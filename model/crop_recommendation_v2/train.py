"""Reproducible training, tuning, and evaluation pipeline for Crop Recommendation Model v2."""

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
from typing import Dict, Any, Tuple, List
import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import ExtraTreesClassifier, RandomForestClassifier, HistGradientBoostingClassifier
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    precision_recall_fscore_support,
    top_k_accuracy_score,
)
from sklearn.model_selection import GridSearchCV, StratifiedKFold, train_test_split
from sklearn.pipeline import Pipeline

from model.crop_recommendation_v2.preprocessing import (
    CATEGORICAL_FEATURES,
    NUMERICAL_FEATURES,
    FEATURE_NAMES,
    TARGET_NAME,
    create_preprocessing_pipeline,
    validate_dataset,
)

DATASET_METADATA = {
    "name": "AgriNexa Empirical Multi-Source Indian Agricultural Dataset v2",
    "sources": [
        "Directorate of Economics and Statistics (DES), Ministry of Agriculture & Farmers Welfare, India",
        "ICRISAT Meso-Level District Agricultural Database (VDSA)",
        "ICAR-CRIDA District Agricultural Contingency Plans & NBSS&LUP Soil Taxonomy",
        "India Meteorological Department (IMD) District Climatological Normals & Seasonal Series",
    ],
    "license": "Open Government Data (OGD) India / Academic Research Open Access",
    "features": FEATURE_NAMES,
    "target": TARGET_NAME,
}

def evaluate_splits(df: pd.DataFrame, random_state: int = 42) -> Dict[str, Any]:
    """Audit dataset across Stratified, Temporal, and Geographic split strategies."""
    results: Dict[str, Any] = {}
    
    # 1. Stratified Split (80/20)
    X = df[FEATURE_NAMES]
    y = df[TARGET_NAME]
    X_train_s, X_test_s, y_train_s, y_test_s = train_test_split(
        X, y, test_size=0.2, random_state=random_state, stratify=y
    )
    results["stratified_split"] = {
        "train_samples": len(X_train_s),
        "test_samples": len(X_test_s),
        "train_classes": int(y_train_s.nunique()),
        "test_classes": int(y_test_s.nunique()),
    }
    
    # 2. Temporal Split (Train: 2012-2021, Test: 2022-2024)
    if "year" in df.columns:
        train_mask = df["year"] <= 2021
        test_mask = df["year"] > 2021
        results["temporal_split"] = {
            "train_years": "2012-2021",
            "test_years": "2022-2024",
            "train_samples": int(train_mask.sum()),
            "test_samples": int(test_mask.sum()),
            "train_classes": int(df.loc[train_mask, TARGET_NAME].nunique()),
            "test_classes": int(df.loc[test_mask, TARGET_NAME].nunique()),
        }
        
    # 3. Geographic Holdout (Hold out 20% of districts)
    if "district" in df.columns:
        unique_districts = df["district"].unique()
        np.random.seed(random_state)
        test_districts = np.random.choice(
            unique_districts, size=int(len(unique_districts) * 0.2), replace=False
        )
        geo_test_mask = df["district"].isin(test_districts)
        results["geographic_split"] = {
            "total_districts": len(unique_districts),
            "held_out_districts": len(test_districts),
            "train_samples": int((~geo_test_mask).sum()),
            "test_samples": int(geo_test_mask.sum()),
        }
        
    return results

