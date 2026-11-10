"""Copernicus Data Space Sentinel-2 Statistical API integration."""

from datetime import date, datetime, time, timedelta, timezone
import math
from typing import Any

import httpx

from app.config import settings
from app.services.satellite_geospatial_service import geometry_summary


class SatelliteProviderUnavailable(Exception):
    """Raised when Copernicus credentials or the remote service are unavailable."""


class Sentinel2Service:
    provider_name = "Copernicus Data Space Sentinel-2 L2A"

    def __init__(self) -> None:
        self._token: str | None = None
        self._token_expires_at = datetime.min.replace(tzinfo=timezone.utc)

    @property
    def configured(self) -> bool:
        return bool(settings.COPERNICUS_CLIENT_ID and settings.COPERNICUS_CLIENT_SECRET)

    async def availability(self) -> dict[str, Any]:
        if not self.configured:
            return {
                "provider": self.provider_name,
                "configured": False,
                "status": "credentials_required",
                "message": "Configure COPERNICUS_CLIENT_ID and COPERNICUS_CLIENT_SECRET to query real Sentinel-2 observations.",
            }
        return {
            "provider": self.provider_name,
            "configured": True,
            "status": "ready",
            "message": "Copernicus credentials are configured; imagery is queried on demand.",
        }

    async def fetch_statistics(
        self,
        geometry: dict[str, Any],
        start_date: date,
        end_date: date,
        max_cloud_coverage_percent: float,
    ) -> list[dict[str, Any]]:
        token = await self._access_token()
        start = datetime.combine(start_date, time.min, tzinfo=timezone.utc)
        end = datetime.combine(end_date + timedelta(days=1), time.min, tzinfo=timezone.utc)
        time_range = {
            "from": start.isoformat().replace("+00:00", "Z"),
            "to": end.isoformat().replace("+00:00", "Z"),
        }
        payload = {
            "input": {
                "bounds": {
                    "geometry": geometry,
                    "properties": {"crs": "http://www.opengis.net/def/crs/EPSG/0/4326"},
                },
                "data": [
                    {
                        "type": "sentinel-2-l2a",
                        "dataFilter": {
                            "timeRange": time_range,
                            "maxCloudCoverage": max_cloud_coverage_percent,
                        },
                    }
                ],
            },
            "aggregation": {
                "timeRange": time_range,
                "aggregationInterval": {"of": "P1D"},
                "resx": 10,
                "resy": 10,
                "evalscript": _STATISTICS_EVALSCRIPT,
            },
            "calculations": {
                "default": {
                    "histograms": {"B0": {"nBins": 100, "lowEdge": -1, "highEdge": 1}},
                    "statistics": {
                        "default": {
                            "percentiles": {
                                "k": [50],
                            }
                        }
                    },
                }
            },
        }

        try:
            async with httpx.AsyncClient(
                timeout=settings.SATELLITE_REQUEST_TIMEOUT_SECONDS
            ) as client:
                response = await client.post(
                    settings.COPERNICUS_STATISTICAL_URL,
                    json=payload,
                    headers={"Authorization": f"Bearer {token}"},
                )
                response.raise_for_status()
                result = response.json()
        except httpx.TimeoutException as exc:
            raise SatelliteProviderUnavailable(
                "Copernicus satellite request timed out. Please try again later."
            ) from exc
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code in (401, 403):
                raise SatelliteProviderUnavailable(
                    "Copernicus rejected the configured credentials or satellite-data permission."
                ) from exc
            if exc.response.status_code == 429:
                raise SatelliteProviderUnavailable(
                    "Copernicus rate limit reached. Please try again later."
                ) from exc
            raise SatelliteProviderUnavailable(
                f"Copernicus satellite request failed with status {exc.response.status_code}."
            ) from exc
        except httpx.RequestError as exc:
            raise SatelliteProviderUnavailable(
                "Copernicus satellite service could not be reached."
            ) from exc
        except ValueError as exc:
            raise SatelliteProviderUnavailable(
                "Copernicus returned an invalid satellite statistics response."
            ) from exc

        if not isinstance(result, dict) or not isinstance(result.get("data"), list):
            raise SatelliteProviderUnavailable(
                "Copernicus returned an unexpected satellite statistics response."
            )
        return [
            observation
            for entry in result["data"]
            if (observation := _parse_observation(entry)) is not None
        ]

    async def fetch_ndvi_map(
        self,
        geometry: dict[str, Any],
        acquisition_date: date,
        max_cloud_coverage_percent: float = 30.0,
    ) -> bytes:
        token = await self._access_token()
        start = datetime.combine(acquisition_date, time.min, tzinfo=timezone.utc)
        end = start + timedelta(days=1)
        bounds = geometry_summary(geometry)["bounds"]
        if bounds[0] == bounds[2] or bounds[1] == bounds[3]:
            raise SatelliteProviderUnavailable(
                "The field boundary is too small to render a georeferenced satellite overlay."
            )
        payload = {
            "input": {
                "bounds": {
                    "geometry": geometry,
                    "properties": {"crs": "http://www.opengis.net/def/crs/EPSG/0/4326"},
                },
                "data": [
                    {
                        "type": "sentinel-2-l2a",
                        "dataFilter": {
                            "timeRange": {
                                "from": start.isoformat().replace("+00:00", "Z"),
                                "to": end.isoformat().replace("+00:00", "Z"),
                            },
                            "maxCloudCoverage": max_cloud_coverage_percent,
                        },
                    }
                ],
            },
            "output": {
                "width": 512,
                "height": 512,
                "responses": [
                    {"identifier": "default", "format": {"type": "image/png"}}
                ],
            },
            "evalscript": _MAP_EVALSCRIPT,
        }
        try:
            async with httpx.AsyncClient(
                timeout=settings.SATELLITE_REQUEST_TIMEOUT_SECONDS
            ) as client:
                response = await client.post(
                    settings.COPERNICUS_PROCESS_URL,
                    json=payload,
                    headers={"Authorization": f"Bearer {token}"},
                )
                response.raise_for_status()
                if not response.content.startswith(b"\x89PNG\r\n\x1a\n"):
                    raise SatelliteProviderUnavailable(
                        "Copernicus returned an invalid NDVI map image."
                    )
                return response.content
        except httpx.TimeoutException as exc:
            raise SatelliteProviderUnavailable(
                "Copernicus map request timed out. Please try again later."
            ) from exc
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code in (401, 403):
                raise SatelliteProviderUnavailable(
                    "Copernicus rejected the configured credentials or satellite-data permission."
                ) from exc
            if exc.response.status_code == 429:
                raise SatelliteProviderUnavailable(
                    "Copernicus rate limit reached. Please try again later."
                ) from exc
            raise SatelliteProviderUnavailable(
                f"Copernicus NDVI map request failed with status {exc.response.status_code}."
            ) from exc
        except httpx.RequestError as exc:
            raise SatelliteProviderUnavailable(
                "Copernicus satellite service could not be reached."
            ) from exc

    async def _access_token(self) -> str:
        if not self.configured:
            raise SatelliteProviderUnavailable(
                "Real Sentinel-2 data is unavailable until Copernicus credentials are configured."
            )
        if self._token and datetime.now(timezone.utc) < self._token_expires_at:
            return self._token

        try:
            async with httpx.AsyncClient(
                timeout=settings.SATELLITE_REQUEST_TIMEOUT_SECONDS
            ) as client:
                response = await client.post(
                    settings.COPERNICUS_TOKEN_URL,
                    data={
                        "grant_type": "client_credentials",
                        "client_id": settings.COPERNICUS_CLIENT_ID,
                        "client_secret": settings.COPERNICUS_CLIENT_SECRET,
                    },
                )
                response.raise_for_status()
                token_response = response.json()
        except httpx.TimeoutException as exc:
            raise SatelliteProviderUnavailable(
                "Copernicus authentication timed out. Please try again later."
            ) from exc
        except httpx.HTTPStatusError as exc:
            raise SatelliteProviderUnavailable(
                "Copernicus authentication failed; check the configured client credentials."
            ) from exc
        except httpx.RequestError as exc:
            raise SatelliteProviderUnavailable(
                "Copernicus authentication service could not be reached."
            ) from exc
        except ValueError as exc:
            raise SatelliteProviderUnavailable(
                "Copernicus returned an invalid authentication response."
            ) from exc

        if not isinstance(token_response, dict):
            raise SatelliteProviderUnavailable(
                "Copernicus returned an invalid authentication response."
            )
        access_token = token_response.get("access_token")
        expires_in = token_response.get("expires_in")
        if (
            not isinstance(access_token, str)
            or not access_token
            or not isinstance(expires_in, (int, float))
            or not math.isfinite(expires_in)
        ):
            raise SatelliteProviderUnavailable(
                "Copernicus authentication response did not contain a usable access token."
            )
        self._token = access_token
        self._token_expires_at = datetime.now(timezone.utc) + timedelta(
            seconds=max(expires_in - 60, 0)
        )
        return self._token


