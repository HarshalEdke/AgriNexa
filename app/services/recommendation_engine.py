from datetime import date, timedelta
from typing import Any

from app.db.models.irrigation import IrrigationField
from app.irrigation_schemas import IrrigationWeatherInput
from app.services.irrigation_calculator import (
    calculate_effective_rainfall_mm,
    calculate_fao56_et0,
    calculate_irrigation_duration_minutes,
    calculate_water_volume_m3,
)

METHOD_EFFICIENCY = {
    "drip": 0.90,
    "micro_sprinkler": 0.85,
    "sprinkler": 0.75,
    "surface": 0.60,
}


def build_recommendation(
    field: IrrigationField,
    weather: IrrigationWeatherInput | None,
    depletion_fraction: float,
) -> dict[str, Any]:
    today = date.today()
    alerts: list[str] = []
    moisture = field.soil_moisture_percent
    available_capacity_mm = field.soil_water_holding_capacity_mm_per_m
    if available_capacity_mm is None:
        available_capacity_mm = (
            field.field_capacity_percent - field.permanent_wilting_point_percent
        ) * 10.0
    total_available_water_mm = available_capacity_mm * field.root_depth_m
    readily_available_water_mm = total_available_water_mm * depletion_fraction

    soil_depletion_mm = None
    projected_depletion_mm = None
    if moisture is not None:
        soil_depletion_mm = min(
            total_available_water_mm,
            max(0.0, (field.field_capacity_percent - moisture) * 10.0 * field.root_depth_m),
        )
        projected_depletion_mm = soil_depletion_mm

    et0_mm_day = None
    etc_mm_day = None
    effective_rainfall_mm = 0.0
    weather_source = "unavailable"
    rain_day = None
    rain_expected = False
    projected_depletion_before_rain = None
    if weather is not None:
        weather_source = weather.source
        day_one = weather.forecast[0] if weather.forecast else None
        rain_day = next(
            (
                forecast_day
                for forecast_day in weather.forecast[:3]
                if forecast_day.rainfall_mm >= 5.0
                and forecast_day.rainfall_probability_percent >= 60.0
            ),
            None,
        )
        rain_expected = rain_day is not None or (
            weather.rainfall_mm >= 5.0 and weather.rainfall_probability_percent >= 60.0
        )
        temp_min = weather.temp_min_c if weather.temp_min_c is not None else (day_one.temp_min_c if day_one else None)
        temp_max = weather.temp_max_c if weather.temp_max_c is not None else (day_one.temp_max_c if day_one else None)
        humidity = day_one.humidity_percent if day_one and day_one.humidity_percent is not None else weather.humidity_percent
        wind = day_one.wind_speed_m_s if day_one and day_one.wind_speed_m_s is not None else weather.wind_speed_m_s
        radiation = (
            weather.solar_radiation_mj_m2_day
            if weather.solar_radiation_mj_m2_day is not None
            else (day_one.solar_radiation_mj_m2_day if day_one else None)
        )
        rainfall = weather.rainfall_mm
        rain_probability = weather.rainfall_probability_percent
        if day_one is not None:
            if rainfall <= 0.0:
                rainfall = day_one.rainfall_mm
            if rain_probability <= 0.0:
                rain_probability = day_one.rainfall_probability_percent
        if rain_day is not None and (rainfall < rain_day.rainfall_mm or rain_probability < rain_day.rainfall_probability_percent):
            rainfall = rain_day.rainfall_mm
            rain_probability = rain_day.rainfall_probability_percent
        calculation_weather = weather.model_copy(
            update={
                "temp_min_c": temp_min,
                "temp_max_c": temp_max,
                "humidity_percent": humidity,
                "wind_speed_m_s": wind,
                "solar_radiation_mj_m2_day": radiation,
                "rainfall_mm": rainfall,
                "rainfall_probability_percent": rain_probability,
            }
        )
        latitude = field.latitude if field.latitude is not None else weather.latitude
        et0_mm_day = calculate_fao56_et0(calculation_weather, latitude, today)
        if et0_mm_day is not None:
            etc_mm_day = round(et0_mm_day * field.kc, 3)
        demand_days = (
            max(1, (rain_day.date - today).days + 1)
            if rain_day is not None
            else 1
        )
        demand_until_rain = (etc_mm_day or 0.0) * demand_days
        if soil_depletion_mm is not None:
            projected_depletion_before_rain = min(
                total_available_water_mm,
                soil_depletion_mm + demand_until_rain,
            )
            rain_storage_capacity = min(
                total_available_water_mm,
                soil_depletion_mm + demand_until_rain,
            )
        else:
            rain_storage_capacity = demand_until_rain if etc_mm_day is not None else None
        effective_rainfall_mm = calculate_effective_rainfall_mm(
            rainfall,
            rain_probability,
            rain_storage_capacity,
        )
        if projected_depletion_mm is not None:
            projected_depletion_mm = min(
                total_available_water_mm,
                max(0.0, projected_depletion_mm + demand_until_rain - effective_rainfall_mm),
            )

    if moisture is None:
        alerts.append("Soil moisture is unknown. Add a manual or sensor reading before relying on a water quantity.")
    elif moisture <= field.permanent_wilting_point_percent:
        alerts.append("Crop water-stress risk: root-zone moisture is at or below the permanent wilting point.")
    elif soil_depletion_mm is not None and soil_depletion_mm >= readily_available_water_mm:
        alerts.append("Root-zone depletion has reached the crop's readily available water threshold.")
    if moisture is not None and moisture > field.field_capacity_percent:
        alerts.append("Soil moisture exceeds field capacity; pause irrigation and check for saturation or sensor calibration.")
    if weather and weather.temperature_c is not None and weather.temperature_c >= 35.0:
        alerts.append("High temperature increases crop water demand; avoid midday irrigation.")
    if weather and weather.wind_speed_m_s is not None and weather.wind_speed_m_s >= 8.0:
        alerts.append("High wind can increase sprinkler losses; prefer drip or irrigate during calmer hours.")

    if weather is not None:
        if rain_expected:
            alerts.append("Rain is likely soon; postpone irrigation where root-zone conditions allow.")
            if rain_day is not None:
                alerts[-1] = f"Rain is forecast for {rain_day.date.isoformat()}; postpone irrigation where root-zone conditions allow."

    needs_irrigation = (
        projected_depletion_mm is not None
        and projected_depletion_mm >= readily_available_water_mm
    )
    was_due_before_rain = (
        projected_depletion_before_rain is not None
        and projected_depletion_before_rain >= readily_available_water_mm
    )
    if moisture is None:
        status = "Monitor"
    elif needs_irrigation and not rain_expected:
        status = "Required"
    elif rain_expected and was_due_before_rain:
        status = "Monitor"
    elif needs_irrigation:
        status = "Required"
    else:
        status = "Not Required"

    net_requirement_mm: float | None = 0.0 if moisture is not None else None
    if moisture is not None and needs_irrigation:
        remaining_depletion = projected_depletion_mm or 0.0
        net_requirement_mm = round(max(0.0, min(total_available_water_mm, remaining_depletion)), 3)

    gross_requirement_mm: float | None = None
    water_litres: float | None = None
    duration_minutes: float | None = None
    saved_litres = 0.0
    if net_requirement_mm is not None:
        gross_requirement_mm = round(net_requirement_mm / field.irrigation_efficiency, 3)
        water_litres = round(calculate_water_volume_m3(gross_requirement_mm, field.area_hectares) * 1000.0, 1)
        gross_flow_duration = calculate_irrigation_duration_minutes(
            water_litres / 1000.0,
            field.flow_rate_lpm,
        )
        duration_minutes = gross_flow_duration
        if effective_rainfall_mm > 0.0 and status in ("Monitor", "Not Required"):
            rain_avoided_depth = min(effective_rainfall_mm, projected_depletion_before_rain or 0.0)
            saved_litres = round(
                rain_avoided_depth
                / field.irrigation_efficiency
                * field.area_hectares
                * 10_000.0,
                1,
            )

    recommended_date = today if status == "Required" else None
    if status == "Monitor" and moisture is not None:
        if rain_day is not None:
            recommended_date = rain_day.date + timedelta(days=1)
        elif net_requirement_mm and net_requirement_mm > 0.0:
            recommended_date = today + timedelta(days=1)
    if status == "Monitor" and moisture is None:
        recommended_date = None
    recommended_time = "06:00" if recommended_date is not None else None

    if et0_mm_day is not None:
        basis = "FAO-56 Penman-Monteith ET0 + root-zone balance"
    else:
        basis = "Root-zone soil-water balance; ET0 unavailable"

    explanation_parts: list[str] = []
    if status == "Required":
        explanation_parts.append(
            f"Projected root-zone depletion ({projected_depletion_mm:.1f} mm) meets or exceeds "
            f"the readily available water threshold ({readily_available_water_mm:.1f} mm)."
        )
    elif status == "Not Required":
        explanation_parts.append(
            f"Projected depletion ({projected_depletion_mm:.1f} mm) remains below the "
            f"readily available water threshold ({readily_available_water_mm:.1f} mm)."
        )
    else:
        explanation_parts.append("Monitor the field because a current soil-moisture reading is unavailable.")
    if etc_mm_day is not None:
        explanation_parts.append(f"Estimated crop demand is {etc_mm_day:.1f} mm/day (ET0 × Kc).")
    else:
        explanation_parts.append("ET0/ETc was not calculated because the required weather inputs are incomplete.")
    if effective_rainfall_mm > 0.0:
        explanation_parts.append(f"Effective rainfall is estimated at {effective_rainfall_mm:.1f} mm.")
    explanation_parts.append(
        f"Gross application uses {field.irrigation_efficiency:.0%} efficiency for {field.irrigation_method.replace('_', ' ')}."
    )
    if field.kc_source == "generic_fao_reference":
        explanation_parts.append("The crop Kc is a generic planning reference; verify it for the local variety and stage.")
    if status == "Monitor" and rain_day is not None:
        explanation_parts.append("A likely rainfall event is forecast; reassess after the event.")

    if moisture is not None and not alerts:
        alerts.append("No threshold alerts; continue monitoring soil moisture.")

    return {
        "status": status,
        "recommended_date": recommended_date,
        "recommended_time": recommended_time,
        "net_requirement_mm": net_requirement_mm,
        "gross_requirement_mm": gross_requirement_mm,
        "required_water_litres": water_litres,
        "estimated_duration_minutes": duration_minutes,
        "recommended_method": field.irrigation_method,
        "irrigation_efficiency": field.irrigation_efficiency,
        "et0_mm_day": et0_mm_day,
        "etc_mm_day": etc_mm_day,
        "effective_rainfall_mm": effective_rainfall_mm,
        "soil_depletion_mm": round(soil_depletion_mm, 3) if soil_depletion_mm is not None else None,
        "readily_available_water_mm": round(readily_available_water_mm, 3),
        "estimated_water_saved_litres": saved_litres,
        "weather_source": weather_source,
        "calculation_basis": basis,
        "explanation": " ".join(explanation_parts),
        "alerts": alerts,
        "calculation_data": {
            "reference_evapotranspiration_mm_day": et0_mm_day,
            "crop_coefficient": field.kc,
            "crop_evapotranspiration_mm_day": etc_mm_day,
            "soil_depletion_mm": soil_depletion_mm,
            "readily_available_water_mm": readily_available_water_mm,
            "effective_rainfall_mm": effective_rainfall_mm,
            "root_depth_m": field.root_depth_m,
            "area_hectares": field.area_hectares,
            "irrigation_efficiency": field.irrigation_efficiency,
            "weather_source": weather_source,
            "model": "transparent_rules_based_fallback; no trained irrigation model configured",
        },
    }
