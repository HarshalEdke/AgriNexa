from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.irrigation import (
    IrrigationField,
    IrrigationHistory,
    IrrigationRecommendation,
    IrrigationSchedule,
    SoilMoistureReading,
    WeatherRecord,
)
from app.irrigation_schemas import (
    IrrigationDashboardResponse,
    IrrigationFieldCreate,
    IrrigationHistoryCreate,
    IrrigationHistoryResponse,
    IrrigationRecommendationResponse,
    IrrigationScheduleResponse,
    IrrigationSensorReadingCreate,
    IrrigationWeatherInput,
    IrrigationWeatherResponse,
)
from app.services.crop_water_service import resolve_crop_water_profile
from app.services.irrigation_history_service import IrrigationHistoryService
from app.services.recommendation_engine import METHOD_EFFICIENCY, build_recommendation


class IrrigationService:
    @staticmethod
    async def get_field(db: AsyncSession, user_id: int, field_id: int) -> IrrigationField:
        result = await db.execute(
            select(IrrigationField).where(
                IrrigationField.id == field_id,
                IrrigationField.user_id == user_id,
            )
        )
        field = result.scalar_one_or_none()
        if field is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Irrigation field not found.")
        return field

    @staticmethod
    async def list_fields(db: AsyncSession, user_id: int) -> list[IrrigationField]:
        result = await db.execute(
            select(IrrigationField)
            .where(IrrigationField.user_id == user_id)
            .order_by(IrrigationField.created_at.desc())
        )
        return list(result.scalars().all())

    @staticmethod
    async def create_field(
        db: AsyncSession,
        user_id: int,
        request: IrrigationFieldCreate,
    ) -> IrrigationField:
        try:
            profile = await resolve_crop_water_profile(
                db,
                request.crop_name,
                request.growth_stage,
                request.kc,
            )
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

        now = datetime.now(timezone.utc)
        field = IrrigationField(
            **request.model_dump(exclude={"kc", "irrigation_efficiency"}),
            user_id=user_id,
            kc=profile.kc,
            kc_source=profile.source,
            moisture_source="manual" if request.soil_moisture_percent is not None else None,
            moisture_updated_at=now if request.soil_moisture_percent is not None else None,
            irrigation_efficiency=request.irrigation_efficiency or METHOD_EFFICIENCY[request.irrigation_method],
        )
        db.add(field)
        await db.flush()
        if request.soil_moisture_percent is not None:
            db.add(
                SoilMoistureReading(
                    field_id=field.id,
                    soil_moisture_percent=request.soil_moisture_percent,
                    source="manual",
                    recorded_at=now,
                )
            )
        await db.flush()
        return field

    @staticmethod
    async def save_recommendation(
        db: AsyncSession,
        user_id: int,
        field: IrrigationField,
        weather: IrrigationWeatherInput | None,
        weather_error: str | None = None,
    ) -> IrrigationRecommendation:
        profile = await resolve_crop_water_profile(db, field.crop_name, field.growth_stage, field.kc)
        details = build_recommendation(field, weather, profile.depletion_fraction)
        if weather_error:
            details["alerts"].append(f"Live weather was unavailable ({weather_error}); weather inputs were omitted.")
            details["explanation"] += " Live weather could not be retrieved, so soil-water balance rules were used."
        recommendation = IrrigationRecommendation(
            field_id=field.id,
            user_id=user_id,
            **details,
        )
        db.add(recommendation)
        if weather is not None:
            db.add(
                WeatherRecord(
                    field_id=field.id,
                    user_id=user_id,
                    source=weather.source,
                    current_data={
                        "temperature_c": weather.temperature_c,
                        "temp_min_c": weather.temp_min_c,
                        "temp_max_c": weather.temp_max_c,
                        "humidity_percent": weather.humidity_percent,
                        "wind_speed_m_s": weather.wind_speed_m_s,
                        "solar_radiation_mj_m2_day": weather.solar_radiation_mj_m2_day,
                        "elevation_m": weather.elevation_m,
                        "rainfall_mm": weather.rainfall_mm,
                        "rainfall_probability_percent": weather.rainfall_probability_percent,
                        "latitude": weather.latitude,
                        "longitude": weather.longitude,
                    },
                    forecast_data=[day.model_dump(mode="json") for day in weather.forecast],
                )
            )
        await db.flush()
        return recommendation

    @staticmethod
    async def save_weather_record(
        db: AsyncSession,
        user_id: int,
        field_id: int,
        weather: IrrigationWeatherResponse,
    ) -> None:
        db.add(
            WeatherRecord(
                field_id=field_id,
                user_id=user_id,
                source=weather.source,
                current_data=weather.current,
                forecast_data=[day.model_dump(mode="json") for day in weather.forecast],
            )
        )
        await db.flush()

    @staticmethod
    async def dashboard(db: AsyncSession, user_id: int) -> IrrigationDashboardResponse:
        fields = await IrrigationService.list_fields(db, user_id)
        recommendation_result = await db.execute(
            select(IrrigationRecommendation)
            .where(IrrigationRecommendation.user_id == user_id)
            .order_by(desc(IrrigationRecommendation.generated_at))
        )
        latest_by_field: dict[int, IrrigationRecommendation] = {}
        for recommendation in recommendation_result.scalars().all():
            latest_by_field.setdefault(recommendation.field_id, recommendation)

        now = datetime.now(timezone.utc)
        schedule_result = await db.execute(
            select(IrrigationSchedule)
            .where(IrrigationSchedule.user_id == user_id)
            .order_by(IrrigationSchedule.scheduled_at.desc())
            .limit(50)
        )
        schedules = list(schedule_result.scalars().all())
        alerts: list[str] = []
        for schedule in schedules:
            schedule_at = schedule.scheduled_at
            if schedule.status in ("scheduled", "postponed") and _as_utc(schedule_at) < now:
                schedule.status = "missed"
                alerts.append(f"Irrigation for field {schedule.field_id} is overdue.")
        await db.flush()

        history_result = await db.execute(
            select(IrrigationHistory)
            .where(IrrigationHistory.user_id == user_id)
            .order_by(IrrigationHistory.irrigated_at.desc())
            .limit(50)
        )
        history = list(history_result.scalars().all())
        history_by_field: dict[int, list[IrrigationHistory]] = {}
        for item in history:
            history_by_field.setdefault(item.field_id, []).append(item)
        moisture_values = [
            field.soil_moisture_percent
            for field in fields
            if field.soil_moisture_percent is not None
        ]
        for field in fields:
            if field.soil_moisture_percent is not None:
                if field.soil_moisture_percent <= field.permanent_wilting_point_percent:
                    alerts.append(f"{field.field_name}: critically low soil moisture.")
                elif field.soil_moisture_percent > field.field_capacity_percent:
                    alerts.append(f"{field.field_name}: moisture exceeds field capacity.")
            latest = latest_by_field.get(field.id)
            if latest:
                alerts.extend(f"{field.field_name}: {message}" for message in latest.alerts)
            field_history = history_by_field.get(field.id, [])
            if len(field_history) >= 4:
                latest_use = field_history[0].water_used_litres
                recent_average = sum(item.water_used_litres for item in field_history[1:4]) / 3.0
                if recent_average > 0.0 and latest_use > recent_average * 1.5:
                    alerts.append(f"{field.field_name}: latest recorded water use is over 50% above the previous three irrigations.")

        return IrrigationDashboardResponse(
            total_fields=len(fields),
            fields_requiring_irrigation=sum(
                1 for recommendation in latest_by_field.values() if recommendation.status == "Required"
            ),
            average_soil_moisture_percent=(
                round(sum(moisture_values) / len(moisture_values), 1) if moisture_values else None
            ),
            estimated_water_requirement_litres=round(
                sum(
                    recommendation.required_water_litres or 0.0
                    for recommendation in latest_by_field.values()
                    if recommendation.status in ("Required", "Monitor")
                ),
                1,
            ),
            potential_water_savings_litres=round(
                sum(item.estimated_water_saved_litres for item in latest_by_field.values()),
                1,
            ),
            fields=fields,
            recommendations=[
                IrrigationRecommendationResponse(
                    field_name=next(field.field_name for field in fields if field.id == item.field_id),
                    crop_name=next(field.crop_name for field in fields if field.id == item.field_id),
                    **_recommendation_dict(item),
                )
                for item in latest_by_field.values()
            ],
            schedules=[IrrigationScheduleResponse.model_validate(item) for item in schedules],
            history=[IrrigationHistoryResponse.model_validate(item) for item in history],
            alerts=list(dict.fromkeys(alerts)),
        )

    @staticmethod
    async def analytics(db: AsyncSession, user_id: int) -> dict[str, Any]:
        fields = await IrrigationService.list_fields(db, user_id)
        field_names = {field.id: field.field_name for field in fields}
        crop_names = {field.id: field.crop_name for field in fields}
        since = datetime.now(timezone.utc) - timedelta(days=30)
        reading_result = await db.execute(
            select(SoilMoistureReading)
            .join(IrrigationField, SoilMoistureReading.field_id == IrrigationField.id)
            .where(IrrigationField.user_id == user_id, SoilMoistureReading.recorded_at >= since)
            .order_by(SoilMoistureReading.recorded_at)
            .limit(300)
        )
        readings = list(reading_result.scalars().all())
        history_result = await db.execute(
            select(IrrigationHistory)
            .where(IrrigationHistory.user_id == user_id, IrrigationHistory.irrigated_at >= since)
            .order_by(IrrigationHistory.irrigated_at)
            .limit(300)
        )
        history = list(history_result.scalars().all())
        recommendation_result = await db.execute(
            select(IrrigationRecommendation)
            .where(IrrigationRecommendation.user_id == user_id)
            .order_by(desc(IrrigationRecommendation.generated_at))
            .limit(100)
        )
        recommendations = list(recommendation_result.scalars().all())
        latest_recommendations: dict[int, IrrigationRecommendation] = {}
        for item in recommendations:
            latest_recommendations.setdefault(item.field_id, item)

        daily_consumption: dict[str, float] = {}
        for item in history:
            day = _as_utc(item.irrigated_at).date().isoformat()
            daily_consumption[day] = daily_consumption.get(day, 0.0) + item.water_used_litres
        return {
            "water_used_litres": round(sum(item.water_used_litres for item in history), 1),
            "potential_water_savings_litres": round(
                sum(item.estimated_water_saved_litres for item in latest_recommendations.values()), 1
            ),
            "recommendations_count": len(recommendations),
            "completed_irrigations_count": len(history),
            "soil_moisture_trend": [
                {
                    "date": _as_utc(item.recorded_at).date().isoformat(),
                    "field_name": field_names.get(item.field_id, "Field"),
                    "moisture_percent": item.soil_moisture_percent,
                    "source": item.source,
                }
                for item in readings
            ],
            "crop_water_demand": [
                {
                    "crop": crop_names.get(item.field_id, "Crop"),
                    "etc_mm_day": item.etc_mm_day,
                    "field_name": field_names.get(item.field_id, "Field"),
                }
                for item in recommendations
                if item.etc_mm_day is not None
            ],
            "water_consumption": [
                {"date": day, "litres": round(litres, 1)}
                for day, litres in sorted(daily_consumption.items())
            ],
            "irrigation_history": [IrrigationHistoryResponse.model_validate(item) for item in history],
        }

    @staticmethod
    async def record_sensor_reading(
        db: AsyncSession,
        field: IrrigationField,
        request: IrrigationSensorReadingCreate,
    ) -> SoilMoistureReading:
        recorded_at = request.recorded_at or datetime.now(timezone.utc)
        reading = SoilMoistureReading(
            field_id=field.id,
            soil_moisture_percent=request.soil_moisture_percent,
            temperature_c=request.temperature_c,
            humidity_percent=request.humidity_percent,
            source=request.source,
            device_id=request.device_id,
            recorded_at=recorded_at,
        )
        field.soil_moisture_percent = request.soil_moisture_percent
        field.moisture_source = request.source
        field.moisture_updated_at = recorded_at
        db.add(reading)
        await db.flush()
        return reading

    @staticmethod
    async def record_irrigation(
        db: AsyncSession,
        user_id: int,
        request: IrrigationHistoryCreate,
    ) -> IrrigationHistory:
        field = await IrrigationService.get_field(db, user_id, request.field_id)
        return await IrrigationHistoryService.record(db, user_id, field, request)


def _recommendation_dict(item: IrrigationRecommendation) -> dict[str, Any]:
    return {
        "id": item.id,
        "field_id": item.field_id,
        "status": item.status,
        "recommended_date": item.recommended_date,
        "recommended_time": item.recommended_time,
        "net_requirement_mm": item.net_requirement_mm,
        "gross_requirement_mm": item.gross_requirement_mm,
        "required_water_litres": item.required_water_litres,
        "estimated_duration_minutes": item.estimated_duration_minutes,
        "recommended_method": item.recommended_method,
        "irrigation_efficiency": item.irrigation_efficiency,
        "et0_mm_day": item.et0_mm_day,
        "etc_mm_day": item.etc_mm_day,
        "effective_rainfall_mm": item.effective_rainfall_mm,
        "soil_depletion_mm": item.soil_depletion_mm,
        "readily_available_water_mm": item.readily_available_water_mm,
        "estimated_water_saved_litres": item.estimated_water_saved_litres,
        "weather_source": item.weather_source,
        "calculation_basis": item.calculation_basis,
        "explanation": item.explanation,
        "alerts": item.alerts,
        "generated_at": item.generated_at,
    }


def _as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)
