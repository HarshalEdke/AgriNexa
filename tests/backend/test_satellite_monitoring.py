import asyncio
import io
import json
import zipfile
from datetime import date, timedelta
from types import SimpleNamespace

import numpy as np
import pytest
import shapefile
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from app.config import settings
from app.core.database import get_db_session
from app.db.models import Base
from app.db.models.irrigation import IrrigationField
from app.db.models.user import User
from app.dependencies import get_current_user
from app.main import app
from app.services.field_boundary_service import parse_boundary_file
from app.services.satellite_geospatial_service import (
    calculate_ndvi,
    classify_ndvi,
    geometry_summary,
    normalize_geometry,
)
from app.services.sentinel2_service import _parse_observation


SQUARE = {
    "type": "Polygon",
    "coordinates": [[
        [75.0, 20.0],
        [75.001, 20.0],
        [75.001, 20.001],
        [75.0, 20.001],
        [75.0, 20.0],
    ]],
}


@pytest.fixture
def satellite_client(tmp_path):
    database_path = (tmp_path / "satellite.db").as_posix()
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{database_path}",
        poolclass=NullPool,
    )

    async def initialize():
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        async with AsyncSession(engine) as session:
            session.add(User(id=1, email="satellite@example.com", hashed_password="test-hash"))
            session.add(User(id=2, email="other@example.com", hashed_password="test-hash"))
            session.add(
                IrrigationField(
                    id=1,
                    user_id=1,
                    field_name="North Field",
                    crop_name="Wheat",
                    growth_stage="mid season",
                    root_depth_m=0.6,
                    kc=1.0,
                    kc_source="farmer_input",
                    soil_type="loamy",
                    field_capacity_percent=30.0,
                    permanent_wilting_point_percent=15.0,
                    area_hectares=0.25,
                    irrigation_method="drip",
                    irrigation_efficiency=0.9,
                    boundary_geojson=None,
                )
            )
            session.add(
                IrrigationField(
                    id=2,
                    user_id=2,
                    field_name="Private Field",
                    crop_name="Corn",
                    growth_stage="mid season",
                    root_depth_m=0.6,
                    kc=1.0,
                    kc_source="farmer_input",
                    soil_type="loamy",
                    field_capacity_percent=30.0,
                    permanent_wilting_point_percent=15.0,
                    area_hectares=0.5,
                    irrigation_method="drip",
                    irrigation_efficiency=0.9,
                )
            )
            await session.commit()

    asyncio.run(initialize())

    async def override_session():
        async with AsyncSession(engine, expire_on_commit=False) as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db_session] = override_session
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
        id=1, email="satellite@example.com"
    )
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()
    asyncio.run(engine.dispose())


def test_ndvi_calculation_masks_invalid_pixels_and_reports_statistics():
    ndvi, stats = calculate_ndvi(
        np.array([[0.8, 0.2], [0.6, np.nan]]),
        np.array([[0.2, 0.2], [0.4, 0.1]]),
        valid_mask=np.array([[True, True], [False, True]]),
    )

    assert ndvi[0, 0] == pytest.approx(0.6)
    assert ndvi[0, 1] == pytest.approx(0.0)
    assert np.isnan(ndvi[1, 0])
    assert np.isnan(ndvi[1, 1])
    assert stats["mean"] == pytest.approx(0.3)
    assert stats["minimum"] == pytest.approx(0.0)
    assert stats["maximum"] == pytest.approx(0.6)
    assert stats["valid_pixels"] == 2
    assert stats["total_pixels"] == 4
    assert stats["valid_pixel_percentage"] == pytest.approx(50.0)


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (-0.01, "non_vegetated_or_water"),
        (0.0, "very_low"),
        (0.2, "low"),
        (0.4, "moderate"),
        (0.6, "high"),
        (0.8, "very_high"),
    ],
)
def test_ndvi_classification_uses_documented_boundaries(value, expected):
    assert classify_ndvi(value) == expected


def test_geojson_validation_and_geodesic_field_measurements():
    geometry = normalize_geometry(SQUARE)
    summary = geometry_summary(geometry)

    assert summary["area_hectares"] == pytest.approx(1.17, rel=0.03)
    assert summary["area_acres"] == pytest.approx(
        summary["area_hectares"] * 2.47105, rel=1e-5
    )
    assert summary["perimeter_metres"] == pytest.approx(420, rel=0.03)
    assert summary["centroid"] == pytest.approx([75.0005, 20.0005])


