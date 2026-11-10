"""Parsers for supported field-boundary upload formats."""

import io
import json
import zipfile
from pathlib import PurePosixPath
from typing import Any
from xml.etree import ElementTree

import shapefile

from app.services.satellite_geospatial_service import normalize_geometry


MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_ARCHIVE_BYTES = 30 * 1024 * 1024


def parse_boundary_file(filename: str, content: bytes) -> dict[str, Any]:
    if not content:
        raise ValueError("The uploaded boundary file is empty.")
    if len(content) > MAX_UPLOAD_BYTES:
        raise ValueError("Boundary files must be 10 MB or smaller.")

    extension = PurePosixPath(filename.replace("\\", "/")).suffix.lower()
    if extension in {".json", ".geojson"}:
        return _parse_geojson(content)
    if extension == ".kml":
        return _parse_kml(content)
    if extension == ".zip":
        return _parse_shapefile_zip(content)
    raise ValueError("Upload a GeoJSON (.json/.geojson), KML (.kml), or zipped shapefile (.zip).")


def _parse_geojson(content: bytes) -> dict[str, Any]:
    try:
        document = json.loads(content)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError("The uploaded file is not valid UTF-8 GeoJSON.") from exc
    if isinstance(document, dict) and document.get("crs") is not None:
        crs = json.dumps(document["crs"]).lower()
        if not any(marker in crs for marker in ("4326", "crs84", "wgs 84", "wgs_1984")):
            raise ValueError("GeoJSON coordinates must use the WGS84 (EPSG:4326) coordinate reference system.")
    return normalize_geometry(document)


def _parse_kml(content: bytes) -> dict[str, Any]:
    try:
        root = ElementTree.fromstring(content)
    except ElementTree.ParseError as exc:
        raise ValueError("The uploaded KML file is malformed.") from exc

    polygons = []
    for polygon in (element for element in root.iter() if _local_name(element.tag) == "Polygon"):
        rings = []
        for boundary in polygon:
            boundary_name = _local_name(boundary.tag)
            if boundary_name not in {"outerBoundaryIs", "innerBoundaryIs"}:
                continue
            coordinates = next(
                (node.text for node in boundary.iter() if _local_name(node.tag) == "coordinates"),
                None,
            )
            if not coordinates:
                raise ValueError("Every KML polygon boundary must contain coordinates.")
            ring = []
            for item in coordinates.split():
                parts = item.split(",")
                if len(parts) < 2:
                    raise ValueError("KML coordinates must use longitude,latitude[,altitude] values.")
                try:
                    ring.append([float(parts[0]), float(parts[1])])
                except ValueError as exc:
                    raise ValueError("KML coordinates must contain numeric longitude and latitude.") from exc
            rings.append(ring)
        if rings:
            polygons.append(rings)
    if not polygons:
        raise ValueError("The KML file contains no polygon boundary.")
    geometry = (
        {"type": "Polygon", "coordinates": polygons[0]}
        if len(polygons) == 1
        else {"type": "MultiPolygon", "coordinates": polygons}
    )
    return normalize_geometry(geometry)


def _parse_shapefile_zip(content: bytes) -> dict[str, Any]:
    try:
        archive = zipfile.ZipFile(io.BytesIO(content))
    except zipfile.BadZipFile as exc:
        raise ValueError("The uploaded shapefile archive is not a valid ZIP file.") from exc

    with archive:
        entries = [item for item in archive.infolist() if not item.is_dir()]
        if sum(item.file_size for item in entries) > MAX_ARCHIVE_BYTES:
            raise ValueError("The uncompressed shapefile archive must be 30 MB or smaller.")
        shp_files = [item for item in entries if PurePosixPath(item.filename).suffix.lower() == ".shp"]
        if len(shp_files) != 1:
            raise ValueError("Upload a ZIP archive containing exactly one shapefile layer.")
        shp_path = PurePosixPath(shp_files[0].filename)
        stem = shp_path.with_suffix("")
        components: dict[str, bytes] = {}
        for extension in (".shp", ".shx", ".dbf", ".prj"):
            matches = [
                item
                for item in entries
                if PurePosixPath(item.filename).with_suffix("") == stem
                and PurePosixPath(item.filename).suffix.lower() == extension
            ]
            if matches:
                components[extension] = archive.read(matches[0])

    if not {".shp", ".shx", ".dbf", ".prj"}.issubset(components):
        raise ValueError("The shapefile ZIP must include matching .shp, .shx, .dbf, and .prj files.")
    projection = components[".prj"].decode("utf-8", errors="ignore").lower()
    if (
        "projcs[" in projection
        or "projcrs[" in projection
        or not any(marker in projection for marker in ("4326", "wgs_1984", "wgs 84", "wgs84"))
    ):
        raise ValueError("Shapefile coordinates must use WGS84 (EPSG:4326); reproject the layer before upload.")

    try:
        reader = shapefile.Reader(
            shp=io.BytesIO(components[".shp"]),
            shx=io.BytesIO(components[".shx"]),
            dbf=io.BytesIO(components[".dbf"]),
        )
        geometry = reader.__geo_interface__
    except (shapefile.ShapefileException, OSError) as exc:
        raise ValueError("The uploaded shapefile components are invalid.") from exc
    finally:
        if "reader" in locals():
            reader.close()
    return normalize_geometry(geometry)


def _local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]
