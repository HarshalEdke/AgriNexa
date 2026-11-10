import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import App from '../App';
import * as client from '../api/client';
import { ApiError } from '../api/client';
import { CropRecommendationResponse } from '../types';
import { BonusFeaturesSection } from '../components/crop/BonusFeaturesSection';
import { CropRecommendationPage, SOIL_TYPES, formatConfidence, getConfidencePercent } from '../pages/CropRecommendationPage';

vi.mock('../api/client', async () => {
  const actual = await vi.importActual<typeof import('../api/client')>('../api/client');
  return {
    ...actual,
    predictDisease: vi.fn(),
    recommendCrop: vi.fn(),
    getWeather: vi.fn(),
    getSeasonalClimate: vi.fn(),
    getIrrigationDashboard: vi.fn().mockRejectedValue(new Error('Irrigation data unavailable in test.')),
    getIrrigationAnalytics: vi.fn().mockRejectedValue(new Error('Irrigation data unavailable in test.')),
  };
});


const mockCropResponse: CropRecommendationResponse = {
  recommended_crop: 'Wheat',
  confidence: 0.925,
  confidence_level: 'High',
  recommendations: ['Wheat', 'Barley', 'Mustard'],
  top_k_recommendations: [
    { crop: 'Wheat', confidence: 0.925 },
    { crop: 'Barley', confidence: 0.052 },
    { crop: 'Mustard', confidence: 0.023 },
  ],
  explanation: 'High winter rainfall and alluvial soil texture create optimal growing conditions for Wheat.',
  model_version: 'cr-v1.0.0',
  input_features: {
    state: 'Gujarat',
    district: 'Ahmedabad',
    temperature: 28.5,
    humidity: 65.0,
    rainfall: 750.0,
    soil_type: 'alluvial',
    previous_crop: 'cotton',
  },
};

describe('Crop Recommendation Bonus Feature — Step 2 Layout and Navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.scrollTo = vi.fn();
  });

  it('renders the Bonus Features section on the home screen below How It Works', () => {
    render(<App initialView="diagnose" />);

    const howItWorksSection = screen.getByRole('region', { name: /how it works/i });
    expect(howItWorksSection).toBeInTheDocument();

    const bonusSection = screen.getByRole('region', { name: /bonus features/i });
    expect(bonusSection).toBeInTheDocument();

    expect(
      screen.getByRole('heading', { name: /bonus features/i, level: 2 })
    ).toBeInTheDocument();
  });

  it('renders all five farm insight cards in the section', () => {
    render(<BonusFeaturesSection onSelectCropRecommendation={vi.fn()} />);

    const bonusSection = screen.getByRole('region', { name: /bonus features/i });
    const cards = within(bonusSection).getAllByRole('region');
    expect(cards).toHaveLength(5);
  });

  it('displays all five farm insight titles', () => {
    render(<BonusFeaturesSection onSelectCropRecommendation={vi.fn()} />);

    [
      'Crop Recommendation',
      'Sustainability Score',
      'Weather Intelligence',
      'Smart Irrigation',
      'Satellite Farm Health',
    ].forEach((title) => {
      expect(screen.getByRole('heading', { name: title, level: 3 })).toBeInTheDocument();
    });
  });

  it('renders both feature cards active without coming soon badges', () => {
    render(<BonusFeaturesSection onSelectCropRecommendation={vi.fn()} />);

    expect(screen.queryByText(/ready to use/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/feature in development/i)).not.toBeInTheDocument();
  });

  it('renders Crop Recommendation CTA button which is active and interactive', () => {
    const handleSelectMock = vi.fn();
    render(<BonusFeaturesSection onSelectCropRecommendation={handleSelectMock} />);

    const ctaButton = screen.getByRole('button', { name: /try crop recommendation/i });
    expect(ctaButton).toBeInTheDocument();
    expect(ctaButton).toBeEnabled();

    fireEvent.click(ctaButton);
    expect(handleSelectMock).toHaveBeenCalledTimes(1);
  });

  it('renders interactive Sustainability Score CTA button and triggers navigation', () => {
    const handleSelectMock = vi.fn();
    render(
      <BonusFeaturesSection
        onSelectCropRecommendation={vi.fn()}
        onSelectSustainabilityScore={handleSelectMock}
      />
    );

    const ctaButton = screen.getByRole('button', { name: /open sustainability score/i });
    expect(ctaButton).toBeInTheDocument();
    expect(ctaButton).toBeEnabled();

    fireEvent.click(ctaButton);
    expect(handleSelectMock).toHaveBeenCalledTimes(1);
  });

  it('navigates from Home to Crop Recommendation form when clicking Try Crop Recommendation', () => {
    render(<App initialView="diagnose" />);

    expect(
      screen.getByRole('heading', { name: /plant disease diagnosis/i, level: 1 })
    ).toBeInTheDocument();

    const tryBtn = screen.getByRole('button', { name: /try crop recommendation/i });
    fireEvent.click(tryBtn);

    expect(
      screen.getByRole('heading', { name: 'Crop Recommendation', level: 1 })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /recommend crop/i })
    ).toBeInTheDocument();
  });

  it('navigates back to the Plant Diagnosis view when clicking Back to Plant Diagnosis', () => {
    render(<App initialView="diagnose" />);

    const tryBtn = screen.getByRole('button', { name: /try crop recommendation/i });
    fireEvent.click(tryBtn);

    const backBtn = screen.getByRole('button', { name: /back to plant diagnosis/i });
    fireEvent.click(backBtn);

    expect(
      screen.getByRole('heading', { name: /plant disease diagnosis/i, level: 1 })
    ).toBeInTheDocument();
  });

  it('navigates from Home to Sustainability Score form when clicking Open Sustainability Score', () => {
    render(<App initialView="diagnose" />);

    const sustainBtn = screen.getByRole('button', { name: /open sustainability score/i });
    fireEvent.click(sustainBtn);

    expect(
      screen.getByRole('heading', { name: /farm sustainability & water score/i, level: 1 })
    ).toBeInTheDocument();
  });

  it('opens Weather Intelligence from its Farm Insights card', async () => {
    render(<App initialView="diagnose" />);

    fireEvent.click(screen.getByRole('button', { name: /open weather intelligence/i }));

    expect(await screen.findByRole('heading', { name: /weather & farm intelligence/i })).toBeInTheDocument();
  });

  it('opens Smart Irrigation from its Farm Insights card', async () => {
    render(<App initialView="diagnose" />);

    fireEvent.click(screen.getByRole('button', { name: /open smart irrigation/i }));

    expect(window.location.hash).toBe('#irrigation');
    expect(await screen.findByRole('heading', { name: /smart irrigation/i, level: 1 })).toBeInTheDocument();
  });

  it('opens Satellite Farm Health from its Farm Insights card', () => {
    render(<App initialView="diagnose" />);

    fireEvent.click(screen.getByRole('button', { name: /open satellite farm health/i }));

    expect(
      screen.getByRole('heading', { name: /satellite farm health/i })
    ).toBeInTheDocument();
  });

  it('navigates back to the Landing view when clicking the Header logo from Crop Recommendation', () => {
    render(<App initialView="diagnose" />);

    const tryBtn = screen.getByRole('button', { name: /try crop recommendation/i });
    fireEvent.click(tryBtn);

    const brandHomeLink = screen.getByLabelText(/agrinexa ai — home/i);
    fireEvent.click(brandHomeLink);

    expect(
      screen.getByRole('heading', { name: /a smarter way to care for your crops/i, level: 1 })
    ).toBeInTheDocument();
  });
});

