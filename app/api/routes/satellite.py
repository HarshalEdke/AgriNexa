from io import BytesIO
from datetime import date
from typing import Any
from xml.sax.saxutils import escape

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile, status
import numpy as np
from reportlab.graphics.charts.lineplots import LinePlot
from reportlab.graphics.shapes import Drawing
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.db.models.irrigation import IrrigationField, SatelliteObservation
from app.db.models.user import User
from app.dependencies import get_current_user
from app.satellite_schemas import (
    SatelliteAnalysisRequest,
    SatelliteAvailabilityResponse,
    SatelliteCompareRequest,
    SatelliteFieldBoundaryInput,
    SatelliteFieldResponse,
    SatelliteObservationResponse,
)
from app.services.satellite_geospatial_service import calculate_ndvi, geometry_summary
from app.services.field_boundary_service import parse_boundary_file
from app.services.sentinel2_service import SatelliteProviderUnavailable, sentinel2_service


router = APIRouter(prefix="/api/satellite", tags=["Satellite Farm Health"])


@router.get("/demo-data")
async def get_ndvi_calculation_demo(
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    ndvi_examples = np.array([[-0.1, 0.1, 0.3, 0.5, 0.7, 0.9]] * 3)
    nir = 1.0 + ndvi_examples
    red = 1.0 - ndvi_examples
    valid_mask = np.ones(ndvi_examples.shape, dtype=bool)
    valid_mask[1, 2] = False
    _, statistics = calculate_ndvi(nir, red, valid_mask=valid_mask)
    return {
        "mode": "demo",
        "synthetic": True,
        "satellite_observation": False,
        "acquisition_date": None,
        "data_source": "Fixed synthetic reflectance values for calculation demonstration",
        "statistics": statistics,
        "notice": (
            "Demonstration only: these fixed values are not satellite imagery, a farm observation, "
            "or a crop-health assessment. They are never saved as field data."
        ),
    }


async def _owned_field(db: AsyncSession, user_id: int, field_id: int) -> IrrigationField:
    result = await db.execute(
        select(IrrigationField).where(
            IrrigationField.id == field_id,
            IrrigationField.user_id == user_id,
        )
    )
    field = result.scalar_one_or_none()
    if field is None:
        raise HTTPException(status_code=404, detail="Field not found.")
    return field


def _field_response(field: IrrigationField) -> SatelliteFieldResponse:
    summary = geometry_summary(field.boundary_geojson) if field.boundary_geojson else None
    return SatelliteFieldResponse(
        id=field.id,
        field_name=field.field_name,
        crop_name=field.crop_name,
        area_hectares=summary["area_hectares"] if summary else field.area_hectares,
        boundary=field.boundary_geojson,
        geometry_summary=summary,
    )


def _observation_response(item: SatelliteObservation) -> SatelliteObservationResponse:
    return SatelliteObservationResponse.model_validate(item)


def _cloud_filter(record: SatelliteObservation) -> float:
    parameters = record.statistics.get("analysis_parameters", {})
    value = parameters.get("max_cloud_coverage_percent") if isinstance(parameters, dict) else None
    return float(value) if isinstance(value, (int, float)) and 0 <= value <= 100 else 30.0


@router.get("/status", response_model=SatelliteAvailabilityResponse)
async def get_satellite_status(
    current_user: User = Depends(get_current_user),
) -> SatelliteAvailabilityResponse:
    return SatelliteAvailabilityResponse(**(await sentinel2_service.availability()))


@router.get("/fields", response_model=list[SatelliteFieldResponse])
async def list_satellite_fields(
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> list[SatelliteFieldResponse]:
    result = await db.execute(
        select(IrrigationField)
        .where(IrrigationField.user_id == current_user.id)
        .order_by(IrrigationField.id)
    )
    return [_field_response(field) for field in result.scalars().all()]


@router.post(
    "/fields",
    response_model=SatelliteFieldResponse,
    status_code=status.HTTP_200_OK,
)
async def save_field_boundary(
    request: SatelliteFieldBoundaryInput,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> SatelliteFieldResponse:
    field = await _owned_field(db, current_user.id, request.field_id)
    field.boundary_geojson = request.geometry
    summary = geometry_summary(request.geometry)
    field.latitude = summary["centroid"][1]
    field.longitude = summary["centroid"][0]
    await db.flush()
    return _field_response(field)


@router.post("/fields/{field_id}/boundary-file", response_model=SatelliteFieldResponse)
async def upload_field_boundary(
    field_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> SatelliteFieldResponse:
    field = await _owned_field(db, current_user.id, field_id)
    content = await file.read(10 * 1024 * 1024 + 1)
    try:
        geometry = parse_boundary_file(file.filename or "", content)
        summary = geometry_summary(geometry)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    finally:
        await file.close()
    field.boundary_geojson = geometry
    field.latitude = summary["centroid"][1]
    field.longitude = summary["centroid"][0]
    await db.flush()
    return _field_response(field)


@router.get("/field/{field_id}", response_model=SatelliteFieldResponse)
async def get_satellite_field(
    field_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> SatelliteFieldResponse:
    field = await _owned_field(db, current_user.id, field_id)
    return _field_response(field)


@router.post(
    "/analyze/{field_id}",
    response_model=list[SatelliteObservationResponse],
)
async def analyze_field(
    field_id: int,
    request: SatelliteAnalysisRequest,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> list[SatelliteObservationResponse]:
    field = await _owned_field(db, current_user.id, field_id)
    if not field.boundary_geojson:
        raise HTTPException(
            status_code=409,
            detail="Save a valid GeoJSON field boundary before requesting satellite analysis.",
        )
    try:
        observations = await sentinel2_service.fetch_statistics(
            field.boundary_geojson,
            request.start_date,
            request.end_date,
            request.max_cloud_coverage_percent,
        )
    except SatelliteProviderUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    saved: list[SatelliteObservation] = []
    for observation in observations:
        acquisition_date = observation["acquisition_date"]
        statistics = dict(observation["statistics"])
        statistics["analysis_parameters"] = {
            "max_cloud_coverage_percent": request.max_cloud_coverage_percent
        }
        result = await db.execute(
            select(SatelliteObservation).where(
                SatelliteObservation.field_id == field.id,
                SatelliteObservation.user_id == current_user.id,
                SatelliteObservation.acquisition_date == acquisition_date,
            )
        )
        record = result.scalar_one_or_none()
        if record is None:
            record = SatelliteObservation(
                field_id=field.id,
                user_id=current_user.id,
                acquisition_date=acquisition_date,
                source=observation["source"],
                cloud_coverage_percent=observation["cloud_coverage_percent"],
                spatial_resolution_m=observation["spatial_resolution_m"],
                statistics=statistics,
            )
            db.add(record)
        else:
            record.source = observation["source"]
            record.cloud_coverage_percent = observation["cloud_coverage_percent"]
            record.spatial_resolution_m = observation["spatial_resolution_m"]
            record.statistics = statistics
        saved.append(record)
    await db.flush()
    return [_observation_response(item) for item in saved]


@router.get("/history", response_model=list[SatelliteObservationResponse])
@router.get("/observations", response_model=list[SatelliteObservationResponse])
async def get_satellite_history(
    field_id: int = Query(..., gt=0),
    start_date: date | None = None,
    end_date: date | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> list[SatelliteObservationResponse]:
    await _owned_field(db, current_user.id, field_id)
    if start_date is not None and end_date is not None and end_date < start_date:
        raise HTTPException(status_code=422, detail="End date must be on or after start date.")
    query = (
        select(SatelliteObservation)
        .where(
            SatelliteObservation.field_id == field_id,
            SatelliteObservation.user_id == current_user.id,
        )
        .order_by(desc(SatelliteObservation.acquisition_date))
        .limit(limit)
    )
    if start_date is not None:
        query = query.where(SatelliteObservation.acquisition_date >= start_date)
    if end_date is not None:
        query = query.where(SatelliteObservation.acquisition_date <= end_date)
    result = await db.execute(query)
    return [_observation_response(item) for item in result.scalars().all()]


@router.get("/ndvi", response_model=SatelliteObservationResponse | None)
async def get_latest_ndvi(
    field_id: int = Query(..., gt=0),
    acquisition_date: date | None = None,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> SatelliteObservationResponse | None:
    await _owned_field(db, current_user.id, field_id)
    query = select(SatelliteObservation).where(
        SatelliteObservation.field_id == field_id,
        SatelliteObservation.user_id == current_user.id,
    )
    if acquisition_date is not None:
        query = query.where(SatelliteObservation.acquisition_date == acquisition_date)
    result = await db.execute(
        query.order_by(desc(SatelliteObservation.acquisition_date)).limit(1)
    )
    record = result.scalar_one_or_none()
    return _observation_response(record) if record else None


@router.get("/map/{field_id}/{acquisition_date}")
async def get_georeferenced_ndvi_map(
    field_id: int,
    acquisition_date: date,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> Response:
    field = await _owned_field(db, current_user.id, field_id)
    if not field.boundary_geojson:
        raise HTTPException(status_code=409, detail="This field has no saved boundary.")
    result = await db.execute(
        select(SatelliteObservation).where(
            SatelliteObservation.field_id == field_id,
            SatelliteObservation.user_id == current_user.id,
            SatelliteObservation.acquisition_date == acquisition_date,
        )
    )
    observation = result.scalar_one_or_none()
    if observation is None:
        raise HTTPException(
            status_code=404,
            detail="No saved satellite observation exists for the selected date.",
        )
    try:
        image = await sentinel2_service.fetch_ndvi_map(
            field.boundary_geojson,
            acquisition_date,
            _cloud_filter(observation),
        )
    except SatelliteProviderUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return Response(
        content=image,
        media_type="image/png",
        headers={"Cache-Control": "private, max-age=3600"},
    )


@router.get("/statistics")
async def get_satellite_statistics(
    field_id: int = Query(..., gt=0),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    field = await _owned_field(db, current_user.id, field_id)
    result = await db.execute(
        select(SatelliteObservation)
        .where(
            SatelliteObservation.field_id == field.id,
            SatelliteObservation.user_id == current_user.id,
        )
        .order_by(desc(SatelliteObservation.acquisition_date))
        .limit(1)
    )
    latest = result.scalar_one_or_none()
    return {
        "field_id": field.id,
        "area_hectares": _field_response(field).area_hectares,
        "observation": _observation_response(latest).model_dump(mode="json")
        if latest
        else None,
    }


@router.get("/health-insights")
async def get_satellite_health_insights(
    field_id: int = Query(..., gt=0),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    await _owned_field(db, current_user.id, field_id)
    result = await db.execute(
        select(SatelliteObservation)
        .where(
            SatelliteObservation.field_id == field_id,
            SatelliteObservation.user_id == current_user.id,
        )
        .order_by(desc(SatelliteObservation.acquisition_date))
        .limit(2)
    )
    observations = result.scalars().all()
    insights: list[dict[str, str]] = []
    if len(observations) == 2:
        latest_mean = observations[0].statistics.get("mean")
        previous_mean = observations[1].statistics.get("mean")
        if (
            isinstance(latest_mean, (int, float))
            and isinstance(previous_mean, (int, float))
            and previous_mean - latest_mean >= 0.1
        ):
            insights.append(
                {
                    "type": "vegetation_decline",
                    "severity": "review",
                    "message": "Average NDVI declined by at least 0.10 between available observations.",
                    "explanation": (
                        f"Mean NDVI changed from {previous_mean:.2f} on "
                        f"{observations[1].acquisition_date.isoformat()} to {latest_mean:.2f} "
                        f"on {observations[0].acquisition_date.isoformat()}. Check imagery quality "
                        "and inspect the field; NDVI alone cannot identify the cause."
                    ),
                    "recommendation": "Compare the images and inspect affected areas on the ground.",
                }
            )
    return {
        "field_id": field_id,
        "insights": insights,
        "disclaimer": "NDVI changes are screening signals, not a diagnosis of disease, nutrient deficiency, or water stress.",
    }


@router.get("/vegetation-zones")
async def get_vegetation_zones(
    field_id: int = Query(..., gt=0),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    await _owned_field(db, current_user.id, field_id)
    return {
        "field_id": field_id,
        "zones": [],
        "available": False,
        "message": (
            "Spatial zone statistics are not included in the Copernicus Statistical API response; "
            "no zone values are inferred from field-wide averages."
        ),
    }


@router.get("/indices")
async def get_supported_indices(
    field_id: int = Query(..., gt=0),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    await _owned_field(db, current_user.id, field_id)
    return {
        "indices": [
            {
                "name": "NDVI",
                "formula": "(B08 - B04) / (B08 + B04)",
                "bands": {"B08": "Near Infrared", "B04": "Red"},
                "available": True,
            },
            {
                "name": "NDWI",
                "formula": "(B08 - B11) / (B08 + B11)",
                "bands": {"B08": "Near Infrared", "B11": "Shortwave Infrared"},
                "available": False,
            },
            {
                "name": "SAVI",
                "formula": "((B08 - B04) / (B08 + B04 + L)) * (1 + L)",
                "bands": {"B08": "Near Infrared", "B04": "Red"},
                "available": False,
            },
            {
                "name": "EVI",
                "formula": "2.5 * (B08 - B04) / (B08 + 6*B04 - 7.5*B02 + 1)",
                "bands": {"B08": "Near Infrared", "B04": "Red", "B02": "Blue"},
                "available": False,
            },
        ],
        "message": "Only NDVI is currently requested from Copernicus; other indices are shown for reference and are not calculated.",
    }


@router.post("/compare")
async def compare_satellite_observations(
    request: SatelliteCompareRequest,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> list[SatelliteObservationResponse]:
    if len(set(request.observation_ids)) != len(request.observation_ids):
        raise HTTPException(status_code=422, detail="Observation IDs must be unique.")
    result = await db.execute(
        select(SatelliteObservation).where(
            SatelliteObservation.id.in_(request.observation_ids),
            SatelliteObservation.user_id == current_user.id,
        )
    )
    observations = result.scalars().all()
    if len(observations) != len(request.observation_ids):
        raise HTTPException(status_code=404, detail="One or more observations were not found.")
    return [
        _observation_response(item)
        for item in sorted(observations, key=lambda observation: observation.acquisition_date)
    ]


@router.get("/report")
async def download_farm_health_report(
    field_id: int = Query(..., gt=0),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> Response:
    field = await _owned_field(db, current_user.id, field_id)
    result = await db.execute(
        select(SatelliteObservation)
        .where(
            SatelliteObservation.field_id == field_id,
            SatelliteObservation.user_id == current_user.id,
        )
        .order_by(desc(SatelliteObservation.acquisition_date))
        .limit(12)
    )
    observations = list(reversed(result.scalars().all()))
    if not observations:
        raise HTTPException(status_code=404, detail="Run a satellite analysis before downloading a report.")

    latest = observations[-1]
    summary = geometry_summary(field.boundary_geojson) if field.boundary_geojson else None
    styles = getSampleStyleSheet()
    story = [
        Paragraph("AgriNexa Farm Health Report", styles["Title"]),
        Paragraph(f"Field: {escape(field.field_name)}", styles["Heading2"]),
        Paragraph(f"Farmer account: {escape(current_user.email)}", styles["BodyText"]),
        Paragraph(f"Crop: {escape(field.crop_name)}", styles["BodyText"]),
        Paragraph(f"Satellite source: {escape(latest.source)}", styles["BodyText"]),
        Paragraph(
            f"Latest observation: {latest.acquisition_date.isoformat()} "
            f"({latest.spatial_resolution_m} m nominal resolution)",
            styles["BodyText"],
        ),
    ]
    if summary:
        story.append(
            Paragraph(
                f"Boundary area: {summary['area_hectares']:.3f} ha "
                f"({summary['area_acres']:.3f} acres); perimeter: "
                f"{summary['perimeter_metres']:.1f} m; centroid (lat, lon): "
                f"{summary['centroid'][1]:.6f}, {summary['centroid'][0]:.6f}.",
                styles["BodyText"],
            )
        )
    story.append(Spacer(1, 5 * mm))

    latest_stats = latest.statistics
    statistic_rows = [["NDVI measure", "Value"]]
    for label, key in (
        ("Mean", "mean"),
        ("Minimum", "minimum"),
        ("Maximum", "maximum"),
        ("Median", "median"),
        ("Standard deviation", "standard_deviation"),
        ("Valid pixels", "valid_pixels"),
        ("Valid pixel coverage", "valid_pixel_percentage"),
    ):
        value = latest_stats.get(key)
        statistic_rows.append([label, f"{value:.3f}" if isinstance(value, (int, float)) else "Not reported"])
    story.extend(
        [
            Paragraph("Latest observation statistics", styles["Heading2"]),
            _report_table(statistic_rows),
            Spacer(1, 4 * mm),
        ]
    )

    distribution = latest_stats.get("vegetation_distribution")
    if isinstance(distribution, dict):
        distribution_rows = [["Illustrative NDVI class", "Observed area share"]]
        for key in ("non_vegetated_or_water", "very_low", "low", "moderate", "high", "very_high"):
            item = distribution.get(key)
            if isinstance(item, dict):
                share = item.get("percentage")
                distribution_rows.append(
                    [key.replace("_", " ").title(), f"{share:.1f}%" if isinstance(share, (int, float)) else "Not reported"]
                )
        story.extend(
            [
                Paragraph("Vegetation distribution", styles["Heading2"]),
                _report_table(distribution_rows),
                Spacer(1, 4 * mm),
            ]
        )

    story.append(Paragraph("Potential field signals", styles["Heading2"]))
    if len(observations) > 1:
        previous_mean = observations[-2].statistics.get("mean")
        latest_mean = latest_stats.get("mean")
        if (
            isinstance(previous_mean, (int, float))
            and isinstance(latest_mean, (int, float))
            and previous_mean - latest_mean >= 0.1
        ):
            story.append(
                Paragraph(
                    f"Average NDVI declined from {previous_mean:.2f} on "
                    f"{observations[-2].acquisition_date.isoformat()} to {latest_mean:.2f} "
                    f"on {latest.acquisition_date.isoformat()}. Compare the images and inspect "
                    "the field. NDVI does not establish the cause.",
                    styles["BodyText"],
                )
            )
        else:
            story.append(
                Paragraph(
                    "No decline of 0.10 or greater was identified between the two latest saved observations.",
                    styles["BodyText"],
                )
            )
    else:
        story.append(
            Paragraph(
                "At least two saved observations are needed to compare field health over time.",
                styles["BodyText"],
            )
        )
    story.append(Spacer(1, 4 * mm))

    means = [
        (index, item.statistics.get("mean"))
        for index, item in enumerate(observations)
        if isinstance(item.statistics.get("mean"), (int, float))
    ]
    if len(means) > 1:
        chart = Drawing(170 * mm, 55 * mm)
        plot = LinePlot()
        plot.x = 18
        plot.y = 12
        plot.width = 145 * mm
        plot.height = 42 * mm
        plot.data = [means]
        plot.lines[0].strokeColor = colors.HexColor("#2D7A46")
        plot.xValueAxis.valueMin = 0
        plot.xValueAxis.valueMax = max(len(means) - 1, 1)
        plot.yValueAxis.valueMin = -1
        plot.yValueAxis.valueMax = 1
        plot.yValueAxis.labelTextFormat = "%.1f"
        chart.add(plot)
        story.extend(
            [
                Paragraph("Observed NDVI history (no interpolation)", styles["Heading2"]),
                chart,
                Paragraph(
                    "Chart points use only actual returned observation dates; gaps are not interpolated.",
                    styles["BodyText"],
                ),
                Spacer(1, 4 * mm),
            ]
        )

    try:
        map_image = await sentinel2_service.fetch_ndvi_map(
            field.boundary_geojson,
            latest.acquisition_date,
            _cloud_filter(latest),
        ) if field.boundary_geojson else None
    except SatelliteProviderUnavailable as exc:
        map_image = None
        map_message = str(exc)
    else:
        map_message = "No boundary is saved for this field." if map_image is None else ""
    story.append(Paragraph("Georeferenced NDVI map", styles["Heading2"]))
    if map_image:
        story.append(Image(BytesIO(map_image), width=135 * mm, height=135 * mm))
    else:
        story.append(Paragraph(f"Map image unavailable: {escape(map_message)}", styles["BodyText"]))
    story.append(Spacer(1, 4 * mm))

    history_rows = [["Acquisition date", "Mean NDVI", "Source"]]
    for item in reversed(observations):
        mean = item.statistics.get("mean")
        history_rows.append(
            [
                item.acquisition_date.isoformat(),
                f"{mean:.3f}" if isinstance(mean, (int, float)) else "Not reported",
                item.source,
            ]
        )
    story.extend(
        [
            Paragraph("Satellite observations", styles["Heading2"]),
            _report_table(history_rows),
            Spacer(1, 4 * mm),
            Paragraph(
                "Interpretation limits: NDVI thresholds are illustrative and are not universal crop-health standards. "
                "Low NDVI may reflect bare soil, crop stage, clouds, or other factors. NDVI does not diagnose "
                "disease, pests, nutrient deficiency, or water stress. Field observations are required.",
                styles["BodyText"],
            ),
            Paragraph(
                "Cloud coverage, vegetation zones, and statistics not supplied by the satellite provider are "
                "not inferred or presented as measured values.",
                styles["BodyText"],
            ),
        ]
    )

    output = BytesIO()
    output_document = SimpleDocTemplate(
        output,
        pagesize=A4,
        rightMargin=18 * mm,
        leftMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
    )
    output_document.build(story)
    filename = f"farm-health-field-{field.id}-{latest.acquisition_date.isoformat()}.pdf"
    return Response(
        content=output.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _report_table(rows: list[list[str]]) -> Table:
    table = Table(rows, repeatRows=1, hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E8F3EC")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#234E37")),
                ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#D7E0D8")),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F7FAF7")]),
            ]
        )
    )
    return table
