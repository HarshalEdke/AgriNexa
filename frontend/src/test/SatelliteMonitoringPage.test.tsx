import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import App from '../App';
import {
  getAuthMe,
  getSatelliteDemo,
  getSatelliteFields,
  getSatelliteStatus,
} from '../api/client';

vi.mock('../api/client', async () => {
  const actual = await vi.importActual<typeof import('../api/client')>('../api/client');
  return {
    ...actual,
    getAuthMe: vi.fn(),
    getSatelliteDemo: vi.fn(),
    getSatelliteFields: vi.fn(),
    getSatelliteStatus: vi.fn(),
  };
});

describe('Satellite monitoring page', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  });

  it('requires authentication before showing private field data', () => {
    render(<App initialView="satellite" />);

    expect(screen.getByRole('heading', { name: /satellite farm health/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in to continue/i })).toBeInTheDocument();
    expect(getSatelliteFields).not.toHaveBeenCalled();
  });

  it('clearly shows provider unavailability without inventing fields or observations', async () => {
    localStorage.setItem('access_token', 'test-token');
    vi.mocked(getAuthMe).mockResolvedValue({ email: 'farmer@example.com' });
    vi.mocked(getSatelliteStatus).mockResolvedValue({
      provider: 'Copernicus Data Space Sentinel-2 L2A',
      configured: false,
      status: 'credentials_required',
      message: 'Configure Copernicus credentials to request real observations.',
    });
    vi.mocked(getSatelliteFields).mockResolvedValue([]);
    vi.mocked(getSatelliteDemo).mockResolvedValue({
      mode: 'demo',
      synthetic: true,
      satellite_observation: false,
      acquisition_date: null,
      data_source: 'Fixed synthetic reflectance values',
      statistics: {
        mean: 0.4,
        minimum: -0.1,
        maximum: 0.9,
        median: 0.4,
        standard_deviation: 0.3,
        valid_pixels: 17,
        total_pixels: 18,
        valid_pixel_percentage: 94.4,
        vegetation_distribution: null,
      },
      notice: 'Demonstration only; not satellite imagery.',
    });

    render(<App initialView="satellite" />);

    expect(await screen.findByText(/satellite data unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/register a field before monitoring/i)).toBeInTheDocument();
    expect(screen.queryByText(/mean ndvi/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /view synthetic ndvi calculation demo/i }));
    expect(await screen.findByText(/demo only — synthetic reflectance values/i)).toBeInTheDocument();
    expect(screen.getAllByText(/not satellite imagery/i)).toHaveLength(2);
  });

  it('routes into the satellite dashboard from the farm insight sidebar', () => {
    render(<App initialView="diagnose" />);
    fireEvent.click(screen.getByRole('button', { name: /farm insight — satellite farm health/i }));
    expect(screen.getByRole('heading', { name: /satellite farm health/i })).toBeInTheDocument();
  });
});
