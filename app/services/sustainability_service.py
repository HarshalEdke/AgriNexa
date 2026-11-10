"""Deterministic Sustainability Scoring Engine for AgriNexa AI.

Evaluates 4 transparent dimensions:
1. Water Conservation & Irrigation Timing (0–40 pts) - Soil-Profile Aware
2. Microclimate & Weather Alignment (0–30 pts) - Crop-Aware
3. Soil Moisture & Root-Zone Balance (0–15 pts) - Soil-Profile Aware
4. Crop Rotation & Agro-Ecological Compatibility (0–15 pts)

Combines live weather forecasts with simulated/real IoT capacitance and flow telemetry.
Guarantees 100% deterministic, explainable results with exact mathematical accounting.
"""

from typing import Dict, Any, Tuple
from app.schemas import (
    SustainabilityScoreRequest,
    SustainabilityScoreResponse,
    ScoreBreakdownItem,
    WaterImpactEstimate,
    ActionComparisonOption,
    SensorTelemetry,
)
from app.services.iot_sensor_service import IoTSensorService

LEGUMES = {"chickpea", "moong", "soybean", "pulses", "groundnut", "pigeonpea", "urad", "clusterbean"}
CEREALS = {"wheat", "rice", "maize", "bajra", "jowar", "barley"}
CASH_CROPS = {"cotton", "sugarcane", "potato", "tobacco"}

# 1. Soil-Profile Aware Reference Thresholds (VWC %)
SOIL_PROFILES = {
    "clay": {
        "name": "Clay Soil Profile",
        "wilting_point": 20.0,
        "mild_deficit": 28.0,
        "optimal_min": 28.0,
        "optimal_max": 42.0,
        "elevated": 46.0,
        "saturation": 48.0,
        "description": "High water-retention clay matrix with higher field capacity (~35–42%) and higher wilting threshold (~20%).",
    },
    "sandy": {
        "name": "Sandy / Coarse Profile",
        "wilting_point": 8.0,
        "mild_deficit": 14.0,
        "optimal_min": 14.0,
        "optimal_max": 24.0,
        "elevated": 28.0,
        "saturation": 32.0,
        "description": "Fast-draining coarse matrix with lower field capacity (~16–24%) and lower wilting threshold (~8%).",
    },
    "black": {
        "name": "Black Cotton / Vertisol Profile",
        "wilting_point": 18.0,
        "mild_deficit": 26.0,
        "optimal_min": 26.0,
        "optimal_max": 42.0,
        "elevated": 46.0,
        "saturation": 50.0,
        "description": "Swelling vertisol with high water-holding capacity and slow hydraulic conductivity.",
    },
    "loam": {
        "name": "Loam Reference Profile (Simulated Standard)",
        "wilting_point": 15.0,
        "mild_deficit": 22.0,
        "optimal_min": 22.0,
        "optimal_max": 38.0,
        "elevated": 42.0,
        "saturation": 45.0,
        "description": "Simulated loam reference profile balancing capillary retention and macro-pore drainage.",
    },
}


def resolve_soil_profile(soil_type: str | None, preset_id: str | None = None) -> dict:
    """Resolve configured soil profile with fallback to the simulated Loam Reference Profile."""
    st = (soil_type or "").lower().strip()
    if "clay" in st:
        return SOIL_PROFILES["clay"]
    if "sand" in st:
        return SOIL_PROFILES["sandy"]
    if "black" in st or "vertisol" in st:
        return SOIL_PROFILES["black"]

    if preset_id == "saturated_heavy":
        return SOIL_PROFILES["clay"]

    return SOIL_PROFILES["loam"]


