import pytest
import uuid
from datetime import datetime, timezone
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock

from app.main import app
from app.schemas import ChatAnswer, ChatContext, ChatRequest
from app.core.errors import ChatProviderUnavailableError

client = TestClient(app)

VALID_PAYLOAD = {
    "predicted_class": "Potato Early Blight",
    "confidence": 0.95,
    "probabilities": {"Potato Early Blight": 0.95, "Potato Healthy": 0.05},
    "model_version": "v1.0.0",
    "leaf_detected": True,
    "fallback_used": False,
    "question": "What should I do about this?",
    "session_id": str(uuid.uuid4()),
    "language": "en"
}

def test_chat_valid_request_calls_service():
    """Verify a valid request calls generate_chat_answer with correct context and returns ChatAnswer."""
    mock_answer = ChatAnswer(
        answer="You should apply fungicide.",
        session_id=uuid.UUID(VALID_PAYLOAD["session_id"]),
        grounded=True,
        source="gemini",
        timestamp=datetime.now(timezone.utc)
    )
    
    with patch("app.api.routes.chat.generate_chat_answer", return_value=mock_answer) as mock_generate:
        response = client.post("/api/chat", json=VALID_PAYLOAD)
        
        assert response.status_code == 200
        data = response.json()
        assert data["answer"] == "You should apply fungicide."
        assert data["grounded"] is True
        
        mock_generate.assert_called_once()
        context = mock_generate.call_args[0][0]
        assert isinstance(context, ChatContext)
        assert context.predicted_class == "Potato Early Blight"
        assert context.confidence == 0.95
        assert context.disease_metadata is not None
        assert context.disease_metadata.display_name == "Potato — Early Blight"
        assert "Fungicides only where warranted" in context.disease_metadata.treatment
        assert context.question == "What should I do about this?"

def test_chat_unknown_disease_no_hallucinated_metadata():
    """Verify an unknown predicted class passes None for disease_metadata."""
    payload = VALID_PAYLOAD.copy()
    payload["predicted_class"] = "Unknown Alien Disease"
    payload["probabilities"] = {"Unknown Alien Disease": 0.99}
    
    mock_answer = ChatAnswer(
        answer="I'm sorry, but I do not have enough specific disease information.",
        session_id=uuid.UUID(VALID_PAYLOAD["session_id"]),
        grounded=False,
        source="system",
        timestamp=datetime.now(timezone.utc)
    )
    
    with patch("app.api.routes.chat.generate_chat_answer", return_value=mock_answer) as mock_generate:
        response = client.post("/api/chat", json=payload)
        
        assert response.status_code == 200
        mock_generate.assert_called_once()
        context = mock_generate.call_args[0][0]
        assert context.predicted_class == "Unknown Alien Disease"
        assert context.disease_metadata is None

def test_chat_validation_confidence_bounds():
    """Verify confidence must be between 0 and 1."""
    payload = VALID_PAYLOAD.copy()
    payload["confidence"] = 1.5
    
    response = client.post("/api/chat", json=payload)
    assert response.status_code == 422
    
    payload["confidence"] = -0.1
    response = client.post("/api/chat", json=payload)
    assert response.status_code == 422

def test_chat_validation_probability_bounds():
    """Verify probabilities must be between 0 and 1."""
    payload = VALID_PAYLOAD.copy()
    payload["probabilities"] = {"Potato Early Blight": 1.2}
    
    response = client.post("/api/chat", json=payload)
    assert response.status_code == 422

def test_chat_validation_invalid_language():
    """Verify unsupported language codes are rejected."""
    payload = VALID_PAYLOAD.copy()
    payload["language"] = "fr"
    
    response = client.post("/api/chat", json=payload)
    assert response.status_code == 422

@pytest.mark.parametrize("language", ["mr", "ta", "pa"])
def test_chat_validation_new_languages(language):
    """Verify Marathi, Tamil, and Punjabi are accepted language codes."""
    payload = {**VALID_PAYLOAD, "language": language}
    request = ChatRequest(**payload)

    assert request.language == language

def test_chat_validation_empty_question():
    """Verify question cannot be empty or just whitespace."""
    payload = VALID_PAYLOAD.copy()
    payload["question"] = "   "
    
    response = client.post("/api/chat", json=payload)
    assert response.status_code == 422

def test_chat_validation_question_too_long():
    """Verify question cannot exceed 500 characters."""
    payload = VALID_PAYLOAD.copy()
    payload["question"] = "a" * 501
    
    response = client.post("/api/chat", json=payload)
    assert response.status_code == 422

def test_chat_provider_unavailable():
    """Verify route handles ChatProviderUnavailableError with HTTP 503."""
    with (
        patch("app.api.routes.chat.has_configured_chat_provider", return_value=True),
        patch("app.api.routes.chat.generate_chat_answer", side_effect=ChatProviderUnavailableError("All providers failed.")),
    ):
        response = client.post("/api/chat", json=VALID_PAYLOAD)
        assert response.status_code == 503
        assert "unavailable" in response.json()["detail"].lower()

def test_chat_missing_provider_configuration():
    """Tell users when neither supported chat provider is configured."""
    with (
        patch("app.api.routes.chat.has_configured_chat_provider", return_value=False),
        patch("app.api.routes.chat.generate_chat_answer", side_effect=ChatProviderUnavailableError()),
    ):
        response = client.post("/api/chat", json=VALID_PAYLOAD)

    assert response.status_code == 503
    assert "GEMINI_API_KEY" in response.json()["detail"]
    assert "GROQ_API_KEY" in response.json()["detail"]

def test_chat_unexpected_error():
    """Verify route handles unexpected errors with HTTP 500."""
    with patch("app.api.routes.chat.generate_chat_answer", side_effect=RuntimeError("Random explosion.")):
        response = client.post("/api/chat", json=VALID_PAYLOAD)
        assert response.status_code == 500
        assert "unexpected error" in response.json()["detail"].lower()
