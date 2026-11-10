from datetime import datetime, timezone
from math import log
from typing import Any

import httpx
from fastapi import HTTPException, status

from app.config import settings
from app.irrigation_schemas import IrrigationForecastDay, IrrigationWeatherResponse
from app.services.weather_service import WeatherService


async def fetch_irrigation_weather(location: str) -> IrrigationWeatherResponse:
    """Fetch Open-Meteo data with radiation fields needed for FAO-56 ET0."""
    weather_service = WeatherService()
    async with httpx.AsyncClient(timeout=httpx.Timeout(weather_service.timeout)) as client:
        geo = await weather_service.geocode_location(location, client)
        try:
            response = await client.get(
                settings.OPEN_METEO_FORECAST_URL,
                params={
                    "latitude": geo["latitude"],
                    "longitude": geo["longitude"],
                    "current": "temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation",
                    "daily": (
                        "temperature_2m_max,temperature_2m_min,relative_humidity_2m_mean,"
                        "wind_speed_10m_mean,precipitation_sum,precipitation_probability_max,"
                        "shortwave_radiation_sum"
                    ),
                    "wind_speed_unit": "ms",
                    "forecast_days": 7,
                    "timezone": "auto",
                },
            )
            response.raise_for_status()
            payload: dict[str, Any] = response.json()
        except httpx.TimeoutException as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Irrigation weather forecast timed out.",
            ) from exc
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Unable to reach the irrigation weather provider.",
            ) from exc
        except httpx.HTTPStatusError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Irrigation weather provider returned {exc.response.status_code}.",
            ) from exc

    daily = payload.get("daily", {})
    dates = daily.get("time", [])
    forecast: list[IrrigationForecastDay] = []
    for index, forecast_date in enumerate(dates[:7]):
        forecast.append(
            IrrigationForecastDay(
                date=forecast_date,
                temp_min_c=_value(daily, "temperature_2m_min", index),
                temp_max_c=_value(daily, "temperature_2m_max", index),
                humidity_percent=_value(daily, "relative_humidity_2m_mean", index),
                wind_speed_m_s=_wind_10m_to_2m(_value(daily, "wind_speed_10m_mean", index)),
                solar_radiation_mj_m2_day=_value(daily, "shortwave_radiation_sum", index),
                rainfall_mm=_value(daily, "precipitation_sum", index) or 0.0,
                rainfall_probability_percent=_value(daily, "precipitation_probability_max", index) or 0.0,
            )
        )

    current = payload.get("current", {})
    return IrrigationWeatherResponse(
        location=geo.get("name", location),
        source="open_meteo",
        current={
            "temperature_c": current.get("temperature_2m"),
            "humidity_percent": current.get("relative_humidity_2m"),
            "wind_speed_m_s": _wind_10m_to_2m(
                float(current["wind_speed_10m"]) if current.get("wind_speed_10m") is not None else None
            ),
            "rainfall_mm": current.get("precipitation", 0.0),
            "temp_min_c": _value(daily, "temperature_2m_min", 0),
            "temp_max_c": _value(daily, "temperature_2m_max", 0),
            "solar_radiation_mj_m2_day": _value(daily, "shortwave_radiation_sum", 0),
            "elevation_m": payload.get("elevation", geo.get("elevation")),
            "latitude": geo.get("latitude"),
            "longitude": geo.get("longitude"),
            "rainfall_probability_percent": _value(daily, "precipitation_probability_max", 0) or 0.0,
        },
        forecast=forecast,
        retrieved_at=datetime.now(timezone.utc),
    )


def _value(data: dict[str, Any], key: str, index: int) -> float | None:
    values = data.get(key, [])
    if index >= len(values) or values[index] is None:
        return None
    return float(values[index])


def _wind_10m_to_2m(wind_speed_10m: float | None) -> float | None:
    if wind_speed_10m is None:
        return None
    return wind_speed_10m * 4.87 / log(67.8 * 10.0 - 5.42)