# 2. Crop-Aware Weather / Thermal & Microclimate Windows
CROP_WEATHER_PROFILES = {
    "rice": {
        "name": "Rice (Warm Kharif Cereal)",
        "temp_optimal": (22.0, 33.0),
        "temp_stress": 37.0,
        "temp_chill": 16.0,
        "rh_optimal": (60.0, 85.0),
        "rh_fungal_risk": 90.0,
    },
    "maize": {
        "name": "Maize (Warm Cereal)",
        "temp_optimal": (20.0, 32.0),
        "temp_stress": 36.0,
        "temp_chill": 14.0,
        "rh_optimal": (45.0, 75.0),
        "rh_fungal_risk": 85.0,
    },
    "cotton": {
        "name": "Cotton (Semi-Arid Cash Crop)",
        "temp_optimal": (23.0, 35.0),
        "temp_stress": 38.0,
        "temp_chill": 18.0,
        "rh_optimal": (40.0, 70.0),
        "rh_fungal_risk": 85.0,
    },
    "wheat": {
        "name": "Wheat (Cool Rabi Cereal)",
        "temp_optimal": (14.0, 25.0),
        "temp_stress": 30.0,
        "temp_chill": 6.0,
        "rh_optimal": (40.0, 70.0),
        "rh_fungal_risk": 85.0,
    },
    "chickpea": {
        "name": "Chickpea (Rabi Pulse)",
        "temp_optimal": (15.0, 26.0),
        "temp_stress": 31.0,
        "temp_chill": 7.0,
        "rh_optimal": (35.0, 65.0),
        "rh_fungal_risk": 80.0,
    },
    "pigeonpea": {
        "name": "Pigeonpea (Warm Kharif Pulse)",
        "temp_optimal": (20.0, 34.0),
        "temp_stress": 38.0,
        "temp_chill": 14.0,
        "rh_optimal": (45.0, 80.0),
        "rh_fungal_risk": 85.0,
    },
    "sugarcane": {
        "name": "Sugarcane (Tropical Perennial)",
        "temp_optimal": (24.0, 36.0),
        "temp_stress": 40.0,
        "temp_chill": 18.0,
        "rh_optimal": (55.0, 85.0),
        "rh_fungal_risk": 90.0,
    },
    "tomato": {
        "name": "Tomato (Solanaceous Vegetable)",
        "temp_optimal": (18.0, 28.0),
        "temp_stress": 34.0,
        "temp_chill": 12.0,
        "rh_optimal": (45.0, 70.0),
        "rh_fungal_risk": 80.0,
    },
    "potato": {
        "name": "Potato (Tuber Crop)",
        "temp_optimal": (16.0, 24.0),
        "temp_stress": 29.0,
        "temp_chill": 8.0,
        "rh_optimal": (50.0, 80.0),
        "rh_fungal_risk": 85.0,
    },
}

DEFAULT_WEATHER_PROFILE = {
    "name": "General Agronomic Microclimate Index",
    "temp_optimal": (18.0, 32.0),
    "temp_stress": 35.0,
    "temp_chill": 12.0,
    "rh_optimal": (40.0, 75.0),
    "rh_fungal_risk": 85.0,
}


def resolve_crop_weather_profile(crop: str | None) -> dict:
    """Resolve crop microclimate profile or fall back to general agronomic index."""
    c = (crop or "").lower().strip()
    for key, prof in CROP_WEATHER_PROFILES.items():
        if key in c:
            return prof
    return DEFAULT_WEATHER_PROFILE


def is_rain_imminent(rain_prob: float, expected_rainfall: float) -> bool:
    """Return True if rainfall is forecast with high confidence and meaningful volume."""
    return rain_prob >= 60.0 and expected_rainfall >= 5.0