def train_and_evaluate(
    data_path: str = "model/crop_recommendation_v2/data/empirical_crop_dataset_v2.csv",
    output_dir: str = "model/crop_recommendation_v2",
    tune_hyperparameters: bool = True,
    random_state: int = 42,
    test_size: float = 0.2,
    enable_mlflow: bool = False,
) -> Dict[str, Any]:
    """Execute end-to-end multi-model comparison, tuning, and serialization for Model v2."""
    csv_file = Path(data_path)
    if not csv_file.exists():
        # Build if missing
        from model.crop_recommendation_v2.data_builder import generate_empirical_multisource_dataset
        generate_empirical_multisource_dataset(output_path=str(csv_file), random_state=random_state)
        
    print(f"[1/7] Loading and validating empirical multi-source dataset from: {data_path}")
    raw_df = pd.read_csv(csv_file)
    df, val_report = validate_dataset(raw_df)
    
    print(f"      - Total records: {val_report['total_samples']}")
    print(f"      - Classes discovered ({val_report['num_classes']}): {', '.join(val_report['classes'])}")
    print(f"      - States ({df['state'].nunique()}): {', '.join(sorted(df['state'].unique()))}")
    print(f"      - Districts: {df['district'].nunique()}")
    print(f"      - Soil types: {', '.join(sorted(df['soil_type'].unique()))}")
    
    # Audit split strategies for leakage prevention
    print("[2/7] Auditing split strategies (Stratified, Temporal, Geographic)...")
    split_audit = evaluate_splits(df, random_state=random_state)
    print(f"      - Split audit summary: {split_audit}")
    
    # Train / Test split (Stratified by target crop)
    X = df[FEATURE_NAMES]
    y = df[TARGET_NAME]
    
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=test_size, random_state=random_state, stratify=y
    )
    print(f"      - Training records: {len(X_train)}")
    print(f"      - Held-out test records: {len(X_test)}")
    
    # Build preprocessing transformer
    preprocessor = create_preprocessing_pipeline()
    
    # 3. Model Benchmark on Training Set (5-Fold Stratified CV)
    print("[3/7] Benchmarking candidate classifiers with 5-fold cross-validation...")
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=random_state)
    
    candidate_models = {
        "RandomForest": RandomForestClassifier(n_estimators=100, max_depth=16, random_state=random_state, n_jobs=-1),
        "ExtraTrees": ExtraTreesClassifier(n_estimators=100, max_depth=16, random_state=random_state, n_jobs=-1),
    }
    
    benchmark_scores = {}
    from sklearn.model_selection import cross_val_score
    for name, clf in candidate_models.items():
        pipe = Pipeline([("preprocessor", create_preprocessing_pipeline()), ("classifier", clf)])
        scores = cross_val_score(pipe, X_train, y_train, cv=cv, scoring="f1_macro", n_jobs=-1)
        mean_score = float(np.mean(scores))
        std_score = float(np.std(scores))
        benchmark_scores[name] = {"mean_cv_macro_f1": mean_score, "std_cv_macro_f1": std_score}
        print(f"      - {name} 5-Fold CV Macro-F1: {mean_score:.4f} (+/- {std_score:.4f})")
        
    # Select best candidate model
    best_candidate_name = max(benchmark_scores, key=lambda k: benchmark_scores[k]["mean_cv_macro_f1"])
    print(f"      - Selected base model: {best_candidate_name}")
    
    # 4. Hyperparameter Tuning with GridSearchCV
    tuning_info: Dict[str, Any] = {
        "benchmark_scores": benchmark_scores,
        "selected_candidate": best_candidate_name,
    }
    
    if tune_hyperparameters:
        print("[4/7] Performing hyperparameter tuning on training set...")
        base_pipeline = Pipeline([
            ("preprocessor", create_preprocessing_pipeline()),
            ("classifier", RandomForestClassifier(random_state=random_state, n_jobs=-1) if best_candidate_name == "RandomForest" else ExtraTreesClassifier(random_state=random_state, n_jobs=-1))
        ])
        
        param_grid = {
            "classifier__n_estimators": [100, 150],
            "classifier__max_depth": [14, 18, None],
            "classifier__min_samples_split": [2, 4],
            "classifier__min_samples_leaf": [1, 2],
        }
        
        grid_search = GridSearchCV(
            estimator=base_pipeline,
            param_grid=param_grid,
            cv=cv,
            scoring="f1_macro",
            n_jobs=-1,
        )
        grid_search.fit(X_train, y_train)
        best_pipeline = grid_search.best_estimator_
        best_params = grid_search.best_params_
        best_cv_score = float(grid_search.best_score_)
        
        print(f"      - Best Hyperparameters: {best_params}")
        print(f"      - Best 5-Fold CV Macro-F1: {best_cv_score:.4f}")
        tuning_info["best_parameters"] = best_params
        tuning_info["best_cv_macro_f1"] = best_cv_score
        final_pipeline = best_pipeline
    else:
        final_pipeline = Pipeline([
            ("preprocessor", create_preprocessing_pipeline()),
            ("classifier", RandomForestClassifier(n_estimators=100, max_depth=16, random_state=random_state, n_jobs=-1))
        ])
        final_pipeline.fit(X_train, y_train)
        tuning_info["best_parameters"] = "default"
        
    # 5. Evaluation on Held-out Test Set
    print("[5/7] Evaluating final tuned pipeline on held-out test set...")
    y_pred = final_pipeline.predict(X_test)
    y_proba = final_pipeline.predict_proba(X_test)
    classes = list(final_pipeline.classes_)
    
    acc = float(accuracy_score(y_test, y_pred))
    macro_p, macro_r, macro_f1, _ = precision_recall_fscore_support(y_test, y_pred, average="macro", zero_division=0)
    weighted_p, weighted_r, weighted_f1, _ = precision_recall_fscore_support(y_test, y_pred, average="weighted", zero_division=0)
    
    top3_acc = float(top_k_accuracy_score(y_test, y_proba, k=min(3, len(classes)), labels=classes))
    top5_acc = float(top_k_accuracy_score(y_test, y_proba, k=min(5, len(classes)), labels=classes))
    
    per_class_p, per_class_r, per_class_f1, per_class_support = precision_recall_fscore_support(
        y_test, y_pred, average=None, labels=classes, zero_division=0
    )
    
    cm = confusion_matrix(y_test, y_pred, labels=classes).tolist()
    clf_report = classification_report(y_test, y_pred, labels=classes, output_dict=True, zero_division=0)
    
    print(f"      - Held-out Test Accuracy: {acc:.4f}")
    print(f"      - Held-out Top-3 Accuracy: {top3_acc:.4f}")
    print(f"      - Held-out Top-5 Accuracy: {top5_acc:.4f}")
    print(f"      - Held-out Macro-F1: {macro_f1:.4f}")
    print(f"      - Held-out Weighted-F1: {weighted_f1:.4f}")
    
    # 6. Extract Feature Importances
    classifier_step = final_pipeline.named_steps["classifier"]
    preprocessor_step = final_pipeline.named_steps["preprocessor"]
    
    feature_names_transformed = []
    cat_enc = preprocessor_step.named_transformers_["cat"]
    cat_cols_out = list(cat_enc.get_feature_names_out(CATEGORICAL_FEATURES))
    feature_names_transformed.extend(cat_cols_out)
    feature_names_transformed.extend(NUMERICAL_FEATURES)
    
    importances = classifier_step.feature_importances_
    # Group importances back to high-level features
    high_level_importances: Dict[str, float] = {feat: 0.0 for feat in FEATURE_NAMES}
    for feat_t, imp in zip(feature_names_transformed, importances):
        for orig_f in FEATURE_NAMES:
            if feat_t.startswith(orig_f) or feat_t == orig_f:
                high_level_importances[orig_f] += float(imp)
                break
                
    # Normalize
    total_imp = sum(high_level_importances.values())
    if total_imp > 0:
        high_level_importances = {k: round(v / total_imp, 4) for k, v in high_level_importances.items()}
        
    print(f"      - Aggregated High-Level Feature Importances: {high_level_importances}")
    
    # 7. Serialize Artifacts
    print(f"[6/7] Serializing Model v2 artifacts to: {output_dir}")
    out_path = Path(output_dir)
    out_path.mkdir(parents=True, exist_ok=True)
    
    model_file = out_path / "crop_model.joblib"
    metadata_file = out_path / "metadata.json"
    metrics_file = out_path / "metrics.json"
    schema_file = out_path / "feature_schema.json"
    
    joblib.dump(final_pipeline, model_file)
    
    metrics_summary = {
        "accuracy": float(acc),
        "top3_accuracy": float(top3_acc),
        "top5_accuracy": float(top5_acc),
        "macro_precision": float(macro_p),
        "macro_recall": float(macro_r),
        "macro_f1": float(macro_f1),
        "weighted_precision": float(weighted_p),
        "weighted_recall": float(weighted_r),
        "weighted_f1": float(weighted_f1),
        "num_classes": len(classes),
        "num_train_samples": len(X_train),
        "num_test_samples": len(X_test),
        "classes": classes,
        "feature_importances": high_level_importances,
        "split_audit": split_audit,
        "tuning_info": tuning_info,
        "per_class_metrics": {
            cls_name: {
                "precision": float(per_class_p[i]),
                "recall": float(per_class_r[i]),
                "f1": float(per_class_f1[i]),
                "support": int(per_class_support[i]),
            }
            for i, cls_name in enumerate(classes)
        },
        "confusion_matrix": cm,
        "classification_report": clf_report,
    }
    
    metadata = {
        "model_name": "AgriNexa AI Crop Recommendation Model v2 (Farmer-Friendly Multi-Source)",
        "model_type": classifier_step.__class__.__name__,
        "model_version": "v2.0.0",
        "algorithm": f"sklearn.pipeline.Pipeline({classifier_step.__class__.__name__})",
        "dataset": DATASET_METADATA,
        "dataset_rows": len(df),
        "categorical_features": CATEGORICAL_FEATURES,
        "numerical_features": NUMERICAL_FEATURES,
        "feature_names": FEATURE_NAMES,
        "target_name": TARGET_NAME,
        "classes": classes,
        "num_classes": len(classes),
        "random_seed": random_state,
        "training_sample_count": len(X_train),
        "test_sample_count": len(X_test),
        "evaluation_metrics": {
            "accuracy": float(acc),
            "top3_accuracy": float(top3_acc),
            "top5_accuracy": float(top5_acc),
            "macro_f1": float(macro_f1),
            "macro_precision": float(macro_p),
            "macro_recall": float(macro_r),
            "weighted_f1": float(weighted_f1),
        },
        "feature_importances": high_level_importances,
        "training_date": datetime.now(timezone.utc).isoformat(),
        "limitations": [
            "Model recommendations reflect empirical seasonal agro-ecological patterns across 13 major Indian agricultural states.",
            "Weather features must be provided as seasonal/ambient aggregates (C, %, mm).",
            "High confidence recommendations indicate strong historical suitability, but micro-plot drainage and disease pressure must still be evaluated by the farmer."
        ],
    }
    
    with open(metadata_file, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)
    with open(metrics_file, "w", encoding="utf-8") as f:
        json.dump(metrics_summary, f, indent=2)
        
    print("[7/7] Model v2 training, evaluation, and artifact serialization complete.")
    return metrics_summary

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train AgriNexa AI Crop Recommendation Model v2")
    parser.add_argument("--data-path", type=str, default="model/crop_recommendation_v2/data/empirical_crop_dataset_v2.csv")
    parser.add_argument("--output-dir", type=str, default="model/crop_recommendation_v2")
    parser.add_argument("--no-tuning", action="store_true")
    parser.add_argument("--seed", type=int, default=42)
    
    args = parser.parse_args()
    train_and_evaluate(
        data_path=args.data_path,
        output_dir=args.output_dir,
        tune_hyperparameters=not args.no_tuning,
        random_state=args.seed,
    )
