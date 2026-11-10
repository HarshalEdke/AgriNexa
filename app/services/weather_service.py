"""Weather Intelligence Service module.

Responsible exclusively for fetching weather metrics from Open-Meteo,
normalizing them into standard AgriNexa weather schemas, and generating
deterministic agronomic farm advisories.
"""

from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
import httpx
from fastapi import HTTPException, status

from app.config import settings
from app.schemas import (
    WeatherLocation,
    WeatherCurrent,
    WeatherDaily,
    WeatherResponse,
    SeasonalClimate,
)
from app.services.climate_service import (
    get_seasonal_climate,
    SeasonalClimateUnavailableError,
)

WMO_WEATHER_CODES: Dict[int, str] = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    56: "Light freezing drizzle",
    57: "Dense freezing drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    66: "Light freezing rain",
    67: "Heavy freezing rain",
    71: "Slight snow fall",
    73: "Moderate snow fall",
    75: "Heavy snow fall",
    77: "Snow grains",
    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    85: "Slight snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with slight hail",
    99: "Thunderstorm with heavy hail",
}


def get_weather_condition(weather_code: int) -> str:
    """Map WMO weather code to human-readable condition string."""
    return WMO_WEATHER_CODES.get(weather_code, "Unknown conditions")


def generate_farm_advisories(
    precipitation_sum: float,
    precipitation_probability: float,
    max_temp: float,
    humidity: float,
    wind_speed: float,
) -> List[str]:
    """Generate deterministic rule-based agricultural advisory messages.

    Rules:
    1. Expected rainfall >= 5 mm: 'Rain is expected today. Postpone irrigation where possible.'
    2. Rain probability >= 60%: 'High chance of rain. Avoid applying fertilizer or pesticide immediately before rainfall.'
    3. Temperature >= 35°C: 'High heat expected. Irrigate early morning or evening to reduce water loss.'
    4. Humidity >= 80%: 'High humidity may increase fungal disease risk. Inspect crops and avoid prolonged leaf wetness.'
    5. Wind speed >= 25 km/h: 'Strong wind expected. Avoid spraying pesticides or nutrients.'
    6. Default if none apply: 'Weather conditions are generally suitable for routine farm activities.'

    Returns 1 to 3 prioritized advisory strings.
    """
    advisories: List[str] = []

    # Rule 1: High rainfall expected
    if precipitation_sum >= 5.0:
        advisories.append("Rain is expected today. Postpone irrigation where possible.")

    # Rule 2: High rain probability
    if precipitation_probability >= 60.0:
        advisories.append(
            "High chance of rain. Avoid applying fertilizer or pesticide immediately before rainfall."
        )

    # Rule 3: Extreme heat / high temperature
    if max_temp >= 35.0:
        advisories.append(
            "High heat expected. Irrigate early morning or evening to reduce water loss."
        )

    # Rule 4: High relative humidity (fungal disease risk)
    if humidity >= 80.0:
        advisories.append(
            "High humidity may increase fungal disease risk. Inspect crops and avoid prolonged leaf wetness."
        )

    # Rule 5: High wind speed
    if wind_speed >= 25.0:
        advisories.append("Strong wind expected. Avoid spraying pesticides or nutrients.")

    # Rule 6: Fallback if no specific condition triggered
    if not advisories:
        advisories.append(
            "Weather conditions are generally suitable for routine farm activities."
        )

    # Cap to top 3 advisories for optimal farmer readability
    return advisories[:3]


