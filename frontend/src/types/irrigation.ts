export type IrrigationStatus = 'Required' | 'Not Required' | 'Monitor';
export type IrrigationMethod = 'drip' | 'micro_sprinkler' | 'sprinkler' | 'surface';

export interface IrrigationField {
  id: number;
  field_name: string;
  crop_name: string;
  crop_variety: string | null;
  growth_stage: string;
  sowing_date: string | null;
  crop_duration_days: number | null;
  root_depth_m: number;
  kc: number;
  kc_source: string;
  soil_type: string;
  soil_moisture_percent: number | null;
  moisture_source: string | null;
  moisture_updated_at: string | null;
  field_capacity_percent: number;
  permanent_wilting_point_percent: number;
  soil_water_holding_capacity_mm_per_m: number | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  area_hectares: number;
  irrigation_method: IrrigationMethod;
  irrigation_efficiency: number;
  flow_rate_lpm: number | null;
  water_source: string | null;
  last_irrigation_at: string | null;
  created_at: string;
}

export interface IrrigationFieldInput {
  field_name: string;
  crop_name: string;
  crop_variety?: string;
  growth_stage: string;
  sowing_date?: string;
  crop_duration_days?: number;
  root_depth_m: number;
  kc?: number;
  soil_type: string;
  soil_moisture_percent?: number;
  field_capacity_percent: number;
  permanent_wilting_point_percent: number;
  soil_water_holding_capacity_mm_per_m?: number;
  location?: string;
  latitude?: number;
  longitude?: number;
  area_hectares: number;
  irrigation_method: IrrigationMethod;
  irrigation_efficiency?: number;
  flow_rate_lpm?: number;
  water_source?: string;
}

export interface IrrigationForecastDay {
  date: string;
  temp_min_c: number | null;
  temp_max_c: number | null;
  humidity_percent: number | null;
  wind_speed_m_s: number | null;
  solar_radiation_mj_m2_day: number | null;
  rainfall_mm: number;
  rainfall_probability_percent: number;
}

export interface IrrigationWeather {
  location: string;
  source: string;
  current: Record<string, number | null>;
  forecast: IrrigationForecastDay[];
  retrieved_at: string;
}

export interface IrrigationWeatherInput {
  source?: 'manual' | 'sensor';
  temperature_c?: number;
  temp_min_c?: number;
  temp_max_c?: number;
  humidity_percent?: number;
  wind_speed_m_s?: number;
  solar_radiation_mj_m2_day?: number;
  elevation_m?: number;
  rainfall_mm?: number;
  rainfall_probability_percent?: number;
}

export interface IrrigationRecommendation {
  id: number;
  field_id: number;
  field_name: string;
  crop_name: string;
  status: IrrigationStatus;
  recommended_date: string | null;
  recommended_time: string | null;
  net_requirement_mm: number | null;
  gross_requirement_mm: number | null;
  required_water_litres: number | null;
  estimated_duration_minutes: number | null;
  recommended_method: IrrigationMethod;
  irrigation_efficiency: number;
  et0_mm_day: number | null;
  etc_mm_day: number | null;
  effective_rainfall_mm: number;
  soil_depletion_mm: number | null;
  readily_available_water_mm: number | null;
  estimated_water_saved_litres: number;
  weather_source: string;
  calculation_basis: string;
  explanation: string;
  alerts: string[];
  generated_at: string;
}

export interface IrrigationSchedule {
  id: number;
  field_id: number;
  recommendation_id: number;
  scheduled_at: string;
  status: 'scheduled' | 'postponed' | 'missed' | 'completed';
  planned_water_litres: number | null;
  notes: string | null;
  completed_at: string | null;
}

export interface IrrigationHistory {
  id: number;
  field_id: number;
  irrigated_at: string;
  water_used_litres: number;
  duration_minutes: number | null;
  method: string;
  notes: string | null;
}

export interface IrrigationDashboard {
  total_fields: number;
  fields_requiring_irrigation: number;
  average_soil_moisture_percent: number | null;
  estimated_water_requirement_litres: number;
  potential_water_savings_litres: number;
  fields: IrrigationField[];
  recommendations: IrrigationRecommendation[];
  schedules: IrrigationSchedule[];
  history: IrrigationHistory[];
  alerts: string[];
}

export interface IrrigationAnalytics {
  water_used_litres: number;
  potential_water_savings_litres: number;
  recommendations_count: number;
  completed_irrigations_count: number;
  soil_moisture_trend: Array<{
    date: string;
    field_name: string;
    moisture_percent: number;
    source: string;
  }>;
  crop_water_demand: Array<{
    crop: string;
    etc_mm_day: number;
    field_name: string;
  }>;
  water_consumption: Array<{ date: string; litres: number }>;
  irrigation_history: IrrigationHistory[];
}

export interface IrrigationSensorReading {
  id: number;
  field_id: number;
  soil_moisture_percent: number;
  temperature_c: number | null;
  humidity_percent: number | null;
  source: 'simulated' | 'hardware';
  device_id: string | null;
  recorded_at: string;
}
