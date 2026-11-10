"""Geometry validation and vegetation-index calculations for satellite monitoring."""

import math
from typing import Any

import numpy as np


EARTH_RADIUS_M = 6_371_008.8
HEALTH_CLASSES = (
    ("non_vegetated_or_water", -1.0, 0.0),
    ("very_low", 0.0, 0.2),
    ("low", 0.2, 0.4),
    ("moderate", 0.4, 0.6),
    ("high", 0.6, 0.8),
    ("very_high", 0.8, 1.000001),
)


def normalize_geometry(value: dict[str, Any]) -> dict[str, Any]:
    """Validate a GeoJSON polygon and normalize Features to a geometry object."""
    if not isinstance(value, dict):
        raise ValueError("A GeoJSON object is required.")

    geo_type = value.get("type")
    if geo_type == "Feature":
        value = value.get("geometry")
    elif geo_type == "FeatureCollection":
        features = value.get("features")
        if not isinstance(features, list) or not features or len(features) > 50:
            raise ValueError("The GeoJSON FeatureCollection must contain 1 to 50 features.")
        geometries = [
            normalize_geometry(feature.get("geometry"))
            for feature in features
            if isinstance(feature, dict) and feature.get("type") == "Feature"
        ]
        if len(geometries) != len(features):
            raise ValueError("Every FeatureCollection item must be a GeoJSON Feature.")
        polygons: list[list[list[list[float]]]] = []
        for geometry in geometries:
            polygons.extend(
                [geometry["coordinates"]]
                if geometry["type"] == "Polygon"
                else geometry["coordinates"]
            )
        value = {"type": "MultiPolygon", "coordinates": polygons}

    if not isinstance(value, dict) or value.get("type") not in {"Polygon", "MultiPolygon"}:
        raise ValueError("Field boundaries must be GeoJSON Polygon or MultiPolygon geometries.")

    coordinates = value.get("coordinates")
    if not isinstance(coordinates, list) or not coordinates:
        raise ValueError("The polygon geometry must contain coordinates.")
    polygons = [coordinates] if value["type"] == "Polygon" else coordinates
    coordinate_count = 0
    for polygon in polygons:
        if not isinstance(polygon, list) or not polygon:
            raise ValueError("Every polygon must contain an exterior ring.")
        for ring in polygon:
            if not isinstance(ring, list) or len(ring) < 4:
                raise ValueError("Each polygon ring must contain at least four coordinates.")
            if ring[0] != ring[-1]:
                raise ValueError("Polygon rings must be closed (first and last coordinates must match).")
            points: list[tuple[float, float]] = []
            for coordinate in ring:
                if (
                    not isinstance(coordinate, (list, tuple))
                    or len(coordinate) < 2
                    or not isinstance(coordinate[0], (float, int))
                    or not isinstance(coordinate[1], (float, int))
                ):
                    raise ValueError("Coordinates must be [longitude, latitude] numeric pairs in WGS84.")
                longitude, latitude = float(coordinate[0]), float(coordinate[1])
                if not math.isfinite(longitude) or not math.isfinite(latitude):
                    raise ValueError("Coordinates must be finite numbers.")
                if not -180 <= longitude <= 180 or not -90 <= latitude <= 90:
                    raise ValueError("Coordinates must use longitude/latitude in the WGS84 range.")
                points.append((longitude, latitude))
                coordinate_count += 1
            if coordinate_count > 2_000:
                raise ValueError("The boundary exceeds the 2,000-coordinate limit.")
            _validate_simple_ring(points)

    return value


def _validate_simple_ring(points: list[tuple[float, float]]) -> None:
    """Reject self-intersecting rings using a bounded planar segment check."""
    segments = len(points) - 1
    for first in range(segments):
        a, b = points[first], points[first + 1]
        for second in range(first + 1, segments):
            if second in (first, first + 1) or (first == 0 and second == segments - 1):
                continue
            c, d = points[second], points[second + 1]
            if _segments_intersect(a, b, c, d):
                raise ValueError("Polygon rings must not self-intersect.")


def _segments_intersect(
    a: tuple[float, float],
    b: tuple[float, float],
    c: tuple[float, float],
    d: tuple[float, float],
) -> bool:
    def orientation(p: tuple[float, float], q: tuple[float, float], r: tuple[float, float]) -> float:
        return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])

    ab_c, ab_d = orientation(a, b, c), orientation(a, b, d)
    cd_a, cd_b = orientation(c, d, a), orientation(c, d, b)
    return ab_c * ab_d < 0 and cd_a * cd_b < 0


def geometry_summary(geometry: dict[str, Any]) -> dict[str, Any]:
    """Return spherical area, perimeter, centroid and bounds for a WGS84 geometry."""
    geometry = normalize_geometry(geometry)
    polygons = (
        [geometry["coordinates"]]
        if geometry["type"] == "Polygon"
        else geometry["coordinates"]
    )
    area_m2 = 0.0
    perimeter_m = 0.0
    centroid_x = centroid_y = centroid_weight = 0.0
    all_points: list[tuple[float, float]] = []

    for polygon in polygons:
        outer_area = _spherical_ring_area(polygon[0])
        hole_area = sum(_spherical_ring_area(ring) for ring in polygon[1:])
        area_m2 += max(outer_area - hole_area, 0.0)
        perimeter_m += _ring_perimeter(polygon[0])
        for ring in polygon:
            all_points.extend((float(point[0]), float(point[1])) for point in ring[:-1])
        polygon_centroid, planar_weight = _polygon_centroid(polygon[0])
        weight = max(planar_weight, 1e-12)
        centroid_x += polygon_centroid[0] * weight
        centroid_y += polygon_centroid[1] * weight
        centroid_weight += weight

    if not all_points or area_m2 <= 0:
        raise ValueError("The field boundary must enclose a non-zero area.")
    centroid = [centroid_x / centroid_weight, centroid_y / centroid_weight]
    return {
        "area_square_metres": area_m2,
        "area_hectares": area_m2 / 10_000,
        "area_acres": area_m2 / 4_046.8564224,
        "perimeter_metres": perimeter_m,
        "centroid": centroid,
        "bounds": [
            min(point[0] for point in all_points),
            min(point[1] for point in all_points),
            max(point[0] for point in all_points),
            max(point[1] for point in all_points),
        ],
    }