def calculate_water_conservation(
    action: str,
    rain_prob: float,
    expected_rainfall: float,
    soil_moisture: float,
    profile: dict,
) -> Tuple[float, str, str]:
    """Dimension 1: Water Conservation & Irrigation Timing (Max 40 points) - Profile Aware."""
    rain_imminent = is_rain_imminent(rain_prob, expected_rainfall)
    opt_min = profile["optimal_min"]
    opt_max = profile["optimal_max"]
    wilt = profile["wilting_point"]
    name = profile["name"]

    if action == "delay" and rain_imminent:
        return (
            40.0,
            f"Forecasted rainfall (≥60% probability, {expected_rainfall:.1f} mm) utilized; irrigation postponed to capture natural precipitation and conserve groundwater.",
            "Optimal Timing",
        )

    if action == "irrigate_now" and rain_imminent:
        return (
            10.0,
            f"Irrigation triggered despite imminent rainfall ({rain_prob:.0f}% chance, {expected_rainfall:.1f} mm); high risk of surface runoff and avoidable pumping.",
            "Runoff Risk",
        )

    # When no heavy rain is forecast
    if soil_moisture < opt_min:
        if action == "irrigate_now":
            return (
                36.0,
                f"Timely irrigation applied to relieve root-zone deficit ({soil_moisture:.1f}% < {opt_min:.0f}%) for configured {name}; protects crop from wilting.",
                "Targeted Relief",
            )
        pts = 20.0 if soil_moisture < wilt else 24.0
        return (
            pts,
            f"Irrigation delayed despite root-zone deficit ({soil_moisture:.1f}% < {opt_min:.0f}%) for configured {name}; risks moisture stress if deferred further.",
            "Under-Irrigated",
        )

    if soil_moisture > opt_max:
        if action == "delay":
            return (
                38.0,
                f"Irrigation delayed for moist soil ({soil_moisture:.1f}% > {opt_max:.0f}%) in configured {name}; avoids waterlogging and unnecessary water expenditure.",
                "Saturation Avoided",
            )
        return (
            14.0,
            f"Irrigation applied to already saturated soil ({soil_moisture:.1f}% > {opt_max:.0f}%) in configured {name}; unnecessary application.",
            "Over-Irrigation",
        )

    # Baseline optimal zone (opt_min to opt_max) without imminent rain
    if action == "delay":
        return (
            32.0,
            f"Standard conservation: root-zone moisture ({soil_moisture:.1f}%) is within healthy field capacity ({opt_min:.0f}%–{opt_max:.0f}%) for configured {name}; routine deferral.",
            "Preserved",
        )
    return (
        28.0,
        f"Routine maintenance irrigation applied within acceptable soil moisture ({soil_moisture:.1f}%) for configured {name}.",
        "Routine Use",
    )


def calculate_weather_alignment(
    temperature: float,
    humidity: float,
    rain_prob: float,
    crop: str | None,
) -> Tuple[float, str, str]:
    """Dimension 2: Microclimate & Weather Alignment (Max 30 points) - Crop-Aware."""
    profile = resolve_crop_weather_profile(crop)
    t_opt_min, t_opt_max = profile["temp_optimal"]
    t_stress = profile["temp_stress"]
    t_chill = profile["temp_chill"]
    rh_opt_min, rh_opt_max = profile["rh_optimal"]
    rh_fungal = profile["rh_fungal_risk"]
    p_name = profile["name"]

    rain_points = 10.0 if rain_prob >= 60.0 else (6.0 if rain_prob >= 30.0 else 3.0)

    if t_opt_min <= temperature <= t_opt_max:
        temp_points = 14.0
        temp_note = f"optimal temperature ({temperature:.1f}°C within {t_opt_min:.0f}–{t_opt_max:.0f}°C window)"
    elif t_chill <= temperature < t_opt_min or t_opt_max < temperature <= t_stress:
        temp_points = 8.0
        temp_note = f"moderate temperature ({temperature:.1f}°C)"
    elif temperature > t_stress:
        temp_points = 4.0
        temp_note = f"heat stress ({temperature:.1f}°C > {t_stress:.0f}°C threshold)"
    else:
        temp_points = 2.0
        temp_note = f"chilling stress ({temperature:.1f}°C < {t_chill:.0f}°C threshold)"

    if rh_opt_min <= humidity <= rh_opt_max:
        hum_points = 6.0
        hum_note = f"favorable relative humidity ({humidity:.0f}%)"
    elif humidity > rh_fungal:
        hum_points = 0.0
        hum_note = f"very high humidity ({humidity:.0f}% > {rh_fungal:.0f}%) elevating foliar disease risk"
    else:
        hum_points = 3.0
        hum_note = f"moderate humidity ({humidity:.0f}%)"

    total = min(30.0, rain_points + temp_points + hum_points)
    status = "Favorable" if total >= 22.0 else ("Moderate" if total >= 14.0 else "Stressful")
    reason = f"Microclimate alignment for {p_name}: {temp_note} (+{temp_points:.0f} pts), {hum_note} (+{hum_points:.0f} pts), and rain chance {rain_prob:.0f}% (+{rain_points:.0f} pts)."
    return (total, reason, status)


