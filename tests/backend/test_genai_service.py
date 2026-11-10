import pytest
from unittest.mock import patch, MagicMock
from uuid import uuid4
from datetime import datetime, timezone
from pydantic import ValidationError
from google.genai.errors import APIError as GeminiAPIError
from groq import APIError as GroqAPIError, RateLimitError as GroqRateLimitError
from app.schemas import ChatContext, DiseaseMetadata, WeatherContext, ChatAnswer
from app.services.genai_service import generate_chat_answer, _build_grounding_context, _build_system_prompt
from app.core.errors import ChatProviderUnavailableError

@pytest.fixture
def valid_context():
    return ChatContext(
        predicted_class="Apple_scab",
        confidence=0.95,
        probabilities={"Apple_scab": 0.95, "Healthy": 0.05},
        model_version="v1.0",
        leaf_detected=True,
        fallback_used=False,
        disease_metadata=DiseaseMetadata(
            display_name="Apple Scab",
            symptoms="Dark lesions on leaves",
            treatment="Fungicide A"
        ),
        question="What should I do?",
        session_id=uuid4()
    )

@patch("app.services.genai_service.get_gemini_client")
@patch("app.services.genai_service.get_groq_client")
def test_gemini_successful_answer(mock_get_groq, mock_get_gemini, valid_context):
    mock_gemini = MagicMock()
    mock_response = MagicMock()
    mock_response.text = "This is a Gemini answer."
    mock_gemini.models.generate_content.return_value = mock_response
    mock_get_gemini.return_value = mock_gemini
    
    mock_get_groq.return_value = None
    
    answer = generate_chat_answer(valid_context)
    
    assert isinstance(answer, ChatAnswer)
    assert answer.answer == "This is a Gemini answer."
    assert answer.source == "gemini"
    assert answer.grounded is True
    assert answer.session_id == valid_context.session_id
    
    # Verify kwargs contain system instruction and target model
    call_args = mock_gemini.models.generate_content.call_args
    assert call_args is not None
    kwargs = call_args[1]
    assert kwargs["model"] == "gemini-3.1-flash-lite"
    assert "config" in kwargs
    assert kwargs["config"].system_instruction is not None
    assert valid_context.question in str(kwargs["contents"])

@patch("app.services.genai_service.get_gemini_client")
@patch("app.services.genai_service.get_groq_client")
def test_gemini_temporary_failure_groq_fallback(mock_get_groq, mock_get_gemini, valid_context):
    mock_gemini = MagicMock()
    # 503 is temporary, should trigger fallback
    error = GeminiAPIError(503, {"error": "Service Unavailable"}, None)
    mock_gemini.models.generate_content.side_effect = error
    mock_get_gemini.return_value = mock_gemini
    
    mock_groq = MagicMock()
    mock_response = MagicMock()
    mock_response.choices = [MagicMock(message=MagicMock(content="This is a Groq answer."))]
    mock_groq.chat.completions.create.return_value = mock_response
    mock_get_groq.return_value = mock_groq
    
    answer = generate_chat_answer(valid_context)
    
    assert answer.answer == "This is a Groq answer."
    assert answer.source == "groq"
    assert answer.grounded is True
    
    # Verify Groq fallback was called with qwen/qwen3.8-27b
    groq_call_args = mock_groq.chat.completions.create.call_args
    assert groq_call_args is not None
    assert groq_call_args[1]["model"] == "qwen/qwen3.8-27b"

@patch("app.services.genai_service.get_gemini_client")
@patch("app.services.genai_service.get_groq_client")
def test_gemini_auth_failure_no_fallback(mock_get_groq, mock_get_gemini, valid_context):
    mock_gemini = MagicMock()
    # 403 Forbidden is NOT in (429, 500, 502, 503, 504) -> should raise
    error = GeminiAPIError(403, {"error": "Forbidden"}, None)
    mock_gemini.models.generate_content.side_effect = error
    mock_get_gemini.return_value = mock_gemini
    
    mock_get_groq.return_value = None
    
    with pytest.raises(GeminiAPIError):
        generate_chat_answer(valid_context)

