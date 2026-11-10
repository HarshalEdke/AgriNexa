"""Unit and integration tests for Crop Recommendation Model v2 (Farmer-Friendly)."""

import json
from pathlib import Path
import numpy as np
import pandas as pd
import pytest

from model.crop_recommendation_v2.preprocessing import (
    FEATURE_NAMES,
    TARGET_NAME,
    ALLOWED_SOIL_TYPES,
    validate_dataset,
    validate_input,
    prepare_inference_dataframe,
)
from model.crop_recommendation_v2.predict import (
    predict_crop,
    CropRecommendationInferenceV2,
    ModelNotReadyError,
)

MODEL_V2_DIR = Path("model/crop_recommendation_v2")

# --- 1. Dataset Schema & Validation Tests ---

def test_validate_dataset_valid():
    """Verify validate_dataset accepts the empirical multi-source dataset."""
    df = pd.read_csv(MODEL_V2_DIR / "data/empirical_crop_dataset_v2.csv")
    cleaned_df, report = validate_dataset(df)
    assert len(cleaned_df) >= 20000
    assert report["num_classes"] == 18
    assert "rice" in report["classes"]
    assert "wheat" in report["classes"]
    assert report["duplicate_feature_rows"] == 0

def test_validate_dataset_missing_column():
    """Verify validate_dataset rejects missing required columns."""
    df = pd.read_csv(MODEL_V2_DIR / "data/empirical_crop_dataset_v2.csv").drop(columns=["state"])
    with pytest.raises(ValueError, match="missing required columns"):
        validate_dataset(df)

def test_validate_dataset_null_values():
    """Verify validate_dataset rejects null/NaN values."""
    df = pd.read_csv(MODEL_V2_DIR / "data/empirical_crop_dataset_v2.csv")
    df.loc[0, "temperature"] = np.nan
    with pytest.raises(ValueError, match="contains null/NaN"):
        validate_dataset(df)

def test_validate_dataset_out_of_bounds():
    """Verify validate_dataset catches out of bounds numbers."""
    df = pd.read_csv(MODEL_V2_DIR / "data/empirical_crop_dataset_v2.csv")
    df.loc[0, "temperature"] = 150.0  # Invalid temp
    with pytest.raises(ValueError, match="outside valid range"):
        validate_dataset(df)

# --- 2. Model Loading & Metadata Tests ---

def test_model_loading():
    """Verify model and metadata load correctly without exceptions."""
    engine = CropRecommendationInferenceV2(model_dir=MODEL_V2_DIR)
    assert engine.pipeline is not None
    assert len(engine.classes_) == 18
    assert engine.metadata["model_version"] == "v2.0.0"

def test_model_metadata_structure():
    """Verify metadata contains all required audit fields."""
    metadata_file = MODEL_V2_DIR / "metadata.json"
    assert metadata_file.exists()
    with open(metadata_file, "r", encoding="utf-8") as f:
        meta = json.load(f)
    assert "model_name" in meta
    assert "model_type" in meta
    assert "model_version" in meta
    assert "dataset" in meta
    assert "feature_names" in meta
    assert "classes" in meta
    assert "evaluation_metrics" in meta
    assert meta["feature_names"] == FEATURE_NAMES
    assert len(meta["classes"]) == 18
    assert "top3_accuracy" in meta["evaluation_metrics"]
    assert meta["evaluation_metrics"]["top3_accuracy"] > 0.90

def test_missing_model_raises_model_not_ready(tmp_path):
    """Verify inference engine raises ModelNotReadyError when artifacts are missing."""
    with pytest.raises(ModelNotReadyError):
        CropRecommendationInferenceV2(model_dir=tmp_path)

# --- 3. Prediction & Output Structure Tests ---

def test_predict_crop_valid():
    """Verify prediction with valid inputs returns correct structure and types."""
    result = predict_crop(
        state="Maharashtra",
        district="Nagpur",
        temperature=28.5,
        humidity=75.0,
        rainfall=850.0,
        soil_type="Black",
        previous_crop="cotton",
        top_k=3,
        model_dir=MODEL_V2_DIR,
    )
    
    assert isinstance(result, dict)
    assert "recommended_crop" in result
    assert "confidence" in result
    assert "confidence_level" in result
    assert "recommendations" in result
    assert "explanation" in result
    assert "model_version" in result
    assert "input_features" in result
    
    assert isinstance(result["recommended_crop"], str)
    assert isinstance(result["confidence"], float)
    assert 0.0 <= result["confidence"] <= 1.0
    assert len(result["recommendations"]) == 3
    assert result["recommended_crop"] == result["recommendations"][0]["crop"]
    assert result["confidence"] == result["recommendations"][0]["probability"]

