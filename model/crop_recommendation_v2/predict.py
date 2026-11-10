"""Inference interface for AgriNexa AI Crop Recommendation Model v2 (Farmer-Friendly)."""

import json
from pathlib import Path
from typing import Dict, Any, List, Optional, Union
import joblib
import numpy as np
import pandas as pd

from model.crop_recommendation_v2.preprocessing import (
    FEATURE_NAMES,
    validate_input,
    prepare_inference_dataframe,
)

class ModelNotReadyError(Exception):
    """Raised when inference is requested but Model v2 artifacts are missing."""
    pass

class CropRecommendationInferenceV2:
    """Thread-safe, cached inference engine for Model v2."""
    _instance: Optional["CropRecommendationInferenceV2"] = None
    
    def __init__(self, model_dir: Optional[Union[str, Path]] = None):
        if model_dir is None:
            model_dir = Path(__file__).parent
        else:
            model_dir = Path(model_dir)
            
        self.model_dir = model_dir
        self.model_path = model_dir / "crop_model.joblib"
        self.metadata_path = model_dir / "metadata.json"
        
        self.pipeline = None
        self.metadata: Dict[str, Any] = {}
        self.classes_: List[str] = []
        self._load()

    def _load(self) -> None:
        if not self.model_path.exists():
            raise ModelNotReadyError(
                f"Model v2 artifact not found at '{self.model_path}'. "
                "Please execute training ('model/crop_recommendation_v2/train.py') first."
            )
        if not self.metadata_path.exists():
            raise ModelNotReadyError(
                f"Model v2 metadata not found at '{self.metadata_path}'. "
                "Please execute training ('model/crop_recommendation_v2/train.py') first."
            )
            
        try:
            self.pipeline = joblib.load(self.model_path)
            with open(self.metadata_path, "r", encoding="utf-8") as f:
                self.metadata = json.load(f)
            self.classes_ = list(self.pipeline.classes_)
        except Exception as e:
            raise RuntimeError(f"Failed to load Crop Recommendation Model v2 artifacts: {str(e)}") from e

    def predict(
        self,
        state: str,
        district: str,
        temperature: Union[int, float],
        humidity: Union[int, float],
        rainfall: Union[int, float],
        soil_type: str,
        previous_crop: str,
        top_k: int = 3,
    ) -> Dict[str, Any]:
        """Predict top recommended crops with calibrated confidence and transparent explainability."""
        # 1. Validate inputs
        validated = validate_input(
            state=state,
            district=district,
            temperature=temperature,
            humidity=humidity,
            rainfall=rainfall,
            soil_type=soil_type,
            previous_crop=previous_crop,
        )
        
        # 2. Prepare DataFrame
        df_input = prepare_inference_dataframe(validated)
        
        # 3. Predict probabilities
        probabilities = self.pipeline.predict_proba(df_input)[0]
        
        # 4. Rank classes
        sorted_indices = np.argsort(probabilities)[::-1]
        k = max(1, min(int(top_k), len(self.classes_)))
        top_indices = sorted_indices[:k]
        
        recommendations: List[Dict[str, Any]] = []
        for idx in top_indices:
            crop_name = str(self.classes_[idx])
            prob = float(probabilities[idx])
            
            # Confidence tiering
            if prob >= 0.40:
                tier = "High"
            elif prob >= 0.20:
                tier = "Medium"
            else:
                tier = "Caution / Low"
                
            recommendations.append({
                "crop": crop_name,
                "probability": round(prob, 4),
                "confidence_tier": tier,
            })
            
        primary = recommendations[0]
        primary_prob = primary["probability"]
        
        if primary_prob >= 0.40:
            overall_conf = "High Confidence"
        elif primary_prob >= 0.20:
            overall_conf = "Moderate Confidence"
        else:
            overall_conf = "Low Confidence (Soil/Crop Rotation Test Recommended)"
            
        # 5. Build transparent agronomic explanation
        explanation = (
            f"'{primary['crop'].title()}' is recommended for {validated['district']}, {validated['state']} "
            f"under {validated['soil_type']} soil with prevailing temperature {validated['temperature']} deg C, "
            f"humidity {validated['humidity']}%, and rainfall {validated['rainfall']} mm following previous crop '{validated['previous_crop']}'; "
            f"matches empirical regional cropping suitability."
        )
        
        return {
            "recommended_crop": primary["crop"],
            "confidence": primary["probability"],
            "confidence_level": overall_conf,
            "recommendations": recommendations,
            "top_k_recommendations": recommendations,
            "explanation": explanation,
            "model_version": self.metadata.get("model_version", "v2.0.0"),
            "input_features": validated,
        }

_cached_engine_v2: Optional[CropRecommendationInferenceV2] = None

def get_inference_engine_v2(
    model_dir: Optional[Union[str, Path]] = None, reload: bool = False
) -> CropRecommendationInferenceV2:
    """Obtain or initialize singleton instance of the Model v2 inference engine."""
    global _cached_engine_v2
    if _cached_engine_v2 is None or reload or model_dir is not None:
        _cached_engine_v2 = CropRecommendationInferenceV2(model_dir=model_dir)
    return _cached_engine_v2

def predict_crop(
    state: str,
    district: str,
    temperature: Union[int, float],
    humidity: Union[int, float],
    rainfall: Union[int, float],
    soil_type: str,
    previous_crop: str,
    top_k: int = 3,
    model_dir: Optional[Union[str, Path]] = None,
) -> Dict[str, Any]:
    """Canonical function interface for Model v2 crop recommendation inference."""
    engine = get_inference_engine_v2(model_dir=model_dir)
    return engine.predict(
        state=state,
        district=district,
        temperature=temperature,
        humidity=humidity,
        rainfall=rainfall,
        soil_type=soil_type,
        previous_crop=previous_crop,
        top_k=top_k,
    )
