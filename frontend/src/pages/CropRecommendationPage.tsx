import { useState, useRef, FormEvent, ChangeEvent } from 'react';
import {
  Sprout,
  ArrowLeft,
  MapPin,
  Thermometer,
  Droplets,
  CloudRain,
  CloudSun,
  Layers,
  Sparkles,
  AlertCircle,
  HelpCircle,
  Loader2,
  CheckCircle2,
  BarChart3,
  FileText,
  RefreshCw,
  RotateCcw,
  Leaf,
} from 'lucide-react';
import { Button } from '../components/Button';
import { SearchableSelect } from '../components/SearchableSelect';
import {
  INDIAN_STATES,
  getDistrictsForState,
  searchStates,
  searchDistricts,
  isValidDistrictForState,
} from '../data/indianLocations';
import { recommendCrop, getWeather, getSeasonalClimate, ApiError } from '../api/client';
import { CropRecommendationRequest, CropRecommendationResponse, WeatherResponse } from '../types';


/** Backend-supported soil types with farmer-friendly display labels */
export const SOIL_TYPES = [
  { value: 'alluvial', label: 'Alluvial Soil' },
  { value: 'black', label: 'Black Soil' },
  { value: 'red', label: 'Red Soil' },
  { value: 'laterite', label: 'Laterite Soil' },
  { value: 'clay', label: 'Clay Soil' },
  { value: 'sandy', label: 'Sandy Soil' },
  { value: 'loamy', label: 'Loamy Soil' },
  { value: 'peaty', label: 'Peaty Soil' },
  { value: 'saline', label: 'Saline Soil' },
  { value: 'arid', label: 'Arid / Desert Soil' },
  { value: 'unknown', label: 'Unknown / Other' },
] as const;

export const CROP_SEASONS = [
  { value: 'Kharif', label: 'Kharif (Monsoon Season / Autumn Harvest)' },
  { value: 'Rabi', label: 'Rabi (Winter Season / Spring Harvest)' },
  { value: 'Summer', label: 'Summer / Zaid (Short Summer Season)' },
] as const;

export interface CropRecommendationFormData {
  state: string;
  district: string;
  temperature: string;
  humidity: string;
  rainfall: string;
  soil_type: string;
  previous_crop: string;
}

export type FormErrors = Partial<Record<keyof CropRecommendationFormData, string>>;

interface CropRecommendationPageProps {
  onBack: () => void;
  onSubmit?: (data: CropRecommendationFormData) => void;
  onNavigateSustainability?: () => void;
}

const INITIAL_FORM_DATA: CropRecommendationFormData = {
  state: '',
  district: '',
  temperature: '',
  humidity: '',
  rainfall: '',
  soil_type: '',
  previous_crop: '',
};

/** Helper to format confidence numbers safely (handles decimals 0-1, whole percentages 0-100, 0, 1, and invalid numbers) */
export function formatConfidence(conf: unknown): string {
  if (typeof conf !== 'number' || !Number.isFinite(conf)) {
    return 'N/A';
  }
  const percent = conf >= 0 && conf <= 1 ? conf * 100 : conf;
  return `${Math.min(100, Math.max(0, percent)).toFixed(1)}%`;
}

/** Helper to extract numeric percentage for progress bars (0-100) */
export function getConfidencePercent(conf: unknown): number {
  if (typeof conf !== 'number' || !Number.isFinite(conf)) {
    return 0;
  }
  const percent = conf >= 0 && conf <= 1 ? conf * 100 : conf;
  return Math.min(100, Math.max(0, percent));
}

