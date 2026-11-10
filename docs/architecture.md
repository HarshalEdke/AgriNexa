# AgriNexa AI System Architecture

## Overview

AgriNexa AI follows a clean **modular monolith** design pattern optimized for low operational complexity, high reproducibility, and predictable deployment.

```text
React Frontend (Vite + TypeScript)
        │
        ▼  (REST / multipart/form-data)
FastAPI Backend (Python 3.12)
        │
        ├─────────────────────────────┐
        ▼                             ▼
PyTorch Inference (In-process)   PostgreSQL 17.x
(model/inference/predict.py)     (Prediction Logs & Metadata)
```

## Architectural Decisions

### 1. In-Process PyTorch Inference vs Microservices
Rather than splitting inference into a separate microservice communicating over gRPC/HTTP with distributed queues (Kafka/RabbitMQ), model inference is executed in-process within the FastAPI service layer.
- **Rationale**: Eliminates network serialization overhead, simplifies container topologies, and reduces cold-start latency during competition evaluations.

### 2. Elimination of Premature Distributed Infrastructure
We intentionally avoid Kubernetes, Kafka, Redis clusters, and Terraform during the core scaffold:
- **Rationale**: Hackathon evaluations require rapid judge verification (10-minute reproduction window). Extra infrastructure layers increase deployment failure points without offering tangible benefits for single-node validation.

### 3. Separation of Concerns
- `app/`: Exposes HTTP endpoints, manages authentication/CORS, and validates payload boundaries.
- `model/`: Encapsulates ML-specific logic, data loading, augmentation transforms, and weights.
- `frontend/`: Single-page application for responsive leaf image uploads and diagnostic inspections.
- `database/`: Persistent storage for audit logs and historical diagnostics.

## Smart Irrigation Module

The irrigation workspace is a user-scoped extension of the existing FastAPI/SQLAlchemy application, not a separate service. Its API requires the existing JWT-authenticated user dependency; fields are owned by `users.id` because the current schema has no farm entity.

- `app/api/routes/irrigation.py` owns the authenticated REST surface and request/response validation.
- `app/services/irrigation_service.py` persists fields, recommendations, schedules, readings, weather snapshots, history and dashboard analytics.
- `app/services/irrigation_calculator.py` implements FAO-56 Penman–Monteith ET₀, probability-weighted effective-rain estimates, depth/area volume conversion and flow-based runtime.
- `app/services/recommendation_engine.py` applies explainable soil-water-balance and weather rules. No trained irrigation ML model is configured; it does not claim an ML prediction.
- `app/services/irrigation_weather_service.py` extends the existing Open-Meteo integration with radiation and seven-day forecast fields. Weather is optional; unavailable/incomplete weather is surfaced and soil-water rules remain usable.
- The Alembic irrigation migration adds field, sensor-reading, recommendation, schedule, history, weather-record and crop-parameter tables. Crop references are generic FAO-56 planning coefficients, editable by manual field Kc.
- The React dashboard uses the existing Vite/React/auth stack and native SVG charts; it adds no chart dependency.

Sensor ingestion is HTTP-based and records `simulated` or `hardware` provenance under the authenticated user. Hardware identity is not verified and there is no MQTT broker/device credential integration yet. Rainfall savings are forecast-derived potential savings, not metered historical savings.

## Satellite Farm Health

Satellite monitoring shares the authenticated `irrigation_fields` records, storing the WGS84 GeoJSON boundary on the existing field. `satellite_observations` persists actual Copernicus Sentinel-2 L2A statistics keyed to the owning user and field; the module does not create simulated observations when the provider is unavailable.

- `app/api/routes/satellite.py` owns user-scoped field boundary, analysis, history, insight, map, comparison and report routes.
- `app/services/field_boundary_service.py` validates GeoJSON/KML and WGS84 zipped shapefile uploads.
- `app/services/satellite_geospatial_service.py` validates polygon geometry, calculates geodesic field measurements, and exposes deterministic NDVI calculation/classification helpers.
- `app/services/sentinel2_service.py` authenticates with the configured Copernicus Data Space OAuth client and requests daily NDVI statistics and a georeferenced map overlay. Its evalscript masks Sentinel-2 scene-classification cloud, shadow and snow classes.
- The frontend uses Leaflet with a satellite basemap, saved field boundary and date-specific Copernicus NDVI overlay. It displays only persisted/provider-returned observation statistics.
- Copernicus credentials remain backend-only environment variables. Without configuration or provider access, analysis is explicitly unavailable; there is no synthetic fallback.

Spatial anomaly zones and NDWI/SAVI/EVI calculations are not implemented. Per-acquisition cloud percentage and pixel-level query values are not claimed when not returned by the provider. NDVI thresholds are illustrative; all generated decline messages require ground verification and do not diagnose crop stress causes.
