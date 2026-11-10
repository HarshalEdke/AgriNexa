# AgriNexa AI API Contract

## Base URL
`http://localhost:8000`

---

## Endpoints

### 1. Health Check
Checks backend operational status.

- **Method:** `GET`
- **Path:** `/health`
- **Request Headers:** None
- **Request Body:** None

#### Response (200 OK)
```json
{
  "status": "ok"
}
```

---

## Smart Irrigation

All `/api/irrigation` routes require `Authorization: Bearer <access_token>` and operate only on fields owned by the authenticated user. Field inputs use hectares, root depth in metres, soil moisture/capacity in percent by volume, rainfall/depth in millimetres, wind at 2 m in m/s, flow in L/min, and water volumes in litres.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/irrigation/dashboard` | Field KPIs, latest recommendations, alerts, schedules and recent measured history |
| `GET` | `/api/irrigation/fields` | List the caller's fields |
| `POST` | `/api/irrigation/fields` | Create a field; known crops can use a generic stage Kc reference, otherwise supply `kc` |
| `GET` | `/api/irrigation/recommendation/?field_id={id}` | List saved recommendations, optionally for one owned field |
| `POST` | `/api/irrigation/recommendation/generate` | Generate and persist a recommendation; accepts `{ "field_id": 1, "weather": { ... } }`; weather is optional |
| `GET` | `/api/irrigation/weather/?field_id={id}` | Fetch and persist a seven-day Open-Meteo forecast for a field with a location |
| `GET` | `/api/irrigation/analytics` | Measured irrigation, sensor trends, crop demand and water-use time series |
| `GET` | `/api/irrigation/history/?field_id={id}` | List actual irrigation records |
| `POST` | `/api/irrigation/history/` | Record actual water use and update the field's last-irrigation date |
| `GET` | `/api/irrigation/schedules` | List scheduled, postponed, missed and completed irrigation |
| `POST` | `/api/irrigation/schedule` | Schedule a saved recommendation for a future datetime |
| `POST` | `/api/irrigation/schedules/{id}/postpone` | Mark a pending schedule as postponed and set its new review time |
| `POST` | `/api/irrigation/schedules/{id}/complete` | Record actual water used and complete the schedule |
| `POST` | `/api/irrigation/fields/{id}/sensor-readings` | Ingest a validated simulated or hardware-labeled HTTP reading |

Recommendation results include `status`, recommended date/time, net/gross depth, litres, duration (when flow rate is known), method/efficiency, ET₀/ETc when calculable, effective rainfall, alerts, weather provenance, calculation basis, and an explanation. Unknown soil moisture yields `Monitor` and no fabricated water quantity. ET₀ is omitted when Tmin/Tmax, humidity, wind, solar radiation, latitude or elevation is unavailable.

The root-zone balance uses measured field capacity, wilting point, optional available-water capacity and crop root depth. Generic crop Kc and irrigation-efficiency values are planning references, not local calibration. Effective rainfall is a probability-weighted estimate capped by available root-zone storage; runoff and deep percolation are not separately modeled. Potential rain savings are estimates and are not metered savings.

Create/update the schema with `alembic upgrade head`. The irrigation endpoints return standard FastAPI validation errors (`422`), `401` for missing/invalid authentication, `404` for inaccessible fields/records, and explicit weather-provider errors on the weather endpoint.

## Satellite Farm Health

All `/api/satellite` routes require a bearer token. Satellite fields are existing user-owned irrigation fields; boundary geometry and observation records are scoped to that field and user.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/satellite/status` | Report Copernicus provider configuration without exposing credentials |
| `GET` | `/api/satellite/demo-data` | Return fixed synthetic reflectance values for an explicitly labeled calculation demo; never saved as observations |
| `GET` | `/api/satellite/fields` | List the caller's fields and any saved boundary measurements |
| `POST` | `/api/satellite/fields` | Save a GeoJSON Polygon/MultiPolygon boundary for `{ "field_id": 1, "geometry": { ... } }` |
| `POST` | `/api/satellite/fields/{field_id}/boundary-file` | Upload `.geojson`, `.json`, `.kml`, or WGS84 `.zip` shapefile |
| `GET` | `/api/satellite/field/{field_id}` | Retrieve a caller-owned field and boundary |
| `POST` | `/api/satellite/analyze/{field_id}` | Request real Sentinel-2 L2A NDVI statistics for `{ "start_date": "2026-01-01", "end_date": "2026-03-31", "max_cloud_coverage_percent": 30 }` |
| `GET` | `/api/satellite/ndvi?field_id={id}` | Return the latest saved NDVI observation; optional `acquisition_date=YYYY-MM-DD` |
| `GET` | `/api/satellite/history?field_id={id}` | Return saved observations; optional `start_date`, `end_date`, and `limit` filters |
| `GET` | `/api/satellite/observations?field_id={id}` | Alias for observation history |
| `GET` | `/api/satellite/statistics?field_id={id}` | Return field area and latest provider-returned statistics |
| `GET` | `/api/satellite/health-insights?field_id={id}` | Return an explained NDVI decline signal, if supported by two observations |
| `GET` | `/api/satellite/vegetation-zones?field_id={id}` | Explicitly report when spatial zone data is unavailable |
| `GET` | `/api/satellite/indices?field_id={id}` | List formulas and availability for NDVI, NDWI, SAVI, and EVI |
| `GET` | `/api/satellite/map/{field_id}/{acquisition_date}` | Return a date-specific georeferenced NDVI PNG overlay |
| `POST` | `/api/satellite/compare` | Compare 2–20 saved observation IDs in `{ "observation_ids": [1, 2] }` |
| `GET` | `/api/satellite/report?field_id={id}` | Download a PDF for a field with saved observations |

Analysis date ranges are limited to 366 days. GeoJSON coordinates must use WGS84; KML and shapefile uploads are validated and converted to WGS84 GeoJSON. Configure `COPERNICUS_CLIENT_ID` and `COPERNICUS_CLIENT_SECRET` on the backend to enable real data. Without valid credentials, analysis returns `503`; no observations are synthesized. Provider scene-cloud filtering does not imply per-acquisition cloud percentage, so that value remains `null` unless actually returned. Spatial anomaly zones and non-NDVI index calculations are not currently implemented.

---

### 2. Predict Crop Disease
Submit a crop leaf image for diagnostic classification.

- **Method:** `POST`
- **Path:** `/api/predictions`
- **Content-Type:** `multipart/form-data`
- **Form Fields:**
  - `image`: Binary file (JPEG, PNG, WEBP, BMP). Maximum size: 15MB.

*Status: Inference implementation pending trained checkpoint.*

#### Expected Response (200 OK — Upon model checkpoint deployment)
```json
{
  "predicted_class": "Tomato___Early_blight",
  "confidence": 0.9624,
  "model_version": "v1.0.0"
}
```

#### Error Responses

##### 400 Bad Request
Occurs if the file is missing, empty, or has an invalid extension:
```json
{
  "detail": "Invalid file extension '.pdf'. Allowed extensions: .bmp, .jpeg, .jpg, .png, .webp"
}
```

##### 413 Payload Too Large
Occurs if the file exceeds 15MB:
```json
{
  "detail": "File exceeds maximum allowed size of 15MB."
}
```

##### 503 Service Unavailable
Occurs when no verified trained checkpoint has been placed in the system:
```json
{
  "detail": "No trained model checkpoint found at 'model/checkpoints/best_model.pt'. In accordance with SIH guidelines, model training will be performed with the official organizer dataset and class labels. Fake predictions are strictly prohibited."
}
```
