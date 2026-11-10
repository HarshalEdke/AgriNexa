import io
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.config import settings

@pytest.fixture
def client():
    return TestClient(app)

def test_app_imports():
    """Verify FastAPI application instance imports cleanly."""
    assert app is not None
    assert app.title == "AgriNexa AI"

def test_health_endpoint(client):
    """Verify GET /health returns HTTP 200 and {'status': 'ok'}."""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

def test_prediction_endpoint_exists(client):
    """Verify POST /api/predictions exists and validates input."""
    response = client.post("/api/predictions")
    assert response.status_code == 422

def test_invalid_image_upload_rejected(client):
    """Verify that unsupported file extensions are rejected with HTTP 400."""
    fake_pdf = io.BytesIO(b"%PDF-1.4 test document content")
    response = client.post(
        "/api/predictions",
        files={"image": ("document.pdf", fake_pdf, "application/pdf")}
    )
    assert response.status_code == 400
    assert "Invalid file extension" in response.json()["detail"]

def test_empty_image_upload_rejected(client):
    """Verify that an empty file is rejected with HTTP 400."""
    empty_file = io.BytesIO(b"")
    response = client.post(
        "/api/predictions",
        files={"image": ("leaf.jpg", empty_file, "image/jpeg")}
    )
    assert response.status_code == 400
    assert "empty" in response.json()["detail"].lower()

def test_missing_checkpoint_does_not_produce_fake_prediction(client, monkeypatch):
    """Verify that an unavailable model returns HTTP 503 rather than fabricating results."""
    monkeypatch.setattr(settings, "MODEL_CHECKPOINT_PATH", "model/checkpoints/non_existent.pt")
    dummy_jpeg = io.BytesIO(b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00`\x00`\x00\x00\xff\xdb\x00C\x00\xff\xd9")
    response = client.post(
        "/api/predictions",
        files={"image": ("leaf.jpg", dummy_jpeg, "image/jpeg")}
    )
    assert response.status_code == 503
    assert "No trained model checkpoint found" in response.json()["detail"]
