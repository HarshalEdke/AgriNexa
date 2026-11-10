import os
import tempfile
from decimal import Decimal
from pathlib import Path
from typing import Optional, Tuple
from fastapi import UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from PIL import Image
import numpy as np

from app.core.errors import (
    InvalidImageError,
    PayloadTooLargeError,
    ModelUnavailableError,
    InferenceError,
    DatabaseError,
)
from app.db.models.prediction import PredictionLog
from app.schemas import PredictionResponse
from app.services.predictor_contract import (
    PredictorProtocol,
    DefaultPredictor,
    normalize_prediction_output,
)
from app.services.disease_metadata_service import (
    DiseaseMetadataService,
    get_default_metadata_service,
)
from app.services.leaf_presence_gate import LeafPresenceGate, get_leaf_presence_gate
from app.services.validity_classifier import (
    ValidityClassifier,
    get_validity_classifier,
    ValidityResult,
)
from model.inference.predict import ModelNotReadyError

ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp", "image/bmp"}
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
MAX_FILE_SIZE = 15 * 1024 * 1024

# Stage 1 Obvious Invalid Image Filter thresholds
# Evidence-based thresholds to reject pure solids, blank images, and flat graphics/documents
# Note: This is an invalid-image filter only; it does NOT claim to detect plant leaves.
MIN_SHANNON_ENTROPY = 2.0
MIN_PIXEL_STD = 10.0

# Stage 3 Uncertainty Gate thresholds
# Uncertainty gate to prevent overconfident/ambiguous diagnoses from cascading downstream
# Note: These thresholds reflect model uncertainty, NOT out-of-distribution (OOD) plant detection.
MIN_TOP1_CONFIDENCE = 0.50
MIN_CONFIDENCE_MARGIN = 0.15


def check_image_statistics(image_path: str) -> Tuple[float, float]:
    """Calculate lightweight image statistics: grayscale Shannon entropy and pixel standard deviation.

    Stage 1: Rejects blank images, pure solid colors, and low-information graphics/documents.
    Does NOT claim to perform biological plant or leaf detection.
    """
    try:
        with Image.open(image_path) as img:
            gray = img.convert("L")
            arr = np.array(gray, dtype=np.float32)
            pixel_std = float(arr.std())

            counts, _ = np.histogram(arr, bins=256, range=(0, 256))
            total = counts.sum()
            if total == 0:
                entropy = 0.0
            else:
                probs = counts / total
                nonzero = probs[probs > 0]
                entropy = float(-np.sum(nonzero * np.log2(nonzero)))
    except Exception as e:
        raise InvalidImageError(
            f"Uploaded file cannot be parsed as a valid image: {e}",
            status="invalid_image",
        )

    if entropy < MIN_SHANNON_ENTROPY or pixel_std < MIN_PIXEL_STD:
        raise InvalidImageError(
            f"Uploaded image has insufficient visual complexity or contrast to be an evaluable crop leaf "
            f"(entropy: {entropy:.2f} < {MIN_SHANNON_ENTROPY:.1f} or std: {pixel_std:.2f} < {MIN_PIXEL_STD:.1f}). "
            f"Please upload a clear, focused photo of a crop leaf.",
            status="invalid_image",
        )

    return entropy, pixel_std


