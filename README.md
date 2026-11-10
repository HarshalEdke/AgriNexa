AgriNexa AI 🌾
> **Intelligent Agriculture for a Sustainable Future**
AgriNexa AI is an intelligent agricultural diagnostic and decision-support platform that combines computer vision, weather intelligence, agronomic recommendations, sustainability analytics, simulated IoT telemetry, and conversational AI to help farmers make faster and more informed decisions.
Team: WebShooters  
Institution: LJ Institute of Engineering and Technology
🎥 Demo : https://youtu.be/_znUEgbqXHk
Watch the AgriNexa AI Demo
---
🌱 The Problem
Farmers can lose yield because crop diseases are diagnosed late, agricultural advice is generic, and irrigation and input usage are not sufficiently adapted to local conditions.
AgriNexa AI brings multiple decision-support capabilities into one platform:
Detect crop diseases from leaf images.
Reject unsuitable images and unsupported crops before disease prediction.
Combine local weather forecasts with practical farm alerts.
Recommend crops using soil and climate parameters.
Estimate sustainability using resource-efficiency indicators.
Accept simulated IoT telemetry.
Provide conversational assistance through an AI Agronomist.
---
🚀 Key Features
Feature	Status	Description
🩺 Disease Detection	✅ Implemented	Multi-stage AI diagnosis from crop-leaf images
🌦️ Weather Intelligence	✅ Implemented	Live weather, 7-day forecast and agronomic alerts
🌱 Crop Recommendation	✅ Implemented	Recommendations from N-P-K, soil pH, rainfall and temperature
♻️ Sustainability Score	✅ Implemented	0–100 resource-efficiency score with breakdown
💧 Smart Irrigation	✅ Implemented	Authenticated field monitoring, transparent water-balance recommendations, schedules and measured irrigation history
🛰️ Satellite Farm Health	🟡 Partial	Authenticated field boundaries, Copernicus Sentinel-2 NDVI statistics, georeferenced map overlays, history, insights and PDF reports
📡 IoT Telemetry	✅ Implemented	Simulated farm sensor ingestion
🤖 AI Agronomist	✅ Implemented	Multi-turn conversational agricultural assistance
🧠 Agentic Advisor	🟡 Partial	Deterministic advisory rules implemented; autonomous multi-agent chaining remains future scope
🔐 Authentication	✅ Implemented	JWT-based registration and login
---
🧠 AI Disease Detection
The disease-detection system uses a three-stage gated pipeline rather than sending every uploaded image directly to a disease classifier.
```text
Uploaded Image
      ↓
Basic Image Checks
      ↓
E14 Leaf Presence Gate
      ↓
E12 Crop Validity Gate
      ↓
E11 Disease Predictor
      ↓
Confidence / Margin Decision
      ↓
Farmer-Friendly Diagnosis & Advice
```
E14 — Leaf Presence Gate
A lightweight deterministic computer-vision gate checks whether an uploaded image plausibly contains leaf/vegetation content. It helps reject non-leaf images, soil/background scenes and degenerate inputs before ML classification.
E12 — Crop Validity Gate
A SigLIP-based validity classifier determines whether the image belongs to a supported crop or should be treated as `Other`.
E11 — Disease Predictor
The production disease model uses:
Backbone: SigLIP ViT-B/16
Architecture: frozen 768-dimensional encoder + trained 768→10 linear classification head
Input: 224×224 RGB
Inference: deterministic FP32 on CPU/CUDA
Model version: `E11-SigLIP-HYBRID10-PRODUCTION`
Production checkpoint:
```text
model/checkpoints/E11_SigLIP_HYBRID10_PRODUCTION.pt
```
SHA-256:
```text
a51d814fc434c514743180a9df596d6a5aa6d250e7b3e496dd5927fdea6c64df
```
Supported Disease Classes
Potato — Early Blight
Potato — Late Blight
Potato — Healthy
Corn — Gray Leaf Spot
Corn — Healthy
Tomato — Yellow Leaf Curl Virus
Tomato — Healthy
Apple — Scab
Apple — Cedar Rust
Apple — Healthy
---
📊 Model Evaluation
The production E11 model uses a locked held-out field-condition test set for the primary result.
Evaluation Protocol	Accuracy	Macro-F1	Role
Held-out field-condition test	96.31%	95.07%	Primary result
PlantVillage validation	99.51%	98.96%	Validation
LOSO field-source diagnostic	64.72%	70.38%	Cross-source robustness diagnostic
PlantDoc diagnostic	69.19%	~69.5%	Post-hoc external diagnostic
Held-out field test size: 1,708 images.
Important Evaluation Note
These evaluation protocols answer different questions and should not be treated as interchangeable benchmarks.
The 96.31% / 95.07% result is the primary locked held-out field-condition evaluation.
LOSO measures generalization when entire field-data sources are held out during evaluation.
PlantDoc is a post-hoc external diagnostic and is not part of the production training pool.
PlantVillage validation is a curated validation set and is expected to be easier than real-field data.
Macro-F1 is emphasized because it gives equal importance to each class rather than allowing larger classes to dominate the metric.
Reproducibility
Inference is configured for deterministic FP32 execution across CPU/CUDA environments, with explicit device selection and backend determinism controls.
Evaluation Limitations
Performance can decrease under domain shift between curated/lab imagery and other field datasets. Visually similar disease/healthy classes and visually similar diseases remain challenging. The system therefore uses input-validity and confidence safeguards rather than presenting every prediction as certain.
---
🌦️ Weather Intelligence
AgriNexa AI combines weather forecasts with rule-based agricultural interpretation.
The weather module provides:
Current atmospheric conditions
7-day forecast
Location-based weather retrieval
Spray-condition guidance
Irrigation-related alerts
Disease-risk windows
Seasonal climate information
Weather data is obtained through Open-Meteo services and does not require a weather API key.
Important endpoints:
`POST /api/weather-intelligence`
`GET /api/weather`
`GET /api/seasonal-climate`
---
💧 Smart Irrigation
Register user-owned fields with crop/stage, soil water limits, area, irrigation equipment and optional location. The dashboard supports soil-moisture readings, live Open-Meteo forecasts when available, manual weather inputs, recommendation explanations, scheduling, completed-water history, alerts and analytics.
The engine calculates FAO-56 Penman–Monteith ET₀ only when the required daily temperature range, humidity, wind, solar radiation, latitude and elevation are available. Otherwise it reports an explicit root-zone soil-water-balance fallback. Water volume is calculated from irrigation depth and hectares; duration is only shown when system flow is configured.
Generic crop Kc values are seeded as editable planning references; local crop/variety/stage values should be verified. Typical irrigation efficiencies are labeled assumptions and can be overridden. Rainfall savings are potential estimates, not measured savings. No trained irrigation ML model is configured.
Field and sensor APIs require a bearer token. Simulated readings are marked `simulated`; hardware-labeled HTTP readings are not cryptographically verified, and MQTT ingestion is future integration work.
Apply the database migration with `alembic upgrade head`. See `docs/api-contract.md` for the irrigation routes and `docs/architecture.md` for the calculation and persistence boundaries.
---
🛰️ Satellite Farm Health
Satellite monitoring extends existing user-owned irrigation fields instead of creating duplicate farm records. Authenticated users can attach GeoJSON, KML, or WGS84 zipped-shapefile boundaries, request Sentinel-2 L2A NDVI statistics from Copernicus Data Space, inspect observations on an interactive map, review available history and download a PDF report.

