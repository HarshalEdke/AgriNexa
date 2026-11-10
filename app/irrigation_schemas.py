from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, model_validator


SoilType = Literal["sandy", "loamy", "clay", "black", "red"]
IrrigationMethod = Literal["drip", "sprinkler", "surface", "micro_sprinkler"]


class IrrigationFieldCreate(BaseModel):
    field_name: str = Field(..., min_length=1, max_length=120)
    crop_name: str = Field(..., min_length=1, max_length=100)
    crop_variety: Optional[str] = Field(default=None, max_length=100)
    growth_stage: str = Field(..., min_length=1, max_length=60)
    sowing_date: Optional[date] = None
    crop_duration_days: Optional[int] = Field(default=None, ge=1, le=1500)
    root_depth_m: float = Field(..., gt=0.0, le=5.0)
    kc: Optional[float] = Field(default=None, gt=0.0, le=2.5)
    soil_type: SoilType
    soil_moisture_percent: Optional[float] = Field(default=None, ge=0.0, le=100.0)
    field_capacity_percent: float = Field(..., gt=0.0, le=100.0)
    permanent_wilting_point_percent: float = Field(..., ge=0.0, le=100.0)
    soil_water_holding_capacity_mm_per_m: Optional[float] = Field(default=None, gt=0.0, le=500.0)
    location: Optional[str] = Field(default=None, max_length=160)
    latitude: Optional[float] = Field(default=None, ge=-90.0, le=90.0)
    longitude: Optional[float] = Field(default=None, ge=-180.0, le=180.0)
    area_hectares: float = Field(..., gt=0.0, le=10000.0)
    irrigation_method: IrrigationMethod
    irrigation_efficiency: Optional[float] = Field(default=None, gt=0.0, le=1.0)
    flow_rate_lpm: Optional[float] = Field(default=None, gt=0.0, le=10_000_000.0)
    water_source: Optional[str] = Field(default=None, max_length=120)

    @model_validator(mode="after")
    def validate_soil_readings(self) -> "IrrigationFieldCreate":
        if self.permanent_wilting_point_percent >= self.field_capacity_percent:
            raise ValueError("Permanent wilting point must be lower than field capacity.")
        return self


class IrrigationFieldResponse(BaseModel):
    id: int
    field_name: str
    crop_name: str
    crop_variety: Optional[str]
    growth_stage: str
    sowing_date: Optional[date]
    crop_duration_days: Optional[int]
    root_depth_m: float
    kc: float
    kc_source: str
    soil_type: str
    soil_moisture_percent: Optional[float]
    moisture_source: Optional[str]
    moisture_updated_at: Optional[datetime]
    field_capacity_percent: float
    permanent_wilting_point_percent: float
    soil_water_holding_capacity_mm_per_m: Optional[float]
    location: Optional[str]
    latitude: Optional[float]
    longitude: Optional[float]
    area_hectares: float
    irrigation_method: str
    irrigation_efficiency: float
    flow_rate_lpm: Optional[float]
    water_source: Optional[str]
    last_irrigation_at: Optional[datetime]
    created_at: datetime

    model_config = {"from_attributes": True}


class IrrigationForecastDay(BaseModel):
    date: date
    temp_min_c: Optional[float] = Field(default=None, ge=-60.0, le=70.0)
    temp_max_c: Optional[float] = Field(default=None, ge=-60.0, le=70.0)
    humidity_percent: Optional[float] = Field(default=None, ge=0.0, le=100.0)
    wind_speed_m_s: Optional[float] = Field(default=None, ge=0.0, le=100.0)
    solar_radiation_mj_m2_day: Optional[float] = Field(default=None, ge=0.0, le=60.0)
    rainfall_mm: float = Field(default=0.0, ge=0.0, le=1000.0)
    rainfall_probability_percent: float = Field(default=0.0, ge=0.0, le=100.0)


class IrrigationWeatherInput(BaseModel):
    source: Literal["manual", "sensor", "open_meteo"] = "manual"
    latitude: Optional[float] = Field(default=None, ge=-90.0, le=90.0)
    longitude: Optional[float] = Field(default=None, ge=-180.0, le=180.0)
    observed_at: Optional[datetime] = None
    temperature_c: Optional[float] = Field(default=None, ge=-60.0, le=70.0)
    temp_min_c: Optional[float] = Field(default=None, ge=-60.0, le=70.0)
    temp_max_c: Optional[float] = Field(default=None, ge=-60.0, le=70.0)
    humidity_percent: Optional[float] = Field(default=None, ge=0.0, le=100.0)
    wind_speed_m_s: Optional[float] = Field(default=None, ge=0.0, le=100.0)
    solar_radiation_mj_m2_day: Optional[float] = Field(default=None, ge=0.0, le=60.0)
    elevation_m: Optional[float] = Field(default=None, ge=-500.0, le=9000.0)
    rainfall_mm: float = Field(default=0.0, ge=0.0, le=1000.0)
    rainfall_probability_percent: float = Field(default=0.0, ge=0.0, le=100.0)
    forecast: list[IrrigationForecastDay] = Field(default_factory=list, max_length=7)

    @model_validator(mode="after")
    def validate_temperature_range(self) -> "IrrigationWeatherInput":
        if self.temp_min_c is not None and self.temp_max_c is not None and self.temp_min_c > self.temp_max_c:
            raise ValueError("Minimum temperature cannot exceed maximum temperature.")
        return self


