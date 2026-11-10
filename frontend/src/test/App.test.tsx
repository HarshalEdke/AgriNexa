import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import App from '../App';
import * as client from '../api/client';
import { ApiError } from '../api/client';
import { PredictionResponse } from '../types';

vi.mock('../api/client', async () => {
  const actual = await vi.importActual<typeof import('../api/client')>('../api/client');
  return {
    ...actual,
    predictDisease: vi.fn(),
  };
});

describe('AgriNexa AI — Task 2 & Disease API Integration Workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders exactly one intro landing screen on open and navigates to diagnosis on Get Started', () => {
    render(<App />);
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /a smarter way to care for your crops/i, level: 1 })
    ).toBeInTheDocument();
    
    // Click Get Started button
    const getStartedBtn = screen.getByRole('button', { name: /get started with agrinexa ai/i });
    expect(getStartedBtn).toBeInTheDocument();
    fireEvent.click(getStartedBtn);

    // Navigates directly to main diagnosis page with navbar
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /plant disease diagnosis/i, level: 1 })
    ).toBeInTheDocument();
    const footer = screen.getByRole('contentinfo');
    expect(footer).toBeInTheDocument();
    expect(footer.textContent).toMatch(/agrinexa ai/i);
  });

  it('renders empty initial upload state with clear farmer-friendly instructions', () => {
    render(<App initialView="diagnose" />);
    expect(screen.getByText('Upload a crop or leaf image')).toBeInTheDocument();
    expect(
      screen.getByText(/use a clear photo of the affected leaf or crop for better diagnosis/i)
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(/upload crop or leaf image/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /select image/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /predict disease/i })
    ).not.toBeInTheDocument();
  });

  it('accepts a valid image file and displays image preview, filename, and action controls', () => {
    render(<App initialView="diagnose" />);
    const fileInput = screen.getByLabelText(/upload crop or leaf image/i) as HTMLInputElement;

    const testFile = new File(['fake-image-bytes'], 'leaf_healthy.jpg', { type: 'image/jpeg' });
    fireEvent.change(fileInput, { target: { files: [testFile] } });

    expect(screen.getByAltText(/selected crop leaf preview/i)).toBeInTheDocument();
    expect(screen.getByText('leaf_healthy.jpg')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /change selected image/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /remove selected image/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /predict disease/i })).toBeEnabled();
  });

  it('rejects unsupported non-image file with a friendly validation error', () => {
    render(<App initialView="diagnose" />);
    const fileInput = screen.getByLabelText(/upload crop or leaf image/i) as HTMLInputElement;

    const invalidFile = new File(['document content'], 'notes.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput, { target: { files: [invalidFile] } });

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(
      screen.getByText(/please select a valid image file \(jpg, png, or webp\)/i)
    ).toBeInTheDocument();
    expect(screen.queryByAltText(/selected crop leaf preview/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /predict disease/i })).not.toBeInTheDocument();
  });

  it('rejects oversized files exceeding 10 MB with clear feedback', () => {
    render(<App initialView="diagnose" />);
    const fileInput = screen.getByLabelText(/upload crop or leaf image/i) as HTMLInputElement;

    const largeFile = new File(['x'.repeat(100)], 'huge_photo.jpg', { type: 'image/jpeg' });
    Object.defineProperty(largeFile, 'size', { value: 11 * 1024 * 1024 });

    fireEvent.change(fileInput, { target: { files: [largeFile] } });

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/image size exceeds the 10 mb limit/i)).toBeInTheDocument();
    expect(screen.queryByAltText(/selected crop leaf preview/i)).not.toBeInTheDocument();
  });

  it('resets form to initial empty state when Remove button is clicked', () => {
    render(<App initialView="diagnose" />);
    const fileInput = screen.getByLabelText(/upload crop or leaf image/i) as HTMLInputElement;

    const testFile = new File(['leaf-data'], 'tomato_leaf.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [testFile] } });

    expect(screen.getByText('tomato_leaf.png')).toBeInTheDocument();

    const removeBtn = screen.getByRole('button', { name: /remove selected image/i });
    fireEvent.click(removeBtn);

    expect(screen.queryByText('tomato_leaf.png')).not.toBeInTheDocument();
    expect(screen.queryByAltText(/selected crop leaf preview/i)).not.toBeInTheDocument();
    expect(screen.getByText('Upload a crop or leaf image')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /select image/i })).toBeInTheDocument();
  });

  it('supports selecting an optional crop type', () => {
    render(<App initialView="diagnose" />);
    const fileInput = screen.getByLabelText(/upload crop or leaf image/i) as HTMLInputElement;

    const testFile = new File(['leaf-data'], 'corn_leaf.jpg', { type: 'image/jpeg' });
    fireEvent.change(fileInput, { target: { files: [testFile] } });

    const cropSelect = screen.getByLabelText(/crop type \(optional\)/i) as HTMLSelectElement;
    expect(cropSelect.value).toBe('');

    fireEvent.change(cropSelect, { target: { value: 'Corn (Maize)' } });
    expect(cropSelect.value).toBe('Corn (Maize)');
  });

  it('enters predicting/loading state on Predict click and prevents duplicate submissions without faking diagnosis', () => {
    // Return pending promise to inspect in-flight loading state
    vi.mocked(client.predictDisease).mockReturnValue(new Promise(() => {}));

    render(<App initialView="diagnose" />);
    const fileInput = screen.getByLabelText(/upload crop or leaf image/i) as HTMLInputElement;

    const testFile = new File(['leaf-data'], 'potato_blight.jpg', { type: 'image/jpeg' });
    fireEvent.change(fileInput, { target: { files: [testFile] } });

    const predictBtn = screen.getByRole('button', { name: /predict disease/i });
    expect(predictBtn).toBeEnabled();

    fireEvent.click(predictBtn);

    expect(client.predictDisease).toHaveBeenCalledTimes(1);
    expect(client.predictDisease).toHaveBeenCalledWith(testFile);

    // Predict status banner is shown
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText(/analyzing your crop image\.\.\./i)).toBeInTheDocument();

    // Predict button is removed/disabled while predicting
    expect(screen.queryByRole('button', { name: /predict disease/i })).not.toBeInTheDocument();

    // Inputs/controls are disabled
    expect(screen.getByRole('button', { name: /change selected image/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /remove selected image/i })).toBeDisabled();

    // Confirms NO fake diagnosis classes or results are rendered
    expect(screen.queryByText(/diagnostic result/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/confidence/i)).not.toBeInTheDocument();
  });

  it('supports drag-and-drop file upload', () => {
    render(<App initialView="diagnose" />);
    const dropzone = screen.getByLabelText(/click or drag and drop to select a crop leaf image/i);

    // Drag over activates highlighted state
    fireEvent.dragOver(dropzone);
    expect(dropzone.className).toContain('border-[#10B981]');

    // Drop valid image
    const file = new File(['dropped-data'], 'dropped_leaf.webp', { type: 'image/webp' });
    fireEvent.drop(dropzone, {
      dataTransfer: {
        files: [file],
      },
    });

    expect(screen.getByText('dropped_leaf.webp')).toBeInTheDocument();
    expect(screen.getByAltText(/selected crop leaf preview/i)).toBeInTheDocument();
  });

  it('successfully predicts disease on HTTP 200, displays DiagnosisResult with real backend data, and allows resetting', async () => {
    const mockResponse: PredictionResponse = {
      predicted_class: 'Tomato___Early_blight',
      display_name: 'Tomato — Early Blight',
      confidence: 0.965,
      model_version: 'v0.1.0-prod',
      precaution: 'Apply copper fungicides weekly. Avoid overhead watering to reduce foliar moisture.',
      probabilities: {
        'Tomato___Early_blight': 0.965,
        'Tomato___healthy': 0.035,
      },
    };
    vi.mocked(client.predictDisease).mockResolvedValue(mockResponse);

    render(<App initialView="diagnose" />);
    const fileInput = screen.getByLabelText(/upload crop or leaf image/i) as HTMLInputElement;

    const testFile = new File(['leaf-bytes'], 'tomato_diseased.jpg', { type: 'image/jpeg' });
    fireEvent.change(fileInput, { target: { files: [testFile] } });

    const cropSelect = screen.getByLabelText(/crop type \(optional\)/i);
    fireEvent.change(cropSelect, { target: { value: 'Tomato' } });

    const predictBtn = screen.getByRole('button', { name: /predict disease/i });
    fireEvent.click(predictBtn);

    expect(client.predictDisease).toHaveBeenCalledWith(testFile);

    // DiagnosisResult component renders with real backend data
    expect(await screen.findByRole('region', { name: /diagnosis result summary/i })).toBeInTheDocument();
    expect(screen.getByText('Tomato — Early Blight')).toBeInTheDocument();
    expect(screen.getAllByText('96.5%').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('v0.1.0-prod')).toBeInTheDocument();
    expect(screen.getByText(/technical class: tomato___early_blight/i)).toBeInTheDocument();
    expect(screen.getByText(/apply copper fungicides weekly/i)).toBeInTheDocument();
    expect(screen.getByText('Tomato___healthy')).toBeInTheDocument();
    expect(screen.getByText('3.5%')).toBeInTheDocument();

    // Resetting returns back to clean empty upload state
    const resetBtn = screen.getByRole('button', { name: /upload another image/i });
    fireEvent.click(resetBtn);

    expect(screen.getByText('Upload a crop or leaf image')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /diagnosis result summary/i })).not.toBeInTheDocument();
  });

  it('renders ModelUnavailable notice on HTTP 503 and allows resetting back to upload', async () => {
    vi.mocked(client.predictDisease).mockRejectedValue(
      new ApiError(503, 'Model checkpoint not yet available')
    );

    render(<App initialView="diagnose" />);
    const fileInput = screen.getByLabelText(/upload crop or leaf image/i) as HTMLInputElement;

    const testFile = new File(['leaf-data'], 'rice_leaf.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [testFile] } });

    const predictBtn = screen.getByRole('button', { name: /predict disease/i });
    fireEvent.click(predictBtn);

    // Model unavailable notice rendered without fake diagnosis
    expect(await screen.findByText(/prediction model unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/diagnostic service is currently offline/i)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /diagnosis result summary/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/confidence score/i)).not.toBeInTheDocument();

    // Resetting returns to empty upload dropzone
    const resetBtn = screen.getByRole('button', { name: /try another image/i });
    fireEvent.click(resetBtn);

    expect(screen.getByText('Upload a crop or leaf image')).toBeInTheDocument();
  });

  it('displays user-friendly error on HTTP 400 bad request and allows retry / image change', async () => {
    vi.mocked(client.predictDisease).mockRejectedValue(
      new ApiError(400, 'Invalid image dimensions or corrupt leaf photo.')
    );

    render(<App initialView="diagnose" />);
    const fileInput = screen.getByLabelText(/upload crop or leaf image/i) as HTMLInputElement;

    const testFile = new File(['leaf-data'], 'bad_photo.jpg', { type: 'image/jpeg' });
    fireEvent.change(fileInput, { target: { files: [testFile] } });

    const predictBtn = screen.getByRole('button', { name: /predict disease/i });
    fireEvent.click(predictBtn);

    // Shows clear user-facing error message without crashing
    expect(await screen.findByText('Diagnosis Request Issue')).toBeInTheDocument();
    expect(screen.getByText('Invalid image dimensions or corrupt leaf photo.')).toBeInTheDocument();
    expect(screen.queryByText(/prediction model unavailable/i)).not.toBeInTheDocument();

    // Preview remains and controls are enabled for retry or image change
    expect(screen.getByAltText(/selected crop leaf preview/i)).toBeInTheDocument();
    const retryBtn = screen.getByRole('button', { name: /predict disease/i });
    expect(retryBtn).toBeEnabled();
    expect(screen.getByRole('button', { name: /change selected image/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /remove selected image/i })).toBeEnabled();

    // User retries successfully
    vi.mocked(client.predictDisease).mockResolvedValue({
      predicted_class: 'Apple___healthy',
      confidence: 0.99,
      model_version: 'v0.1.0',
    });
    fireEvent.click(retryBtn);

    expect(await screen.findByRole('region', { name: /diagnosis result summary/i })).toBeInTheDocument();
    expect(screen.queryByText('Diagnosis Request Issue')).not.toBeInTheDocument();
  });

  it('displays generic user-friendly error on HTTP 500 or unexpected error without exposing stack traces', async () => {
    vi.mocked(client.predictDisease).mockRejectedValue(
      new ApiError(500, 'Internal Server Error: Traceback (most recent call last) in torch.cuda...')
    );

    render(<App initialView="diagnose" />);
    const fileInput = screen.getByLabelText(/upload crop or leaf image/i) as HTMLInputElement;

    const testFile = new File(['leaf-data'], 'failing_leaf.jpg', { type: 'image/jpeg' });
    fireEvent.change(fileInput, { target: { files: [testFile] } });

    const predictBtn = screen.getByRole('button', { name: /predict disease/i });
    fireEvent.click(predictBtn);

    // Generic friendly error displayed
    expect(await screen.findByText('Diagnosis Request Issue')).toBeInTheDocument();
    expect(
      screen.getByText(/unable to process diagnosis due to a server error\. please try again in a few moments\./i)
    ).toBeInTheDocument();

    // Raw technical details/stack traces are never exposed
    expect(screen.queryByText(/traceback/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/torch\.cuda/i)).not.toBeInTheDocument();

    // User can retry
    expect(screen.getByRole('button', { name: /predict disease/i })).toBeEnabled();
  });

  it('displays user-friendly retryable error on network failure (offline/disconnect)', async () => {
    vi.mocked(client.predictDisease).mockRejectedValue(new TypeError('Failed to fetch'));

    render(<App initialView="diagnose" />);
    const fileInput = screen.getByLabelText(/upload crop or leaf image/i) as HTMLInputElement;

    const testFile = new File(['leaf-data'], 'network_leaf.jpg', { type: 'image/jpeg' });
    fireEvent.change(fileInput, { target: { files: [testFile] } });

    const predictBtn = screen.getByRole('button', { name: /predict disease/i });
    fireEvent.click(predictBtn);

    expect(await screen.findByText('Diagnosis Request Issue')).toBeInTheDocument();
    expect(
      screen.getByText(/unable to process diagnosis due to a server error\. please try again in a few moments\./i)
    ).toBeInTheDocument();

    // Controls remain enabled for retry
    expect(screen.getByRole('button', { name: /predict disease/i })).toBeEnabled();
  });
});
