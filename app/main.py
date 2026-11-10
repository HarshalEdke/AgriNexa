from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.schemas import HealthResponse
from app.api.routes.predictions import router as predictions_router
from app.api.routes.crop_recommendations import router as crop_recommendations_router
from app.api.routes.chat import router as chat_router
from app.api.routes.weather import router as weather_router
from app.api.routes.auth import router as auth_router
from app.api.routes.sustainability import router as sustainability_router
from app.api.routes.irrigation import router as irrigation_router
from app.api.routes.satellite import router as satellite_router
from app.core.database import close_db_engine
from app.core.errors import AppError, app_error_handler
from model.inference.torch_config import configure_inference_backends


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_inference_backends()
    yield
    await close_db_engine()


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="AgriNexa AI - Intelligent Crop Disease Classification API for Smart India Hackathon 2026",
    lifespan=lifespan,
)

app.add_exception_handler(AppError, app_error_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get(
    "/health",
    response_model=HealthResponse,
    tags=["System"],
    summary="Health check endpoint"
)
async def health():
    """Health check endpoint to verify backend operational status."""
    return {"status": "ok"}


app.include_router(predictions_router)
app.include_router(crop_recommendations_router)
app.include_router(chat_router)
app.include_router(weather_router)

app.include_router(auth_router)
app.include_router(sustainability_router)
app.include_router(irrigation_router)
app.include_router(satellite_router)
