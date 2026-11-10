"""Simulated IoT Sensor Service for AgriNexa AI.

Provides deterministic, reproducible telemetry representing root-zone capacitance,
soil temperature probes, and smart irrigation flow meters.
Designed so simulated telemetry can later be swapped with real MQTT/LoRaWAN sensor streams
without changing the Sustainability Engine API contract.
"""

from typing import Optional, Dict
from app.schemas import SensorTelemetry, IoTPreset, IoTPresetsResponse

# Deterministic scenario presets for stable demos and automated testing
IOT_PRESETS: Dict[str, IoTPreset] = {
    "optimal_loam": IoTPreset(
        preset_id="optimal_loam",
        name="Optimal Field Capacity",
        description="Healthy root-zone moisture (32%) and balanced soil temperature (24°C).",
        telemetry=SensorTelemetry(
            soil_moisture_percent=32.0,
            soil_temperature_celsius=24.0,
            irrigation_flow_rate_lpm=30.0,
            irrigation_duration_minutes=60,
            water_tank_level_percent=85.0,
            soil_ph=6.8,
            soil_ec_ds_m=1.2,
            is_simulated=True,
        ),
    ),
    "dry_deficit": IoTPreset(
        preset_id="dry_deficit",
        name="Root-Zone Moisture Deficit",
        description="Moisture below wilting threshold (18%), indicating legitimate irrigation requirement.",
        telemetry=SensorTelemetry(
            soil_moisture_percent=18.0,
            soil_temperature_celsius=28.5,
            irrigation_flow_rate_lpm=35.0,
            irrigation_duration_minutes=90,
            water_tank_level_percent=60.0,
            soil_ph=7.2,
            soil_ec_ds_m=1.5,
            is_simulated=True,
        ),
    ),
    "saturated_heavy": IoTPreset(
        preset_id="saturated_heavy",
        name="Over-Saturated Soil (Waterlogged)",
        description="Excess root-zone water (48%) presenting hypoxia and fungal infection hazards.",
        telemetry=SensorTelemetry(
            soil_moisture_percent=48.0,
            soil_temperature_celsius=21.5,
            irrigation_flow_rate_lpm=25.0,
            irrigation_duration_minutes=45,
            water_tank_level_percent=95.0,
            soil_ph=6.5,
            soil_ec_ds_m=1.0,
            is_simulated=True,
        ),
    ),
    "heat_stress": IoTPreset(
        preset_id="heat_stress",
        name="High Heat & Transpiration Stress",
        description="Elevated soil temperature (36°C) and rapid evapotranspiration conditions.",
        telemetry=SensorTelemetry(
            soil_moisture_percent=23.0,
            soil_temperature_celsius=36.0,
            irrigation_flow_rate_lpm=40.0,
            irrigation_duration_minutes=75,
            water_tank_level_percent=50.0,
            soil_ph=7.0,
            soil_ec_ds_m=1.8,
            is_simulated=True,
        ),
    ),
}


class IoTSensorService:
    """Service providing simulated IoT field sensor streams."""

    @staticmethod
    def get_all_presets() -> IoTPresetsResponse:
        """Return all standard deterministic presets."""
        return IoTPresetsResponse(presets=list(IOT_PRESETS.values()))

    @staticmethod
    def get_preset(preset_id: str) -> Optional[SensorTelemetry]:
        """Retrieve telemetry by preset identifier."""
        preset = IOT_PRESETS.get(preset_id)
        if preset:
            return preset.telemetry.model_copy()
        return None

    @classmethod
    def resolve_telemetry(
        cls,
        telemetry_override: Optional[SensorTelemetry] = None,
        soil_moisture_override: Optional[float] = None,
        default_preset: str = "optimal_loam",
    ) -> SensorTelemetry:
        """Resolve telemetry by applying user/request overrides over deterministic presets."""
        if telemetry_override is not None:
            telemetry = telemetry_override.model_copy()
        else:
            base = cls.get_preset(default_preset) or IOT_PRESETS["optimal_loam"].telemetry
            telemetry = base.model_copy()

        if soil_moisture_override is not None:
            telemetry.soil_moisture_percent = round(float(soil_moisture_override), 1)

        return telemetry
