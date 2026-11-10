import asyncio
from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.database import get_db_session
from app.db.models import Base
from app.db.models.irrigation import CropWaterParameter, IrrigationField
from app.db.models.user import User
from app.dependencies import get_current_user
from app.irrigation_schemas import IrrigationFieldCreate, IrrigationWeatherInput
from app.main import app
from app.services.irrigation_calculator import calculate_fao56_et0
from app.services.recommendation_engine import build_recommendation


def make_field(**overrides) -> IrrigationField:
    data = {
        "id": 1,
        "user_id": 1,
        "field_name": "North Field",
        "crop_name": "Wheat",
        "crop_variety": None,
        "growth_stage": "mid season",
        "sowing_date": None,
        "crop_duration_days": None,
        "root_depth_m": 0.6,
        "kc": 1.0,
        "kc_source": "farmer_input",
        "soil_type": "loamy",
        "soil_moisture_percent": 5.0,
        "moisture_source": "manual",
        "field_capacity_percent": 30.0,
        "permanent_wilting_point_percent": 15.0,
        "soil_water_holding_capacity_mm_per_m": 150.0,
        "location": None,
        "latitude": 20.0,
        "longitude": 75.0,
        "area_hectares": 0.25,
        "irrigation_method": "drip",
        "irrigation_efficiency": 0.9,
        "flow_rate_lpm": 30.0,
        "water_source": "well",
    }
    data.update(overrides)
    return IrrigationField(**data)


def test_critically_low_moisture_requires_irrigation_and_warns_of_stress():
    recommendation = build_recommendation(make_field(), None, depletion_fraction=0.5)

    assert recommendation["status"] == "Required"
    assert recommendation["net_requirement_mm"] == pytest.approx(90.0)
    assert recommendation["required_water_litres"] == pytest.approx(250_000.0)
    assert any("water-stress" in alert for alert in recommendation["alerts"])


def test_sufficient_moisture_does_not_trigger_irrigation():
    recommendation = build_recommendation(
        make_field(soil_moisture_percent=28.0),
        None,
        depletion_fraction=0.5,
    )

    assert recommendation["status"] == "Not Required"
    assert recommendation["required_water_litres"] == 0.0
    assert recommendation["et0_mm_day"] is None
    assert "ET0 unavailable" in recommendation["calculation_basis"]


def test_high_probability_rain_postpones_a_due_irrigation():
    rain_date = date.today() + timedelta(days=1)
    weather = IrrigationWeatherInput(
        source="manual",
        rainfall_mm=20.0,
        rainfall_probability_percent=90.0,
        forecast=[{
            "date": rain_date,
            "rainfall_mm": 20.0,
            "rainfall_probability_percent": 90.0,
        }],
    )

    recommendation = build_recommendation(make_field(), weather, depletion_fraction=0.5)

    assert recommendation["status"] == "Monitor"
    assert recommendation["recommended_date"] == rain_date + timedelta(days=1)
    assert recommendation["effective_rainfall_mm"] == pytest.approx(18.0)
    assert recommendation["estimated_water_saved_litres"] > 0


def test_penman_monteith_responds_to_heat_and_complete_weather_inputs():
    mild = IrrigationWeatherInput(
        temp_min_c=20.0,
        temp_max_c=28.0,
        humidity_percent=55.0,
        wind_speed_m_s=2.0,
        solar_radiation_mj_m2_day=18.0,
        elevation_m=300.0,
    )
    hot = mild.model_copy(update={"temp_min_c": 27.0, "temp_max_c": 40.0})

    mild_et0 = calculate_fao56_et0(mild, 20.0, date.today())
    hot_et0 = calculate_fao56_et0(hot, 20.0, date.today())

    assert mild_et0 is not None
    assert hot_et0 is not None
    assert hot_et0 > mild_et0
    assert calculate_fao56_et0(
        IrrigationWeatherInput(temperature_c=30.0, humidity_percent=50.0),
        20.0,
        date.today(),
    ) is None


def test_crop_coefficient_and_measured_soil_limits_change_water_balance():
    weather = IrrigationWeatherInput(
        temp_min_c=25.0,
        temp_max_c=35.0,
        humidity_percent=40.0,
        wind_speed_m_s=2.0,
        solar_radiation_mj_m2_day=22.0,
        elevation_m=300.0,
    )
    wetter_capacity = build_recommendation(
        make_field(kc=0.8, soil_moisture_percent=20.0),
        weather,
        depletion_fraction=0.5,
    )
    higher_kc = build_recommendation(
        make_field(kc=1.2, soil_moisture_percent=20.0),
        weather,
        depletion_fraction=0.5,
    )
    sandy_profile = build_recommendation(
        make_field(
            soil_type="sandy",
            field_capacity_percent=20.0,
            permanent_wilting_point_percent=8.0,
            soil_water_holding_capacity_mm_per_m=None,
            soil_moisture_percent=12.0,
        ),
        None,
        depletion_fraction=0.5,
    )
    loamy_profile = build_recommendation(
        make_field(
            soil_type="loamy",
            field_capacity_percent=35.0,
            permanent_wilting_point_percent=15.0,
            soil_water_holding_capacity_mm_per_m=None,
            soil_moisture_percent=27.0,
        ),
        None,
        depletion_fraction=0.5,
    )

    assert higher_kc["etc_mm_day"] > wetter_capacity["etc_mm_day"]
    assert sandy_profile["readily_available_water_mm"] != loamy_profile["readily_available_water_mm"]