class WeatherService:
    """Service layer handling external provider communication, validation, and normalization."""

    def __init__(self, timeout_seconds: Optional[float] = None):
        self.timeout = timeout_seconds or settings.WEATHER_REQUEST_TIMEOUT_SECONDS

    async def geocode_location(self, location: str, client: httpx.AsyncClient) -> Dict[str, Any]:
        """Geocode location query string to coordinates via Open-Meteo Geocoding API."""
        cleaned = location.strip()
        if not cleaned:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Location parameter cannot be empty.",
            )

        try:
            geo_response = await client.get(
                settings.OPEN_METEO_GEOCODING_URL,
                params={
                    "name": cleaned,
                    "count": 1,
                    "language": "en",
                    "format": "json",
                },
            )
            geo_response.raise_for_status()
            geo_data = geo_response.json()
        except httpx.TimeoutException:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Geocoding service timed out. Please try again.",
            )
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Unable to reach geocoding provider: {str(exc)}",
            )
        except httpx.HTTPStatusError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Geocoding provider returned error: {exc.response.status_code}",
            )

        results = geo_data.get("results")
        if not results or len(results) == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Location '{cleaned}' not found. Please verify the city or district name.",
            )

        return results[0]

    async def fetch_forecast_data(
        self, latitude: float, longitude: float, client: httpx.AsyncClient, forecast_days: int = 7
    ) -> Dict[str, Any]:
        """Fetch real-time atmospheric metrics and daily forecast from Open-Meteo API."""
        try:
            forecast_response = await client.get(
                settings.OPEN_METEO_FORECAST_URL,
                params={
                    "latitude": latitude,
                    "longitude": longitude,
                    "current": "temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,precipitation",
                    "daily": "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max",
                    "forecast_days": forecast_days,
                    "timezone": "auto",
                },
            )
            forecast_response.raise_for_status()
            return forecast_response.json()
        except httpx.TimeoutException:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Weather forecast service timed out. Please try again.",
            )
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Unable to reach weather forecast provider: {str(exc)}",
            )
        except httpx.HTTPStatusError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Weather forecast provider returned error: {exc.response.status_code}",
            )

    def normalize_response(
        self, geo_match: Dict[str, Any], forecast_data: Dict[str, Any], query_location: str
    ) -> WeatherResponse:
        """Normalize raw provider JSON into typed WeatherResponse model."""
        loc_name = geo_match.get("name") or query_location.strip().title()
        country = geo_match.get("country", "Unknown")
        state = geo_match.get("admin1")
        district = geo_match.get("admin2") or geo_match.get("admin3")
        latitude = float(geo_match.get("latitude", 0.0))
        longitude = float(geo_match.get("longitude", 0.0))

        current = forecast_data.get("current", {})
        daily = forecast_data.get("daily", {})

        temp_curr = float(current.get("temperature_2m", 0.0))
        humidity = float(current.get("relative_humidity_2m", 0.0))
        wind_speed = float(current.get("wind_speed_10m", 0.0))
        precipitation_curr = float(current.get("precipitation", 0.0))
        weather_code = int(current.get("weather_code", 0))
        condition = get_weather_condition(weather_code)

        temp_min_list = daily.get("temperature_2m_min", [temp_curr])
        temp_min = float(temp_min_list[0]) if temp_min_list and temp_min_list[0] is not None else temp_curr

        temp_max_list = daily.get("temperature_2m_max", [temp_curr])
        temp_max = float(temp_max_list[0]) if temp_max_list and temp_max_list[0] is not None else temp_curr

        precip_sum_list = daily.get("precipitation_sum", [precipitation_curr])
        precipitation_sum = float(precip_sum_list[0]) if precip_sum_list and precip_sum_list[0] is not None else precipitation_curr

        precip_prob_list = daily.get("precipitation_probability_max", [0.0])
        precipitation_probability = (
            float(precip_prob_list[0])
            if precip_prob_list and precip_prob_list[0] is not None
            else 0.0
        )

        advisories = generate_farm_advisories(
            precipitation_sum=precipitation_sum,
            precipitation_probability=precipitation_probability,
            max_temp=temp_max,
            humidity=humidity,
            wind_speed=wind_speed,
        )

        climate: Optional[SeasonalClimate] = None
        lookup_state = state or loc_name
        if lookup_state:
            try:
                climate = get_seasonal_climate(state=lookup_state, district=district)
            except SeasonalClimateUnavailableError:
                climate = None

        return WeatherResponse(
            location=WeatherLocation(
                name=loc_name,
                country=country,
                latitude=latitude,
                longitude=longitude,
                state=state,
                district=district,
            ),
            current=WeatherCurrent(
                temperature=temp_curr,
                humidity=humidity,
                wind_speed=wind_speed,
                weather_code=weather_code,
                condition=condition,
                precipitation=precipitation_curr,
            ),
            daily=WeatherDaily(
                temp_min=temp_min,
                temp_max=temp_max,
                precipitation_sum=precipitation_sum,
                precipitation_probability=precipitation_probability,
            ),
            climate=climate,
            advisories=advisories,
            timestamp=datetime.now(timezone.utc),
        )

    async def get_weather_by_location(self, location: str) -> WeatherResponse:
        """Fetch, validate, and normalize weather data for a specified location name."""
        cleaned_location = location.strip()
        if not cleaned_location:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Location parameter cannot be empty.",
            )

        timeout = httpx.Timeout(self.timeout)
        async with httpx.AsyncClient(timeout=timeout) as client:
            geo_match = await self.geocode_location(cleaned_location, client)
            latitude = float(geo_match.get("latitude", 0.0))
            longitude = float(geo_match.get("longitude", 0.0))
            forecast_data = await self.fetch_forecast_data(latitude, longitude, client)

        return self.normalize_response(geo_match, forecast_data, cleaned_location)


_default_weather_service = WeatherService()


async def fetch_weather_by_location(location: str) -> WeatherResponse:
    """Convenience functional interface for fetching weather by location."""
    return await _default_weather_service.get_weather_by_location(location)
