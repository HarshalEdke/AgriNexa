import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  ApiError,
  generateIrrigationRecommendation,
  getIrrigationAnalytics,
  getIrrigationDashboard,
  submitIrrigationSensorReading,
} from '../api/client';
import { IrrigationDashboard, IrrigationAnalytics, IrrigationRecommendation } from '../types';
import { IrrigationPage } from '../pages/IrrigationPage';

vi.mock('../api/client', async () => {
  const actual = await vi.importActual<typeof import('../api/client')>('../api/client');
  return {
    ...actual,
    generateIrrigationRecommendation: vi.fn(),
    getIrrigationAnalytics: vi.fn(),
    getIrrigationDashboard: vi.fn(),
    submitIrrigationSensorReading: vi.fn(),
  };
});

const field = {
  id: 12,
  field_name: 'North plot',
  crop_name: 'Wheat',
  crop_variety: null,
  growth_stage: 'Mid season',
  sowing_date: null,
  crop_duration_days: null,
  root_depth_m: 0.6,
  kc: 1.15,
  kc_source: 'generic_fao_reference',
  soil_type: 'loamy',
  soil_moisture_percent: 18,
  moisture_source: 'simulated',
  moisture_updated_at: '2026-11-06T08:00:00Z',
  field_capacity_percent: 30,
  permanent_wilting_point_percent: 15,
  soil_water_holding_capacity_mm_per_m: null,
  location: 'Pune',
  latitude: null,
  longitude: null,
  area_hectares: 0.5,
  irrigation_method: 'drip' as const,
  irrigation_efficiency: 0.9,
  flow_rate_lpm: 30,
  water_source: 'well',
  last_irrigation_at: null,
  created_at: '2026-11-06T08:00:00Z',
};

const recommendation: IrrigationRecommendation = {
  id: 45,
  field_id: field.id,
  field_name: field.field_name,
  crop_name: field.crop_name,
  status: 'Required',
  recommended_date: '2026-11-06',
  recommended_time: '06:00',
  net_requirement_mm: 60,
  gross_requirement_mm: 66.67,
  required_water_litres: 333333,
  estimated_duration_minutes: 11111,
  recommended_method: 'drip',
  irrigation_efficiency: 0.9,
  et0_mm_day: null,
  etc_mm_day: null,
  effective_rainfall_mm: 0,
  soil_depletion_mm: 60,
  readily_available_water_mm: 45,
  estimated_water_saved_litres: 0,
  weather_source: 'unavailable',
  calculation_basis: 'Root-zone soil-water balance; ET0 unavailable',
  explanation: 'Root-zone depletion meets the readily available water threshold.',
  alerts: ['ET0 was unavailable.'],
  generated_at: '2026-11-06T08:00:00Z',
};

const dashboard: IrrigationDashboard = {
  total_fields: 1,
  fields_requiring_irrigation: 1,
  average_soil_moisture_percent: 18,
  estimated_water_requirement_litres: 333333,
  potential_water_savings_litres: 0,
  fields: [field],
  recommendations: [recommendation],
  schedules: [],
  history: [],
  alerts: [],
};

const analytics: IrrigationAnalytics = {
  water_used_litres: 0,
  potential_water_savings_litres: 0,
  recommendations_count: 1,
  completed_irrigations_count: 0,
  soil_moisture_trend: [],
  crop_water_demand: [],
  water_consumption: [],
  irrigation_history: [],
};

describe('Smart irrigation dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getIrrigationDashboard).mockResolvedValue(dashboard);
    vi.mocked(getIrrigationAnalytics).mockResolvedValue(analytics);
    vi.mocked(generateIrrigationRecommendation).mockResolvedValue(recommendation);
    vi.mocked(submitIrrigationSensorReading).mockResolvedValue({
      id: 2,
      field_id: field.id,
      soil_moisture_percent: 18,
      temperature_c: null,
      humidity_percent: null,
      source: 'simulated',
      device_id: 'demo',
      recorded_at: '2026-11-06T08:00:00Z',
    });
  });

  it('renders measured field metrics and recalculates through the API', async () => {
    render(<IrrigationPage onSignIn={vi.fn()} />);

    expect(await screen.findByRole('heading', { name: 'Smart irrigation' })).toBeInTheDocument();
    expect(screen.getAllByText('North plot').length).toBeGreaterThan(0);
    expect(screen.getAllByText('18.0%').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /recalculate/i }));
    await waitFor(() => {
      expect(generateIrrigationRecommendation).toHaveBeenCalledWith(field.id, undefined);
    });
  }, 15000);

  it('saves a clearly labeled simulated moisture reading', async () => {
    render(<IrrigationPage onSignIn={vi.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: /save simulated reading/i }));
    await waitFor(() => {
      expect(submitIrrigationSensorReading).toHaveBeenCalledWith(field.id, {
        soil_moisture_percent: field.soil_moisture_percent,
        source: 'simulated',
      });
    });
    expect(await screen.findByText(/simulated sensor reading saved/i)).toBeInTheDocument();
  });

  it('offers sign-in when the authenticated irrigation API rejects a guest', async () => {
    const onSignIn = vi.fn();
    vi.mocked(getIrrigationDashboard).mockRejectedValue(
      new ApiError(401, 'Authentication required or session expired. Please sign in.')
    );

    render(<IrrigationPage onSignIn={onSignIn} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Sign in' }));
    expect(onSignIn).toHaveBeenCalledOnce();
  });
});
