"""Command-line test interface for AgriNexa AI Crop Recommendation Model v2."""

import argparse
import sys
from pathlib import Path

# Add project root to sys.path to enable direct script execution
project_root = Path(__file__).resolve().parent.parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

from model.crop_recommendation_v2.predict import predict_crop, ModelNotReadyError
from model.crop_recommendation_v2.preprocessing import ALLOWED_SOIL_TYPES

def format_prediction_output(result: dict) -> None:
    """Print beautifully formatted crop recommendation output."""
    print("\n" + "=" * 65)
    print(f"  AGRINEXA AI CROP RECOMMENDATION ({result.get('model_version', 'v2.0.0')})")
    print("=" * 65)
    
    inputs = result.get("input_features", {})
    print("\n[Farmer Input Summary]")
    print(f"  * Location      : {inputs.get('district')}, {inputs.get('state')}")
    print(f"  * Soil Type     : {inputs.get('soil_type')}")
    print(f"  * Previous Crop : {inputs.get('previous_crop')}")
    print(f"  * Weather       : {inputs.get('temperature')} deg C | {inputs.get('humidity')}% Humidity | {inputs.get('rainfall')} mm Rain")
    
    print("\n[Primary Recommendation]")
    print(f"  * Recommended Crop : {result.get('recommended_crop', '').upper()}")
    print(f"  * Confidence Score : {result.get('confidence', 0.0) * 100:.2f}% ({result.get('confidence_level', 'N/A')})")
    
    recommendations = result.get("recommendations", [])
    print(f"\n[Ranked Alternatives (Top {len(recommendations)})]")
    print(f"  {'Rank':<6} {'Crop':<18} {'Probability':<14} {'Confidence Tier'}")
    print("  " + "-" * 55)
    for idx, rec in enumerate(recommendations, 1):
        crop = rec.get("crop", "").capitalize()
        prob = f"{rec.get('probability', 0.0) * 100:.2f}%"
        tier = rec.get("confidence_tier", "N/A")
        marker = "*" if idx == 1 else " "
        print(f"  {marker} #{idx:<4} {crop:<18} {prob:<14} {tier}")
        
    print("\n[Agronomic Context]")
    print(f"  {result.get('explanation', '')}")
    print("=" * 65 + "\n")

def run_interactive():
    """Prompt user interactively for farmer-friendly parameters."""
    print("\n=== AgriNexa AI Model v2: Interactive Crop Recommendation ===")
    print(f"Available soil categories: {', '.join([s.title() for s in ALLOWED_SOIL_TYPES if s != 'unknown'])}\n")
    
    try:
        state = input("Enter State [e.g. Gujarat]: ").strip() or "Gujarat"
        district = input("Enter District [e.g. Ahmedabad]: ").strip() or "Ahmedabad"
        
        temp_str = input("Enter Temperature in °C [e.g. 28]: ").strip() or "28"
        temperature = float(temp_str)
        
        hum_str = input("Enter Relative Humidity in % [e.g. 65]: ").strip() or "65"
        humidity = float(hum_str)
        
        rain_str = input("Enter Rainfall in mm [e.g. 750]: ").strip() or "750"
        rainfall = float(rain_str)
        
        soil_type = input("Enter Soil Type [e.g. Alluvial]: ").strip() or "Alluvial"
        previous_crop = input("Enter Previous Crop [e.g. cotton]: ").strip() or "cotton"
        
        top_k_str = input("Enter Number of recommendations (top_k) [e.g. 5]: ").strip() or "5"
        top_k = int(top_k_str)
        
        result = predict_crop(
            state=state,
            district=district,
            temperature=temperature,
            humidity=humidity,
            rainfall=rainfall,
            soil_type=soil_type,
            previous_crop=previous_crop,
            top_k=top_k,
        )
        format_prediction_output(result)
        
    except ValueError as ve:
        print(f"\n[Validation Error] {ve}", file=sys.stderr)
        sys.exit(1)
    except ModelNotReadyError as me:
        print(f"\n[Model Error] {me}", file=sys.stderr)
        sys.exit(1)
    except KeyboardInterrupt:
        print("\nOperation cancelled by user.")
        sys.exit(0)

def run_example(top_k: int = 5):
    """Run standard canonical example test on Model v2."""
    print("\n--- Running AgriNexa Model v2 Example Prediction ---")
    try:
        result = predict_crop(
            state="Gujarat",
            district="Ahmedabad",
            temperature=28.0,
            humidity=65.0,
            rainfall=750.0,
            soil_type="Alluvial",
            previous_crop="cotton",
            top_k=top_k,
        )
        format_prediction_output(result)
    except Exception as e:
        print(f"[Error] Failed to execute prediction: {e}", file=sys.stderr)
        sys.exit(1)

def main():
    parser = argparse.ArgumentParser(
        description="CLI Test Interface for AgriNexa AI Crop Recommendation Model v2"
    )
    parser.add_argument("-i", "--interactive", action="store_true", help="Run in interactive prompt mode")
    parser.add_argument("--state", type=str, default=None, help="State name (e.g. Gujarat)")
    parser.add_argument("--district", type=str, default=None, help="District name (e.g. Ahmedabad)")
    parser.add_argument("--temperature", type=float, default=None, help="Temperature in °C")
    parser.add_argument("--humidity", type=float, default=None, help="Relative humidity in %")
    parser.add_argument("--rainfall", type=float, default=None, help="Rainfall in mm")
    parser.add_argument("--soil-type", type=str, default=None, help="Soil category (e.g. Alluvial, Black, Red)")
    parser.add_argument("--previous-crop", type=str, default=None, help="Previously cultivated crop (e.g. cotton)")
    parser.add_argument("--top-k", type=int, default=5, help="Number of top crop recommendations (default: 5)")
    
    args = parser.parse_args()
    
    if args.interactive:
        run_interactive()
    elif all(v is not None for v in [args.state, args.district, args.temperature, args.humidity, args.rainfall, args.soil_type, args.previous_crop]):
        try:
            result = predict_crop(
                state=args.state,
                district=args.district,
                temperature=args.temperature,
                humidity=args.humidity,
                rainfall=args.rainfall,
                soil_type=args.soil_type,
                previous_crop=args.previous_crop,
                top_k=args.top_k,
            )
            format_prediction_output(result)
        except ValueError as ve:
            print(f"\n[Validation Error] {ve}", file=sys.stderr)
            sys.exit(1)
    else:
        run_example(top_k=args.top_k)

if __name__ == "__main__":
    main()