def calculate_soil_moisture_balance(soil_moisture: float, profile: dict) -> Tuple[float, str, str]:
    """Dimension 3: Soil Moisture & Root-Zone Balance (Max 15 points) - Soil-Profile Aware."""
    opt_min = profile["optimal_min"]
    opt_max = profile["optimal_max"]
    wilt = profile["wilting_point"]
    mild = profile["mild_deficit"]
    sat = profile["saturation"]
    name = profile["name"]

    if opt_min <= soil_moisture <= opt_max:
        return (
            15.0,
            f"IoT probe shows root-zone moisture ({soil_moisture:.1f}%) within optimal field capacity ({opt_min:.0f}%–{opt_max:.0f}%) for configured {name}.",
            "Optimal",
        )
    if mild <= soil_moisture < opt_min:
        return (
            11.0,
            f"IoT probe indicates mild moisture deficit ({soil_moisture:.1f}%) below {opt_min:.0f}% field capacity for configured {name}.",
            "Mild Deficit",
        )
    if wilt <= soil_moisture < mild:
        return (
            8.0,
            f"IoT probe indicates moderate deficit ({soil_moisture:.1f}%); approaching {wilt:.0f}% wilting threshold for configured {name}.",
            "Moderate Deficit",
        )
    if soil_moisture < wilt:
        return (
            4.0,
            f"IoT probe detects acute moisture deficit ({soil_moisture:.1f}% < {wilt:.0f}% wilting point) for configured {name}; root stress imminent.",
            "Severe Deficit",
        )
    if opt_max < soil_moisture <= sat:
        return (
            9.0,
            f"IoT probe reports elevated moisture ({soil_moisture:.1f}% > {opt_max:.0f}% field capacity) for configured {name}; root aeration constrained.",
            "Elevated",
        )
    return (
        3.0,
        f"IoT probe reports saturation ({soil_moisture:.1f}% > {sat:.0f}%) for configured {name}; high risk of root hypoxia and rot.",
        "Waterlogged",
    )


def calculate_crop_rotation_compatibility(
    target_crop: str,
    previous_crop: str | None,
    soil_type: str | None,
) -> Tuple[float, str, str]:
    """Dimension 4: Crop Rotation & Agro-Ecological Compatibility (Max 15 points)."""
    if not previous_crop or not previous_crop.strip():
        return (
            10.0,
            f"Target crop '{target_crop.title()}' evaluated as standalone seasonal planting without preceding rotation history (+10 pts baseline).",
            "Baseline Single-Crop",
        )

    t_crop = target_crop.strip().lower()
    p_crop = previous_crop.strip().lower()

    # Monoculture detection
    if t_crop == p_crop:
        return (
            4.0,
            f"Continuous monoculture of '{t_crop.title()}' following '{p_crop.title()}'; increases soil-borne pathogen persistence and nutrient depletion.",
            "Monoculture Risk",
        )

    is_t_legume = any(leg in t_crop for leg in LEGUMES)
    is_p_legume = any(leg in p_crop for leg in LEGUMES)
    is_t_cereal = any(cer in t_crop for cer in CEREALS)
    is_p_cereal = any(cer in p_crop for cer in CEREALS)
    is_t_cash = any(c in t_crop for c in CASH_CROPS)
    is_p_cash = any(c in p_crop for c in CASH_CROPS)

    if (is_t_legume and (is_p_cereal or is_p_cash)) or ((is_t_cereal or is_t_cash) and is_p_legume):
        return (
            15.0,
            f"Synergistic restorative rotation ('{p_crop.title()}' → '{t_crop.title()}'); breaks pest cycles, replenishes soil nitrogen, and optimizes nutrient uptake.",
            "Optimal Rotation",
        )

    if is_t_legume or is_p_legume:
        return (
            13.0,
            f"Beneficial rotation incorporating legume biology ('{p_crop.title()}' → '{t_crop.title()}'); supports soil microbial health.",
            "Favorable Rotation",
        )

    return (
        11.0,
        f"Standard diverse crop sequence ('{p_crop.title()}' → '{t_crop.title()}'); interrupts host-specific disease cycles compared to monoculture.",
        "Diverse Rotation",
    )