class IrrigationRecommendationRequest(BaseModel):
    field_id: int = Field(..., gt=0)
    weather: Optional[IrrigationWeatherInput] = None


class IrrigationRecommendationResponse(BaseModel):
    id: int
    field_id: int
    field_name: str
    crop_name: str
    status: Literal["Required", "Not Required", "Monitor"]
    recommended_date: Optional[date]
    recommended_time: Optional[str]
    net_requirement_mm: Optional[float]
    gross_requirement_mm: Optional[float]
    required_water_litres: Optional[float]
    estimated_duration_minutes: Optional[float]
    recommended_method: str
    irrigation_efficiency: float
    et0_mm_day: Optional[float]
    etc_mm_day: Optional[float]
    effective_rainfall_mm: float
    soil_depletion_mm: Optional[float]
    readily_available_water_mm: Optional[float]
    estimated_water_saved_litres: float
    weather_source: str
    calculation_basis: str
    explanation: str
    alerts: list[str]
    generated_at: datetime

    model_config = {"from_attributes": True}


class IrrigationSensorReadingCreate(BaseModel):
    soil_moisture_percent: float = Field(..., ge=0.0, le=100.0)
    temperature_c: Optional[float] = Field(default=None, ge=-60.0, le=70.0)
    humidity_percent: Optional[float] = Field(default=None, ge=0.0, le=100.0)
    source: Literal["simulated", "hardware"] = "simulated"
    device_id: Optional[str] = Field(default=None, max_length=120)
    recorded_at: Optional[datetime] = None


class IrrigationSensorReadingResponse(BaseModel):
    id: int
    field_id: int
    soil_moisture_percent: float
    temperature_c: Optional[float]
    humidity_percent: Optional[float]
    source: str
    device_id: Optional[str]
    recorded_at: datetime

    model_config = {"from_attributes": True}


class IrrigationScheduleCreate(BaseModel):
    recommendation_id: int = Field(..., gt=0)
    scheduled_at: datetime
    notes: Optional[str] = Field(default=None, max_length=500)


class IrrigationScheduleComplete(BaseModel):
    water_used_litres: float = Field(..., gt=0.0, le=100_000_000.0)
    duration_minutes: Optional[float] = Field(default=None, gt=0.0)
    notes: Optional[str] = Field(default=None, max_length=500)


class IrrigationSchedulePostpone(BaseModel):
    scheduled_at: datetime
    notes: Optional[str] = Field(default=None, max_length=500)


class IrrigationScheduleResponse(BaseModel):
    id: int
    field_id: int
    recommendation_id: int
    scheduled_at: datetime
    status: str
    planned_water_litres: Optional[float]
    notes: Optional[str]
    completed_at: Optional[datetime]

    model_config = {"from_attributes": True}


class IrrigationHistoryCreate(BaseModel):
    field_id: int = Field(..., gt=0)
    irrigated_at: datetime
    water_used_litres: float = Field(..., gt=0.0, le=100_000_000.0)
    duration_minutes: Optional[float] = Field(default=None, gt=0.0)
    method: Optional[IrrigationMethod] = None
    notes: Optional[str] = Field(default=None, max_length=500)


class IrrigationHistoryResponse(BaseModel):
    id: int
    field_id: int
    irrigated_at: datetime
    water_used_litres: float
    duration_minutes: Optional[float]
    method: str
    notes: Optional[str]

    model_config = {"from_attributes": True}


class IrrigationWeatherResponse(BaseModel):
    location: str
    source: str
    current: dict
    forecast: list[IrrigationForecastDay]
    retrieved_at: datetime


class IrrigationDashboardResponse(BaseModel):
    total_fields: int
    fields_requiring_irrigation: int
    average_soil_moisture_percent: Optional[float]
    estimated_water_requirement_litres: float
    potential_water_savings_litres: float
    fields: list[IrrigationFieldResponse]
    recommendations: list[IrrigationRecommendationResponse]
    schedules: list[IrrigationScheduleResponse]
    history: list[IrrigationHistoryResponse]
    alerts: list[str]


class IrrigationAnalyticsResponse(BaseModel):
    water_used_litres: float
    potential_water_savings_litres: float
    recommendations_count: int
    completed_irrigations_count: int
    soil_moisture_trend: list[dict]
    crop_water_demand: list[dict]
    water_consumption: list[dict]
    irrigation_history: list[IrrigationHistoryResponse]