@patch("app.services.genai_service.get_gemini_client")
@patch("app.services.genai_service.get_groq_client")
def test_gemini_empty_response_fallback(mock_get_groq, mock_get_gemini, valid_context):
    mock_gemini = MagicMock()
    mock_response = MagicMock()
    mock_response.text = "" # Empty response
    mock_gemini.models.generate_content.return_value = mock_response
    mock_get_gemini.return_value = mock_gemini
    
    mock_groq = MagicMock()
    mock_response_groq = MagicMock()
    mock_response_groq.choices = [MagicMock(message=MagicMock(content="Groq fallback."))]
    mock_groq.chat.completions.create.return_value = mock_response_groq
    mock_get_groq.return_value = mock_groq
    
    answer = generate_chat_answer(valid_context)
    assert answer.source == "groq"

@patch("app.services.genai_service.get_gemini_client")
@patch("app.services.genai_service.get_groq_client")
def test_groq_empty_response(mock_get_groq, mock_get_gemini, valid_context):
    mock_get_gemini.return_value = None # Skip Gemini
    
    mock_groq = MagicMock()
    mock_response_groq = MagicMock()
    mock_response_groq.choices = [MagicMock(message=MagicMock(content="   "))] # Empty after strip
    mock_groq.chat.completions.create.return_value = mock_response_groq
    mock_get_groq.return_value = mock_groq
    
    with pytest.raises(ChatProviderUnavailableError):
        generate_chat_answer(valid_context)

@patch("app.services.genai_service.get_gemini_client")
@patch("app.services.genai_service.get_groq_client")
def test_both_providers_fail(mock_get_groq, mock_get_gemini, valid_context):
    from groq import InternalServerError as GroqInternalServerError
    mock_gemini = MagicMock()
    mock_gemini.models.generate_content.side_effect = GeminiAPIError(503, {}, None)
    mock_get_gemini.return_value = mock_gemini
    
    mock_groq = MagicMock()
    mock_response = MagicMock()
    mock_response.request = MagicMock()
    mock_groq.chat.completions.create.side_effect = GroqInternalServerError("Server Error", response=mock_response, body=None)
    mock_get_groq.return_value = mock_groq
    
    with pytest.raises(ChatProviderUnavailableError):
        generate_chat_answer(valid_context)

def test_missing_disease_metadata():
    context = ChatContext(
        predicted_class="Apple_scab",
        confidence=0.95,
        probabilities={"Apple_scab": 0.95, "Healthy": 0.05},
        model_version="v1.0",
        leaf_detected=True,
        question="What should I do?",
        session_id=uuid4()
    )
    
    answer = generate_chat_answer(context)
    assert answer.grounded is False
    assert answer.source == "system"
    assert "not have enough specific disease information" in answer.answer

def test_leaf_detected_false():
    context = ChatContext(
        predicted_class="Apple_scab",
        confidence=0.95,
        probabilities={"Apple_scab": 0.95, "Healthy": 0.05},
        model_version="v1.0",
        leaf_detected=False,
        disease_metadata=DiseaseMetadata(display_name="Scab", symptoms="", treatment=""),
        question="What should I do?",
        session_id=uuid4()
    )
    
    answer = generate_chat_answer(context)
    assert answer.grounded is False
    assert answer.source == "system"
    assert "uploading a clearer photo" in answer.answer

