import logging
import json
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

try:
    from google import genai
    from google.genai import types as genai_types
    from google.genai.errors import APIError as GeminiAPIError
except ImportError:  # pragma: no cover
    genai = None
    genai_types = None
    GeminiAPIError = Exception
    logger.warning("Google generative AI package not installed; chat functionality disabled.")

from groq import Groq
from groq import APIError as GroqAPIError, APIConnectionError as GroqAPIConnectionError, RateLimitError as GroqRateLimitError, InternalServerError as GroqInternalServerError
from app.config import settings
from app.schemas import ChatContext, ChatAnswer
from app.core.errors import ChatProviderUnavailableError

logger = logging.getLogger(__name__)

# Initialize clients lazily if keys are available
_gemini_client = None
_groq_client = None

def _is_configured_api_key(api_key):
    return bool(api_key and api_key.strip() and not api_key.strip().lower().startswith("your_"))

def has_configured_chat_provider() -> bool:
    return _is_configured_api_key(settings.GEMINI_API_KEY) or _is_configured_api_key(settings.GROQ_API_KEY)

def get_gemini_client():
    global _gemini_client
    if _gemini_client is None and _is_configured_api_key(settings.GEMINI_API_KEY):
        if genai is not None:
            try:
                _gemini_client = genai.Client(api_key=settings.GEMINI_API_KEY)
            except Exception as e:
                logger.warning("Failed to initialize Gemini client: %s", e)
                _gemini_client = None
        else:
            logger.debug("Google generative AI package is not installed; skipping Gemini client.")
    return _gemini_client

def get_groq_client():
    global _groq_client
    if _groq_client is None and _is_configured_api_key(settings.GROQ_API_KEY):
        if Groq is not None:
            try:
                _groq_client = Groq(api_key=settings.GROQ_API_KEY)
            except Exception as e:
                logger.warning("Failed to initialize Groq client: %s", e)
                _groq_client = None
        else:
            logger.debug("Groq package is not installed; skipping Groq client.")
    return _groq_client

def _build_grounding_context(context: ChatContext) -> str:
    parts = []
    parts.append(f"Predicted Disease: {context.predicted_class}")
    parts.append(f"Confidence: {context.confidence:.2f}")
    
    # Ambiguity check
    sorted_probs = sorted(context.probabilities.items(), key=lambda x: x[1], reverse=True)
    if len(sorted_probs) > 1:
        top_prob = sorted_probs[0][1]
        second_prob = sorted_probs[1][1]
        if top_prob - second_prob < 0.15: # 0.15 threshold for ambiguity
            parts.append(f"Note: The prediction is somewhat ambiguous. {sorted_probs[1][0]} is also a possibility.")
            
    if context.fallback_used:
        parts.append("Note: The primary diagnostic system encountered an issue, so a fallback diagnostic was used. Please be slightly more cautious in your tone.")
            
    if context.disease_metadata:
        md = context.disease_metadata
        parts.append(f"Disease Name: {md.display_name}")
        parts.append(f"Symptoms: {md.symptoms}")
        parts.append(f"Treatment: {md.treatment}")
        if md.precautions:
            parts.append(f"Precautions: {md.precautions}")
            
    if context.weather_context:
        w = context.weather_context
        w_parts = []
        if w.risk_level: w_parts.append(f"Risk Level: {w.risk_level}")
        if w.temperature is not None: w_parts.append(f"Temp: {w.temperature}°C")
        if w.humidity is not None: w_parts.append(f"Humidity: {w.humidity}%")
        if w.rainfall_probability is not None: w_parts.append(f"Rainfall Prob: {w.rainfall_probability:.2f}")
        if w_parts:
            parts.append("Weather Context: " + ", ".join(w_parts))
            
    if context.location_context:
        parts.append(f"Location Context: {json.dumps(context.location_context)}")
        
    if context.farmer_context:
        parts.append(f"Farmer Context: {json.dumps(context.farmer_context)}")

    return "\n".join(parts)


def _build_system_prompt(context: ChatContext, grounding_text: str) -> str:
    lang = context.language or "en"
    language_name = {
        "en": "English",
        "hi": "Hindi",
        "gu": "Gujarati",
        "mr": "Marathi",
        "ta": "Tamil",
        "pa": "Punjabi",
    }.get(lang, lang)
    return (
        "You are a helpful, simple, farmer-friendly agricultural assistant. "
        "Answer the farmer's question directly using ONLY the following Grounding Context. "
        "Do not invent facts, symptoms, treatments, precautions, pesticides, dosages, weather, or farmer info. "
        "If the information is not in the context, clearly state that you do not have that information. "
        "If the prediction is ambiguous/uncertain, communicate that uncertainty politely. "
        "If the question is unrelated to agriculture or the disease, politely redirect the user. "
        f"IMPORTANT: The farmer-facing answer MUST be written entirely in the requested language "
        f"(language code: {lang}, language name: {language_name}). "
        "Disease names and technical terms may remain in their standard form if translating them reduces clarity, "
        "but all treatments, symptoms, precautions, and other facts must come ONLY from the Grounding Context.\n\n"
        "--- Grounding Context ---\n"
        f"{grounding_text}\n"
        "--------------------------"
    )