def test_irrigation_efficiency_changes_gross_volume_and_duration():
    drip = build_recommendation(make_field(irrigation_efficiency=0.9), None, 0.5)
    surface = build_recommendation(
        make_field(irrigation_method="surface", irrigation_efficiency=0.6),
        None,
        0.5,
    )

    assert surface["gross_requirement_mm"] > drip["gross_requirement_mm"]
    assert surface["required_water_litres"] > drip["required_water_litres"]
    assert surface["estimated_duration_minutes"] > drip["estimated_duration_minutes"]


def test_invalid_field_soil_limits_are_rejected():
    with pytest.raises(ValueError, match="wilting point"):
        IrrigationFieldCreate(
            field_name="Bad field",
            crop_name="Wheat",
            growth_stage="mid season",
            root_depth_m=0.5,
            soil_type="loamy",
            field_capacity_percent=12.0,
            permanent_wilting_point_percent=18.0,
            area_hectares=1.0,
            irrigation_method="drip",
        )


@pytest.fixture
def irrigation_client(tmp_path):
    database_path = (tmp_path / "irrigation.db").as_posix()
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{database_path}",
        poolclass=NullPool,
    )

    async def initialize():
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        async with AsyncSession(engine) as session:
            session.add(User(id=1, email="irrigation@example.com", hashed_password="test-hash"))
            session.add(CropWaterParameter(
                crop_name="wheat",
                kc_initial=0.3,
                kc_mid=1.15,
                kc_end=0.25,
                depletion_fraction=0.55,
                source="test generic reference",
            ))
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
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=1)
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()
    asyncio.run(engine.dispose())


def test_authenticated_api_creates_recommendation_sensor_and_history(irrigation_client):
    field_response = irrigation_client.post(
        "/api/irrigation/fields",
        json={
            "field_name": "North plot",
            "crop_name": "Wheat",
            "growth_stage": "mid season",
            "root_depth_m": 0.6,
            "soil_type": "loamy",
            "soil_moisture_percent": 8.0,
            "field_capacity_percent": 30.0,
            "permanent_wilting_point_percent": 15.0,
            "area_hectares": 0.25,
            "irrigation_method": "drip",
            "flow_rate_lpm": 30.0,
        },
    )
    assert field_response.status_code == 201, field_response.text
    field = field_response.json()
    assert field["kc_source"] == "generic_fao_reference"
    assert field["moisture_source"] == "manual"

    recommendation_response = irrigation_client.post(
        "/api/irrigation/recommendation/generate",
        json={"field_id": field["id"]},
    )
    assert recommendation_response.status_code == 201, recommendation_response.text
    recommendation = recommendation_response.json()
    assert recommendation["status"] == "Required"
    assert recommendation["weather_source"] == "unavailable"
    assert recommendation["et0_mm_day"] is None

    schedule_response = irrigation_client.post(
        "/api/irrigation/schedule",
        json={
            "recommendation_id": recommendation["id"],
            "scheduled_at": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
            "notes": "Early morning",
        },
    )
    assert schedule_response.status_code == 201, schedule_response.text
    schedule = schedule_response.json()

    complete_response = irrigation_client.post(
        f"/api/irrigation/schedules/{schedule['id']}/complete",
        json={"water_used_litres": 450.0, "duration_minutes": 15.0},
    )
    assert complete_response.status_code == 200, complete_response.text
    assert complete_response.json()["status"] == "completed"

    sensor_response = irrigation_client.post(
        f"/api/irrigation/fields/{field['id']}/sensor-readings",
        json={"soil_moisture_percent": 27.0, "source": "simulated", "device_id": "demo-01"},
    )
    assert sensor_response.status_code == 201, sensor_response.text
    assert sensor_response.json()["source"] == "simulated"

    history_response = irrigation_client.post(
        "/api/irrigation/history/",
        json={
            "field_id": field["id"],
            "irrigated_at": datetime.now(timezone.utc).isoformat(),
            "water_used_litres": 500.0,
            "duration_minutes": 20.0,
            "notes": "Measured at meter",
        },
    )
    assert history_response.status_code == 201, history_response.text

    dashboard = irrigation_client.get("/api/irrigation/dashboard")
    assert dashboard.status_code == 200, dashboard.text
    result = dashboard.json()
    assert result["total_fields"] == 1
    assert result["fields"][0]["soil_moisture_percent"] == 27.0
    assert result["fields"][0]["moisture_source"] == "simulated"
    assert result["history"][0]["water_used_litres"] == 500.0


def test_irrigation_api_rejects_cross_user_field_access(irrigation_client):
    response = irrigation_client.post(
        "/api/irrigation/recommendation/generate",
        json={"field_id": 987654},
    )

    assert response.status_code == 404


def test_irrigation_endpoints_require_authentication():
    with TestClient(app) as client:
        response = client.get("/api/irrigation/dashboard")

    assert response.status_code == 401
