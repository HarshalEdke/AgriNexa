# AgriNexa AI Crop Recommendation Model v2 (Farmer-Friendly Architecture)

## 1. Overview & Motivation

**Model v1** (`model/crop_recommendation/crop_model.joblib`) requires technical soil nutrient inputs ($N, P, K, \text{pH}$) that require laboratory soil testing.

**Model v2** (`model/crop_recommendation_v2/crop_model.joblib`) implements a **farmer-friendly interaction**:
$$\text{Location (State, District)} \longrightarrow \text{Auto-Fetched Weather (Temp, Humidity, Rain)} \longrightarrow \text{Soil Type} \longrightarrow \text{Previous Crop} \longrightarrow \text{Ranked Recommendations}$$

---

## 2. Model Architecture & Pipeline

Model v2 is packaged as an end-to-end Scikit-Learn `Pipeline`:
1. **Preprocessor (`ColumnTransformer`)**:
   - `OneHotEncoder(handle_unknown='ignore')` for `state`, `district`, `soil_type`, `previous_crop`.
   - `StandardScaler()` for `temperature`, `humidity`, `rainfall`.
2. **Classifier (`RandomForestClassifier`)**:
   - Tuned ensemble of 150 decision trees trained on 25,032 empirical observations.

---

## 3. Performance Metrics (Held-out Test Set, $N = 6,259$)

- **Top-1 Accuracy**: **61.51%**
- **Top-3 Recommendation Accuracy**: **97.24%**
- **Top-5 Recommendation Accuracy**: **100.00%**
- **Macro-F1**: **0.5108**
- **Weighted-F1**: **0.6148**

Feature importances:
- `previous_crop`: 27.7%
- `temperature`: 17.7%
- `rainfall`: 17.4%
- `humidity`: 16.5%
- `soil_type`: 11.3%
- `district`: 6.6%
- `state`: 2.7%

---

## 4. Inference Usage

```python
from model.crop_recommendation_v2.predict import predict_crop

result = predict_crop(
    state="Maharashtra",
    district="Nagpur",
    temperature=28.5,
    humidity=75.0,
    rainfall=850.0,
    soil_type="Black",
    previous_crop="cotton",
    top_k=3,
)

print(result["recommended_crop"])
# Output: 'wheat' or 'chickpea'
print(result["recommendations"])
```
