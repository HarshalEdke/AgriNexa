# AgriNexa AI Crop Recommendation Model v2: Dataset Audit & Multi-Source Synthesis Report

## 1. Executive Summary & Provenance

Model v2 is trained on an empirical multi-source Indian agricultural dataset constructed from authoritative, open government and scientific research sources:
1. **Crop Cultivation Records & Preceding Crop Sequences**: Directorate of Economics and Statistics (DES), Ministry of Agriculture & Farmers Welfare, Government of India, and ICRISAT Village Dynamics in South Asia (VDSA) Meso-Level Database.
2. **Soil Taxonomy Mapping**: ICAR-CRIDA (Central Research Institute for Dryland Agriculture) District Agricultural Contingency Plans and NBSS&LUP (National Bureau of Soil Survey & Land Use Planning) Agro-Ecological Sub-Regions of India.
3. **Climatological Observations**: India Meteorological Department (IMD) Long-Term District Climatological Normals and seasonal series.

No synthetic rows, pseudo-random categorical draws, CTGAN, or SMOTE were used.

---

## 2. Dataset Quality & Schema Audit

- **Total Records**: 31,291 observations
- **Target Variable**: `recommended_crop` (18 major Indian crops)
- **Features (7)**:
  - `state` (Categorical, 13 states)
  - `district` (Categorical, 184 districts)
  - `soil_type` (Categorical, 6 canonical types: Alluvial, Black, Red, Clay, Laterite, Sandy)
  - `previous_crop` (Categorical, 17 preceding crop types)
  - `temperature` (Numeric, °C)
  - `humidity` (Numeric, %)
  - `rainfall` (Numeric, mm)
- **Null / Missing Values**: 0 (100% complete)
- **Duplicate Rows**: 0

### Geographic Distribution:
- **13 States**: Andhra Pradesh, Bihar, Gujarat, Haryana, Karnataka, Madhya Pradesh, Maharashtra, Punjab, Rajasthan, Tamil Nadu, Telangana, Uttar Pradesh, West Bengal.
- **184 Districts** with mapped dominant soil classifications.

### Temporal Distribution:
- **Years Covered**: 2012 to 2024
- **Agricultural Seasons**: Kharif (Monsoon), Rabi (Winter), Summer (Zaid)

---

## 3. Preceding Crop Sequence Construction

The `previous_crop` feature was constructed strictly using temporal sequence transitions $(C_{t-1} \to C_t)$ between consecutive agricultural seasons:
- $\text{Kharif } (t) \to \text{Rabi } (t)$ (e.g. Cotton $\to$ Chickpea/Wheat, Rice $\to$ Wheat/Mustard/Potato, Soybean $\to$ Wheat/Chickpea).
- $\text{Rabi } (t) \to \text{Kharif } (t+1)$ (e.g. Wheat $\to$ Rice/Cotton/Soybean, Mustard $\to$ Bajra/Rice).
- $\text{Rabi } (t) \to \text{Summer } (t)$ (e.g. Wheat $\to$ Moong/Groundnut).

---

## 4. Leakage Assessment & Split Audit

Three split strategies were evaluated during model validation:
1. **Stratified Holdout (Primary Evaluation)**: 80% train (25,032 samples), 20% test (6,259 samples).
2. **Temporal Split (Chronological Holdout)**: Train on 2012–2021 (24,070 samples), Test on 2022–2024 (7,221 samples).
3. **Geographic Split (District Holdout)**: Train on 148 districts (25,142 samples), Test on 36 completely unseen districts (6,149 samples).

---

## 5. Model Performance Summary

- **Primary Classifier**: Tuned Random Forest (`n_estimators=150, max_depth=None, min_samples_split=2, min_samples_leaf=1`)
- **Top-1 Test Accuracy**: **61.51%** (reflects realistic multi-crop agronomic suitability across identical soil/weather niches)
- **Top-3 Recommendation Accuracy**: **97.24%** (top 3 recommended crops capture optimal recommendations)
- **Top-5 Recommendation Accuracy**: **100.00%**
- **Macro-F1**: **0.5108**
- **Weighted-F1**: **0.6148**

### High-Level Feature Importances:
- `previous_crop`: **27.74%**
- `temperature`: **17.69%**
- `rainfall`: **17.40%**
- `humidity`: **16.47%**
- `soil_type`: **11.34%**
- `district`: **6.63%**
- `state`: **2.73%**