Configure a Copernicus Data Space OAuth client with Sentinel Hub Statistical API access using `COPERNICUS_CLIENT_ID` and `COPERNICUS_CLIENT_SECRET`. Without valid credentials, the dashboard clearly reports that satellite observations are unavailable. An optional fixed-value NDVI calculation demo is explicitly labeled synthetic, has no observation date, and is never saved as field data. Apply the latest schema with `alembic upgrade head`. See `docs/development-guide.md` for setup and `docs/api-contract.md` for the authenticated routes.

Current limitations: spatial anomaly zones and additional vegetation indices are not calculated; cloud coverage for each individual acquisition is not returned by the statistics response; field history is limited to observations the user has requested and saved. NDVI is a screening indicator, not a crop diagnosis or irrigation recommendation.
---
🌱 Crop Recommendation
Farmers can provide:
Nitrogen (N)
Phosphorus (P)
Potassium (K)
Soil pH
Rainfall
Temperature
The recommendation engine ranks suitable crops based on the supplied conditions.
Endpoint:
```text
POST /api/crop-recommendations
```
---
♻️ Sustainability Score
The sustainability module calculates a 0–100 sustainability score using resource-efficiency indicators.
It provides:
Overall score
Sustainability grade
Water-use considerations
Chemical/input penalties
Resource-efficiency breakdown
The system also supports simulated IoT telemetry.
Endpoints:
```text
POST /api/sustainability-score
POST /api/sustainability/iot-telemetry
```
---
🤖 AI Agronomist
The conversational AI Agronomist provides contextual agricultural assistance through a multi-turn chat interface.
Capabilities include:
Multi-turn conversations
Context-aware responses
Diagnostic context hand-off
Primary/fallback model routing
Current integrations include Google Gemini as the primary LLM and Groq as a fallback.
Endpoint:
```text
POST /api/chat
```
---
🏗️ System Architecture
```text
┌──────────────────────────────────────────────────────────┐
│                    React Frontend                        │
│        React + TypeScript + Vite + Tailwind             │
└──────────────────────────┬───────────────────────────────┘
                           │ REST API
                           ▼
┌──────────────────────────────────────────────────────────┐
│                    FastAPI Backend                       │
│             Validation • Services • Auth                 │
└───────────────┬──────────────────────┬───────────────────┘
                │                      │
                ▼                      ▼
        ┌───────────────┐      ┌──────────────────┐
        │  PostgreSQL   │      │     AI / ML      │
        │ SQLAlchemy +  │      │  E14 → E12 → E11 │
        │    Alembic    │      └──────────────────┘
        └───────────────┘
```
---
🛠️ Technology Stack
Frontend
React 19
TypeScript
Vite
Tailwind CSS
Lucide React
TanStack Query
Backend
Python 3.12+
FastAPI
Pydantic
Uvicorn
SQLAlchemy 2
AsyncPG
Alembic
Database
PostgreSQL
AI / ML
PyTorch
Torchvision
timm
Scikit-learn
Albumentations
SigLIP ViT-B/16
Security
JWT authentication
bcrypt password hashing
External Services
Open-Meteo Geocoding / Forecast APIs
Google Gemini API
Groq API
---
🔌 Important API Endpoints
Method	Endpoint	Purpose
POST	`/api/predictions`	Crop-leaf disease diagnosis
POST	`/api/weather-intelligence`	Weather + agricultural intelligence
GET	`/api/weather`	Current weather/advisories
GET	`/api/seasonal-climate`	Seasonal climate information
POST	`/api/crop-recommendations`	Crop recommendation
POST	`/api/sustainability-score`	Sustainability calculation
POST	`/api/sustainability/iot-telemetry`	IoT telemetry ingestion
POST	`/api/chat`	AI Agronomist
POST	`/api/auth/register`	User registration
POST	`/api/auth/login`	JWT login
GET	`/health`	Application/model readiness
---
📁 Project Structure
```text
AgriNexa/
├── app/
├── frontend/
├── model/
│   ├── checkpoints/
│   └── inference/
├── experiments/
├── tests/
├── requirements.txt
├── LICENSE
└── ...
```
---
⚙️ Installation & Setup
Prerequisites
Node.js 20+
npm
Python 3.12+
PostgreSQL 16+ or Docker
Backend
```bash
python -m venv .venv
```
Windows
```bash
.venv\Scripts\activate
```
Linux/macOS
```bash
source .venv/bin/activate
```
Install dependencies:
```bash
pip install -r requirements.txt
```
Start the API:
```bash
uvicorn app.main:app --reload --port 8000
```
Run the website frontend:
```bash
cd frontend
npm install
npm run dev
```
Then open `http://localhost:5173` in your browser. Start the API in a separate terminal using the backend command above.
The Vite development server communicates with the FastAPI backend through the configured `/api` proxy.
---
🔐 Environment Variables
Required variable names include:
```text
DATABASE_URL
JWT_SECRET_KEY
ACCESS_TOKEN_EXPIRE_MINUTES
ENVIRONMENT

GEMINI_API_KEY
GEMINI_MODEL

GROQ_API_KEY
GROQ_MODEL

OPEN_METEO_GEOCODING_URL
OPEN_METEO_FORECAST_URL

MODEL_CHECKPOINT_PATH
VALIDITY_CHECKPOINT_PATH
```
Never commit API keys, passwords, JWT secrets or other credentials.
---
🧪 Testing
The repository includes tests covering important backend, model, safety and reproducibility behavior, including:
Disease prediction API
E14 leaf-presence safety gate
E12 crop validity
E11 inference
Safety/rejection behavior
Cross-device reproducibility
Backend integration
Weather intelligence
---
🛡️ Safety & Reliability
AgriNexa AI is designed around a fail-safe diagnostic pipeline:
Non-leaf/invalid imagery can be rejected before disease inference.
Unsupported crops can be classified as `Other`.
Low-confidence predictions can be marked inconclusive.
The production disease model is isolated behind validation gates.
CPU/CUDA inference uses explicit FP32 configuration.
External conversational AI services are separate from the core disease-detection pipeline.
The system is a decision-support tool and should not be treated as a substitute for professional agronomic diagnosis.
---
⚠️ Limitations
Disease detection supports a defined set of crops/classes rather than all agricultural species.
Visual symptoms outside supported leaf-disease categories may not be diagnosed.
Domain shift between curated datasets and different real-world environments can reduce performance.
Visually similar diseases/classes remain challenging.
Weather intelligence depends on external weather-service availability.
The Agentic Advisor currently uses deterministic advisory logic; fully autonomous multi-agent tool chaining remains future scope.
Irrigation supports simulated or authenticated HTTP hardware-labeled readings; no MQTT broker, device credentials, or verified physical sensor integration is deployed.
---
🔭 Future Scope
More crops and disease classes
Improved real-field domain adaptation
Regional-language agricultural assistance
GPS-aware recommendations
Crop-stress and yield prediction
Crop-rotation intelligence
Expanded IoT sensor integration
Autonomous multi-agent agricultural planning
More extensive field validation
---
📜 License & Attribution
This project is released under the MIT License. See `LICENSE`.
The project uses open-source technologies and third-party resources including:
SigLIP / pretrained vision components
PlantVillage and referenced agricultural datasets
Open-Meteo weather services
India Meteorological Department climatological information
PyTorch, timm, FastAPI, React and other open-source libraries
Third-party datasets, models and services remain subject to their respective licenses and terms. Specific dataset/model licenses should be checked against their original sources before redistribution.
---
👥 Team
WebShooters
LJ Institute of Engineering and Technology
> Built for Smart India Hackathon 2026.