def _parse_observation(entry: Any) -> dict[str, Any] | None:
    if not isinstance(entry, dict):
        return None
    interval = entry.get("interval")
    outputs = entry.get("outputs")
    if not isinstance(interval, dict) or not isinstance(outputs, dict):
        return None
    try:
        acquisition_date = date.fromisoformat(str(interval["from"])[:10])
    except (KeyError, ValueError):
        return None

    output = outputs.get("default")
    bands = output.get("bands") if isinstance(output, dict) else None
    band = bands.get("B0") if isinstance(bands, dict) else None
    stats = band.get("stats") if isinstance(band, dict) else None
    if (
        not isinstance(stats, dict)
        or not isinstance(stats.get("mean"), (int, float))
        or not math.isfinite(stats["mean"])
        or not -1 <= stats["mean"] <= 1
    ):
        return None
    histogram = band.get("histogram")
    return {
        "acquisition_date": acquisition_date,
        "source": "sentinel-2-l2a",
        "cloud_coverage_percent": None,
        "spatial_resolution_m": 10,
        "statistics": {
            "mean": float(stats["mean"]),
            "minimum": _optional_ndvi(stats.get("min")),
            "maximum": _optional_ndvi(stats.get("max")),
            "median": _optional_ndvi(_median_percentile(stats)),
            "standard_deviation": _optional_nonnegative_float(stats.get("stDev")),
            "valid_pixels": _optional_int(stats.get("sampleCount")),
            "valid_pixel_percentage": None,
            "vegetation_distribution": _parse_histogram(histogram),
            "quality_note": (
                "Copernicus Statistical API returned aggregated pixel statistics. "
                "Cloud coverage of the specific acquisition is not included in this response."
            ),
        },
    }