@pytest.mark.parametrize(
    "geometry",
    [
        {"type": "Point", "coordinates": [75, 20]},
        {"type": "Polygon", "coordinates": [[[75, 20], [76, 20], [76, 21]]]},
        {
            "type": "Polygon",
            "coordinates": [[[75, 20], [76, 21], [75, 21], [76, 20], [75, 20]]],
        },
        {
            "type": "Polygon",
            "coordinates": [[[181, 20], [76, 20], [76, 21], [181, 20]]],
        },
        {
            "type": "Polygon",
            "coordinates": [[[75, 20], [76, 20], [77, 20], [75, 20]]],
        },
    ],
)
def test_invalid_boundaries_are_rejected(geometry):
    with pytest.raises(ValueError):
        geometry_summary(normalize_geometry(geometry))


def test_kml_and_geojson_upload_parsing():
    kml = b"""<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><Polygon><outerBoundaryIs><LinearRing><coordinates>75,20 75.001,20 75.001,20.001 75,20.001 75,20</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></Document></kml>"""
    assert parse_boundary_file("field.kml", kml)["type"] == "Polygon"
    assert parse_boundary_file("field.geojson", json.dumps(SQUARE).encode()) == SQUARE


def test_wgs84_shapefile_zip_upload_parsing(tmp_path):
    base = tmp_path / "boundary"
    writer = shapefile.Writer(str(base))
    writer.field("name", "C")
    writer.poly([list(reversed(SQUARE["coordinates"][0]))])
    writer.record("field")
    writer.close()
    (tmp_path / "boundary.prj").write_text(
        'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984"],AUTHORITY["EPSG","4326"]]',
        encoding="utf-8",
    )
    archive_path = tmp_path / "boundary.zip"
    with zipfile.ZipFile(archive_path, "w") as archive:
        for extension in (".shp", ".shx", ".dbf", ".prj"):
            archive.write(f"{base}{extension}", f"boundary{extension}")

    geometry = parse_boundary_file("boundary.zip", archive_path.read_bytes())
    assert geometry["type"] in {"Polygon", "MultiPolygon"}
    coordinates = geometry["coordinates"][0] if geometry["type"] == "MultiPolygon" else geometry["coordinates"]
    assert list(coordinates[0][0]) == [75.0, 20.0]


def test_statistics_response_parser_does_not_invent_unavailable_metadata():
    observation = _parse_observation(
        {
            "interval": {"from": "2026-04-02T00:00:00Z", "to": "2026-04-03T00:00:00Z"},
            "outputs": {
                "default": {
                    "bands": {
                        "B0": {
                            "stats": {
                                "mean": 0.42,
                                "min": 0.1,
                                "max": 0.8,
                                "stDev": 0.12,
                                "sampleCount": 55,
                                "percentiles": {"50": 0.41},
                            },
                            "histogram": {
                                "bins": [
                                    {"lowEdge": 0.0, "count": 10},
                                    {"lowEdge": 0.3, "count": 20},
                                    {"lowEdge": 0.7, "count": 25},
                                ]
                            },
                        }
                    }
                }
            },
        }
    )

    assert observation["acquisition_date"] == date(2026, 4, 2)
    assert observation["statistics"]["mean"] == 0.42
    assert observation["statistics"]["median"] == 0.41
    assert observation["cloud_coverage_percent"] is None
    assert observation["statistics"]["valid_pixel_percentage"] is None
    assert sum(
        item["percentage"]
        for item in observation["statistics"]["vegetation_distribution"].values()
    ) == pytest.approx(100)


def test_demo_data_is_explicitly_synthetic_and_not_saved_as_observation(satellite_client):
    response = satellite_client.get("/api/satellite/demo-data")

    assert response.status_code == 200
    result = response.json()
    assert result["mode"] == "demo"
    assert result["synthetic"] is True
    assert result["satellite_observation"] is False
    assert result["acquisition_date"] is None
    assert result["statistics"]["valid_pixels"] == 17
    assert "not satellite imagery" in result["notice"].lower()
    assert satellite_client.get("/api/satellite/history?field_id=1").json() == []


