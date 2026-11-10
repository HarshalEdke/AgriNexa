from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.irrigation import (
    IrrigationField,
    IrrigationHistory,
    IrrigationRecommendation,
    IrrigationSchedule,
)
from app.dependencies import get_current_user
from app.core.database import get_db_session
from app.db.models.user import User
from app.irrigation_schemas import (
    IrrigationAnalyticsResponse,
    IrrigationDashboardResponse,
    IrrigationFieldCreate,
    IrrigationFieldResponse,
    IrrigationHistoryCreate,
    IrrigationHistoryResponse,
    IrrigationRecommendationRequest,
    IrrigationRecommendationResponse,
    IrrigationScheduleComplete,
    IrrigationScheduleCreate,
    IrrigationSchedulePostpone,
    IrrigationScheduleResponse,
    IrrigationSensorReadingCreate,
    IrrigationSensorReadingResponse,
    IrrigationWeatherInput,
    IrrigationWeatherResponse,
)
from app.services.irrigation_service import IrrigationService, _recommendation_dict
from app.services.irrigation_weather_service import fetch_irrigation_weather


router = APIRouter(prefix="/api/irrigation", tags=["Smart Irrigation"])


@router.get("/dashboard", response_model=IrrigationDashboardResponse)
async def get_dashboard(
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> IrrigationDashboardResponse:
    return await IrrigationService.dashboard(db, current_user.id)


@router.get("/recommendation/", response_model=list[IrrigationRecommendationResponse])
async def get_recommendations(
    field_id: Optional[int] = Query(default=None, gt=0),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> list[IrrigationRecommendationResponse]:
    if field_id is not None:
        await IrrigationService.get_field(db, current_user.id, field_id)
    query = (
        select(IrrigationRecommendation, IrrigationField)
        .join(IrrigationField, IrrigationRecommendation.field_id == IrrigationField.id)
        .where(
            IrrigationRecommendation.user_id == current_user.id,
            IrrigationField.user_id == current_user.id,
        )
        .order_by(desc(IrrigationRecommendation.generated_at))
        .limit(100)
    )
    if field_id is not None:
        query = query.where(IrrigationRecommendation.field_id == field_id)
    result = await db.execute(query)
    return [
        IrrigationRecommendationResponse(
            field_name=field.field_name,
            crop_name=field.crop_name,
            **_recommendation_dict(recommendation),
        )
        for recommendation, field in result.all()
    ]


@router.post(
    "/recommendation/generate",
    response_model=IrrigationRecommendationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def generate_recommendation(
    request: IrrigationRecommendationRequest,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> IrrigationRecommendationResponse:
    field = await IrrigationService.get_field(db, current_user.id, request.field_id)
    weather = request.weather
    weather_error = None
    if weather is None and field.location:
        try:
            forecast = await fetch_irrigation_weather(field.location)
            current_weather = dict(forecast.current)
            current_weather["rainfall_mm"] = current_weather.get("rainfall_mm") or 0.0
            current_weather["rainfall_probability_percent"] = (
                current_weather.get("rainfall_probability_percent") or 0.0
            )
            weather = IrrigationWeatherInput(
                source="open_meteo",
                **current_weather,
                forecast=forecast.forecast,
            )
        except HTTPException as exc:
            weather_error = str(exc.detail)

    recommendation = await IrrigationService.save_recommendation(
        db,
        current_user.id,
        field,
        weather,
        weather_error,
    )
    return IrrigationRecommendationResponse(
        field_name=field.field_name,
        crop_name=field.crop_name,
        **_recommendation_dict(recommendation),
    )


@router.post("/fields", response_model=IrrigationFieldResponse, status_code=status.HTTP_201_CREATED)
async def create_field(
    request: IrrigationFieldCreate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> IrrigationFieldResponse:
    field = await IrrigationService.create_field(db, current_user.id, request)
    return IrrigationFieldResponse.model_validate(field)


@router.get("/fields", response_model=list[IrrigationFieldResponse])
async def get_fields(
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> list[IrrigationFieldResponse]:
    fields = await IrrigationService.list_fields(db, current_user.id)
    return [IrrigationFieldResponse.model_validate(field) for field in fields]


@router.get("/history/", response_model=list[IrrigationHistoryResponse])
async def get_irrigation_history(
    field_id: Optional[int] = Query(default=None, gt=0),
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> list[IrrigationHistoryResponse]:
    query = (
        select(IrrigationHistory)
        .where(IrrigationHistory.user_id == current_user.id)
        .order_by(desc(IrrigationHistory.irrigated_at))
        .limit(limit)
    )
    if field_id is not None:
        await IrrigationService.get_field(db, current_user.id, field_id)
        query = query.where(IrrigationHistory.field_id == field_id)
    result = await db.execute(query)
    return [IrrigationHistoryResponse.model_validate(item) for item in result.scalars().all()]


@router.post("/history/", response_model=IrrigationHistoryResponse, status_code=status.HTTP_201_CREATED)
async def record_irrigation(
    request: IrrigationHistoryCreate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> IrrigationHistoryResponse:
    history = await IrrigationService.record_irrigation(db, current_user.id, request)
    return IrrigationHistoryResponse.model_validate(history)


@router.post("/schedule", response_model=IrrigationScheduleResponse, status_code=status.HTTP_201_CREATED)
async def create_schedule(
    request: IrrigationScheduleCreate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> IrrigationScheduleResponse:
    now = datetime.now(timezone.utc)
    scheduled_at = request.scheduled_at
    if (scheduled_at.replace(tzinfo=timezone.utc) if scheduled_at.tzinfo is None else scheduled_at) <= now:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Schedule time must be in the future.")

    result = await db.execute(
        select(IrrigationRecommendation, IrrigationField)
        .join(IrrigationField, IrrigationField.id == IrrigationRecommendation.field_id)
        .where(
            IrrigationRecommendation.id == request.recommendation_id,
            IrrigationRecommendation.user_id == current_user.id,
            IrrigationField.user_id == current_user.id,
        )
    )
    row = result.one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Irrigation recommendation not found.")
    recommendation, field = row
    schedule = IrrigationSchedule(
        field_id=field.id,
        user_id=current_user.id,
        recommendation_id=recommendation.id,
        scheduled_at=scheduled_at,
        status="scheduled",
        planned_water_litres=recommendation.required_water_litres,
        notes=request.notes,
    )
    db.add(schedule)
    await db.flush()
    return IrrigationScheduleResponse.model_validate(schedule)


@router.get("/schedules", response_model=list[IrrigationScheduleResponse])
async def get_schedules(
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> list[IrrigationScheduleResponse]:
    result = await db.execute(
        select(IrrigationSchedule)
        .where(IrrigationSchedule.user_id == current_user.id)
        .order_by(IrrigationSchedule.scheduled_at.desc())
        .limit(100)
    )
    return [IrrigationScheduleResponse.model_validate(item) for item in result.scalars().all()]


@router.post("/schedules/{schedule_id}/complete", response_model=IrrigationScheduleResponse)
async def complete_schedule(
    schedule_id: int,
    request: IrrigationScheduleComplete,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> IrrigationScheduleResponse:
    result = await db.execute(
        select(IrrigationSchedule).where(
            IrrigationSchedule.id == schedule_id,
            IrrigationSchedule.user_id == current_user.id,
        )
    )
    schedule = result.scalar_one_or_none()
    if schedule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Irrigation schedule not found.")
    if schedule.status not in ("scheduled", "missed", "postponed"):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This irrigation schedule cannot be marked complete.")

    field = await IrrigationService.get_field(db, current_user.id, schedule.field_id)
    completed_at = datetime.now(timezone.utc)
    await IrrigationService.record_irrigation(
        db,
        current_user.id,
        IrrigationHistoryCreate(
            field_id=field.id,
            irrigated_at=completed_at,
            water_used_litres=request.water_used_litres,
            duration_minutes=request.duration_minutes,
            method=field.irrigation_method,
            notes=request.notes,
        ),
    )
    schedule.status = "completed"
    schedule.completed_at = completed_at
    await db.flush()
    return IrrigationScheduleResponse.model_validate(schedule)


@router.post("/schedules/{schedule_id}/postpone", response_model=IrrigationScheduleResponse)
async def postpone_schedule(
    schedule_id: int,
    request: IrrigationSchedulePostpone,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> IrrigationScheduleResponse:
    new_schedule_time = request.scheduled_at
    if (new_schedule_time.replace(tzinfo=timezone.utc) if new_schedule_time.tzinfo is None else new_schedule_time) <= datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="The postponed time must be in the future.")
    result = await db.execute(
        select(IrrigationSchedule).where(
            IrrigationSchedule.id == schedule_id,
            IrrigationSchedule.user_id == current_user.id,
        )
    )
    schedule = result.scalar_one_or_none()
    if schedule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Irrigation schedule not found.")
    if schedule.status not in ("scheduled", "missed"):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Only scheduled or missed irrigation can be postponed.")
    schedule.status = "postponed"
    schedule.scheduled_at = new_schedule_time
    if request.notes:
        schedule.notes = request.notes
    await db.flush()
    return IrrigationScheduleResponse.model_validate(schedule)


@router.get("/weather/", response_model=IrrigationWeatherResponse)
async def get_field_weather(
    field_id: int = Query(..., gt=0),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> IrrigationWeatherResponse:
    field = await IrrigationService.get_field(db, current_user.id, field_id)
    if not field.location:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Add a field location before requesting a live weather forecast.",
        )
    weather = await fetch_irrigation_weather(field.location)
    await IrrigationService.save_weather_record(db, current_user.id, field.id, weather)
    return weather


@router.get("/analytics", response_model=IrrigationAnalyticsResponse)
async def get_analytics(
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> IrrigationAnalyticsResponse:
    data = await IrrigationService.analytics(db, current_user.id)
    return IrrigationAnalyticsResponse(**data)


@router.post(
    "/fields/{field_id}/sensor-readings",
    response_model=IrrigationSensorReadingResponse,
    status_code=status.HTTP_201_CREATED,
)
async def ingest_sensor_reading(
    field_id: int,
    request: IrrigationSensorReadingCreate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> IrrigationSensorReadingResponse:
    field = await IrrigationService.get_field(db, current_user.id, field_id)
    reading = await IrrigationService.record_sensor_reading(db, field, request)
    return IrrigationSensorReadingResponse.model_validate(reading)