export function CropRecommendationPage({
  onBack,
  onSubmit,
  onNavigateSustainability,
}: CropRecommendationPageProps) {
  const [formData, setFormData] = useState<CropRecommendationFormData>(INITIAL_FORM_DATA);
  const [selectedSeason, setSelectedSeason] = useState<string>('Kharif');
  const [errors, setErrors] = useState<FormErrors>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [recommendationResult, setRecommendationResult] = useState<CropRecommendationResponse | null>(null);

  // Field element references for accessible focus placement on validation failure
  const stateRef = useRef<HTMLInputElement>(null);
  const districtRef = useRef<HTMLInputElement>(null);
  const temperatureRef = useRef<HTMLInputElement>(null);
  const humidityRef = useRef<HTMLInputElement>(null);
  const rainfallRef = useRef<HTMLInputElement>(null);
  const soilTypeRef = useRef<HTMLSelectElement>(null);
  const previousCropRef = useRef<HTMLInputElement>(null);

  const fieldRefs: Record<keyof CropRecommendationFormData, React.RefObject<HTMLInputElement | HTMLSelectElement | null>> = {
    state: stateRef,
    district: districtRef,
    temperature: temperatureRef,
    humidity: humidityRef,
    rainfall: rainfallRef,
    soil_type: soilTypeRef,
    previous_crop: previousCropRef,
  };

  const [isFetchingWeather, setIsFetchingWeather] = useState<boolean>(false);
  const [weatherInfo, setWeatherInfo] = useState<WeatherResponse | null>(null);
  const [weatherError, setWeatherError] = useState<string | null>(null);

  const handleStateChange = async (newState: string) => {
    // If state changed, check if previous district still belongs to new state
    const validDistricts = getDistrictsForState(newState);
    const districtStillValid = validDistricts.some(
      (d) => d.toLowerCase() === formData.district.trim().toLowerCase()
    );
    const updatedDistrict = districtStillValid ? formData.district : '';

    setFormData((prev) => ({
      ...prev,
      state: newState,
      district: updatedDistrict,
    }));

    setErrors((prev) => {
      const next = { ...prev };
      if (newState.trim()) delete next.state;
      if (!districtStillValid && prev.district) delete next.district;
      return next;
    });

    // If updatedDistrict is present, refresh seasonal climate
    if (newState.trim() && updatedDistrict) {
      try {
        const climate = await getSeasonalClimate(newState, updatedDistrict, selectedSeason);
        if (climate && climate.temperature_mean !== undefined) {
          setFormData((prev) => ({
            ...prev,
            temperature: String(climate.temperature_mean),
            humidity: String(climate.humidity_mean),
            rainfall: String(climate.rainfall_normal),
            soil_type: prev.soil_type || climate.soil_type_default || '',
          }));
          setErrors((prev) => {
            const next = { ...prev };
            delete next.temperature;
            delete next.humidity;
            delete next.rainfall;
            return next;
          });
        }
      } catch {
        // Unmapped state/district
      }
    }
  };

  const handleDistrictChange = async (newDistrict: string) => {
    setFormData((prev) => ({
      ...prev,
      district: newDistrict,
    }));

    setErrors((prev) => {
      const next = { ...prev };
      if (newDistrict.trim()) delete next.district;
      return next;
    });

    const st = formData.state.trim();
    if (st && newDistrict.trim()) {
      try {
        const climate = await getSeasonalClimate(st, newDistrict, selectedSeason);
        if (climate && climate.temperature_mean !== undefined) {
          setFormData((prev) => ({
            ...prev,
            temperature: String(climate.temperature_mean),
            humidity: String(climate.humidity_mean),
            rainfall: String(climate.rainfall_normal),
            soil_type: prev.soil_type || climate.soil_type_default || '',
          }));
          setErrors((prev) => {
            const next = { ...prev };
            delete next.temperature;
            delete next.humidity;
            delete next.rainfall;
            return next;
          });
        }
      } catch {
        // Unmapped state/district
      }
    }
  };

  const handleSeasonChange = async (newSeason: string) => {
    setSelectedSeason(newSeason);
    const st = formData.state.trim();
    const dt = formData.district.trim();
    if (st) {
      try {
        const climate = await getSeasonalClimate(st, dt, newSeason);
        if (climate && climate.temperature_mean !== undefined) {
          setFormData((prev) => ({
            ...prev,
            temperature: String(climate.temperature_mean),
            humidity: String(climate.humidity_mean),
            rainfall: String(climate.rainfall_normal),
            soil_type: prev.soil_type || climate.soil_type_default || '',
          }));
          setErrors((prev) => {
            const next = { ...prev };
            delete next.temperature;
            delete next.humidity;
            delete next.rainfall;
            return next;
          });
        }
      } catch {
        // If climate is unmapped for state, keep existing values
      }
    }
  };

  const handleFetchWeather = async () => {
    const query = formData.district.trim() || formData.state.trim();
    if (!query) {
      setWeatherError('Please enter a District or State to fetch live weather data.');
      return;
    }

    setIsFetchingWeather(true);
    setWeatherError(null);

    try {
      const weather = await getWeather(query);
      setWeatherInfo(weather);

      // Auto-populate environmental fields with verified seasonal climate normals
      const climateData = weather.climate;
      if (climateData) {
        setFormData((prev) => ({
          ...prev,
          temperature: String(climateData?.temperature_mean ?? prev.temperature),
          humidity: String(climateData?.humidity_mean ?? prev.humidity),
          rainfall: String(climateData?.rainfall_normal ?? prev.rainfall),
          soil_type: prev.soil_type || climateData?.soil_type_default || '',
          state: prev.state || weather.location.state || '',
          district: prev.district || weather.location.district || weather.location.name || '',
        }));
      } else {
        setFormData((prev) => ({
          ...prev,
          state: prev.state || weather.location.state || '',
          district: prev.district || weather.location.district || weather.location.name || '',
        }));
      }

      // Clear field errors for populated fields
      setErrors((prev) => {
        const next = { ...prev };
        if (climateData) {
          delete next.temperature;
          delete next.humidity;
          delete next.rainfall;
        }
        if (weather.location.state) delete next.state;
        if (weather.location.district || weather.location.name) delete next.district;
        return next;
      });
    } catch (err: unknown) {
      let message = 'Unable to fetch weather for this location.';
      if (err instanceof ApiError) {
        message = err.message;
      } else if (err instanceof Error) {
        message = err.message;
      }
      setWeatherError(message);
    } finally {
      setIsFetchingWeather(false);
    }
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    // Clear individual field error as user edits
    if (errors[name as keyof CropRecommendationFormData]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[name as keyof CropRecommendationFormData];
        return next;
      });
    }
    if (generalError) {
      setGeneralError(null);
    }
    if (apiError) {
      setApiError(null);
    }
    if (weatherError) {
      setWeatherError(null);
    }
  };


  const validate = (): FormErrors => {
    const newErrors: FormErrors = {};

    // 1. State
    if (!formData.state.trim()) {
      newErrors.state = 'State is required.';
    }

    // 2. District
    if (!formData.district.trim()) {
      newErrors.district = 'District is required.';
    } else if (
      formData.state.trim() &&
      !isValidDistrictForState(formData.state, formData.district)
    ) {
      newErrors.district = `Selected district does not belong to ${formData.state}.`;
    }

    // 3. Temperature (-10°C to 60°C)
    if (!formData.temperature.trim()) {
      newErrors.temperature = 'Temperature is required.';
    } else {
      const tempNum = Number(formData.temperature);
      if (Number.isNaN(tempNum)) {
        newErrors.temperature = 'Temperature must be a valid number.';
      } else if (tempNum < -10 || tempNum > 60) {
        newErrors.temperature = 'Temperature must be between -10°C and 60°C.';
      }
    }

    // 4. Humidity (0% to 100%)
    if (!formData.humidity.trim()) {
      newErrors.humidity = 'Humidity is required.';
    } else {
      const humNum = Number(formData.humidity);
      if (Number.isNaN(humNum)) {
        newErrors.humidity = 'Humidity must be a valid number.';
      } else if (humNum < 0 || humNum > 100) {
        newErrors.humidity = 'Humidity must be between 0% and 100%.';
      }
    }

    // 5. Rainfall (0 mm to 5000 mm)
    if (!formData.rainfall.trim()) {
      newErrors.rainfall = 'Rainfall is required.';
    } else {
      const rainNum = Number(formData.rainfall);
      if (Number.isNaN(rainNum)) {
        newErrors.rainfall = 'Rainfall must be a valid number.';
      } else if (rainNum < 0 || rainNum > 5000) {
        newErrors.rainfall = 'Rainfall must be between 0 mm and 5000 mm.';
      }
    }

    // 6. Soil Type
    if (!formData.soil_type) {
      newErrors.soil_type = 'Soil type is required.';
    }

    // 7. Previous Crop
    if (!formData.previous_crop.trim()) {
      newErrors.previous_crop = 'Previous crop is required.';
    }

    return newErrors;
  };

  const executeRecommendation = async () => {
    setErrors({});
    setGeneralError(null);
    setApiError(null);
    setIsSubmitting(true);

    // Build backend payload (7 model features + explicit season context)
    const payload: CropRecommendationRequest = {
      state: formData.state.trim(),
      district: formData.district.trim(),
      temperature: Number(formData.temperature),
      humidity: Number(formData.humidity),
      rainfall: Number(formData.rainfall),
      soil_type: formData.soil_type,
      previous_crop: formData.previous_crop.trim(),
      season: selectedSeason,
    };

    if (onSubmit) {
      onSubmit(formData);
    }

    try {
      const response = await recommendCrop(payload);
      setRecommendationResult(response);
      setApiError(null);

      // Smoothly scroll to results display
      setTimeout(() => {
        const resultSection = document.getElementById('recommendation-result');
        resultSection?.scrollIntoView?.({ behavior: 'smooth' });
      }, 50);
    } catch (err: unknown) {
      setRecommendationResult(null);
      let message = 'Unable to generate recommendation due to an unexpected error. Please try again.';

      if (err instanceof ApiError) {
        if (err.status === 503) {
          message = 'The crop recommendation service is temporarily offline (503). Please try again in a few moments.';
        } else if (err.status === 400 || err.status === 422) {
          message = err.message || 'Invalid environmental parameters. Please verify the entered values.';
        } else if (err.status >= 500) {
          message = 'A server error occurred while processing recommendations. Please try again in a few moments.';
        } else {
          message = err.message || `Request failed with status: ${err.status}`;
        }
      } else if (err instanceof TypeError && /fetch|network/i.test(err.message)) {
        message = 'Network error: Unable to connect to AgriNexa AI services. Please check your internet connection and try again.';
      } else if (err instanceof Error) {
        message = err.message;
      }
      setApiError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const validationErrors = validate();

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      setGeneralError('Please correct the highlighted fields before submitting.');

      // Place focus on the first invalid field for keyboard & screen-reader accessibility
      const fieldOrder: (keyof CropRecommendationFormData)[] = [
        'state',
        'district',
        'temperature',
        'humidity',
        'rainfall',
        'soil_type',
        'previous_crop',
      ];
      const firstInvalidField = fieldOrder.find((field) => validationErrors[field]);
      if (firstInvalidField && fieldRefs[firstInvalidField]?.current) {
        fieldRefs[firstInvalidField].current?.focus();
      }
      return;
    }

    await executeRecommendation();
  };

  const handleRetry = async () => {
    if (isSubmitting) return;
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      setGeneralError('Please correct the highlighted fields before retrying.');
      return;
    }
    await executeRecommendation();
  };

  const handleReset = () => {
    setFormData(INITIAL_FORM_DATA);
    setErrors({});
    setGeneralError(null);
    setApiError(null);
    setRecommendationResult(null);
    stateRef.current?.focus();
  };

  return (
    <main
      id="crop-recommendation"
      aria-label="Crop Recommendation"
      className="flex-1 relative bg-mesh-agri overflow-hidden py-8 sm:py-12"
    >
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">

        {/* Top Back Action & Farm Insights Sub-Nav */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <Button
            type="button"
            variant="secondary"
            onClick={onBack}
            className="px-4 py-2 text-xs font-semibold rounded-xl gap-2 w-fit"
            aria-label="Back to Plant Diagnosis"
          >
            <ArrowLeft size={15} aria-hidden="true" />
            <span>Back to Plant Diagnosis</span>
          </Button>

          {/* Farm Insights Sub-Tabs */}
          <div
            className="flex items-center gap-1.5 p-1 rounded-2xl bg-white border border-slate-200/80 shadow-2xs w-fit"
            role="tablist"
            aria-label="Farm Insights Navigation"
          >
            <button
              type="button"
              role="tab"
              aria-selected={true}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200/80 shadow-2xs"
            >
              <Sprout size={14} className="text-emerald-600" />
              <span>Crop Recommendation</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={false}
              onClick={onNavigateSustainability}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:text-emerald-700 hover:bg-emerald-50/50 transition-colors cursor-pointer"
            >
              <Leaf size={14} className="text-emerald-600" />
              <span>Sustainability Score</span>
            </button>
          </div>
        </div>

        {/* Main Form Workbench Card */}
        <div
          className="w-full rounded-3xl border border-slate-200/80 bg-white p-6 sm:p-10 shadow-[0_4px_25px_rgba(15,23,42,0.04)] text-left"
          role="region"
          aria-label="Crop Recommendation Form Workbench"
        >

          {/* Page Header */}
          <div className="border-b border-slate-100 pb-6 mb-8 text-center sm:text-left">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3.5 mb-2">
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-100/90 text-emerald-700 mx-auto sm:mx-0"
                aria-hidden="true"
              >
                <Sprout size={24} strokeWidth={2.2} />
              </span>
              <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
                  Crop Recommendation
                </h1>
                <p className="mt-1 text-sm sm:text-base text-slate-600 font-normal leading-relaxed">
                  Enter your field conditions to receive a crop recommendation based on your soil and environment.
                </p>
              </div>
            </div>
          </div>

          {/* Validation Alert Banner */}
          {generalError && (
            <div
              role="alert"
              aria-live="polite"
              className="mb-8 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/90 p-4 text-left text-sm text-amber-900 shadow-xs"
            >
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
              <div>
                <strong className="font-semibold text-amber-950">Incomplete Form Submission</strong>
                <p className="mt-0.5 text-amber-800">{generalError}</p>
              </div>
            </div>
          )}

          {/* API Error Alert Banner with Retry & Reset Actions */}
          {apiError && (
            <div
              role="alert"
              aria-live="polite"
              className="mb-8 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50/90 p-4 text-left text-sm text-red-900 shadow-xs"
            >
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden="true" />
              <div className="flex-1">
                <strong className="font-semibold text-red-950">Recommendation Request Issue</strong>
                <p className="mt-0.5 text-red-800">{apiError}</p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleRetry}
                    disabled={isSubmitting}
                    aria-label="Retry recommendation request"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold cursor-pointer transition-colors disabled:opacity-50"
                  >
                    <RefreshCw size={13} className={isSubmitting ? 'animate-spin' : ''} aria-hidden="true" />
                    <span>Retry Request</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleReset}
                    className="text-xs font-semibold text-red-700 hover:text-red-900 underline cursor-pointer"
                  >
                    Reset Form
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Structured Recommendation Form */}
          <form onSubmit={handleSubmit} noValidate className="space-y-8">

            {/* ── Section 1: Location ── */}
            <fieldset className="rounded-2xl border border-slate-100 bg-slate-50/50 p-5 sm:p-6">
              <legend className="flex items-center gap-2 px-1 text-base font-bold text-slate-900">
                <MapPin size={18} className="text-emerald-600" aria-hidden="true" />
                <span>Section 1 — Location</span>
              </legend>
              <p className="text-xs text-slate-500 mb-5 px-1">
                Regional geography enables accurate local agro-climatic pattern analysis.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">

                {/* State Searchable Field */}
                <SearchableSelect
                  ref={stateRef}
                  id="state-input"
                  name="state"
                  label="State"
                  value={formData.state}
                  options={INDIAN_STATES}
                  filterFn={(_opts, q) => searchStates(q)}
                  onChange={handleStateChange}
                  disabled={isSubmitting}
                  required
                  placeholder="Type to search state (e.g. Gujarat)..."
                  error={errors.state}
                  noOptionsMessage="No matching Indian state found"
                />

                {/* District Searchable Field */}
                <SearchableSelect
                  ref={districtRef}
                  id="district-input"
                  name="district"
                  label="District"
                  value={formData.district}
                  options={getDistrictsForState(formData.state)}
                  filterFn={(_opts, q) => searchDistricts(formData.state, q)}
                  onChange={handleDistrictChange}
                  disabled={isSubmitting || !formData.state.trim()}
                  disabledPlaceholder="Select state first"
                  required
                  placeholder="Type to search district (e.g. Ahmedabad)..."
                  error={errors.district}
                  noOptionsMessage="No matching district found for selected state"
                />

                {/* Target Crop Season Field */}
                <div>
                  <label
                    htmlFor="season-select"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Target Crop Season <span className="text-red-500" aria-hidden="true">*</span>
                  </label>
                  <div className="relative">
                    <select
                      id="season-select"
                      name="season"
                      value={selectedSeason}
                      disabled={isSubmitting}
                      onChange={(e) => handleSeasonChange(e.target.value)}
                      aria-label="Target Crop Season"
                      className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-3.5 text-sm text-slate-800 transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 hover:border-slate-300 disabled:bg-slate-100 disabled:cursor-not-allowed"
                    >
                      {CROP_SEASONS.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

              </div>

              {/* Weather Intelligence Auto-fetch Trigger */}
              <div className="mt-4 pt-3.5 border-t border-slate-200/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="text-xs text-slate-500">
                  <span>Automatically sync regional seasonal climate normals & live weather from Weather Intelligence</span>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleFetchWeather}
                  disabled={isFetchingWeather || isSubmitting}
                  className="px-3.5 py-1.5 text-xs font-semibold rounded-xl gap-2 text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/80 cursor-pointer transition-all active:scale-[0.98]"
                  aria-label="Auto-fetch weather and climate data for location"
                >
                  {isFetchingWeather ? (
                    <Loader2 size={14} className="animate-spin text-emerald-600" aria-hidden="true" />
                  ) : (
                    <CloudSun size={14} className="text-emerald-600" aria-hidden="true" />
                  )}
                  <span>{isFetchingWeather ? 'Fetching Weather & Climate...' : 'Fetch Weather & Climate'}</span>
                </Button>
              </div>

              {/* Weather Lookup Notice/Error */}
              {weatherError && (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <AlertCircle size={14} className="text-amber-600 shrink-0" aria-hidden="true" />
                    <span>{weatherError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setWeatherError(null)}
                    className="text-amber-700 hover:text-amber-900 font-semibold cursor-pointer text-xs"
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </fieldset>

            {/* Weather Intelligence Live Condition & Advisory Card */}
            {weatherInfo && (
              <div
                role="region"
                aria-label="Live Weather Intelligence"
                className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4 sm:p-5 text-left text-xs shadow-xs space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-bold text-emerald-950 text-sm">
                    <CloudSun size={18} className="text-emerald-600" aria-hidden="true" />
                    <span>Live Weather • {weatherInfo.location.name}, {weatherInfo.location.country}</span>
                  </div>
                  <span className="inline-flex items-center rounded-full bg-emerald-100/90 border border-emerald-200 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800">
                    {weatherInfo.current.condition}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-slate-700">
                  <div className="bg-white/90 rounded-xl p-2.5 border border-emerald-100">
                    <span className="text-slate-500 block text-[10px] uppercase font-semibold">Current Temp</span>
                    <strong className="text-slate-900 text-sm">{weatherInfo.current.temperature}°C</strong>
                  </div>
                  <div className="bg-white/90 rounded-xl p-2.5 border border-emerald-100">
                    <span className="text-slate-500 block text-[10px] uppercase font-semibold">Current Humidity</span>
                    <strong className="text-slate-900 text-sm">{weatherInfo.current.humidity}%</strong>
                  </div>
                  <div className="bg-white/90 rounded-xl p-2.5 border border-emerald-100">
                    <span className="text-slate-500 block text-[10px] uppercase font-semibold">Today's Rain (24h)</span>
                    <strong className="text-slate-900 text-sm">{weatherInfo.daily.precipitation_sum} mm</strong>
                  </div>
                  <div className="bg-white/90 rounded-xl p-2.5 border border-emerald-100">
                    <span className="text-slate-500 block text-[10px] uppercase font-semibold">Wind Speed</span>
                    <strong className="text-slate-900 text-sm">{weatherInfo.current.wind_speed} km/h</strong>
                  </div>
                </div>

                {weatherInfo.climate && (
                  <div className="rounded-xl bg-white/95 border border-emerald-200/80 p-3 text-[11.5px] text-emerald-900">
                    <div className="font-bold text-emerald-950 mb-1 flex items-center gap-1.5">
                      <Sparkles size={13} className="text-emerald-600" aria-hidden="true" />
                      <span>Seasonal Climate Normals Applied to Crop Model ({weatherInfo.climate.season} Season — {weatherInfo.climate.region} Region):</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-slate-700 text-xs mt-1.5">
                      <span>• Mean Temp: <strong>{weatherInfo.climate.temperature_mean}°C</strong></span>
                      <span>• Mean Humidity: <strong>{weatherInfo.climate.humidity_mean}%</strong></span>
                      <span>• Normal Rain: <strong>{weatherInfo.climate.rainfall_normal} mm</strong></span>
                    </div>
                  </div>
                )}

                {weatherInfo.advisories && weatherInfo.advisories.length > 0 && (
                  <div className="space-y-1 border-t border-emerald-200/60 pt-2.5">
                    <span className="text-[11px] font-bold text-emerald-900 block mb-1">Agronomic Farm Advisories:</span>
                    {weatherInfo.advisories.map((adv, idx) => (
                      <div key={idx} className="flex items-start gap-1.5 text-emerald-800 text-[11.5px]">
                        <span className="text-emerald-600 mt-0.5">•</span>
                        <span>{adv}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Section 2: Seasonal Climate Conditions ── */}
            <fieldset className="rounded-2xl border border-slate-100 bg-slate-50/50 p-5 sm:p-6">
              <legend className="flex items-center gap-2 px-1 text-base font-bold text-slate-900">
                <CloudRain size={18} className="text-emerald-600" aria-hidden="true" />
                <span>Section 2 — Seasonal Climate Conditions</span>
              </legend>

              <p className="text-xs text-slate-500 mb-5 px-1">
                Seasonal mean temperature, relative humidity, and cumulative normal rainfall for your crop growing season (used for crop recommendation).
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">

                {/* Temperature Field */}
                <div>
                  <label
                    htmlFor="temperature-input"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Seasonal Mean Temperature <span className="text-red-500" aria-hidden="true">*</span>
                  </label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                      <Thermometer size={16} />
                    </div>
                    <input
                      ref={temperatureRef}
                      id="temperature-input"
                      name="temperature"
                      type="number"
                      step="0.1"
                      min="-10"
                      max="60"
                      required
                      disabled={isSubmitting}
                      value={formData.temperature}
                      onChange={handleChange}
                      placeholder="e.g. 28.0"
                      aria-required="true"
                      aria-invalid={!!errors.temperature}
                      aria-describedby={errors.temperature ? 'temperature-error' : undefined}
                      className={`w-full rounded-xl border bg-white py-2.5 pl-9 pr-10 text-sm text-slate-800 transition-colors placeholder:text-slate-400 focus:outline-none focus:ring-2 disabled:bg-slate-100 disabled:cursor-not-allowed ${
                        errors.temperature
                          ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20'
                          : 'border-slate-200 focus:border-emerald-500 focus:ring-emerald-500/20 hover:border-slate-300'
                      }`}
                    />
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                      <span className="text-xs font-bold text-slate-500">°C</span>
                    </div>
                  </div>
                  {errors.temperature && (
                    <p id="temperature-error" role="alert" className="mt-1.5 text-xs text-red-600 font-medium flex items-center gap-1">
                      <AlertCircle size={13} aria-hidden="true" />
                      <span>{errors.temperature}</span>
                    </p>
                  )}
                </div>

                {/* Humidity Field */}
                <div>
                  <label
                    htmlFor="humidity-input"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Seasonal Mean Humidity <span className="text-red-500" aria-hidden="true">*</span>
                  </label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                      <Droplets size={16} />
                    </div>
                    <input
                      ref={humidityRef}
                      id="humidity-input"
                      name="humidity"
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      required
                      disabled={isSubmitting}
                      value={formData.humidity}
                      onChange={handleChange}
                      placeholder="e.g. 75.0"
                      aria-required="true"
                      aria-invalid={!!errors.humidity}
                      aria-describedby={errors.humidity ? 'humidity-error' : undefined}
                      className={`w-full rounded-xl border bg-white py-2.5 pl-9 pr-8 text-sm text-slate-800 transition-colors placeholder:text-slate-400 focus:outline-none focus:ring-2 disabled:bg-slate-100 disabled:cursor-not-allowed ${
                        errors.humidity
                          ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20'
                          : 'border-slate-200 focus:border-emerald-500 focus:ring-emerald-500/20 hover:border-slate-300'
                      }`}
                    />
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                      <span className="text-xs font-bold text-slate-500">%</span>
                    </div>
                  </div>
                  {errors.humidity && (
                    <p id="humidity-error" role="alert" className="mt-1.5 text-xs text-red-600 font-medium flex items-center gap-1">
                      <AlertCircle size={13} aria-hidden="true" />
                      <span>{errors.humidity}</span>
                    </p>
                  )}
                </div>

                {/* Rainfall Field */}
                <div>
                  <label
                    htmlFor="rainfall-input"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Seasonal Cumulative Rainfall <span className="text-red-500" aria-hidden="true">*</span>
                  </label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                      <CloudRain size={16} />
                    </div>
                    <input
                      ref={rainfallRef}
                      id="rainfall-input"
                      name="rainfall"
                      type="number"
                      step="0.1"
                      min="0"
                      max="5000"
                      required
                      disabled={isSubmitting}
                      value={formData.rainfall}
                      onChange={handleChange}
                      placeholder="e.g. 1150.0"
                      aria-required="true"
                      aria-invalid={!!errors.rainfall}
                      aria-describedby={errors.rainfall ? 'rainfall-error' : undefined}
                      className={`w-full rounded-xl border bg-white py-2.5 pl-9 pr-12 text-sm text-slate-800 transition-colors placeholder:text-slate-400 focus:outline-none focus:ring-2 disabled:bg-slate-100 disabled:cursor-not-allowed ${
                        errors.rainfall
                          ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20'
                          : 'border-slate-200 focus:border-emerald-500 focus:ring-emerald-500/20 hover:border-slate-300'
                      }`}
                    />
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                      <span className="text-xs font-bold text-slate-500">mm</span>
                    </div>
                  </div>
                  {errors.rainfall && (
                    <p id="rainfall-error" role="alert" className="mt-1.5 text-xs text-red-600 font-medium flex items-center gap-1">
                      <AlertCircle size={13} aria-hidden="true" />
                      <span>{errors.rainfall}</span>
                    </p>
                  )}
                </div>

              </div>
            </fieldset>

            {/* ── Section 3: Farming Context ── */}
            <fieldset className="rounded-2xl border border-slate-100 bg-slate-50/50 p-5 sm:p-6">
              <legend className="flex items-center gap-2 px-1 text-base font-bold text-slate-900">
                <Layers size={18} className="text-emerald-600" aria-hidden="true" />
                <span>Section 3 — Farming Context</span>
              </legend>
              <p className="text-xs text-slate-500 mb-5 px-1">
                Soil characteristics and crop rotation history on your target plot.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">

                {/* Soil Type Select */}
                <div>
                  <label
                    htmlFor="soil-type-select"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Soil Type <span className="text-red-500" aria-hidden="true">*</span>
                  </label>
                  <div className="relative">
                    <select
                      ref={soilTypeRef}
                      id="soil-type-select"
                      name="soil_type"
                      required
                      disabled={isSubmitting}
                      value={formData.soil_type}
                      onChange={handleChange}
                      aria-required="true"
                      aria-invalid={!!errors.soil_type}
                      aria-describedby={errors.soil_type ? 'soil_type-error' : undefined}
                      className={`w-full rounded-xl border bg-white py-2.5 px-3.5 text-sm text-slate-800 transition-colors focus:outline-none focus:ring-2 cursor-pointer disabled:bg-slate-100 disabled:cursor-not-allowed ${
                        errors.soil_type
                          ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20'
                          : 'border-slate-200 focus:border-emerald-500 focus:ring-emerald-500/20 hover:border-slate-300'
                      }`}
                    >
                      <option value="">Select soil type</option>
                      {SOIL_TYPES.map((st) => (
                        <option key={st.value} value={st.value}>
                          {st.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {errors.soil_type && (
                    <p id="soil_type-error" role="alert" className="mt-1.5 text-xs text-red-600 font-medium flex items-center gap-1">
                      <AlertCircle size={13} aria-hidden="true" />
                      <span>{errors.soil_type}</span>
                    </p>
                  )}
                </div>

                {/* Previous Crop Field */}
                <div>
                  <label
                    htmlFor="previous-crop-input"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Previous Crop <span className="text-red-500" aria-hidden="true">*</span>
                  </label>
                  <div className="relative">
                    <input
                      ref={previousCropRef}
                      id="previous-crop-input"
                      name="previous_crop"
                      type="text"
                      required
                      disabled={isSubmitting}
                      value={formData.previous_crop}
                      onChange={handleChange}
                      placeholder="e.g. Cotton"
                      aria-required="true"
                      aria-invalid={!!errors.previous_crop}
                      aria-describedby={`previous-crop-helper ${errors.previous_crop ? 'previous-crop-error' : ''}`.trim()}
                      className={`w-full rounded-xl border bg-white py-2.5 px-3.5 text-sm text-slate-800 transition-colors placeholder:text-slate-400 focus:outline-none focus:ring-2 disabled:bg-slate-100 disabled:cursor-not-allowed ${
                        errors.previous_crop
                          ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20'
                          : 'border-slate-200 focus:border-emerald-500 focus:ring-emerald-500/20 hover:border-slate-300'
                      }`}
                    />
                  </div>
                  <p id="previous-crop-helper" className="mt-1.5 text-xs text-slate-500 flex items-center gap-1">
                    <HelpCircle size={12} className="shrink-0 text-slate-400" aria-hidden="true" />
                    <span>Enter the crop that was previously harvested from this soil plot.</span>
                  </p>
                  {errors.previous_crop && (
                    <p id="previous-crop-error" role="alert" className="mt-1 text-xs text-red-600 font-medium flex items-center gap-1">
                      <AlertCircle size={13} aria-hidden="true" />
                      <span>{errors.previous_crop}</span>
                    </p>
                  )}
                </div>

              </div>
            </fieldset>

            {/* ── Submit Area ── */}
            <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <p className="text-xs text-slate-500 leading-relaxed max-w-sm">
                Your information is used to generate a recommendation from the crop model.
              </p>

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isSubmitting}
                  onClick={handleReset}
                  className="w-full sm:w-auto py-3 px-5 text-sm font-semibold rounded-xl text-slate-600 hover:text-slate-900 border border-slate-200 hover:bg-slate-50 cursor-pointer disabled:opacity-50"
                  aria-label="Reset Form"
                >
                  <RotateCcw size={15} aria-hidden="true" />
                  <span>Reset Form</span>
                </Button>

                <Button
                  type="submit"
                  variant="primary"
                  disabled={isSubmitting}
                  className="w-full sm:w-auto py-3 px-7 text-sm font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                  aria-label="Recommend Crop"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                      <span>Analyzing Conditions...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} aria-hidden="true" />
                      <span>Recommend Crop</span>
                    </>
                  )}
                </Button>
              </div>
            </div>

          </form>

          {/* ── Recommendation Result Section ── */}
          {recommendationResult && (
            <div
              id="recommendation-result"
              role="region"
              aria-label="Crop recommendation result"
              aria-live="polite"
              className="mt-10 pt-8 border-t border-slate-200/80 space-y-6"
            >
              {/* Primary Output Hero Card */}
              <div className="rounded-3xl border border-emerald-200/90 bg-gradient-to-br from-[#ECFDF5]/80 via-white to-white p-6 sm:p-8 shadow-xs">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
                  <div className="space-y-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide bg-emerald-100 text-emerald-800"
                      >
                        <CheckCircle2 size={13} aria-hidden="true" />
                        Recommended Crop Output
                      </span>

                      {recommendationResult.confidence_level && (
                        <span
                          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold capitalize border ${
                            recommendationResult.confidence_level.toLowerCase() === 'high'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}
                        >
                          Confidence Level: {recommendationResult.confidence_level}
                        </span>
                      )}
                    </div>

                    <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 break-words">
                      {recommendationResult.recommended_crop || 'Recommended Crop'}
                    </h2>

                    <p className="text-xs sm:text-sm text-slate-600 max-w-lg leading-relaxed">
                      Recommended for field plot in <span className="font-semibold text-slate-800">{formData.district || 'District'}</span>, <span className="font-semibold text-slate-800">{formData.state || 'State'}</span> based on provided environmental and soil dynamics.
                    </p>
                  </div>

                  {/* Metrics Ribbon */}
                  <div className="flex flex-wrap md:flex-col items-start md:items-end gap-3 shrink-0">
                    <div className="rounded-2xl border border-emerald-100 bg-white px-5 py-3 shadow-xs text-left md:text-right">
                      <span className="block text-xs font-medium text-slate-500">Confidence Score</span>
                      <span className="text-2xl font-black text-emerald-700">
                        {formatConfidence(recommendationResult.confidence)}
                      </span>
                    </div>

                    {recommendationResult.model_version && (
                      <span className="text-xs font-medium text-slate-400">
                        Model Version: {recommendationResult.model_version}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Agronomic Explanation Card */}
              {recommendationResult.explanation && recommendationResult.explanation.trim().length > 0 && (
                <div className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-xs">
                  <div className="flex items-start gap-3.5">
                    <div
                      className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"
                      aria-hidden="true"
                    >
                      <FileText size={20} strokeWidth={2} />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-base font-bold text-slate-900">
                        Agronomic Explanation
                      </h3>
                      <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line break-words">
                        {recommendationResult.explanation}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Top-K Alternative Recommendations */}
              {recommendationResult.top_k_recommendations && recommendationResult.top_k_recommendations.length > 0 && (
                <div className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-xs">
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <BarChart3 size={18} className="text-emerald-700" aria-hidden="true" />
                      <h3 className="text-base font-bold text-slate-900">
                        Ranked Crop Alternatives
                      </h3>
                    </div>
                    <span className="text-xs text-slate-500 font-medium">Model Probability</span>
                  </div>

                  <div className="space-y-3.5">
                    {recommendationResult.top_k_recommendations.map((item, idx) => {
                      const score = item.probability ?? item.confidence;
                      const pctText = formatConfidence(score);
                      const pctWidth = getConfidencePercent(score);
                      return (
                        <div key={item.crop || idx} className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                            <span className="flex items-center gap-2 min-w-0">
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] text-slate-600 font-bold">
                                {idx + 1}
                              </span>
                              <span className="text-sm font-bold text-slate-800 truncate" title={item.crop}>
                                {item.crop}
                              </span>
                            </span>
                            <span className="text-xs font-bold text-slate-700 shrink-0 ml-2">{pctText}</span>
                          </div>
                          <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{
                                width: `${pctWidth}%`,
                                backgroundColor: pctWidth > 50 ? '#10B981' : '#F59E0B',
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Other Recommendations List */}
              {(() => {
                const rawRecs = recommendationResult.recommendations;
                if (!Array.isArray(rawRecs) || rawRecs.length === 0) return null;

                const normalized = rawRecs
                  .map((rec) => {
                    if (typeof rec === 'string') {
                      const text = rec.trim();
                      return text.length > 0 ? { crop: text } : null;
                    }
                    if (rec && typeof rec === 'object' && typeof rec.crop === 'string') {
                      const text = rec.crop.trim();
                      return text.length > 0 ? { crop: text, tier: rec.confidence_tier } : null;
                    }
                    return null;
                  })
                  .filter((item): item is { crop: string; tier?: string } => Boolean(item));

                if (normalized.length === 0) return null;

                return (
                  <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 sm:p-5">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2.5">
                      Other Suitable Crops
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {normalized.map((item, idx) => (
                        <span
                          key={`${item.crop}-${idx}`}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs break-words"
                        >
                          <Sprout size={13} className="text-emerald-600 shrink-0" aria-hidden="true" />
                          <span>{item.crop}</span>
                          {item.tier && (
                            <span className="text-[10px] text-slate-400 font-normal">({item.tier})</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Action Buttons: Adjust / Recalculate or Return */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => {
                    const formEl = document.querySelector('form');
                    formEl?.scrollIntoView?.({ behavior: 'smooth' });
                    temperatureRef.current?.focus();
                  }}
                  className="w-full sm:w-auto py-2.5 px-5 text-sm font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs gap-2"
                  aria-label="Adjust parameters and recalculate"
                >
                  <RefreshCw size={15} aria-hidden="true" />
                  <span>Adjust Conditions & Re-calculate</span>
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleReset}
                  className="w-full sm:w-auto py-2.5 px-5 text-sm font-semibold rounded-xl gap-2 cursor-pointer"
                  aria-label="Start Over"
                >
                  <RotateCcw size={15} aria-hidden="true" />
                  <span>Start Over</span>
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  onClick={onBack}
                  className="w-full sm:w-auto py-2.5 px-5 text-sm font-semibold rounded-xl gap-2"
                  aria-label="Return to Plant Diagnosis"
                >
                  <ArrowLeft size={15} aria-hidden="true" />
                  <span>Return to Plant Diagnosis</span>
                </Button>
              </div>

            </div>
          )}

        </div>

      </div>
    </main>
  );
}
