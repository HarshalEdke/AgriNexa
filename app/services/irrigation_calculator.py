"""Unit-explicit irrigation and FAO-56 reference evapotranspiration calculations."""

from datetime import date
from math import acos, cos, exp, pi, sin, sqrt, tan
from typing import Optional

from app.irrigation_schemas import IrrigationWeatherInput

SOLAR_CONSTANT_MJ_M2_MIN = 0.0820
STEFAN_BOLTZMANN_MJ_K4_M2_DAY = 4.903e-9


def saturation_vapour_pressure_kpa(temperature_c: float) -> float:
    return 0.6108 * exp((17.27 * temperature_c) / (temperature_c + 237.3))


def calculate_fao56_et0(
    weather: IrrigationWeatherInput,
    latitude: Optional[float],
    calculation_date: date,
) -> Optional[float]:
    """Return daily ET0 (mm/day) when the required FAO-56 weather inputs exist.

    Relative humidity is a mean-RH estimate of actual vapour pressure.
    """
    temp_min = weather.temp_min_c
    temp_max = weather.temp_max_c
    if temp_min is None or temp_max is None:
        return None
    if weather.humidity_percent is None or weather.wind_speed_m_s is None:
        return None
    if weather.solar_radiation_mj_m2_day is None or latitude is None or weather.elevation_m is None:
        return None

    t_mean = (temp_min + temp_max) / 2.0
    delta = (4098.0 * saturation_vapour_pressure_kpa(t_mean)) / ((t_mean + 237.3) ** 2)
    pressure = 101.3 * (((293.0 - 0.0065 * weather.elevation_m) / 293.0) ** 5.26)
    psychrometric_constant = 0.000665 * pressure
    es = (saturation_vapour_pressure_kpa(temp_min) + saturation_vapour_pressure_kpa(temp_max)) / 2.0
    ea = saturation_vapour_pressure_kpa(t_mean) * weather.humidity_percent / 100.0

    latitude_rad = latitude * pi / 180.0
    day_angle = 2.0 * pi * calculation_date.timetuple().tm_yday / 365.0
    inverse_distance = 1.0 + 0.033 * cos(day_angle)
    solar_declination = 0.409 * sin(day_angle - 1.39)
    sunset_argument = -tan(latitude_rad) * tan(solar_declination)
    sunset_angle = acos(max(-1.0, min(1.0, sunset_argument)))
    extraterrestrial_radiation = (
        (24.0 * 60.0 / pi)
        * SOLAR_CONSTANT_MJ_M2_MIN
        * inverse_distance
        * (
            sunset_angle * sin(latitude_rad) * sin(solar_declination)
            + cos(latitude_rad) * cos(solar_declination) * sin(sunset_angle)
        )
    )
    clear_sky_radiation = (0.75 + 2e-5 * weather.elevation_m) * extraterrestrial_radiation
    if extraterrestrial_radiation <= 0.0 or clear_sky_radiation <= 0.0:
        return None

    shortwave = weather.solar_radiation_mj_m2_day
    net_shortwave = 0.77 * shortwave
    cloudiness = max(0.05, min(1.0, 1.35 * shortwave / clear_sky_radiation - 0.35))
    net_longwave = (
        STEFAN_BOLTZMANN_MJ_K4_M2_DAY
        * (((temp_max + 273.16) ** 4 + (temp_min + 273.16) ** 4) / 2.0)
        * (0.34 - 0.14 * sqrt(max(ea, 0.0)))
        * cloudiness
    )
    net_radiation = net_shortwave - net_longwave
    et0 = (
        0.408 * delta * net_radiation
        + psychrometric_constant * (900.0 / (t_mean + 273.0)) * weather.wind_speed_m_s * (es - ea)
    ) / (delta + psychrometric_constant * (1.0 + 0.34 * weather.wind_speed_m_s))
    return round(max(0.0, et0), 3)


def calculate_effective_rainfall_mm(
    rainfall_mm: float,
    rainfall_probability_percent: float,
    root_zone_storage_capacity_mm: Optional[float],
) -> float:
    """Estimate dependable rain as probability-weighted precipitation within root-zone storage."""
    expected_rain = rainfall_mm * rainfall_probability_percent / 100.0
    effective_rain = (
        min(expected_rain, root_zone_storage_capacity_mm)
        if root_zone_storage_capacity_mm is not None
        else expected_rain
    )
    return round(effective_rain, 3)


def calculate_water_volume_m3(depth_mm: float, area_hectares: float) -> float:
    """Convert irrigation depth and area to volume: mm × ha × 10 = m³."""
    return round(depth_mm * area_hectares * 10.0, 4)


def calculate_irrigation_duration_minutes(
    water_volume_m3: float,
    flow_rate_lpm: Optional[float],
) -> Optional[float]:
    if flow_rate_lpm is None or flow_rate_lpm <= 0.0:
        return None
    return round(water_volume_m3 * 1000.0 / flow_rate_lpm, 1)
