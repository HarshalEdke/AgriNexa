export interface HealthResponse {
  status: string;
}

export interface PredictionResponse {
  predicted_class: string;
  confidence: number;
  model_version: string;
  display_name?: string;
  precaution?: string;
  probabilities?: Record<string, number>;
  pipeline?: string;
  leaf_detected?: boolean;
  roi_count?: number;
  fallback_used?: boolean;
}

export type ChatLanguage = 'en' | 'hi' | 'gu' | 'mr' | 'ta' | 'pa';

export interface ChatRequest {
  predicted_class: string;
  confidence: number;
  probabilities: Record<string, number>;
  model_version: string;
  leaf_detected?: boolean;
  fallback_used?: boolean;
  question: string;
  session_id: string;
  language?: ChatLanguage;
}

export interface ChatAnswer {
  answer: string;
  session_id: string;
  grounded: boolean;
  source: string;
  timestamp: string;
}

export interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

export interface ChatSessionResponse {
  id: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessageResponse {
  id: number;
  role: 'user' | 'assistant' | string;
  content: string;
  created_at: string;
}

export interface ApiError {
  detail: string;
}

export interface RankedCropRecommendation {
  crop: string;
  confidence?: number;
  probability?: number;
  confidence_tier?: string;
}

export interface CropRecommendationRequest {
  state: string;
  district: string;
  temperature: number;
  humidity: number;
  rainfall: number;
  soil_type: string;
  previous_crop: string;
  season?: string;
}

export interface CropRecommendationResponse {
  recommended_crop: string;
  confidence: number;
  confidence_level: string;
  recommendations?: Array<RankedCropRecommendation | string>;
  top_k_recommendations?: RankedCropRecommendation[];
  explanation?: string;
  model_version?: string;
  input_features?: Record<string, unknown>;
}

export interface WeatherLocation {
  name: string;
  country: string;
  latitude: number;
  longitude: number;
  state?: string;
  district?: string;
}

export interface WeatherCurrent {
  temperature: number;
  humidity: number;
  wind_speed: number;
  weather_code: number;
  condition: string;
  precipitation?: number;
}

export interface WeatherDaily {
  temp_min: number;
  temp_max: number;
  precipitation_sum: number;
  precipitation_probability: number;
}

export interface SeasonalClimate {
  season: string;
  temperature_mean: number;
  humidity_mean: number;
  rainfall_normal: number;
  region: string;
  soil_type_default?: string;
}

export interface WeatherResponse {
  location: WeatherLocation;
  current: WeatherCurrent;
  daily: WeatherDaily;
  climate?: SeasonalClimate;
  advisories: string[];
  timestamp?: string;
}

export interface ForecastDay {
  date: string;
  temp_min: number;
  temp_max: number;
  precipitation_sum: number;
  precipitation_probability: number;
  weather_code: number;
  condition: string;
}

export interface AgronomicAlert {
  category: string;
  severity: string;
  action: string;
  title: string;
  message: string;
  reason: string;
  priority: number;
}

export interface PrimaryAction {
  action: string;
  badge_label: string;
  headline: string;
  detail: string;
  severity: string;
}

export interface WeatherIntelligenceRequest {
  location: string;
  crop?: string;
  soil_moisture_percent?: number;
  soil_type?: string;
  diagnosed_disease?: string;
  irrigation_status?: string;
  forecast_days?: number;
}

export interface WeatherIntelligenceResponse {
  location: WeatherLocation;
  current: WeatherCurrent;
  forecast_daily: ForecastDay[];
  primary_action: PrimaryAction;
  alerts: AgronomicAlert[];
  farm_context_applied: Record<string, unknown>;
  farm_context_complete: boolean;
  data_source: string;
  timestamp?: string;
}

export * from './auth';
export * from './sustainability';
export * from './irrigation';
