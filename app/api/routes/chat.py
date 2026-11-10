import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import SQLAlchemyError
from typing import Optional

logger = logging.getLogger(__name__)

from app.schemas import ChatRequest, ChatAnswer, ChatContext, WeatherContext, DiseaseMetadata as GenAIDiseaseMetadata, ChatSessionResponse, ChatMessageResponse, ChatHistoryMessage
from app.services.disease_metadata_service import DiseaseMetadataService, get_default_metadata_service
from app.services.genai_service import generate_chat_answer, has_configured_chat_provider
from app.core.errors import ChatProviderUnavailableError, AppError, DatabaseError
from app.dependencies import get_optional_user, get_db_session, get_current_user
from app.db.models.user import User
from typing import List
import uuid
from app.services.chat_history_service import ChatHistoryService

router = APIRouter(prefix="/api", tags=["Chat"])

@router.post("/chat", response_model=ChatAnswer)
async def chat(
    request: ChatRequest,
    metadata_service: DiseaseMetadataService = Depends(get_default_metadata_service),
    current_user: Optional[User] = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db_session)
):
    """
    Accepts a prediction context and a question, resolves authoritative disease metadata, 
    and streams a grounded answer via GenAI.
    Persists history for authenticated users.
    """
    
    # 1. Resolve authoritative metadata
    disease_metadata = metadata_service.get_genai_metadata(request.predicted_class)
    
    # 2. Build internal ChatContext
    context = ChatContext(
        predicted_class=request.predicted_class,
        confidence=request.confidence,
        probabilities=request.probabilities,
        model_version=request.model_version,
        leaf_detected=request.leaf_detected,
        fallback_used=request.fallback_used,
        disease_metadata=disease_metadata,
        weather_context=None,
        location_context=None,
        farmer_context=None,
        question=request.question,
        session_id=request.session_id,
        language=request.language
    )

    # 3. If authenticated, enforce ownership/initialize session before GenAI call
    if current_user:
        try:
            await ChatHistoryService.get_or_create_session(db, request.session_id, current_user.id)
            history_msgs = await ChatHistoryService.get_session_messages(db, request.session_id, current_user.id, limit=12)
            context.history = [
                ChatHistoryMessage(role=m.role, content=m.content) for m in history_msgs
            ]
        except AppError as e:
            raise e
        except SQLAlchemyError:
            raise DatabaseError("Failed to initialize chat session or retrieve history.")
    
    # 4. Call internal GenAI service directly
    try:
        answer = generate_chat_answer(context)
    except ChatProviderUnavailableError as e:
        if current_user:
            await db.rollback()
        logger.warning("Chat service unavailable: %s", e)
        detail = (
            "Chat AI is not configured. Add a valid GEMINI_API_KEY or GROQ_API_KEY "
            "to the backend .env file, then restart the backend."
            if not has_configured_chat_provider()
            else "Chat service is currently unavailable. Please try again later."
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=detail
        )
    except Exception as e:
        if current_user:
            await db.rollback()
        logger.exception("Unexpected error during chat generation: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred during chat generation."
        )

    # 5. If authenticated, persist conversation history
    if current_user:
        try:
            # Persist user question
            await ChatHistoryService.append_message(
                db, request.session_id, current_user.id, "user", request.question
            )
            # Persist assistant response
            await ChatHistoryService.append_message(
                db, request.session_id, current_user.id, "assistant", answer.answer
            )
            await db.commit()
        except AppError as e:
            await db.rollback()
            raise e
        except SQLAlchemyError:
            await db.rollback()
            raise DatabaseError("Failed to persist chat history.")
        except Exception:
            await db.rollback()
            raise
            
    return answer

@router.get("/chat/sessions", response_model=List[ChatSessionResponse])
async def get_sessions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
):
    """
    Retrieve all chat sessions belonging to the authenticated user.
    """
    try:
        return await ChatHistoryService.get_user_sessions(db, current_user.id)
    except SQLAlchemyError:
        raise DatabaseError("Failed to retrieve chat sessions.")

@router.get("/chat/sessions/{session_id}/messages", response_model=List[ChatMessageResponse])
async def get_session_messages(
    session_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
):
    """
    Retrieve all messages for a specific chat session owned by the authenticated user.
    """
    try:
        return await ChatHistoryService.get_session_messages(db, session_id, current_user.id)
    except AppError as e:
        raise e
    except SQLAlchemyError:
        raise DatabaseError("Failed to retrieve chat messages.")