def _spherical_ring_area(ring: list[list[float]]) -> float:
    total = 0.0
    for first, second in zip(ring, ring[1:]):
        lon1, lat1 = math.radians(first[0]), math.radians(first[1])
        lon2, lat2 = math.radians(second[0]), math.radians(second[1])
        total += (lon2 - lon1) * (2 + math.sin(lat1) + math.sin(lat2))
    return abs(total * EARTH_RADIUS_M**2 / 2)


def _ring_perimeter(ring: list[list[float]]) -> float:
    total = 0.0
    for first, second in zip(ring, ring[1:]):
        lat1, lat2 = math.radians(first[1]), math.radians(second[1])
        delta_lat = lat2 - lat1
        delta_lon = math.radians(second[0] - first[0])
        haversine = (
            math.sin(delta_lat / 2) ** 2
            + math.cos(lat1) * math.cos(lat2) * math.sin(delta_lon / 2) ** 2
        )
        total += 2 * EARTH_RADIUS_M * math.asin(min(1.0, math.sqrt(haversine)))
    return total


def _polygon_centroid(ring: list[list[float]]) -> tuple[tuple[float, float], float]:
    twice_area = 0.0
    centroid_x = centroid_y = 0.0
    for first, second in zip(ring, ring[1:]):
        cross = first[0] * second[1] - second[0] * first[1]
        twice_area += cross
        centroid_x += (first[0] + second[0]) * cross
        centroid_y += (first[1] + second[1]) * cross
    if abs(twice_area) < 1e-12:
        points = ring[:-1]
        return (
            (sum(point[0] for point in points) / len(points), sum(point[1] for point in points) / len(points)),
            1e-12,
        )
    centroid = (centroid_x / (3 * twice_area), centroid_y / (3 * twice_area))
    return centroid, abs(twice_area) / 2


def calculate_ndvi(
    nir: Any,
    red: Any,
    *,
    valid_mask: Any | None = None,
) -> tuple[np.ndarray, dict[str, Any]]:
    """Calculate NDVI while excluding nodata, cloud-masked and invalid reflectance pixels."""
    nir_array = np.asarray(nir, dtype=np.float64)
    red_array = np.asarray(red, dtype=np.float64)
    if nir_array.shape != red_array.shape or nir_array.size == 0:
        raise ValueError("NIR and red inputs must have the same non-empty shape.")

    denominator = nir_array + red_array
    valid = (
        np.isfinite(nir_array)
        & np.isfinite(red_array)
        & (nir_array >= 0)
        & (red_array >= 0)
        & (denominator > 0)
    )
    if valid_mask is not None:
        mask = np.asarray(valid_mask, dtype=bool)
        if mask.shape != nir_array.shape:
            raise ValueError("The valid-pixel mask must match the band dimensions.")
        valid &= mask

    ndvi = np.full(nir_array.shape, np.nan, dtype=np.float64)
    np.divide(nir_array - red_array, denominator, out=ndvi, where=valid)
    valid &= np.isfinite(ndvi) & (ndvi >= -1) & (ndvi <= 1)
    ndvi[~valid] = np.nan

    valid_values = ndvi[valid]
    distribution = {}
    for name, lower, upper in HEALTH_CLASSES:
        count = int(np.count_nonzero((valid_values >= lower) & (valid_values < upper)))
        distribution[name] = {
            "pixels": count,
            "percentage": count / len(valid_values) * 100 if len(valid_values) else 0.0,
        }

    stats = {
        "mean": float(np.mean(valid_values)) if len(valid_values) else None,
        "minimum": float(np.min(valid_values)) if len(valid_values) else None,
        "maximum": float(np.max(valid_values)) if len(valid_values) else None,
        "median": float(np.median(valid_values)) if len(valid_values) else None,
        "standard_deviation": float(np.std(valid_values)) if len(valid_values) else None,
        "valid_pixels": int(len(valid_values)),
        "total_pixels": int(nir_array.size),
        "valid_pixel_percentage": float(len(valid_values) / nir_array.size * 100),
        "vegetation_distribution": distribution,
    }
    return ndvi, stats


def classify_ndvi(value: float) -> str:
    """Classify a finite NDVI value using illustrative, non-crop-specific thresholds."""
    if not math.isfinite(value) or not -1 <= value <= 1:
        raise ValueError("NDVI must be a finite value between -1 and 1.")
    if value < 0:
        return "non_vegetated_or_water"
    if value < 0.2:
        return "very_low"
    if value < 0.4:
        return "low"
    if value < 0.6:
        return "moderate"
    if value < 0.8:
        return "high"
    return "very_high"