async def process_prediction(
    image: UploadFile,
    db: Optional[AsyncSession] = None,
    predictor: Optional[PredictorProtocol] = None,
    metadata_service: Optional[DiseaseMetadataService] = None,
    leaf_gate: Optional[LeafPresenceGate] = None,
    validity_service: Optional[ValidityClassifier] = None,
) -> PredictionResponse:
    """Validate uploaded image, filter invalid inputs, invoke E14 gate, E12 validity, and E11 disease predictor."""
    if not image.filename:
        raise InvalidImageError("No file selected or uploaded.", status="invalid_image")

    ext = Path(image.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise InvalidImageError(
            f"Invalid file extension '{ext}'. Allowed extensions: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
            status="invalid_image",
        )

    content = await image.read()
    if len(content) == 0:
        raise InvalidImageError("The uploaded image file is empty.", status="invalid_image")

    if len(content) > MAX_FILE_SIZE:
        raise PayloadTooLargeError(
            f"File exceeds maximum allowed size of {MAX_FILE_SIZE // (1024 * 1024)}MB."
        )

    if image.content_type and image.content_type not in ALLOWED_MIME_TYPES:
        raise InvalidImageError(
            f"Invalid Content-Type '{image.content_type}'. Allowed types: {', '.join(sorted(ALLOWED_MIME_TYPES))}",
            status="invalid_image",
        )

    suffix = ext if ext else ".jpg"
    temp_path = None

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            temp_file.write(content)
            temp_path = temp_file.name

        # Resolve predictor and metadata service
        active_predictor = predictor if predictor is not None else DefaultPredictor()
        active_metadata_service = (
            metadata_service if metadata_service is not None else get_default_metadata_service()
        )

        is_default = isinstance(active_predictor, DefaultPredictor)

        # Check model checkpoint availability before image statistics so missing model returns 503
        if is_default:
            cp = Path(active_predictor.checkpoint_path)
            if not cp.exists() or not cp.is_file():
                raise ModelUnavailableError(
                    f"No trained model checkpoint found at '{cp}'. "
                    "In accordance with project integrity guidelines, model training must be completed "
                    "with the verified HYBRID-10 training pool."
                )

        # Stage 1 — Obvious Invalid Image Filter (basic entropy & contrast checks)
        check_image_statistics(temp_path)

        # Stage 2 — E14 Leaf / Vegetation Presence Gate (Strict Fail-Closed)
        active_leaf_gate = leaf_gate if leaf_gate is not None else get_leaf_presence_gate()
        try:
            with Image.open(temp_path) as pil_img:
                img_arr = np.array(pil_img.convert("RGB"))
            is_leaf, gate_reason, telemetry = active_leaf_gate.evaluate(img_arr)
        except Exception as e:
            raise InvalidImageError(
                f"Leaf presence safety evaluation failed: {e}",
                status="invalid_image",
                rejection_reason="E14_EVALUATION_ERROR",
            )

        if not is_leaf:
            # Rejection semantics: E14 is NOT an OOD detector and must NOT be described as one.
            # If E14 rejects: DO NOT call E12. DO NOT call E11.
            raise InvalidImageError(
                f"The uploaded image does not appear to contain a plausible plant or leaf region ({gate_reason}). "
                f"Please upload a clear, focused photo of an Apple, Corn, Potato, or Tomato leaf.",
                status="not_leaf" if gate_reason != "INVALID_DEGENERATE_IMAGE" else "invalid_image",
                rejection_reason=gate_reason,
            )

        # Stage 3 — E12 5-Way Crop Validity Classifier & Margin Policy (Always Enforced)
        active_validity = validity_service if validity_service is not None else get_validity_classifier()
        val_res = active_validity.evaluate(temp_path)

        if not val_res.is_supported:
            # E11 is NOT called for unsupported or inconclusive crops
            if val_res.status == "unsupported_crop":
                return PredictionResponse(
                    predicted_class="Unsupported Crop",
                    confidence=val_res.confidence,
                    model_version=val_res.model_version,
                    display_name="Unsupported Crop Species",
                    precaution="AgriNexa AI currently supports Apple, Corn, Potato, and Tomato foliage. This leaf appears to belong to an unsupported plant variety.",
                    probabilities=val_res.probabilities,
                    pipeline="E12-SigLIP-Validity-Gate",
                    leaf_detected=True,
                    roi_count=1,
                    fallback_used=False,
                    is_conclusive=False,
                    status="unsupported_crop",
                    crop_class="Other",
                    crop_confidence=val_res.confidence,
                )
            else:  # inconclusive_crop
                return PredictionResponse(
                    predicted_class="Inconclusive Crop",
                    confidence=val_res.confidence,
                    model_version=val_res.model_version,
                    display_name="Inconclusive Crop Identification",
                    precaution="The crop species could not be identified with sufficient certainty. Please upload a clear photo of an Apple, Corn, Potato, or Tomato leaf.",
                    probabilities=val_res.probabilities,
                    pipeline="E12-SigLIP-Validity-Gate",
                    leaf_detected=True,
                    roi_count=1,
                    fallback_used=False,
                    is_conclusive=False,
                    status="inconclusive_crop",
                    crop_class=val_res.crop_class,
                    crop_confidence=val_res.confidence,
                )

        # Stage 4 — E11 Disease Classifier Execution (reached only for confirmed supported crops)
        try:
            raw_output = active_predictor.predict(temp_path)
            prediction_output = normalize_prediction_output(raw_output)
        except (ModelUnavailableError, ModelNotReadyError) as e:
            raise ModelUnavailableError(str(e))
        except (InvalidImageError, ValueError, FileNotFoundError) as e:
            raise InvalidImageError(str(e), status="invalid_image")
        except InferenceError:
            raise
        except Exception as e:
            raise InferenceError(f"Model inference failed: {str(e)}")

        # Stage 5 — E11 Uncertainty Gate
        probabilities = prediction_output.probabilities or {}
        if probabilities:
            sorted_probs = sorted(probabilities.values(), reverse=True)
            top1_conf = sorted_probs[0] if len(sorted_probs) > 0 else prediction_output.confidence
            top2_conf = sorted_probs[1] if len(sorted_probs) > 1 else 0.0
        else:
            top1_conf = prediction_output.confidence
            top2_conf = 0.0

        top1_margin = top1_conf - top2_conf

        # Evidence-based rule:
        # Inconclusive if top1_confidence < 0.50 OR top1_margin < 0.15
        if prediction_output.is_conclusive is False:
            is_conclusive = False
            diagnosis_status = prediction_output.status or "inconclusive"
        elif top1_conf < MIN_TOP1_CONFIDENCE or top1_margin < MIN_CONFIDENCE_MARGIN:
            is_conclusive = False
            diagnosis_status = "inconclusive"
        else:
            is_conclusive = True
            diagnosis_status = "confident"

        # Stage 6 — Backend metadata mapping & database persistence
        metadata = active_metadata_service.get_metadata(prediction_output.predicted_class)

        # Persist genuine prediction to database only after successful inference
        if db is not None:
            try:
                conf_val = None
                if prediction_output.confidence is not None:
                    conf_val = Decimal(str(round(prediction_output.confidence, 4)))

                log_entry = PredictionLog(
                    image_filename=image.filename,
                    predicted_class=prediction_output.predicted_class,
                    confidence=conf_val,
                    model_version=prediction_output.model_version,
                )
                db.add(log_entry)
                await db.flush()
            except Exception as e:
                raise DatabaseError(f"Database persistence failed: {str(e)}")

        return PredictionResponse(
            predicted_class=prediction_output.predicted_class,
            confidence=prediction_output.confidence,
            model_version=prediction_output.model_version,
            display_name=metadata.display_name,
            precaution=metadata.precaution,
            probabilities=prediction_output.probabilities,
            pipeline=prediction_output.pipeline,
            leaf_detected=prediction_output.leaf_detected,
            roi_count=prediction_output.roi_count,
            fallback_used=prediction_output.fallback_used,
            is_conclusive=is_conclusive,
            status=diagnosis_status,
            crop_class=val_res.crop_class if val_res else prediction_output.crop_class,
            crop_confidence=val_res.confidence if val_res else prediction_output.crop_confidence,
        )

    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except OSError:
                pass