def test_satellite_endpoints_validate_ownership_boundaries_and_real_observations(
    satellite_client, monkeypatch
):
    async def fake_statistics(geometry, start_date, end_date, max_cloud):
        assert geometry["type"] == "Polygon"
        assert max_cloud == 30
        return [
            {
                "acquisition_date": date.today() - timedelta(days=2),
                "source": "sentinel-2-l2a",
                "cloud_coverage_percent": None,
                "spatial_resolution_m": 10,
                "statistics": {"mean": 0.6, "vegetation_distribution": None},
            },
            {
                "acquisition_date": date.today() - timedelta(days=1),
                "source": "sentinel-2-l2a",
                "cloud_coverage_percent": None,
                "spatial_resolution_m": 10,
                "statistics": {"mean": 0.45, "vegetation_distribution": None},
            },
        ]

    async def fake_map(geometry, acquisition_date, max_cloud=30):
        image_buffer = io.BytesIO()
        Image.new("RGBA", (1, 1), (32, 121, 71, 255)).save(image_buffer, format="PNG")
        return image_buffer.getvalue()

    monkeypatch.setattr("app.services.sentinel2_service.sentinel2_service.fetch_statistics", fake_statistics)
    monkeypatch.setattr("app.services.sentinel2_service.sentinel2_service.fetch_ndvi_map", fake_map)

    other_owner = satellite_client.post(
        "/api/satellite/fields",
        json={"field_id": 2, "geometry": SQUARE},
    )
    assert other_owner.status_code == 404

    saved_boundary = satellite_client.post(
        "/api/satellite/fields",
        json={"field_id": 1, "geometry": SQUARE},
    )
    assert saved_boundary.status_code == 200
    assert saved_boundary.json()["geometry_summary"]["area_hectares"] > 0

    uploaded_boundary = satellite_client.post(
        "/api/satellite/fields/1/boundary-file",
        files={
            "file": (
                "field.kml",
                b"""<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><Polygon><outerBoundaryIs><LinearRing><coordinates>75,20 75.001,20 75.001,20.001 75,20.001 75,20</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></Document></kml>""",
                "application/vnd.google-earth.kml+xml",
            )
        },
    )
    assert uploaded_boundary.status_code == 200, uploaded_boundary.text

    analysis = satellite_client.post(
        "/api/satellite/analyze/1",
        json={
            "start_date": (date.today() - timedelta(days=7)).isoformat(),
            "end_date": date.today().isoformat(),
            "max_cloud_coverage_percent": 30,
        },
    )
    assert analysis.status_code == 200, analysis.text
    assert len(analysis.json()) == 2
    assert analysis.json()[0]["cloud_coverage_percent"] is None

    history = satellite_client.get("/api/satellite/history?field_id=1")
    assert history.status_code == 200
    assert len(history.json()) == 2
    insights = satellite_client.get("/api/satellite/health-insights?field_id=1")
    assert insights.json()["insights"][0]["type"] == "vegetation_decline"

    map_response = satellite_client.get(
        f"/api/satellite/map/1/{date.today() - timedelta(days=1)}"
    )
    assert map_response.status_code == 200
    assert map_response.headers["content-type"] == "image/png"

    report_response = satellite_client.get("/api/satellite/report?field_id=1")
    assert report_response.status_code == 200, report_response.text
    assert report_response.content.startswith(b"%PDF")


def test_satellite_api_rejects_invalid_date_range_and_missing_boundary(
    satellite_client, monkeypatch
):
    response = satellite_client.post(
        "/api/satellite/analyze/1",
        json={
            "start_date": (date.today() + timedelta(days=1)).isoformat(),
            "end_date": date.today().isoformat(),
        },
    )
    assert response.status_code == 422

    response = satellite_client.post(
        "/api/satellite/analyze/1",
        json={
            "start_date": (date.today() - timedelta(days=3)).isoformat(),
            "end_date": date.today().isoformat(),
        },
    )
    assert response.status_code == 409

    monkeypatch.setattr(settings, "COPERNICUS_CLIENT_ID", None)
    monkeypatch.setattr(settings, "COPERNICUS_CLIENT_SECRET", None)
    satellite_client.post(
        "/api/satellite/fields",
        json={"field_id": 1, "geometry": SQUARE},
    )
    response = satellite_client.post(
        "/api/satellite/analyze/1",
        json={
            "start_date": (date.today() - timedelta(days=3)).isoformat(),
            "end_date": date.today().isoformat(),
        },
    )
    assert response.status_code == 503
    assert "credentials" in response.json()["detail"].lower()


def test_satellite_endpoints_require_authentication():
    with TestClient(app) as client:
        response = client.get("/api/satellite/fields")
    assert response.status_code == 401
