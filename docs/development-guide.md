# AgriNexa AI Development Guide

## Prerequisites
- Python 3.12.x
- Node.js 22.x
- PostgreSQL 17.x (or Docker / Docker Compose)

---

## 1. Local Environment Setup

### Backend
```bash
# Create virtual environment
python -m venv .venv

# Activate virtual environment
# Windows:
.venv\Scripts\activate
# Linux/macOS:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### Frontend
```bash
cd frontend
npm install
```

---

## 2. Running Services

### Start Database via Docker
```bash
docker-compose up -d postgres
```

### Run FastAPI Backend
```bash
uvicorn app.main:app --reload --port 8000
```
Backend API will be accessible at `http://localhost:8000`.
Interactive Swagger UI at `http://localhost:8000/docs`.

### Run Frontend Development Server
```bash
cd frontend
npm run dev
```
Frontend will be accessible at `http://localhost:5173`.

---

## 3. Running Tests

### Backend Unit Tests
```bash
pytest tests/backend tests/model
```

### Frontend Tests
```bash
cd frontend
npm run test
```

---

## 4. Git Workflow Guidelines
- Branch naming: `feature/<feature-name>`, `fix/<bug-name>`
- Commit messages: Follow Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`)
- Always verify tests and linter before staging commits.

## Smart Irrigation Setup and Validation

After configuring the existing database and JWT settings, apply the schema migration:

```powershell
alembic upgrade head
```

Sign in through the existing UI before using the irrigation dashboard. Add a field with measured field-capacity and wilting-point values. A location enables an optional Open-Meteo seven-day forecast; without network access, manual inputs or root-zone soil balance remain available. No additional weather API key or frontend chart package is required.

The simulated sensor option labels and stores each sample as `simulated`. The authenticated HTTP sensor endpoint also accepts readings labeled `hardware`, but device identity is not independently authenticated and MQTT is not implemented.

Run the focused checks:

```powershell
pytest tests/backend/test_irrigation.py -q
cd frontend
npx vitest run src/test/IrrigationPage.test.tsx
npm run build
```

## Satellite Farm Health Setup and Validation

The satellite module reuses fields created in Smart Irrigation. After configuring the database and JWT settings, install the Python dependencies and apply the migration:

```powershell
pip install -r requirements.txt
alembic upgrade head
```

For real Sentinel-2 L2A observations, register a Copernicus Data Space OAuth client with access to the Sentinel Hub Statistical API and set these backend environment variables:

```text
COPERNICUS_CLIENT_ID
COPERNICUS_CLIENT_SECRET
```

Optional endpoint overrides are `COPERNICUS_TOKEN_URL`, `COPERNICUS_STATISTICAL_URL`, `COPERNICUS_PROCESS_URL`, and `SATELLITE_REQUEST_TIMEOUT_SECONDS`. Do not put Copernicus credentials in frontend variables or commit them. If credentials or imagery are unavailable, the dashboard reports the unavailable state and does not invent observations.

Sign in, create or select an existing irrigation field, then upload a GeoJSON, KML, or zipped shapefile in WGS84 (EPSG:4326). Analysis requests may cover up to 366 days and default to a 30% maximum scene-cloud threshold. Observations are stored for history and reporting.

```powershell
pytest tests/backend/test_satellite_monitoring.py -q
cd frontend
npx vitest run src/test/SatelliteMonitoringPage.test.tsx
npm run build
```

All `/api/satellite` endpoints require the existing bearer-token authentication and enforce field ownership. The interactive basemap uses Esri World Imagery; the NDVI overlay and statistics come from Copernicus when configured.