describe('Crop Recommendation Form UI — Step 3 Fields and Validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Crop Recommendation page with description and header', () => {
    render(<CropRecommendationPage onBack={vi.fn()} />);

    expect(
      screen.getByRole('heading', { name: 'Crop Recommendation', level: 1 })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/enter your field conditions to receive a crop recommendation based on your soil and environment/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /back to plant diagnosis/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /recommend crop/i })
    ).toBeInTheDocument();
  });

  it('renders all seven required form fields with proper labels and units', () => {
    render(<CropRecommendationPage onBack={vi.fn()} />);

    // Section 1: Location
    expect(screen.getByLabelText(/state/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/district/i)).toBeInTheDocument();

    // Section 2: Environmental Conditions
    expect(screen.getByLabelText(/temperature/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/humidity/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/rainfall/i)).toBeInTheDocument();
    expect(screen.getByText('°C')).toBeInTheDocument();
    expect(screen.getByText('%')).toBeInTheDocument();
    expect(screen.getByText('mm')).toBeInTheDocument();

    // Section 3: Farming Context
    expect(screen.getByLabelText(/soil type/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/previous crop/i)).toBeInTheDocument();
    expect(
      screen.getByText(/enter the crop that was previously harvested from this soil plot/i)
    ).toBeInTheDocument();
  });

  it('contains backend-supported soil type options in the dropdown', () => {
    render(<CropRecommendationPage onBack={vi.fn()} />);

    const soilSelect = screen.getByLabelText(/soil type/i) as HTMLSelectElement;
    expect(soilSelect).toBeInTheDocument();

    const expectedValues = [
      'alluvial',
      'black',
      'red',
      'laterite',
      'clay',
      'sandy',
      'loamy',
      'peaty',
      'saline',
      'arid',
      'unknown',
    ];

    expectedValues.forEach((val) => {
      const option = within(soilSelect).getByRole('option', {
        name: SOIL_TYPES.find((st) => st.value === val)!.label,
      });
      expect(option).toBeInTheDocument();
      expect((option as HTMLOptionElement).value).toBe(val);
    });
  });

  it('strictly ensures obsolete fields (nitrogen, phosphorus, potassium, ph) are absent', () => {
    render(<CropRecommendationPage onBack={vi.fn()} />);

    expect(screen.queryByLabelText(/nitrogen/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/phosphorus/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/potassium/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/\bph\b/i)).not.toBeInTheDocument();

    expect(screen.queryByPlaceholderText(/nitrogen/i)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/phosphorus/i)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/potassium/i)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/\bph\b/i)).not.toBeInTheDocument();
  });

  it('validates empty inputs and blocks form submission', () => {
    const onSubmitMock = vi.fn();
    render(<CropRecommendationPage onBack={vi.fn()} onSubmit={onSubmitMock} />);

    const submitBtn = screen.getByRole('button', { name: /recommend crop/i });
    fireEvent.click(submitBtn);

    // Form submission blocked
    expect(onSubmitMock).not.toHaveBeenCalled();
    expect(client.recommendCrop).not.toHaveBeenCalled();

    // Alert banner shown
    expect(screen.getByText('Incomplete Form Submission')).toBeInTheDocument();
    expect(screen.getByText(/please correct the highlighted fields before submitting/i)).toBeInTheDocument();

    // Field-level error messages
    expect(screen.getByText('State is required.')).toBeInTheDocument();
    expect(screen.getByText('District is required.')).toBeInTheDocument();
    expect(screen.getByText('Temperature is required.')).toBeInTheDocument();
    expect(screen.getByText('Humidity is required.')).toBeInTheDocument();
    expect(screen.getByText('Rainfall is required.')).toBeInTheDocument();
    expect(screen.getByText('Soil type is required.')).toBeInTheDocument();
    expect(screen.getByText('Previous crop is required.')).toBeInTheDocument();
  });

  it('validates temperature range (-10°C to 60°C)', () => {
    const onSubmitMock = vi.fn();
    render(<CropRecommendationPage onBack={vi.fn()} onSubmit={onSubmitMock} />);

    const tempInput = screen.getByLabelText(/temperature/i);
    const submitBtn = screen.getByRole('button', { name: /recommend crop/i });

    // Below range
    fireEvent.change(tempInput, { target: { value: '-15' } });
    fireEvent.click(submitBtn);
    expect(screen.getByText('Temperature must be between -10°C and 60°C.')).toBeInTheDocument();
    expect(onSubmitMock).not.toHaveBeenCalled();

    // Above range
    fireEvent.change(tempInput, { target: { value: '75' } });
    fireEvent.click(submitBtn);
    expect(screen.getByText('Temperature must be between -10°C and 60°C.')).toBeInTheDocument();
    expect(onSubmitMock).not.toHaveBeenCalled();
  });

  it('validates humidity range (0% to 100%)', () => {
    const onSubmitMock = vi.fn();
    render(<CropRecommendationPage onBack={vi.fn()} onSubmit={onSubmitMock} />);

    const humInput = screen.getByLabelText(/humidity/i);
    const submitBtn = screen.getByRole('button', { name: /recommend crop/i });

    // Below range
    fireEvent.change(humInput, { target: { value: '-5' } });
    fireEvent.click(submitBtn);
    expect(screen.getByText('Humidity must be between 0% and 100%.')).toBeInTheDocument();
    expect(onSubmitMock).not.toHaveBeenCalled();

    // Above range
    fireEvent.change(humInput, { target: { value: '110' } });
    fireEvent.click(submitBtn);
    expect(screen.getByText('Humidity must be between 0% and 100%.')).toBeInTheDocument();
    expect(onSubmitMock).not.toHaveBeenCalled();
  });

  it('validates rainfall range (0 mm to 5000 mm)', () => {
    const onSubmitMock = vi.fn();
    render(<CropRecommendationPage onBack={vi.fn()} onSubmit={onSubmitMock} />);

    const rainInput = screen.getByLabelText(/rainfall/i);
    const submitBtn = screen.getByRole('button', { name: /recommend crop/i });

    // Below range
    fireEvent.change(rainInput, { target: { value: '-1' } });
    fireEvent.click(submitBtn);
    expect(screen.getByText('Rainfall must be between 0 mm and 5000 mm.')).toBeInTheDocument();
    expect(onSubmitMock).not.toHaveBeenCalled();

    // Above range
    fireEvent.change(rainInput, { target: { value: '6000' } });
    fireEvent.click(submitBtn);
    expect(screen.getByText('Rainfall must be between 0 mm and 5000 mm.')).toBeInTheDocument();
    expect(onSubmitMock).not.toHaveBeenCalled();
  });
});