def calculate_water_volume_impact(
    action: str,
    rain_prob: float,
    expected_rainfall: float,
    soil_moisture: float,
    farm_area_ha: float,
    telemetry: SensorTelemetry,
    profile: dict,
) -> WaterImpactEstimate:
    """Calculate explicit volumetric water impact in Liters based on IoT flow and duration.

    Terminology: When delaying unnecessary irrigation, reports 'Potential Irrigation Water Avoided'
    representing the simulated cycle volume avoided, rather than claiming an unjustified scientific 'Water Saved'.
    """
    # Option A: irrigation_flow_rate_lpm represents total irrigation-system flow for the selected field.
    # Total cycle volume = flow_rate_lpm * irrigation_duration_minutes. Field area does NOT multiply volume.
    cycle_liters = int(round(telemetry.irrigation_flow_rate_lpm * telemetry.irrigation_duration_minutes))

    rain_imminent = is_rain_imminent(rain_prob, expected_rainfall)
    opt_max = profile["optimal_max"]

    if action == "delay":
        if rain_imminent or soil_moisture > opt_max:
            return WaterImpactEstimate(
                litres=cycle_liters,
                impact_type="avoided",
                label=f"Potential Irrigation Water Avoided: {cycle_liters:,} L",
                formula_basis=f"Avoided 1 planned irrigation cycle ({telemetry.irrigation_flow_rate_lpm:.0f} L/min × {telemetry.irrigation_duration_minutes:.0f} min for {farm_area_ha:.2f} ha) because rain or root-zone moisture was sufficient. Represents simulated cycle volume avoided, not agronomic excess demand.",
            )
        return WaterImpactEstimate(
            litres=cycle_liters,
            impact_type="neutral",
            label=f"Estimated {cycle_liters:,} L Irrigation Deferred",
            formula_basis=f"Irrigation deferred under standard operational schedule for {farm_area_ha:.2f} ha.",
        )

    # action == "irrigate_now"
    if rain_imminent or soil_moisture > opt_max:
        return WaterImpactEstimate(
            litres=cycle_liters,
            impact_type="unnecessary_use",
            label=f"Estimated {cycle_liters:,} L Redundant Application",
            formula_basis=f"Application during imminent rain or soil saturation leads to avoidable pumping across {farm_area_ha:.2f} ha.",
        )

    return WaterImpactEstimate(
        litres=cycle_liters,
        impact_type="neutral",
        label=f"{cycle_liters:,} L Productively Delivered",
        formula_basis=f"Measured water delivery ({telemetry.irrigation_flow_rate_lpm:.0f} L/min over {telemetry.irrigation_duration_minutes:.0f} min) satisfying crop requirement on {farm_area_ha:.2f} ha.",
    )


def generate_recommendation_text(
    action: str,
    rain_prob: float,
    expected_rainfall: float,
    soil_moisture: float,
    profile: dict,
    total_score: int,
) -> str:
    """Generate unambiguous operational advice for farmers."""
    rain_imminent = is_rain_imminent(rain_prob, expected_rainfall)
    opt_min = profile["optimal_min"]
    opt_max = profile["optimal_max"]

    if rain_imminent:
        if soil_moisture > opt_max:
            return "Postpone irrigation for 24–48 hours. Heavy rainfall is imminent and root-zone moisture is already elevated, avoiding root hypoxia."
        return "Postpone irrigation for 24 hours. Natural precipitation will sufficiently replenish root-zone moisture without groundwater pumping."

    if soil_moisture < opt_min:
        return "Irrigate during early morning or evening hours. Root-zone moisture has dropped below the field capacity threshold and no significant precipitation is forecast."

    if soil_moisture > opt_max:
        return "Hold irrigation. Current root-zone moisture is sufficient; additional watering risks nutrient leaching."

    return "Maintain routine monitoring. Soil moisture, microclimate, and crop rotation indices are well-balanced."