def generate_chat_answer(context: ChatContext) -> ChatAnswer:
    if context.leaf_detected is False:
        return ChatAnswer(
            answer="I couldn't find diagnosis details for this — please try uploading a clearer photo of the leaf.",
            session_id=context.session_id,
            grounded=False,
            source="system",
            timestamp=datetime.now(timezone.utc)
        )

    if not context.disease_metadata:
        # Graceful fallback when missing core grounding
        return ChatAnswer(
            answer="I'm sorry, but I do not have enough specific disease information available right now to provide a detailed answer.",
            session_id=context.session_id,
            grounded=False,
            source="system",
            timestamp=datetime.now(timezone.utc)
        )
        
    grounding_text = _build_grounding_context(context)
    system_prompt = _build_system_prompt(context, grounding_text)
    user_prompt = context.question
    
    gemini = get_gemini_client()
    groq = get_groq_client()
    
    gemini_failed = False
    # Try Gemini first
    if gemini:
        try:
            contents = []
            if context.history:
                for msg in context.history:
                    role = "model" if msg.role == "assistant" else "user"
                    if contents and contents[-1].role == role:
                        contents[-1].parts.append(genai_types.Part.from_text(text=f"\n\n{msg.content}"))
                    else:
                        contents.append(genai_types.Content(role=role, parts=[genai_types.Part.from_text(text=msg.content)]))
            
            if contents and contents[-1].role == "user":
                contents[-1].parts.append(genai_types.Part.from_text(text=f"\n\n{user_prompt}"))
            else:
                contents.append(genai_types.Content(role="user", parts=[genai_types.Part.from_text(text=user_prompt)]))

            response = gemini.models.generate_content(
                model=settings.GEMINI_MODEL,
                contents=contents,
                config=genai_types.GenerateContentConfig(
                    system_instruction=system_prompt
                )
            )
            if response.text and response.text.strip():
                return ChatAnswer(
                    answer=response.text.strip(),
                    session_id=context.session_id,
                    grounded=True,
                    source="gemini",
                    timestamp=datetime.now(timezone.utc)
                )
            else:
                logger.warning("Gemini returned an empty response, triggering fallback.")
                gemini_failed = True
        except GeminiAPIError as e:
            code = getattr(e, 'code', None)
            if code in (429, 500, 502, 503, 504):
                logger.warning("Gemini generation transient failure (code=%s), falling back to Groq: %s", code, e)
                gemini_failed = True
            else:
                logger.error("Gemini generation fatal error (code=%s): %s", code, e)
                raise # Bubble up fatal/auth errors
        except Exception as e:
            logger.warning("Gemini unexpected generation error: %s, falling back to Groq", e)
            gemini_failed = True
    else:
        gemini_failed = True
            
    # Fallback to Groq
    if groq and gemini_failed:
        try:
            messages = [{"role": "system", "content": system_prompt}]
            if context.history:
                for msg in context.history:
                    messages.append({"role": msg.role, "content": msg.content})
            messages.append({"role": "user", "content": user_prompt})

            response = groq.chat.completions.create(
                model=settings.GROQ_MODEL,
                messages=messages,
                max_tokens=900,
                temperature=0.3
            )
            
            if response.choices and response.choices[0].message.content and response.choices[0].message.content.strip():
                return ChatAnswer(
                    answer=response.choices[0].message.content.strip(),
                    session_id=context.session_id,
                    grounded=True,
                    source="groq",
                    timestamp=datetime.now(timezone.utc)
                )
            else:
                logger.error("Groq returned an empty response.")
                raise ChatProviderUnavailableError("Empty response from providers")
                
        except (GroqInternalServerError, GroqAPIConnectionError, GroqRateLimitError) as e:
            logger.warning("Groq transient generation failed: %s", e)
            raise ChatProviderUnavailableError() from e
        except GroqAPIError as e:
            logger.warning("Groq generation API error: %s", e)
            raise ChatProviderUnavailableError() from e
        except Exception as e:
            logger.warning("Groq unexpected error: %s", e)
            raise ChatProviderUnavailableError() from e
            
    # Both failed or unavailable
    raise ChatProviderUnavailableError("All configured GenAI chat providers are unavailable.")
