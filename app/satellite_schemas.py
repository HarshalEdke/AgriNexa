from datetime import date
from typing import Any

from pydantic import BaseModel, Field, model_validator

from app.services.satellite_geospatial_service import geometry_summary, normalize_geometry


class SatelliteFieldBoundaryInput(BaseModel):
    field_id: int = Field(..., gt=0)
    geometry: dict[str, Any]

    @model_validator(mode="after")
    def validate_geometry(self) -> "SatelliteFieldBoundaryInput":
        self.geometry = normalize_geometry(self.geometry)
        geometry_summary(self.geometry)
        return self


class SatelliteAnalysisRequest(BaseModel):
    start_date: date
    end_date: date
    max_cloud_coverage_percent: float = Field(default=30.0, ge=0.0, le=100.0)

    @model_validator(mode="after")
    def validate_period(self) -> "SatelliteAnalysisRequest":
        if self.end_date < self.start_date:
            raise ValueError("End date must be on or after start date.")
        if (self.end_date - self.start_date).days > 366:
            raise ValueError("Satellite analysis date ranges cannot exceed 366 days.")
        if self.end_date > date.today():
            raise ValueError("Satellite analysis end date cannot be in the future.")
        return self


class SatelliteFieldResponse(BaseModel):
    id: int
    field_name: str
    crop_name: str
    area_hectares: float
    boundary: dict[str, Any] | None
    geometry_summary: dict[str, Any] | None


class SatelliteObservationResponse(BaseModel):
    id: int
    field_id: int
    acquisition_date: date
    source: str
    cloud_coverage_percent: float | None
    spatial_resolution_m: int
    statistics: dict[str, Any]

    model_config = {"from_attributes": True}


class SatelliteAvailabilityResponse(BaseModel):
    provider: str
    configured: bool
    status: str
    message: str


class SatelliteCompareRequest(BaseModel):
    observation_ids: list[int] = Field(..., min_length=2, max_length=20)