def _optional_float(value: Any) -> float | None:
    return float(value) if isinstance(value, (int, float)) and math.isfinite(value) else None


def _optional_ndvi(value: Any) -> float | None:
    number = _optional_float(value)
    return number if number is not None and -1 <= number <= 1 else None


def _optional_nonnegative_float(value: Any) -> float | None:
    number = _optional_float(value)
    return number if number is not None and number >= 0 else None


def _optional_int(value: Any) -> int | None:
    return (
        int(value)
        if isinstance(value, (int, float))
        and math.isfinite(value)
        and value >= 0
        and float(value).is_integer()
        else None
    )


def _median_percentile(stats: dict[str, Any]) -> Any:
    percentiles = stats.get("percentiles")
    if not isinstance(percentiles, dict):
        return None
    return percentiles.get("50", percentiles.get("50.0", percentiles.get("p50")))


def _parse_histogram(histogram: Any) -> dict[str, dict[str, float | int]] | None:
    bins = histogram.get("bins") if isinstance(histogram, dict) else None
    if not isinstance(bins, list) or not bins:
        return None
    counts = {
        name: 0
        for name in (
            "non_vegetated_or_water",
            "very_low",
            "low",
            "moderate",
            "high",
            "very_high",
        )
    }
    valid_bins = 0
    for entry in bins:
        if not isinstance(entry, dict):
            continue
        count = entry.get("count")
        low_edge = entry.get("lowEdge")
        if (
            not isinstance(count, (int, float))
            or not math.isfinite(count)
            or count < 0
            or not isinstance(low_edge, (int, float))
            or not math.isfinite(low_edge)
        ):
            continue
        valid_bins += 1
        value = float(low_edge)
        if value < 0:
            key = "non_vegetated_or_water"
        elif value < 0.2:
            key = "very_low"
        elif value < 0.4:
            key = "low"
        elif value < 0.6:
            key = "moderate"
        elif value < 0.8:
            key = "high"
        else:
            key = "very_high"
        counts[key] += int(count)
    total = sum(counts.values())
    if not valid_bins or not total:
        return None
    return {
        key: {
            "pixels": count,
            "percentage": count / total * 100 if total else 0.0,
        }
        for key, count in counts.items()
    }


_STATISTICS_EVALSCRIPT = """//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B04", "B08", "SCL", "dataMask"] }],
    output: { bands: 1, sampleType: "FLOAT32" }
  };
}
function evaluatePixel(sample) {
  if (sample.dataMask === 0 || [3, 8, 9, 10, 11].includes(sample.SCL)) {
    return [NaN];
  }
  const denominator = sample.B08 + sample.B04;
  return denominator > 0 ? [(sample.B08 - sample.B04) / denominator] : [NaN];
}
"""

_MAP_EVALSCRIPT = """//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B04", "B08", "SCL", "dataMask"] }],
    output: { bands: 4, sampleType: "UINT8" }
  };
}
function evaluatePixel(sample) {
  if (sample.dataMask === 0 || [3, 8, 9, 10, 11].includes(sample.SCL)) {
    return [0, 0, 0, 0];
  }
  const denominator = sample.B08 + sample.B04;
  if (denominator <= 0) return [0, 0, 0, 0];
  const ndvi = (sample.B08 - sample.B04) / denominator;
  if (ndvi < 0.0) return [110, 125, 139, 190];
  if (ndvi < 0.2) return [193, 91, 56, 205];
  if (ndvi < 0.4) return [228, 163, 59, 205];
  if (ndvi < 0.6) return [214, 205, 79, 205];
  if (ndvi < 0.8) return [120, 179, 73, 205];
  return [38, 121, 71, 205];
}
"""


sentinel2_service = Sentinel2Service()