describe('Crop Recommendation API Integration — Step 4', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls recommendCrop with exact 7-field payload and numeric conversions on valid submit', async () => {
    vi.mocked(client.recommendCrop).mockResolvedValueOnce(mockCropResponse);

    render(<CropRecommendationPage onBack={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/state/i), { target: { value: 'Gujarat' } });
    fireEvent.change(screen.getByLabelText(/district/i), { target: { value: 'Ahmedabad' } });
    fireEvent.change(screen.getByLabelText(/temperature/i), { target: { value: '28.5' } });
    fireEvent.change(screen.getByLabelText(/humidity/i), { target: { value: '65.0' } });
    fireEvent.change(screen.getByLabelText(/rainfall/i), { target: { value: '750.0' } });
    fireEvent.change(screen.getByLabelText(/soil type/i), { target: { value: 'alluvial' } });
    fireEvent.change(screen.getByLabelText(/previous crop/i), { target: { value: 'cotton' } });

    const submitBtn = screen.getByRole('button', { name: /recommend crop/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(client.recommendCrop).toHaveBeenCalledTimes(1);
    });

    const sentPayload = vi.mocked(client.recommendCrop).mock.calls[0][0];

    // Assert payload fields (7 model features + season context)
    expect(sentPayload).toEqual({
      state: 'Gujarat',
      district: 'Ahmedabad',
      temperature: 28.5,
      humidity: 65,
      rainfall: 750,
      soil_type: 'alluvial',
      previous_crop: 'cotton',
      season: 'Kharif',
    });

    // Assert numeric fields are numbers
    expect(typeof sentPayload.temperature).toBe('number');
    expect(typeof sentPayload.humidity).toBe('number');
    expect(typeof sentPayload.rainfall).toBe('number');

    // Assert strictly no obsolete fields
    expect(sentPayload).not.toHaveProperty('nitrogen');
    expect(sentPayload).not.toHaveProperty('phosphorus');
    expect(sentPayload).not.toHaveProperty('potassium');
    expect(sentPayload).not.toHaveProperty('ph');
    expect(Object.keys(sentPayload)).toHaveLength(8);
  });

  it('displays loading state during submission and prevents duplicate submissions', async () => {
    let resolvePromise: (value: CropRecommendationResponse) => void;
    const slowPromise = new Promise<CropRecommendationResponse>((resolve) => {
      resolvePromise = resolve;
    });
    vi.mocked(client.recommendCrop).mockReturnValueOnce(slowPromise);

    render(<CropRecommendationPage onBack={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/state/i), { target: { value: 'Gujarat' } });
    fireEvent.change(screen.getByLabelText(/district/i), { target: { value: 'Ahmedabad' } });
    fireEvent.change(screen.getByLabelText(/temperature/i), { target: { value: '28.5' } });
    fireEvent.change(screen.getByLabelText(/humidity/i), { target: { value: '65.0' } });
    fireEvent.change(screen.getByLabelText(/rainfall/i), { target: { value: '750.0' } });
    fireEvent.change(screen.getByLabelText(/soil type/i), { target: { value: 'alluvial' } });
    fireEvent.change(screen.getByLabelText(/previous crop/i), { target: { value: 'cotton' } });

    const submitBtn = screen.getByRole('button', { name: /recommend crop/i });
    fireEvent.click(submitBtn);

    // While submitting: button is disabled and shows loading text
    expect(screen.getByText(/analyzing conditions/i)).toBeInTheDocument();
    expect(submitBtn).toBeDisabled();

    // Attempt second click while in flight
    fireEvent.click(submitBtn);
    expect(client.recommendCrop).toHaveBeenCalledTimes(1);

    // Resolve promise
    resolvePromise!(mockCropResponse);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Wheat', level: 2 })).toBeInTheDocument();
    });
  });

  it('renders successful recommendation results from the real API response', async () => {
    vi.mocked(client.recommendCrop).mockResolvedValueOnce(mockCropResponse);

    render(<CropRecommendationPage onBack={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/state/i), { target: { value: 'Gujarat' } });
    fireEvent.change(screen.getByLabelText(/district/i), { target: { value: 'Ahmedabad' } });
    fireEvent.change(screen.getByLabelText(/temperature/i), { target: { value: '28.5' } });
    fireEvent.change(screen.getByLabelText(/humidity/i), { target: { value: '65.0' } });
    fireEvent.change(screen.getByLabelText(/rainfall/i), { target: { value: '750.0' } });
    fireEvent.change(screen.getByLabelText(/soil type/i), { target: { value: 'alluvial' } });
    fireEvent.change(screen.getByLabelText(/previous crop/i), { target: { value: 'cotton' } });

    fireEvent.click(screen.getByRole('button', { name: /recommend crop/i }));

    // Verify result section renders
    const resultSection = await screen.findByRole('region', { name: /crop recommendation result/i });
    expect(resultSection).toBeInTheDocument();

    // Recommended crop
    expect(within(resultSection).getByRole('heading', { name: 'Wheat', level: 2 })).toBeInTheDocument();

    // Confidence score and level
    expect(within(resultSection).getAllByText('92.5%').length).toBeGreaterThanOrEqual(1);
    expect(within(resultSection).getByText(/confidence level: high/i)).toBeInTheDocument();

    // Explanation
    expect(within(resultSection).getByText(mockCropResponse.explanation!)).toBeInTheDocument();

    // Ranked alternatives
    expect(within(resultSection).getAllByText('Barley').length).toBeGreaterThanOrEqual(1);
    expect(within(resultSection).getByText('5.2%')).toBeInTheDocument();
    expect(within(resultSection).getAllByText('Mustard').length).toBeGreaterThanOrEqual(1);
    expect(within(resultSection).getByText('2.3%')).toBeInTheDocument();

    // Model version
    expect(within(resultSection).getByText(/model version: cr-v1.0.0/i)).toBeInTheDocument();

    // Form inputs remain preserved with entered values
    expect((screen.getByLabelText(/state/i) as HTMLInputElement).value).toBe('Gujarat');
    expect((screen.getByLabelText(/district/i) as HTMLInputElement).value).toBe('Ahmedabad');
    expect((screen.getByLabelText(/temperature/i) as HTMLInputElement).value).toBe('28.5');
  });

  it('handles 503 service unavailable error, displays friendly message, and preserves entered values', async () => {
    vi.mocked(client.recommendCrop).mockRejectedValueOnce(
      new ApiError(503, 'Model unavailable')
    );

    render(<CropRecommendationPage onBack={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/state/i), { target: { value: 'Punjab' } });
    fireEvent.change(screen.getByLabelText(/district/i), { target: { value: 'Ludhiana' } });
    fireEvent.change(screen.getByLabelText(/temperature/i), { target: { value: '22' } });
    fireEvent.change(screen.getByLabelText(/humidity/i), { target: { value: '70' } });
    fireEvent.change(screen.getByLabelText(/rainfall/i), { target: { value: '600' } });
    fireEvent.change(screen.getByLabelText(/soil type/i), { target: { value: 'loamy' } });
    fireEvent.change(screen.getByLabelText(/previous crop/i), { target: { value: 'rice' } });

    fireEvent.click(screen.getByRole('button', { name: /recommend crop/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/the crop recommendation service is temporarily offline \(503\)/i)
      ).toBeInTheDocument();
    });

    // Verify entered values are preserved
    expect((screen.getByLabelText(/state/i) as HTMLInputElement).value).toBe('Punjab');
    expect((screen.getByLabelText(/district/i) as HTMLInputElement).value).toBe('Ludhiana');
    expect((screen.getByLabelText(/previous crop/i) as HTMLInputElement).value).toBe('rice');

    // No fake recommendation rendered
    expect(screen.queryByRole('region', { name: /crop recommendation result/i })).not.toBeInTheDocument();
  });

  it('handles 400 and 422 validation errors from backend, displaying server message', async () => {
    vi.mocked(client.recommendCrop).mockRejectedValueOnce(
      new ApiError(422, 'Invalid combination of rainfall and temperature for district.')
    );

    render(<CropRecommendationPage onBack={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/state/i), { target: { value: 'Rajasthan' } });
    fireEvent.change(screen.getByLabelText(/district/i), { target: { value: 'Jaipur' } });
    fireEvent.change(screen.getByLabelText(/temperature/i), { target: { value: '35' } });
    fireEvent.change(screen.getByLabelText(/humidity/i), { target: { value: '40' } });
    fireEvent.change(screen.getByLabelText(/rainfall/i), { target: { value: '300' } });
    fireEvent.change(screen.getByLabelText(/soil type/i), { target: { value: 'sandy' } });
    fireEvent.change(screen.getByLabelText(/previous crop/i), { target: { value: 'millet' } });

    fireEvent.click(screen.getByRole('button', { name: /recommend crop/i }));

    await waitFor(() => {
      expect(
        screen.getByText('Invalid combination of rainfall and temperature for district.')
      ).toBeInTheDocument();
    });

    // Values preserved
    expect((screen.getByLabelText(/state/i) as HTMLInputElement).value).toBe('Rajasthan');
  });

  it('allows user to adjust conditions and submit again', async () => {
    vi.mocked(client.recommendCrop)
      .mockRejectedValueOnce(new ApiError(500, 'Internal Server Error'))
      .mockResolvedValueOnce(mockCropResponse);

    render(<CropRecommendationPage onBack={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/state/i), { target: { value: 'Gujarat' } });
    fireEvent.change(screen.getByLabelText(/district/i), { target: { value: 'Ahmedabad' } });
    fireEvent.change(screen.getByLabelText(/temperature/i), { target: { value: '28' } });
    fireEvent.change(screen.getByLabelText(/humidity/i), { target: { value: '65' } });
    fireEvent.change(screen.getByLabelText(/rainfall/i), { target: { value: '750' } });
    fireEvent.change(screen.getByLabelText(/soil type/i), { target: { value: 'alluvial' } });
    fireEvent.change(screen.getByLabelText(/previous crop/i), { target: { value: 'cotton' } });

    // First attempt -> fails with 500
    fireEvent.click(screen.getByRole('button', { name: /recommend crop/i }));

    await waitFor(() => {
      expect(screen.getByText(/a server error occurred while processing recommendations/i)).toBeInTheDocument();
    });

    // Modify a value and retry
    fireEvent.change(screen.getByLabelText(/temperature/i), { target: { value: '29' } });
    fireEvent.click(screen.getByRole('button', { name: /recommend crop/i }));

    // Second attempt succeeds
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Wheat', level: 2 })).toBeInTheDocument();
    });
    expect(client.recommendCrop).toHaveBeenCalledTimes(2);
  });

  it('handles response with empty optional arrays and missing explanation safely', async () => {
    const minimalResponse: CropRecommendationResponse = {
      recommended_crop: 'Mustard',
      confidence: 0.88,
      confidence_level: 'Medium',
      recommendations: [],
      top_k_recommendations: [],
      explanation: '',
      model_version: 'cr-v1.0.0',
      input_features: {},
    };

    vi.mocked(client.recommendCrop).mockResolvedValueOnce(minimalResponse);

    render(<CropRecommendationPage onBack={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/state/i), { target: { value: 'Haryana' } });
    fireEvent.change(screen.getByLabelText(/district/i), { target: { value: 'Hisar' } });
    fireEvent.change(screen.getByLabelText(/temperature/i), { target: { value: '25' } });
    fireEvent.change(screen.getByLabelText(/humidity/i), { target: { value: '55' } });
    fireEvent.change(screen.getByLabelText(/rainfall/i), { target: { value: '450' } });
    fireEvent.change(screen.getByLabelText(/soil type/i), { target: { value: 'sandy' } });
    fireEvent.change(screen.getByLabelText(/previous crop/i), { target: { value: 'wheat' } });

    fireEvent.click(screen.getByRole('button', { name: /recommend crop/i }));

    const resultSection = await screen.findByRole('region', { name: /crop recommendation result/i });
    expect(resultSection).toBeInTheDocument();

    // Recommended crop renders
    expect(within(resultSection).getByRole('heading', { name: 'Mustard', level: 2 })).toBeInTheDocument();
    expect(within(resultSection).getByText('88.0%')).toBeInTheDocument();

    // Blank explanation and empty arrays do not render unnecessary empty containers
    expect(within(resultSection).queryByRole('heading', { name: /agronomic explanation/i })).not.toBeInTheDocument();
    expect(within(resultSection).queryByRole('heading', { name: /ranked crop alternatives/i })).not.toBeInTheDocument();
    expect(within(resultSection).queryByRole('heading', { name: /other suitable crops/i })).not.toBeInTheDocument();
  });

  it('formats edge-case confidence values (0, 1, whole percentages, and invalid) correctly', () => {
    expect(formatConfidence(0)).toBe('0.0%');
    expect(formatConfidence(1)).toBe('100.0%');
    expect(formatConfidence(0.5)).toBe('50.0%');
    expect(formatConfidence(85.4)).toBe('85.4%');
    expect(formatConfidence(null)).toBe('N/A');
    expect(formatConfidence(undefined)).toBe('N/A');
    expect(formatConfidence(NaN)).toBe('N/A');

    expect(getConfidencePercent(0)).toBe(0);
    expect(getConfidencePercent(1)).toBe(100);
    expect(getConfidencePercent(0.75)).toBe(75);
    expect(getConfidencePercent(75)).toBe(75);
    expect(getConfidencePercent(null)).toBe(0);
  });

  it('allows re-submission and updates results after a prior successful recommendation', async () => {
    vi.mocked(client.recommendCrop)
      .mockResolvedValueOnce(mockCropResponse)
      .mockResolvedValueOnce({
        ...mockCropResponse,
        recommended_crop: 'Barley',
        confidence: 0.95,
      });

    render(<CropRecommendationPage onBack={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/state/i), { target: { value: 'Gujarat' } });
    fireEvent.change(screen.getByLabelText(/district/i), { target: { value: 'Ahmedabad' } });
    fireEvent.change(screen.getByLabelText(/temperature/i), { target: { value: '28' } });
    fireEvent.change(screen.getByLabelText(/humidity/i), { target: { value: '65' } });
    fireEvent.change(screen.getByLabelText(/rainfall/i), { target: { value: '750' } });
    fireEvent.change(screen.getByLabelText(/soil type/i), { target: { value: 'alluvial' } });
    fireEvent.change(screen.getByLabelText(/previous crop/i), { target: { value: 'cotton' } });

    // First submit
    fireEvent.click(screen.getByRole('button', { name: /recommend crop/i }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Wheat', level: 2 })).toBeInTheDocument();
    });

    // Adjust conditions and re-submit
    fireEvent.change(screen.getByLabelText(/temperature/i), { target: { value: '18' } });
    fireEvent.click(screen.getByRole('button', { name: /recommend crop/i }));

    // Second submit succeeds with updated crop
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Barley', level: 2 })).toBeInTheDocument();
    });
    expect(client.recommendCrop).toHaveBeenCalledTimes(2);
  });

  it('handles network connection failure with a farmer-friendly message', async () => {
    vi.mocked(client.recommendCrop).mockRejectedValueOnce(
      new TypeError('Failed to fetch')
    );

    render(<CropRecommendationPage onBack={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/state/i), { target: { value: 'Punjab' } });
    fireEvent.change(screen.getByLabelText(/district/i), { target: { value: 'Ludhiana' } });
    fireEvent.change(screen.getByLabelText(/temperature/i), { target: { value: '22' } });
    fireEvent.change(screen.getByLabelText(/humidity/i), { target: { value: '70' } });
    fireEvent.change(screen.getByLabelText(/rainfall/i), { target: { value: '600' } });
    fireEvent.change(screen.getByLabelText(/soil type/i), { target: { value: 'loamy' } });
    fireEvent.change(screen.getByLabelText(/previous crop/i), { target: { value: 'rice' } });

    fireEvent.click(screen.getByRole('button', { name: /recommend crop/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/network error: unable to connect to agrinexa ai services/i)
      ).toBeInTheDocument();
    });

    // Form inputs remain preserved
    expect((screen.getByLabelText(/state/i) as HTMLInputElement).value).toBe('Punjab');
  });

  it('correctly renders real backend response contract with probability and recommendations array of objects', async () => {
    const realApiResponse: CropRecommendationResponse = {
      recommended_crop: 'urad',
      confidence: 0.2206,
      confidence_level: 'Moderate Confidence',
      recommendations: [
        { crop: 'urad', probability: 0.2206, confidence_tier: 'Medium' },
        { crop: 'moong', probability: 0.2154, confidence_tier: 'Medium' },
        { crop: 'wheat', probability: 0.1339, confidence_tier: 'Caution / Low' },
      ],
      top_k_recommendations: [
        { crop: 'urad', probability: 0.2206, confidence_tier: 'Medium' },
        { crop: 'moong', probability: 0.2154, confidence_tier: 'Medium' },
        { crop: 'wheat', probability: 0.1339, confidence_tier: 'Caution / Low' },
      ],
      explanation: "'Urad' is recommended for Ludhiana, Punjab under Alluvial soil with prevailing conditions.",
      model_version: 'v2.0.0',
      input_features: {
        state: 'Punjab',
        district: 'Ludhiana',
        soil_type: 'Alluvial',
        previous_crop: 'wheat',
        temperature: 28,
        humidity: 65,
        rainfall: 120,
      },
    };

    vi.mocked(client.recommendCrop).mockResolvedValueOnce(realApiResponse);

    render(<CropRecommendationPage onBack={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/state/i), { target: { value: 'Punjab' } });
    fireEvent.change(screen.getByLabelText(/district/i), { target: { value: 'Ludhiana' } });
    fireEvent.change(screen.getByLabelText(/temperature/i), { target: { value: '28' } });
    fireEvent.change(screen.getByLabelText(/humidity/i), { target: { value: '65' } });
    fireEvent.change(screen.getByLabelText(/rainfall/i), { target: { value: '120' } });
    fireEvent.change(screen.getByLabelText(/soil type/i), { target: { value: 'alluvial' } });
    fireEvent.change(screen.getByLabelText(/previous crop/i), { target: { value: 'Wheat' } });

    fireEvent.click(screen.getByRole('button', { name: /recommend crop/i }));

    const resultSection = await screen.findByRole('region', { name: /crop recommendation result/i });
    expect(resultSection).toBeInTheDocument();
    expect(within(resultSection).getByRole('heading', { name: /urad/i, level: 2 })).toBeInTheDocument();
    expect(within(resultSection).getAllByText(/22\.1%/).length).toBeGreaterThanOrEqual(1);
    expect(within(resultSection).getByText(/ranked crop alternatives/i)).toBeInTheDocument();
    expect(within(resultSection).getByText(/other suitable crops/i)).toBeInTheDocument();
    expect(within(resultSection).getByText(realApiResponse.explanation!)).toBeInTheDocument();
  });
});