@patch("app.services.genai_service.get_gemini_client")
@patch("app.services.genai_service.get_groq_client")
def test_leaf_detected_none(mock_get_groq, mock_get_gemini):
    context = ChatContext(
        predicted_class="Apple_scab",
        confidence=0.95,
        probabilities={"Apple_scab": 0.95, "Healthy": 0.05},
        model_version="v1.0",
        leaf_detected=None,
        disease_metadata=DiseaseMetadata(display_name="Scab", symptoms="", treatment=""),
        question="What should I do?",
        session_id=uuid4()
    )
    
    mock_gemini = MagicMock()
    mock_response = MagicMock()
    mock_response.text = "This works fine."
    mock_gemini.models.generate_content.return_value = mock_response
    mock_get_gemini.return_value = mock_gemini
    
    mock_get_groq.return_value = None
    
    answer = generate_chat_answer(context)
    assert answer.grounded is True
    assert answer.source == "gemini"

def test_ambiguous_prediction_grounding(valid_context):
    # Set ambiguity with diff < 0.15
    valid_context.probabilities = {"Apple_scab": 0.40, "Cedar_apple_rust": 0.35, "Healthy": 0.25}
    grounding_text = _build_grounding_context(valid_context)
    
    assert "prediction is somewhat ambiguous" in grounding_text
    assert "Cedar_apple_rust is also a possibility" in grounding_text

def test_fallback_used_grounding(valid_context):
    valid_context.fallback_used = True
    grounding_text = _build_grounding_context(valid_context)
    assert "fallback diagnostic was used" in grounding_text
    
def test_schema_probability_validation():
    with pytest.raises(ValidationError):
        ChatContext(
            predicted_class="Apple_scab",
            confidence=0.95,
            probabilities={"Apple_scab": 1.5}, # Invalid probability
            model_version="v1.0",
            leaf_detected=True,
            question="Help",
            session_id=uuid4()
        )

def test_schema_whitespace_question():
    with pytest.raises(ValidationError):
        ChatContext(
            predicted_class="Apple_scab",
            confidence=0.95,
            probabilities={"Apple_scab": 0.95},
            model_version="v1.0",
            leaf_detected=True,
            question="   \n   ", # Only whitespace
            session_id=uuid4()
        )

# --- Multilingual Tests ---

def test_language_en_prompt(valid_context):
    valid_context.language = "en"
    grounding = _build_grounding_context(valid_context)
    prompt = _build_system_prompt(valid_context, grounding)
    assert "language code: en" in prompt
    assert "MUST be written entirely in the requested language" in prompt

def test_language_hi_prompt(valid_context):
    valid_context.language = "hi"
    grounding = _build_grounding_context(valid_context)
    prompt = _build_system_prompt(valid_context, grounding)
    assert "language code: hi" in prompt
    assert "MUST be written entirely in the requested language" in prompt

def test_language_gu_prompt(valid_context):
    valid_context.language = "gu"
    grounding = _build_grounding_context(valid_context)
    prompt = _build_system_prompt(valid_context, grounding)
    assert "language code: gu" in prompt

@pytest.mark.parametrize(
    ("language", "language_name"),
    [("mr", "Marathi"), ("ta", "Tamil"), ("pa", "Punjabi")],
)
def test_new_language_prompts(valid_context, language, language_name):
    valid_context.language = language
    grounding = _build_grounding_context(valid_context)
    prompt = _build_system_prompt(valid_context, grounding)

    assert f"language code: {language}" in prompt
    assert f"language name: {language_name}" in prompt

def test_language_default_prompt():
    context = ChatContext(
        predicted_class="Apple_scab",
        confidence=0.95,
        probabilities={"Apple_scab": 0.95, "Healthy": 0.05},
        model_version="v1.0",
        leaf_detected=True,
        question="Help",
        session_id=uuid4()
    )
    # language is implicitly "en"
    grounding = _build_grounding_context(context)
    prompt = _build_system_prompt(context, grounding)
    assert "language code: en" in prompt

def test_followup_language_behavior(valid_context):
    valid_context.language = "hi"
    valid_context.question = "First question in Hindi"
    grounding1 = _build_grounding_context(valid_context)
    prompt1 = _build_system_prompt(valid_context, grounding1)
    
    valid_context.language = "gu"
    valid_context.question = "Second question in Gujarati"
    grounding2 = _build_grounding_context(valid_context)
    prompt2 = _build_system_prompt(valid_context, grounding2)
    
    assert "language code: hi" in prompt1
    assert "language code: gu" in prompt2