class SustainabilityService:
    """Service executing deterministic sustainability scoring."""

    @classmethod
    def calculate_score(cls, request: SustainabilityScoreRequest) -> SustainabilityScoreResponse:
        """Calculate explainable 100-point sustainability score."""
        # 1. Resolve IoT telemetry (deterministic simulated presets or explicit override)
        telemetry = IoTSensorService.resolve_telemetry(
            telemetry_override=request.telemetry,
            soil_moisture_override=request.soil_moisture_percent,
        )

        soil_moisture = telemetry.soil_moisture_percent
        temp = request.temperature_celsius
        humidity = request.humidity_percent
        rain_prob = request.rain_probability_percent
        rainfall = request.expected_rainfall_mm

        # Resolve soil profile & crop weather profile
        soil_profile = resolve_soil_profile(request.soil_type, getattr(telemetry, "preset_id", None))

        # 2. Compute 4 dimensions
        water_pts, water_reason, water_status = calculate_water_conservation(
            action=request.action,
            rain_prob=rain_prob,
            expected_rainfall=rainfall,
            soil_moisture=soil_moisture,
            profile=soil_profile,
        )

        weather_pts, weather_reason, weather_status = calculate_weather_alignment(
            temperature=temp,
            humidity=humidity,
            rain_prob=rain_prob,
            crop=request.crop,
        )

        soil_pts, soil_reason, soil_status = calculate_soil_moisture_balance(
            soil_moisture=soil_moisture,
            profile=soil_profile,
        )

        rotation_pts, rotation_reason, rotation_status = calculate_crop_rotation_compatibility(
            target_crop=request.crop,
            previous_crop=request.previous_crop,
            soil_type=request.soil_type,
        )

        raw_total = water_pts + weather_pts + soil_pts + rotation_pts
        total_score = max(0, min(100, int(round(raw_total))))

        if total_score >= 80:
            score_label = "Excellent"
        elif total_score >= 60:
            score_label = "Good"
        else:
            score_label = "Needs Improvement"

        # 3. Water volume calculation
        water_impact = calculate_water_volume_impact(
            action=request.action,
            rain_prob=rain_prob,
            expected_rainfall=rainfall,
            soil_moisture=soil_moisture,
            farm_area_ha=request.farm_area_hectares,
            telemetry=telemetry,
            profile=soil_profile,
        )

        # 4. Action comparison (What-if delay vs irrigate_now)
        comparison: Dict[str, ActionComparisonOption] = {}
        for act in ("delay", "irrigate_now"):
            comp_water_pts, _, _ = calculate_water_conservation(
                action=act,
                rain_prob=rain_prob,
                expected_rainfall=rainfall,
                soil_moisture=soil_moisture,
                profile=soil_profile,
            )
            comp_total = max(0, min(100, int(round(comp_water_pts + weather_pts + soil_pts + rotation_pts))))
            comp_label = "Excellent" if comp_total >= 80 else ("Good" if comp_total >= 60 else "Needs Improvement")
            comp_impact = calculate_water_volume_impact(
                action=act,
                rain_prob=rain_prob,
                expected_rainfall=rainfall,
                soil_moisture=soil_moisture,
                farm_area_ha=request.farm_area_hectares,
                telemetry=telemetry,
                profile=soil_profile,
            )
            comparison[act] = ActionComparisonOption(
                action=act,
                score=comp_total,
                score_label=comp_label,
                water_impact_litres=comp_impact.litres,
                water_impact_type=comp_impact.impact_type,
            )

        recommendation = generate_recommendation_text(
            action=request.action,
            rain_prob=rain_prob,
            expected_rainfall=rainfall,
            soil_moisture=soil_moisture,
            profile=soil_profile,
            total_score=total_score,
        )

        breakdown = {
            "water_conservation": ScoreBreakdownItem(
                dimension="Water Conservation & Irrigation Timing",
                points=water_pts,
                max_points=40.0,
                percentage=round((water_pts / 40.0) * 100, 1),
                reason=water_reason,
                status=water_status,
            ),
            "microclimate_alignment": ScoreBreakdownItem(
                dimension="Microclimate & Weather Alignment",
                points=weather_pts,
                max_points=30.0,
                percentage=round((weather_pts / 30.0) * 100, 1),
                reason=weather_reason,
                status=weather_status,
            ),
            "soil_moisture_balance": ScoreBreakdownItem(
                dimension="Soil Moisture & Root-Zone Balance",
                points=soil_pts,
                max_points=15.0,
                percentage=round((soil_pts / 15.0) * 100, 1),
                reason=soil_reason,
                status=soil_status,
            ),
            "crop_rotation_compatibility": ScoreBreakdownItem(
                dimension="Crop Rotation & Agro-Ecological Compatibility",
                points=rotation_pts,
                max_points=15.0,
                percentage=round((rotation_pts / 15.0) * 100, 1),
                reason=rotation_reason,
                status=rotation_status,
            ),
        }

        # Provenance notice
        notice = (
            "Simulated IoT Telemetry Layer: Root-zone sensor values are deterministically "
            "simulated for SIH prototyping and reproducible scoring."
        )

        return SustainabilityScoreResponse(
            total_score=total_score,
            score_label=score_label,
            summary=f"Sustainability index is {total_score}/100 ({score_label}). Action evaluated: {request.action.replace('_', ' ').title()}.",
            recommendation=recommendation,
            breakdown=breakdown,
            water_impact=water_impact,
            comparison=comparison,
            telemetry_used=telemetry,
            simulated_telemetry_notice=notice,
        )
