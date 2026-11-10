export interface SatelliteField {
  id: number;
  field_name: string;
  crop_name: string;
  area_hectares: number;
  boundary: GeoJSON.GeoJsonObject | null;
  geometry_summary: {
    area_square_metres: number;
    area_hectares: number;
    area_acres: number;
    perimeter_metres: number;
    centroid: [number, number];
    bounds: [number, number, number, number];
  } | null;
}

export interface SatelliteAvailability {
  provider: string;
  configured: boolean;
  status: string;
  message: string;
}

export interface SatelliteVegetationClass {
  pixels?: number;
  percentage?: number;
}

export interface SatelliteObservation {
  id: number;
  field_id: number;
  acquisition_date: string;
  source: string;
  cloud_coverage_percent: number | null;
  spatial_resolution_m: number;
  statistics: {
    mean: number | null;
    minimum: number | null;
    maximum: number | null;
    median: number | null;
    standard_deviation: number | null;
    valid_pixels: number | null;
    total_pixels?: number | null;
    valid_pixel_percentage: number | null;
    vegetation_distribution: Record<string, SatelliteVegetationClass> | null;
    quality_note?: string;
  };
}

export interface SatelliteInsights {
  field_id: number;
  insights: Array<{
    type: string;
    severity: string;
    message: string;
    explanation: string;
    recommendation: string;
  }>;
  disclaimer: string;
}

export interface SatelliteDemo {
  mode: 'demo';
  synthetic: true;
  satellite_observation: false;
  acquisition_date: null;
  data_source: string;
  statistics: SatelliteObservation['statistics'];
  notice: string;
}