@patch("app.services.genai_service.get_gemini_client")
@patch("app.services.genai_service.get_groq_client")
def test_gemini_fallback_preserves_language(mock_get_groq, mock_get_gemini, valid_context):
    valid_context.language = "gu"
    
    # Mock Gemini to fail (transient)
    mock_gemini = MagicMock()
    error = GeminiAPIError(503, {"error": "Service Unavailable"}, None)
    mock_gemini.models.generate_content.side_effect = error
    mock_get_gemini.return_value = mock_gemini
    
    # Mock Groq to succeed
    mock_groq = MagicMock()
    mock_response = MagicMock()
    mock_response.choices = [MagicMock(message=MagicMock(content="Gujarati Groq Response"))]
    mock_groq.chat.completions.create.return_value = mock_response
    mock_get_groq.return_value = mock_groq
    
    answer = generate_chat_answer(valid_context)
    
    # Groq must have been called with the Gujarati instruction
    call_args = mock_groq.chat.completions.create.call_args
    assert call_args is not None
    kwargs = call_args[1]
    system_prompt_used = kwargs["messages"][0]["content"]
    assert "language code: gu" in system_prompt_used
    assert answer.source == "groq"
    assert answer.answer == "Gujarati Groq Response"

def test_schema_unsupported_language():
    with pytest.raises(ValidationError) as exc:
        ChatContext(
            predicted_class="Apple_scab",
            confidence=0.95,
            probabilities={"Apple_scab": 0.95},
            model_version="v1.0",
            leaf_detected=True,
            question="Help",
            session_id=uuid4(),
            language="fr" # Unsupported
        )
    assert "unsupported language code" in str(exc.value).lower()


@patch("app.services.genai_service.get_gemini_client")
@patch("app.services.genai_service.get_groq_client")
def test_provider_hierarchy_and_model_configuration(mock_get_groq, mock_get_gemini, valid_context):
    """Verify Gemini is tried first with gemini-3.1-flash-lite, and falls back to Groq with qwen/qwen3.8-27b on transient failure."""
    from app.config import settings
    assert settings.GEMINI_MODEL == "gemini-3.1-flash-lite"
    assert settings.GROQ_MODEL == "qwen/qwen3.8-27b"

    # 1. Successful Gemini call (Primary)
    mock_gemini = MagicMock()
    mock_gemini_res = MagicMock()
    mock_gemini_res.text = "Primary Gemini Answer"
    mock_gemini.models.generate_content.return_value = mock_gemini_res
    mock_get_gemini.return_value = mock_gemini

    mock_groq = MagicMock()
    mock_get_groq.return_value = mock_groq

    ans = generate_chat_answer(valid_context)
    assert ans.source == "gemini"
    assert ans.answer == "Primary Gemini Answer"
    mock_gemini.models.generate_content.assert_called_once()
    assert mock_gemini.models.generate_content.call_args[1]["model"] == "gemini-3.1-flash-lite"
    mock_groq.chat.completions.create.assert_not_called()

    # 2. Transient Gemini failure -> Fallback to Groq
    mock_gemini.models.generate_content.side_effect = GeminiAPIError(503, {"error": "Transient 503"}, None)
    mock_groq_res = MagicMock()
    mock_groq_res.choices = [MagicMock(message=MagicMock(content="Fallback Groq Qwen Answer"))]
    mock_groq.chat.completions.create.return_value = mock_groq_res

    ans_fallback = generate_chat_answer(valid_context)
    assert ans_fallback.source == "groq"
    assert ans_fallback.answer == "Fallback Groq Qwen Answer"
    mock_groq.chat.completions.create.assert_called_once()
    assert mock_groq.chat.completions.create.call_args[1]["model"] == "qwen/qwen3.8-27b"

