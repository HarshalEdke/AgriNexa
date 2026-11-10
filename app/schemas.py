from typing import Optional, Dict, Any
from pydantic import BaseModel, Field, field_validator, ValidationInfo, EmailStr
from datetime import datetime
from uuid import UUID

ALLOWED_EMAIL_DOMAINS = {"gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com"}

class UserRegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6)

    @field_validator("email")
    @classmethod
    def validate_email_domain(cls, v: str) -> str:
        domain = v.split('@')[-1].lower()
        if domain not in ALLOWED_EMAIL_DOMAINS:
            raise ValueError("Email provider not supported")
        if "." not in domain:
            raise ValueError("Invalid email domain format")
        return v

class UserLoginRequest(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: int
    email: EmailStr
    is_active: bool
    created_at: datetime

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"



class HealthResponse(BaseModel):
    status: str = "ok"

class PredictionResponse(BaseModel):
    predicted_class: str
    confidence: float = Field(..., ge=0.0, le=1.0)
    model_version: str
    display_name: Optional[str] = None
    precaution: Optional[str] = None
    probabilities: Optional[Dict[str, float]] = None
    pipeline: Optional[str] = None
    leaf_detected: Optional[bool] = None
    roi_count: Optional[int] = None
    fallback_used: Optional[bool] = None
    is_conclusive: Optional[bool] = True
    status: Optional[str] = "confident"
    rejection_reason: Optional[str] = None
    crop_class: Optional[str] = None
    crop_confidence: Optional[float] = None

class ErrorResponse(BaseModel):
    detail: str
    status: Optional[str] = None
    is_conclusive: Optional[bool] = None
    rejection_reason: Optional[str] = None

class CropRecommendationRequest(BaseModel):
    state: str
    district: str
    temperature: float = Field(..., ge=-10.0, le=60.0)
    humidity: float = Field(..., ge=0.0, le=100.0)
    rainfall: float = Field(..., ge=0.0, le=5000.0)
    soil_type: str
    previous_crop: str
    season: Optional[str] = None
    top_k: int = Field(default=3, ge=1, le=10)

class RankedCropRecommendation(BaseModel):
    crop: str
    probability: float
    confidence_tier: str

class CropRecommendationResponse(BaseModel):
    recommended_crop: str
    confidence: float
    confidence_level: str
    recommendations: list[RankedCropRecommendation]
    top_k_recommendations: list[RankedCropRecommendation]
    explanation: str
    model_version: str
    input_features: dict

class DiseaseMetadata(BaseModel):
    display_name: str
    symptoms: str
    treatment: str
    precautions: Optional[str] = None


class WeatherLocation(BaseModel):
    name: str
    country: str = "Unknown"
    latitude: float
    longitude: float
    state: Optional[str] = None
    district: Optional[str] = None


class WeatherCurrent(BaseModel):
    temperature: float
    humidity: float
    wind_speed: float
    weather_code: int
    condition: str
    precipitation: Optional[float] = 0.0


class WeatherDaily(BaseModel):
    temp_min: float
    temp_max: float
    precipitation_sum: float
    precipitation_probability: float


class SeasonalClimate(BaseModel):
    season: str
    temperature_mean: float
    humidity_mean: float
    rainfall_normal: float
    region: str
    soil_type_default: Optional[str] = None


class WeatherResponse(BaseModel):
    location: WeatherLocation
    current: WeatherCurrent
    daily: WeatherDaily
    climate: Optional[SeasonalClimate] = None
    advisories: list[str] = []
    timestamp: Optional[datetime] = None


class WeatherContext(BaseModel):
    risk_level: Optional[str] = None
    rainfall_probability: Optional[float] = Field(None, ge=0.0, le=1.0)
    temperature: Optional[float] = None
    humidity: Optional[float] = None


class ChatHistoryMessage(BaseModel):
    role: str = Field(..., pattern="^(user|assistant)$")
    content: str


class ChatContext(BaseModel):
    predicted_class: str
    confidence: float = Field(..., ge=0.0, le=1.0)
    probabilities: Dict[str, float]
    model_version: str
    leaf_detected: Optional[bool] = None
    fallback_used: Optional[bool] = False
    disease_metadata: Optional[DiseaseMetadata] = None
    weather_context: Optional[WeatherContext] = None
    location_context: Optional[Dict] = None
    farmer_context: Optional[Dict] = None
    question: str = Field(..., min_length=1, max_length=500)
    session_id: UUID
    language: Optional[str] = Field("en")
    history: list[ChatHistoryMessage] = Field(default_factory=list)

    @field_validator("question")
    @classmethod
    def validate_question(cls, v: str) -> str:
        trimmed = v.strip()
        if not trimmed:
            raise ValueError("question cannot be empty after trimming")
        return trimmed

    @field_validator("probabilities")
    @classmethod
    def validate_probabilities(cls, v: Dict[str, float]) -> Dict[str, float]:
        for cls_name, prob in v.items():
            if not (0.0 <= prob <= 1.0):
                raise ValueError(f"probability for {cls_name} must be between 0.0 and 1.0")
        return v

    @field_validator("language")
    @classmethod
    def validate_language(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in ("en", "hi", "gu", "mr", "ta", "pa"):
            raise ValueError("unsupported language code")
        return v


class ChatAnswer(BaseModel):
    answer: str
    session_id: UUID
    grounded: bool
    source: str
    timestamp: datetime
class ChatRequest(BaseModel):
    predicted_class: str
    confidence: float = Field(..., ge=0.0, le=1.0)
    probabilities: Dict[str, float]
    model_version: str
    leaf_detected: Optional[bool] = None
    fallback_used: Optional[bool] = False
    question: str = Field(..., min_length=1, max_length=500)
    session_id: UUID
    language: Optional[str] = Field("en")

    @field_validator("question")
    @classmethod
    def validate_question(cls, v: str) -> str:
        trimmed = v.strip()
        if not trimmed:
            raise ValueError("question cannot be empty after trimming")
        return trimmed

    @field_validator("probabilities")
    @classmethod
    def validate_probabilities(cls, v: Dict[str, float]) -> Dict[str, float]:
        for cls_name, prob in v.items():
            if not (0.0 <= prob <= 1.0):
                raise ValueError(f"probability for {cls_name} must be between 0.0 and 1.0")
        return v

    @field_validator("language")
    @classmethod
    def validate_language(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in ("en", "hi", "gu", "mr", "ta", "pa"):
            raise ValueError("unsupported language code")
        return v

class ChatSessionResponse(BaseModel):
    id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

class ChatMessageResponse(BaseModel):
    id: int
    role: str
    content: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ===================================# Simulated IoT Sensor Telemetry Schemas
# ===================================
class SensorTelemetry(BaseModel):
    soil_moisture_percent: float = Field(..., ge=0.0, le=100.0, description="Volumetric or capacitive soil moisture %")
    soil_temperature_celsius: float = Field(..., ge=-10.0, le=60.0, description="Root-zone temperature in °C")
    irrigation_flow_rate_lpm: float = Field(default=30.0, ge=0.0, description="Drip/sprinkler flow rate in Liters/Minute")
    irrigation_duration_minutes: int = Field(default=60, ge=0, description="Nominal irrigation cycle duration in minutes")
    water_tank_level_percent: Optional[float] = Field(default=85.0, ge=0.0, le=100.0, description="Water storage tank level %")
    soil_ph: Optional[float] = Field(default=6.8, ge=0.0, le=14.0, description="Soil pH reading")
    soil_ec_ds_m: Optional[float] = Field(default=1.2, ge=0.0, description="Soil Electrical Conductivity in dS/m")
    is_simulated: bool = Field(default=True, description="True if telemetry originates from simulated IoT layer")


class IoTPreset(BaseModel):
    preset_id: str
    name: str
    description: str
    telemetry: SensorTelemetry


class IoTPresetsResponse(BaseModel):
    presets: list[IoTPreset]


# ===================================# Sustainability Score Schemas
# ===================================
class SustainabilityScoreRequest(BaseModel):
    crop: str = Field(..., min_length=1, description="Target crop name")
    farm_area_hectares: float = Field(default=0.1, gt=0.0, le=10000.0, description="Farm plot size in hectares")
    soil_type: Optional[str] = Field(default=None, description="Soil classification")
    previous_crop: Optional[str] = Field(default=None, description="Previously harvested crop")
    action: str = Field(default="delay", pattern="^(delay|irrigate_now)$", description="Planned irrigation decision")

    # Climatological parameters (from live weather or user)
    temperature_celsius: float = Field(..., ge=-10.0, le=60.0, description="Ambient air temperature in °C")
    humidity_percent: float = Field(..., ge=0.0, le=100.0, description="Relative humidity in %")
    rain_probability_percent: float = Field(default=0.0, ge=0.0, le=100.0, description="Probability of rain in %")
    expected_rainfall_mm: float = Field(default=0.0, ge=0.0, le=1000.0, description="Expected precipitation in mm")

    # Optional IoT telemetry override (defaults to simulated optimal profile if omitted)
    telemetry: Optional[SensorTelemetry] = Field(default=None, description="Simulated or real IoT telemetry")
    soil_moisture_percent: Optional[float] = Field(default=None, ge=0.0, le=100.0, description="Convenience override for soil moisture")


class ScoreBreakdownItem(BaseModel):
    dimension: str
    points: float
    max_points: float
    percentage: float
    reason: str
    status: str


class WaterImpactEstimate(BaseModel):
    litres: int
    impact_type: str  # "saved", "unnecessary_use", "neutral"
    label: str
    formula_basis: str


class ActionComparisonOption(BaseModel):
    action: str
    score: int
    score_label: str
    water_impact_litres: int
    water_impact_type: str


class SustainabilityScoreResponse(BaseModel):
    total_score: int
    score_label: str  # "Excellent", "Good", "Needs Improvement"
    summary: str
    recommendation: str
    breakdown: dict[str, ScoreBreakdownItem]
    water_impact: WaterImpactEstimate
    comparison: dict[str, ActionComparisonOption]
    telemetry_used: SensorTelemetry
    simulated_telemetry_notice: str


# ===================================
# Weather Intelligence Schemas
# ===================================
class WeatherIntelligenceRequest(BaseModel):
    location: str = Field(..., min_length=1, description="City, district, or town name")
    crop: Optional[str] = Field(default=None, description="Current or planned crop species")
    soil_moisture_percent: Optional[float] = Field(
        default=None, ge=0.0, le=100.0, description="Volumetric soil moisture percentage"
    )
    soil_type: Optional[str] = Field(default=None, description="Soil classification: clay, sandy, black, loam, etc.")
    diagnosed_disease: Optional[str] = Field(default=None, description="Diagnosed disease class or display name")
    irrigation_status: Optional[str] = Field(default=None, description="Current or planned irrigation status")
    forecast_days: int = Field(default=7, ge=1, le=7, description="Number of daily forecast days (1-7)")


class ForecastDay(BaseModel):
    date: str
    temp_min: float
    temp_max: float
    precipitation_sum: float
    precipitation_probability: float
    weather_code: int
    condition: str


class AgronomicAlert(BaseModel):
    category: str
    severity: str
    action: str
    title: str
    message: str
    reason: str
    priority: int


class PrimaryAction(BaseModel):
    action: str
    badge_label: str
    headline: str
    detail: str
    severity: str


class WeatherIntelligenceResponse(BaseModel):
    location: WeatherLocation
    current: WeatherCurrent
    forecast_daily: list[ForecastDay]
    primary_action: PrimaryAction
    alerts: list[AgronomicAlert]
    farm_context_applied: Dict[str, Any]
    farm_context_complete: bool
    data_source: str = "Open-Meteo API & India Meteorological Department (IMD) Normals"
    timestamp: Optional[datetime] = None