def test_top_k_probability_ranking():
    """Verify top-k recommendations are sorted descending by probability."""
    result = predict_crop(
        state="Punjab",
        district="Ludhiana",
        temperature=22.0,
        humidity=65.0,
        rainfall=450.0,
        soil_type="Alluvial",
        previous_crop="rice",
        top_k=5,
        model_dir=MODEL_V2_DIR,
    )
    recs = result["recommendations"]
    assert len(recs) == 5
    probs = [r["probability"] for r in recs]
    assert probs == sorted(probs, reverse=True)

def test_unknown_location_graceful_handling():
    """Verify model gracefully handles an unseen district without crashing."""
    result = predict_crop(
        state="UnknownState",
        district="UnknownDistrict",
        temperature=25.0,
        humidity=70.0,
        rainfall=600.0,
        soil_type="Alluvial",
        previous_crop="rice",
        top_k=3,
        model_dir=MODEL_V2_DIR,
    )
    assert "recommended_crop" in result
    assert len(result["recommendations"]) == 3

def test_deterministic_prediction():
    """Verify identical inputs produce strictly identical predictions."""
    args = {
        "state": "Gujarat",
        "district": "Rajkot",
        "temperature": 30.0,
        "humidity": 60.0,
        "rainfall": 700.0,
        "soil_type": "Black",
        "previous_crop": "cotton",
        "top_k": 3,
        "model_dir": MODEL_V2_DIR,
    }
    res1 = predict_crop(**args)
    res2 = predict_crop(**args)
    assert res1["recommended_crop"] == res2["recommended_crop"]
    assert res1["confidence"] == res2["confidence"]
    assert res1["recommendations"] == res2["recommendations"]

# --- 4. Input Validation & Error Handling Tests ---

@pytest.mark.parametrize("invalid_kwargs, expected_error", [
    ({"temperature": 75.0}, "outside valid physical range"),
    ({"temperature": -30.0}, "outside valid physical range"),
    ({"humidity": 120.0}, "outside valid physical range"),
    ({"rainfall": -50.0}, "outside valid physical range"),
    ({"temperature": "invalid_temp"}, "must be numeric"),
    ({"humidity": np.nan}, "cannot be NaN"),
    ({"rainfall": np.inf}, "cannot be NaN or infinite"),
    ({"soil_type": "UnobtaniumSoil"}, "Unsupported soil type"),
    ({"state": ""}, "must be a non-empty string"),
    ({"district": "   "}, "must be a non-empty string"),
])
def test_predict_invalid_inputs(invalid_kwargs, expected_error):
    """Verify input validation rejects invalid, out-of-range, NaN, or non-numeric inputs."""
    valid_base = {
        "state": "Maharashtra",
        "district": "Pune",
        "temperature": 26.0,
        "humidity": 70.0,
        "rainfall": 800.0,
        "soil_type": "Black",
        "previous_crop": "soybean",
        "model_dir": MODEL_V2_DIR,
    }
    valid_base.update(invalid_kwargs)
    with pytest.raises(ValueError, match=expected_error):
        predict_crop(**valid_base)

def test_predict_missing_feature():
    """Verify omitting a required feature raises TypeError."""
    with pytest.raises(TypeError):
        predict_crop(
            state="Maharashtra",
            district="Pune",
            temperature=26.0,
            humidity=70.0,
            rainfall=800.0,
            soil_type="Black",
            # previous_crop omitted
            model_dir=MODEL_V2_DIR,
        )

# --- 5. CLI Interface Tests ---

def test_cli_format_output(capsys):
    """Verify CLI output formatting prints clean, expected summary."""
    from model.crop_recommendation_v2.test_predict import format_prediction_output, run_example
    
    mock_result = {
        "model_version": "v2.0.0",
        "input_features": {
            "state": "Gujarat",
            "district": "Ahmedabad",
            "soil_type": "Alluvial",
            "previous_crop": "cotton",
            "temperature": 28.0,
            "humidity": 65.0,
            "rainfall": 750.0,
        },
        "recommended_crop": "rice",
        "confidence": 0.3287,
        "confidence_level": "Moderate Confidence",
        "recommendations": [
            {"crop": "rice", "probability": 0.3287, "confidence_tier": "Medium"},
            {"crop": "maize", "probability": 0.2710, "confidence_tier": "Medium"},
        ],
        "explanation": "Rice is recommended for Ahmedabad.",
    }
    
    format_prediction_output(mock_result)
    captured = capsys.readouterr().out
    assert "AGRINEXA AI CROP RECOMMENDATION" in captured
    assert "Ahmedabad, Gujarat" in captured
    assert "RICE" in captured

def test_cli_run_example(capsys):
    """Verify run_example executes without raising exceptions."""
    from model.crop_recommendation_v2.test_predict import run_example
    run_example(top_k=3)
    captured = capsys.readouterr().out
    assert "AGRINEXA AI CROP RECOMMENDATION" in captured
    assert "Ahmedabad, Gujarat" in captured
