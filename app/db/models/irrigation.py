from datetime import date, datetime
from typing import Any, Optional

from sqlalchemy import Date, DateTime, Float, ForeignKey, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.models.base import Base


class IrrigationField(Base):
    __tablename__ = "irrigation_fields"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    field_name: Mapped[str] = mapped_column(String(120), nullable=False)
    crop_name: Mapped[str] = mapped_column(String(100), nullable=False)
    crop_variety: Mapped[Optional[str]] = mapped_column(String(100))
    growth_stage: Mapped[str] = mapped_column(String(60), nullable=False)
    sowing_date: Mapped[Optional[date]] = mapped_column(Date)
    crop_duration_days: Mapped[Optional[int]]
    root_depth_m: Mapped[float] = mapped_column(Float, nullable=False)
    kc: Mapped[float] = mapped_column(Float, nullable=False)
    kc_source: Mapped[str] = mapped_column(String(40), nullable=False)
    soil_type: Mapped[str] = mapped_column(String(20), nullable=False)
    soil_moisture_percent: Mapped[Optional[float]] = mapped_column(Float)
    moisture_source: Mapped[Optional[str]] = mapped_column(String(20))
    moisture_updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    field_capacity_percent: Mapped[float] = mapped_column(Float, nullable=False)
    permanent_wilting_point_percent: Mapped[float] = mapped_column(Float, nullable=False)
    soil_water_holding_capacity_mm_per_m: Mapped[Optional[float]] = mapped_column(Float)
    location: Mapped[Optional[str]] = mapped_column(String(160))
    latitude: Mapped[Optional[float]] = mapped_column(Float)
    longitude: Mapped[Optional[float]] = mapped_column(Float)
    boundary_geojson: Mapped[Optional[dict[str, Any]]] = mapped_column(JSON)
    area_hectares: Mapped[float] = mapped_column(Float, nullable=False)
    irrigation_method: Mapped[str] = mapped_column(String(30), nullable=False)
    irrigation_efficiency: Mapped[float] = mapped_column(Float, nullable=False)
    flow_rate_lpm: Mapped[Optional[float]] = mapped_column(Float)
    water_source: Mapped[Optional[str]] = mapped_column(String(120))
    last_irrigation_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class SatelliteObservation(Base):
    __tablename__ = "satellite_observations"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    field_id: Mapped[int] = mapped_column(
        ForeignKey("irrigation_fields.id", ondelete="CASCADE"), index=True, nullable=False
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    acquisition_date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    source: Mapped[str] = mapped_column(String(40), nullable=False)
    cloud_coverage_percent: Mapped[Optional[float]] = mapped_column(Float)
    spatial_resolution_m: Mapped[int] = mapped_column(nullable=False, default=10)
    statistics: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class SoilMoistureReading(Base):
    __tablename__ = "soil_moisture_readings"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    field_id: Mapped[int] = mapped_column(ForeignKey("irrigation_fields.id", ondelete="CASCADE"), index=True, nullable=False)
    soil_moisture_percent: Mapped[float] = mapped_column(Float, nullable=False)
    temperature_c: Mapped[Optional[float]] = mapped_column(Float)
    humidity_percent: Mapped[Optional[float]] = mapped_column(Float)
    source: Mapped[str] = mapped_column(String(20), nullable=False)
    device_id: Mapped[Optional[str]] = mapped_column(String(120))
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class IrrigationRecommendation(Base):
    __tablename__ = "irrigation_recommendations"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    field_id: Mapped[int] = mapped_column(ForeignKey("irrigation_fields.id", ondelete="CASCADE"), index=True, nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False)
    recommended_date: Mapped[Optional[date]] = mapped_column(Date)
    recommended_time: Mapped[Optional[str]] = mapped_column(String(20))
    net_requirement_mm: Mapped[Optional[float]] = mapped_column(Float)
    gross_requirement_mm: Mapped[Optional[float]] = mapped_column(Float)
    required_water_litres: Mapped[Optional[float]] = mapped_column(Float)
    estimated_duration_minutes: Mapped[Optional[float]] = mapped_column(Float)
    recommended_method: Mapped[str] = mapped_column(String(30), nullable=False)
    irrigation_efficiency: Mapped[float] = mapped_column(Float, nullable=False)
    et0_mm_day: Mapped[Optional[float]] = mapped_column(Float)
    etc_mm_day: Mapped[Optional[float]] = mapped_column(Float)
    effective_rainfall_mm: Mapped[float] = mapped_column(Float, nullable=False)
    soil_depletion_mm: Mapped[Optional[float]] = mapped_column(Float)
    readily_available_water_mm: Mapped[Optional[float]] = mapped_column(Float)
    estimated_water_saved_litres: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    weather_source: Mapped[str] = mapped_column(String(30), nullable=False)
    calculation_basis: Mapped[str] = mapped_column(String(80), nullable=False)
    explanation: Mapped[str] = mapped_column(Text, nullable=False)
    alerts: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    calculation_data: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class IrrigationSchedule(Base):
    __tablename__ = "irrigation_schedules"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    field_id: Mapped[int] = mapped_column(ForeignKey("irrigation_fields.id", ondelete="CASCADE"), index=True, nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    recommendation_id: Mapped[int] = mapped_column(
        ForeignKey("irrigation_recommendations.id", ondelete="CASCADE"), nullable=False
    )
    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="scheduled")
    planned_water_litres: Mapped[Optional[float]] = mapped_column(Float)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class IrrigationHistory(Base):
    __tablename__ = "irrigation_history"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    field_id: Mapped[int] = mapped_column(ForeignKey("irrigation_fields.id", ondelete="CASCADE"), index=True, nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    irrigated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    water_used_litres: Mapped[float] = mapped_column(Float, nullable=False)
    duration_minutes: Mapped[Optional[float]] = mapped_column(Float)
    method: Mapped[str] = mapped_column(String(30), nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text)


class WeatherRecord(Base):
    __tablename__ = "weather_records"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    field_id: Mapped[int] = mapped_column(ForeignKey("irrigation_fields.id", ondelete="CASCADE"), index=True, nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    source: Mapped[str] = mapped_column(String(30), nullable=False)
    current_data: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    forecast_data: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False)
    retrieved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class CropWaterParameter(Base):
    __tablename__ = "crop_water_parameters"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    crop_name: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    kc_initial: Mapped[float] = mapped_column(Float, nullable=False)
    kc_mid: Mapped[float] = mapped_column(Float, nullable=False)
    kc_end: Mapped[float] = mapped_column(Float, nullable=False)
    depletion_fraction: Mapped[float] = mapped_column(Float, nullable=False, default=0.5)
    source: Mapped[str] = mapped_column(String(120), nullable=False)