describe('Crop Recommendation — Weather Intelligence Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the Fetch Weather & Climate button in the Location section', () => {
    render(<CropRecommendationPage onBack={vi.fn()} />);

    const fetchWeatherBtn = screen.getByRole('button', { name: /auto-fetch weather and climate data for location/i });
    expect(fetchWeatherBtn).toBeInTheDocument();
    expect(fetchWeatherBtn).toBeEnabled();
  });

  it('prompts user if clicking Fetch Weather without entering District or State', async () => {
    render(<CropRecommendationPage onBack={vi.fn()} />);

    const fetchWeatherBtn = screen.getByRole('button', { name: /auto-fetch weather and climate data for location/i });
    fireEvent.click(fetchWeatherBtn);

    expect(await screen.findByText(/please enter a district or state/i)).toBeInTheDocument();
    expect(client.getWeather).not.toHaveBeenCalled();
  });

  it('fetches weather, auto-populates seasonal climate normals, and displays live advisory card', async () => {
    const mockWeatherData = {
      location: {
        name: 'Ahmedabad',
        country: 'India',
        latitude: 23.02,
        longitude: 72.57,
        state: 'Gujarat',
        district: 'Ahmedabad',
      },
      current: {
        temperature: 31.5,
        humidity: 62.0,
        wind_speed: 14.2,
        weather_code: 1,
        condition: 'Mainly clear',
        precipitation: 0.0,
      },
      daily: {
        temp_min: 22.0,
        temp_max: 35.0,
        precipitation_sum: 12.0,
        precipitation_probability: 25.0,
      },
      climate: {
        season: 'Kharif',
        region: 'West',
        temperature_mean: 31.0,
        humidity_mean: 72.0,
        rainfall_normal: 546.0,
        soil_type_default: 'alluvial',
      },
      advisories: [
        'Rain is expected today. Postpone irrigation where possible.',
        'Weather conditions are generally suitable for routine farm activities.',
      ],
      timestamp: '2026-09-13T12:00:00Z',
    };

    vi.mocked(client.getWeather).mockResolvedValueOnce(mockWeatherData);

    render(<CropRecommendationPage onBack={vi.fn()} />);

    const districtInput = screen.getByLabelText(/district/i) as HTMLInputElement;
    fireEvent.change(districtInput, { target: { value: 'Ahmedabad' } });

    const fetchWeatherBtn = screen.getByRole('button', { name: /auto-fetch weather and climate data for location/i });
    fireEvent.click(fetchWeatherBtn);

    await waitFor(() => {
      expect(client.getWeather).toHaveBeenCalledWith('Ahmedabad');
    });

    const weatherCard = await screen.findByRole('region', { name: /live weather intelligence/i });
    expect(weatherCard).toBeInTheDocument();
    expect(within(weatherCard).getByText(/Live Weather • Ahmedabad, India/i)).toBeInTheDocument();
    expect(within(weatherCard).getByText(/31.5°C/)).toBeInTheDocument();
    expect(within(weatherCard).getByText(/62%/)).toBeInTheDocument();
    expect(within(weatherCard).getByText(/12 mm/)).toBeInTheDocument();
    expect(within(weatherCard).getByText(/Rain is expected today/i)).toBeInTheDocument();
    expect(within(weatherCard).getByText(/Seasonal Climate Normals Applied to Crop Model/i)).toBeInTheDocument();

    const tempInput = screen.getByLabelText(/temperature/i) as HTMLInputElement;
    const humInput = screen.getByLabelText(/humidity/i) as HTMLInputElement;
    const rainInput = screen.getByLabelText(/rainfall/i) as HTMLInputElement;

    // Environmental fields receive verified seasonal climate normals
    expect(tempInput.value).toBe('31');
    expect(humInput.value).toBe('72');
    expect(rainInput.value).toBe('546');
  });

  it('displays graceful error message when weather service fails without breaking form', async () => {
    vi.mocked(client.getWeather).mockRejectedValueOnce(
      new ApiError(503, 'Weather service is temporarily unavailable (503).')
    );

    render(<CropRecommendationPage onBack={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/district/i), { target: { value: 'RemoteVillage' } });

    const fetchWeatherBtn = screen.getByRole('button', { name: /auto-fetch weather and climate data for location/i });
    fireEvent.click(fetchWeatherBtn);

    expect(await screen.findByText(/weather service is temporarily unavailable/i)).toBeInTheDocument();

    // Farmer can still type manual temperature
    const tempInput = screen.getByLabelText(/temperature/i);
    fireEvent.change(tempInput, { target: { value: '30' } });
    expect((tempInput as HTMLInputElement).value).toBe('30');
  });

  it('updates seasonal climate values when farmer explicitly changes the crop season', async () => {
    const mockRabiClimate = {
      season: 'Rabi',
      region: 'West',
      temperature_mean: 22.0,
      humidity_mean: 45.0,
      rainfall_normal: 23.4,
      soil_type_default: 'alluvial',
    };

    vi.mocked(client.getSeasonalClimate).mockResolvedValueOnce(mockRabiClimate);

    render(<CropRecommendationPage onBack={vi.fn()} />);

    // Enter Gujarat state
    fireEvent.change(screen.getByLabelText(/state/i), { target: { value: 'Gujarat' } });
    fireEvent.change(screen.getByLabelText(/district/i), { target: { value: 'Ahmedabad' } });

    // Explicitly select Rabi season
    const seasonSelect = screen.getByLabelText(/target crop season/i);
    fireEvent.change(seasonSelect, { target: { value: 'Rabi' } });

    await waitFor(() => {
      expect(client.getSeasonalClimate).toHaveBeenCalledWith('Gujarat', 'Ahmedabad', 'Rabi');
    });

    const tempInput = screen.getByLabelText(/temperature/i) as HTMLInputElement;
    const humInput = screen.getByLabelText(/humidity/i) as HTMLInputElement;
    const rainInput = screen.getByLabelText(/rainfall/i) as HTMLInputElement;

    // Environmental fields receive verified Rabi seasonal climate normals (22°C, 45%, 23.4mm)
    expect(tempInput.value).toBe('22');
    expect(humInput.value).toBe('45');
    expect(rainInput.value).toBe('23.4');
  });
});


describe('Crop Recommendation — Incremental Completion Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.scrollTo = vi.fn();
  });

  it('navigates directly to crop recommendation from the header navigation as a guest', () => {
    render(<App initialView="diagnose" />);

    // Click Crop Recommendation button in desktop header nav
    const cropNavButtons = screen.getAllByRole('button', { name: /crop recommendation/i });
    expect(cropNavButtons.length).toBeGreaterThan(0);
    fireEvent.click(cropNavButtons[0]);

    // Verifies the page is rendered without any authentication modal or redirect
    expect(
      screen.getByRole('heading', { name: /^crop recommendation$/i, level: 1 })
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('validates required fields and shows user-friendly validation messages', () => {
    render(<CropRecommendationPage onBack={vi.fn()} />);

    // Click submit on empty form
    fireEvent.click(screen.getByRole('button', { name: /recommend crop/i }));

    expect(screen.getByText(/incomplete form submission/i)).toBeInTheDocument();
    expect(screen.getByText(/please correct the highlighted fields before submitting/i)).toBeInTheDocument();
    expect(screen.getByText(/state is required/i)).toBeInTheDocument();
    expect(screen.getByText(/district is required/i)).toBeInTheDocument();
    expect(screen.getByText(/temperature is required/i)).toBeInTheDocument();
    expect(screen.getByText(/humidity is required/i)).toBeInTheDocument();
    expect(screen.getByText(/rainfall is required/i)).toBeInTheDocument();
    expect(screen.getByText(/soil type is required/i)).toBeInTheDocument();
    expect(screen.getByText(/previous crop is required/i)).toBeInTheDocument();
  });

  it('validates out-of-range numeric fields', () => {
    render(<CropRecommendationPage onBack={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/temperature/i), { target: { value: '99' } });
    fireEvent.change(screen.getByLabelText(/humidity/i), { target: { value: '150' } });
    fireEvent.change(screen.getByLabelText(/rainfall/i), { target: { value: '6000' } });

    fireEvent.click(screen.getByRole('button', { name: /recommend crop/i }));

    expect(screen.getByText(/temperature must be between -10°c and 60°c/i)).toBeInTheDocument();
    expect(screen.getByText(/humidity must be between 0% and 100%/i)).toBeInTheDocument();
    expect(screen.getByText(/rainfall must be between 0 mm and 5000 mm/i)).toBeInTheDocument();
  });

  it('submits valid request payload and displays loading state before success', async () => {
    let resolvePromise: (val: any) => void = () => {};
    const pendingPromise = new Promise((resolve) => {
      resolvePromise = resolve;
    });
    vi.mocked(client.recommendCrop).mockReturnValueOnce(pendingPromise as any);

    render(<CropRecommendationPage onBack={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/state/i), { target: { value: 'Gujarat' } });
    fireEvent.change(screen.getByLabelText(/district/i), { target: { value: 'Ahmedabad' } });
    fireEvent.change(screen.getByLabelText(/temperature/i), { target: { value: '28.5' } });
    fireEvent.change(screen.getByLabelText(/humidity/i), { target: { value: '65' } });
    fireEvent.change(screen.getByLabelText(/rainfall/i), { target: { value: '750' } });
    fireEvent.change(screen.getByLabelText(/soil type/i), { target: { value: 'alluvial' } });
    fireEvent.change(screen.getByLabelText(/previous crop/i), { target: { value: 'cotton' } });

    const submitBtn = screen.getByRole('button', { name: /recommend crop/i });
    fireEvent.click(submitBtn);

    // Verify loading state
    expect(screen.getByText(/analyzing conditions\.\.\./i)).toBeInTheDocument();
    expect(screen.getByLabelText(/state/i)).toBeDisabled();

    // Verify exact 7-field backend payload
    expect(client.recommendCrop).toHaveBeenCalledWith({
      state: 'Gujarat',
      district: 'Ahmedabad',
      temperature: 28.5,
      humidity: 65,
      rainfall: 750,
      soil_type: 'alluvial',
      previous_crop: 'cotton',
      season: 'Kharif',
    });

    // Resolve API call
    resolvePromise(mockCropResponse);

    await waitFor(() => {
      expect(screen.getByRole('region', { name: /crop recommendation result/i })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /wheat/i, level: 2 })).toBeInTheDocument();
    });
  });

  it('displays API error state with a working Retry action', async () => {
    vi.mocked(client.recommendCrop)
      .mockRejectedValueOnce(new ApiError(503, 'Crop recommendation model is not available'))
      .mockResolvedValueOnce(mockCropResponse);

    render(<CropRecommendationPage onBack={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/state/i), { target: { value: 'Gujarat' } });
    fireEvent.change(screen.getByLabelText(/district/i), { target: { value: 'Ahmedabad' } });
    fireEvent.change(screen.getByLabelText(/temperature/i), { target: { value: '28' } });
    fireEvent.change(screen.getByLabelText(/humidity/i), { target: { value: '60' } });
    fireEvent.change(screen.getByLabelText(/rainfall/i), { target: { value: '500' } });
    fireEvent.change(screen.getByLabelText(/soil type/i), { target: { value: 'alluvial' } });
    fireEvent.change(screen.getByLabelText(/previous crop/i), { target: { value: 'rice' } });

    fireEvent.click(screen.getByRole('button', { name: /recommend crop/i }));

    // API error banner appears
    const errorAlert = await screen.findByRole('alert');
    expect(errorAlert).toBeInTheDocument();
    expect(screen.getByText(/crop recommendation service is temporarily offline \(503\)/i)).toBeInTheDocument();

    // Click Retry Request button
    const retryBtn = screen.getByRole('button', { name: /retry recommendation request/i });
    expect(retryBtn).toBeInTheDocument();
    fireEvent.click(retryBtn);

    // Second call succeeds
    const resultSection = await screen.findByRole('region', { name: /crop recommendation result/i });
    expect(resultSection).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /wheat/i, level: 2 })).toBeInTheDocument();
  });

  it('allows resetting form and starting over from result view', async () => {
    vi.mocked(client.recommendCrop).mockResolvedValueOnce(mockCropResponse);

    render(<CropRecommendationPage onBack={vi.fn()} />);

    const stateInput = screen.getByLabelText(/state/i) as HTMLInputElement;
    fireEvent.change(stateInput, { target: { value: 'Punjab' } });
    expect(stateInput.value).toBe('Punjab');

    // Test form-level reset button
    const resetFormBtn = screen.getByRole('button', { name: /reset form/i });
    fireEvent.click(resetFormBtn);
    expect(stateInput.value).toBe('');

    // Fill form and submit
    fireEvent.change(screen.getByLabelText(/state/i), { target: { value: 'Punjab' } });
    fireEvent.change(screen.getByLabelText(/district/i), { target: { value: 'Ludhiana' } });
    fireEvent.change(screen.getByLabelText(/temperature/i), { target: { value: '25' } });
    fireEvent.change(screen.getByLabelText(/humidity/i), { target: { value: '55' } });
    fireEvent.change(screen.getByLabelText(/rainfall/i), { target: { value: '450' } });
    fireEvent.change(screen.getByLabelText(/soil type/i), { target: { value: 'alluvial' } });
    fireEvent.change(screen.getByLabelText(/previous crop/i), { target: { value: 'maize' } });

    fireEvent.click(screen.getByRole('button', { name: /recommend crop/i }));

    await screen.findByRole('region', { name: /crop recommendation result/i });

    // Test "Start Over" button from result section
    const startOverBtn = screen.getByRole('button', { name: /start over/i });
    fireEvent.click(startOverBtn);

    // Result is cleared and form is reset
    expect(screen.queryByRole('region', { name: /crop recommendation result/i })).not.toBeInTheDocument();
    expect((screen.getByLabelText(/state/i) as HTMLInputElement).value).toBe('');
  });
});
