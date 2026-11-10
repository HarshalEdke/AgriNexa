import {
  HealthResponse,
  PredictionResponse,
  CropRecommendationRequest,
  CropRecommendationResponse,
  WeatherResponse,
  SeasonalClimate,
  ChatRequest,
  ChatAnswer,
  ChatSessionResponse,
  ChatMessageResponse,
  SustainabilityScoreRequest,
  SustainabilityScoreResponse,
  IoTPresetsResponse,
  WeatherIntelligenceRequest,
  WeatherIntelligenceResponse,
  IrrigationAnalytics,
  IrrigationDashboard,
  IrrigationField,
  IrrigationFieldInput,
  IrrigationHistory,
  IrrigationRecommendation,
  IrrigationSchedule,
  IrrigationSensorReading,
  IrrigationWeather,
  IrrigationWeatherInput,
} from '../types';
import {
  SatelliteAvailability,
  SatelliteDemo,
  SatelliteField,
  SatelliteInsights,
  SatelliteObservation,
} from '../types/satellite';

export class ApiError extends Error {

  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function satelliteRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('access_token') : null;
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(path, { ...init, headers });
  } catch {
    throw new ApiError(0, 'Unable to connect to the satellite monitoring service.');
  }
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: response.statusText }));
    throw new ApiError(
      response.status,
      extractErrorMessage(errorData, response.status, 'Satellite request failed.')
    );
  }
  return response.json() as Promise<T>;
}

async function satelliteBlob(path: string): Promise<Blob> {
  const headers = new Headers();
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('access_token') : null;
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(path, { headers });
  } catch {
    throw new ApiError(0, 'Unable to connect to the satellite monitoring service.');
  }
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: response.statusText }));
    throw new ApiError(
      response.status,
      extractErrorMessage(errorData, response.status, 'Satellite download failed.')
    );
  }
  return response.blob();
}

export function getSatelliteStatus(): Promise<SatelliteAvailability> {
  return satelliteRequest('/api/satellite/status');
}

export function getSatelliteDemo(): Promise<SatelliteDemo> {
  return satelliteRequest('/api/satellite/demo-data');
}

export function getSatelliteFields(): Promise<SatelliteField[]> {
  return satelliteRequest('/api/satellite/fields');
}

export function saveSatelliteBoundary(
  fieldId: number,
  geometry: Record<string, unknown>
): Promise<SatelliteField> {
  return satelliteRequest('/api/satellite/fields', {
    method: 'POST',
    body: JSON.stringify({ field_id: fieldId, geometry }),
  });
}

export function uploadSatelliteBoundary(fieldId: number, file: File): Promise<SatelliteField> {
  const body = new FormData();
  body.append('file', file);
  return satelliteRequest(`/api/satellite/fields/${fieldId}/boundary-file`, {
    method: 'POST',
    body,
  });
}

export function analyzeSatelliteField(
  fieldId: number,
  startDate: string,
  endDate: string,
  maxCloudCoveragePercent = 30
): Promise<SatelliteObservation[]> {
  return satelliteRequest(`/api/satellite/analyze/${fieldId}`, {
    method: 'POST',
    body: JSON.stringify({
      start_date: startDate,
      end_date: endDate,
      max_cloud_coverage_percent: maxCloudCoveragePercent,
    }),
  });
}

export function getSatelliteHistory(fieldId: number): Promise<SatelliteObservation[]> {
  return satelliteRequest(`/api/satellite/history?field_id=${fieldId}`);
}

export function getSatelliteInsights(fieldId: number): Promise<SatelliteInsights> {
  return satelliteRequest(`/api/satellite/health-insights?field_id=${fieldId}`);
}

export function getSatelliteMap(fieldId: number, acquisitionDate: string): Promise<Blob> {
  return satelliteBlob(`/api/satellite/map/${fieldId}/${encodeURIComponent(acquisitionDate)}`);
}

export function downloadSatelliteReport(fieldId: number): Promise<Blob> {
  return satelliteBlob(`/api/satellite/report?field_id=${fieldId}`);
}

export function extractErrorMessage(
  errorData: unknown,
  status: number,
  fallbackMessage: string
): string {
  if (status === 401) {
    return 'Authentication required or session expired. Please sign in or continue as guest.';
  }
  if (status === 429) {
    return 'Too many requests. Please wait a moment and try again.';
  }

  let message = '';
  if (typeof errorData === 'object' && errorData !== null) {
    const data = errorData as Record<string, unknown>;
    if (typeof data.detail === 'string' && data.detail.trim()) {
      message = data.detail.trim();
    } else if (Array.isArray(data.detail)) {
      const msgs = data.detail
        .map((item) => {
          if (typeof item === 'string') return item.trim();
          if (typeof item === 'object' && item !== null) {
            const d = item as Record<string, unknown>;
            if (typeof d.msg === 'string') return d.msg.trim();
            if (typeof d.message === 'string') return d.message.trim();
          }
          return '';
        })
        .filter(Boolean);
      if (msgs.length > 0) {
        message = msgs.join('. ');
      }
    } else if (typeof data.message === 'string' && data.message.trim()) {
      message = data.message.trim();
    }
  } else if (typeof errorData === 'string' && errorData.trim()) {
    message = errorData.trim();
  }

  if (message) {
    if (message.includes('[object Object]')) {
      return fallbackMessage;
    }
    const sanitized = message
      .replace(/(Bearer\s+)[A-Za-z0-9-_=.]+/gi, '$1[REDACTED]')
      .replace(/(password|secret|key|token)[=:]\s*[^\s,]+/gi, '$1=[REDACTED]')
      .replace(/Traceback \(most recent call last\):[\s\S]*/gi, '')
      .trim();
    return sanitized || fallbackMessage;
  }

  if (status === 503) {
    return 'Service is temporarily unavailable. Please verify the backend is running and try again.';
  }
  if (status >= 500) {
    return 'Backend server is unreachable or encountered an error. Please verify the backend is running on port 8000.';
  }

  return fallbackMessage;
}

export async function checkHealth(): Promise<HealthResponse> {
  let res: Response;
  try {
    res = await fetch('/health');
  } catch {
    throw new ApiError(0, 'Unable to connect to server. Please check your network connection.');
  }

  if (!res.ok) {
    throw new ApiError(res.status, `Health check failed with status: ${res.status}`);
  }
  return res.json();
}

export async function predictDisease(file: File): Promise<PredictionResponse> {
  const formData = new FormData();
  formData.append('image', file);

  let res: Response;
  try {
    res = await fetch('/api/predictions', {
      method: 'POST',
      body: formData,
    });
  } catch {
    throw new ApiError(0, 'Unable to connect to the diagnostic server. Please check your network connection.');
  }

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: res.statusText }));
    const message = extractErrorMessage(errorData, res.status, `Prediction failed with status: ${res.status}`);
    throw new ApiError(res.status, message);
  }

  return res.json();
}

export async function recommendCrop(
  data: CropRecommendationRequest
): Promise<CropRecommendationResponse> {
  let res: Response;
  try {
    res = await fetch('/api/crop-recommendations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
  } catch {
    throw new ApiError(0, 'Unable to connect to the recommendation server. Please check your network connection.');
  }

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: res.statusText }));
    const message = extractErrorMessage(errorData, res.status, 'Failed to get crop recommendation');
    throw new ApiError(res.status, message);
  }

  return res.json();
}

export const recommendCrops = recommendCrop;

export async function getWeather(location: string): Promise<WeatherResponse> {
  const trimmed = location.trim();
  if (!trimmed) {
    throw new ApiError(400, 'Location query cannot be empty.');
  }

  const res = await fetch(`/api/weather?location=${encodeURIComponent(trimmed)}`);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: res.statusText }));
    const message = errorData?.detail || `Weather retrieval failed with status: ${res.status}`;
    throw new ApiError(res.status, message);
  }

  return res.json();
}

export async function getWeatherIntelligence(
  data: WeatherIntelligenceRequest
): Promise<WeatherIntelligenceResponse> {
  const trimmedLocation = (data.location || '').trim();
  if (!trimmedLocation) {
    throw new ApiError(400, 'Location query cannot be empty.');
  }

  let res: Response;
  try {
    res = await fetch('/api/weather-intelligence', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...data,
        location: trimmedLocation,
      }),
    });
  } catch {
    throw new ApiError(0, 'Unable to connect to the weather intelligence service. Please check your network connection.');
  }

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: res.statusText }));
    const message = extractErrorMessage(errorData, res.status, `Weather intelligence retrieval failed with status: ${res.status}`);
    throw new ApiError(res.status, message);
  }

  return res.json();
}


export async function sendChatMessage(data: ChatRequest): Promise<ChatAnswer> {
  const trimmedQuestion = data.question ? data.question.trim() : '';
  if (!trimmedQuestion || trimmedQuestion.length > 500) {
    throw new ApiError(400, 'Question must be between 1 and 500 characters.');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  try {
    const token = localStorage.getItem('access_token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  } catch {
    // Gracefully ignore in non-browser/restricted environments
  }

  let res: Response;
  try {
    res = await fetch('/api/chat', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...data,
        question: trimmedQuestion,
      }),
    });
  } catch {
    throw new ApiError(0, 'Unable to connect to the AI assistant. Please check your network connection.');
  }

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: res.statusText }));
    let message = extractErrorMessage(errorData, res.status, 'Failed to get advice from Agro AI');
    if (res.status === 400 || res.status === 422) {
      message = typeof errorData?.detail === 'string' && errorData.detail
        ? errorData.detail
        : 'Please provide a valid question for the AI assistant (1–500 characters).';
    }
    throw new ApiError(res.status, message);
  }

  return res.json();
}

export async function getSeasonalClimate(
  state: string,
  district?: string,
  season?: string
): Promise<SeasonalClimate> {
  const params = new URLSearchParams({ state: state.trim() });
  if (district?.trim()) params.append('district', district.trim());
  if (season?.trim()) params.append('season', season.trim());

  const res = await fetch(`/api/seasonal-climate?${params.toString()}`);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: res.statusText }));
    const message = errorData?.detail || `Seasonal climate retrieval failed with status: ${res.status}`;
    throw new ApiError(res.status, message);
  }

  return res.json();
}

import { AuthResponse, AuthUser, LoginRequest, RegisterRequest } from '../types/auth';

export async function registerUser(data: RegisterRequest): Promise<AuthResponse> {
  let res: Response;
  try {
    res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
  } catch {
    throw new ApiError(0, 'Unable to connect to the authentication server. Please check your network connection.');
  }

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: res.statusText }));
    const message = extractErrorMessage(errorData, res.status, `Registration failed with status: ${res.status}`);
    throw new ApiError(res.status, message);
  }

  return res.json();
}

export async function loginUser(data: LoginRequest): Promise<AuthResponse> {
  let res: Response;
  try {
    res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
  } catch {
    throw new ApiError(0, 'Unable to connect to the authentication server. Please check your network connection.');
  }

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: res.statusText }));
    let message = extractErrorMessage(errorData, res.status, `Login failed with status: ${res.status}`);
    if (res.status === 401) {
      message = typeof errorData?.detail === 'string' && errorData.detail
        ? errorData.detail
        : 'Incorrect email or password.';
    }
    throw new ApiError(res.status, message);
  }

  return res.json();
}

export async function getAuthMe(): Promise<AuthUser> {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('access_token') : null;
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch('/api/auth/me', {
      method: 'GET',
      headers,
    });
  } catch {
    throw new ApiError(0, 'Unable to connect to the server. Please check your network connection.');
  }

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: res.statusText }));
    const message = extractErrorMessage(errorData, res.status, `Session validation failed with status: ${res.status}`);
    throw new ApiError(res.status, message);
  }

  return res.json();
}

export async function getChatSessions(): Promise<ChatSessionResponse[]> {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('access_token') : null;
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch('/api/chat/sessions', {
      method: 'GET',
      headers,
    });
  } catch {
    throw new ApiError(0, 'Unable to connect to the chat service. Please check your network connection.');
  }

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: res.statusText }));
    const message = extractErrorMessage(errorData, res.status, `Failed to fetch chat sessions with status: ${res.status}`);
    throw new ApiError(res.status, message);
  }

  return res.json();
}

export async function getChatSessionMessages(sessionId: string): Promise<ChatMessageResponse[]> {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('access_token') : null;
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const encodedId = encodeURIComponent(sessionId);
  let res: Response;
  try {
    res = await fetch(`/api/chat/sessions/${encodedId}/messages`, {
      method: 'GET',
      headers,
    });
  } catch {
    throw new ApiError(0, 'Unable to connect to the chat service. Please check your network connection.');
  }

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: res.statusText }));
    const message = extractErrorMessage(errorData, res.status, `Failed to fetch session messages with status: ${res.status}`);
    throw new ApiError(res.status, message);
  }

  return res.json();
}

export async function calculateSustainabilityScore(
  data: SustainabilityScoreRequest
): Promise<SustainabilityScoreResponse> {
  let res: Response;
  try {
    res = await fetch('/api/sustainability-score', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
  } catch {
    throw new ApiError(0, 'Unable to connect to the sustainability service. Please check your network connection.');
  }

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: res.statusText }));
    const message = extractErrorMessage(errorData, res.status, 'Failed to calculate sustainability score');
    throw new ApiError(res.status, message);
  }

  return res.json();
}

export async function getIoTPresets(): Promise<IoTPresetsResponse> {
  let res: Response;
  try {
    res = await fetch('/api/sustainability/iot-telemetry', {
      method: 'GET',
    });
  } catch {
    throw new ApiError(0, 'Unable to connect to the IoT telemetry service. Please check your network connection.');
  }

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: res.statusText }));
    const message = extractErrorMessage(errorData, res.status, 'Failed to fetch IoT telemetry presets');
    throw new ApiError(res.status, message);
  }

  return res.json();
}

async function irrigationRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  try {
    const token = localStorage.getItem('access_token');
    if (token) headers.set('Authorization', `Bearer ${token}`);
  } catch {
    // The API will return its normal authentication error if storage is unavailable.
  }

  let response: Response;
  try {
    response = await fetch(`/api/irrigation${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, 'Unable to connect to the irrigation service. Please check your network connection.');
  }
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: response.statusText }));
    throw new ApiError(
      response.status,
      extractErrorMessage(errorData, response.status, 'Irrigation request failed.')
    );
  }
  return response.json() as Promise<T>;
}

export function getIrrigationDashboard(): Promise<IrrigationDashboard> {
  return irrigationRequest('/dashboard');
}

export function getIrrigationAnalytics(): Promise<IrrigationAnalytics> {
  return irrigationRequest('/analytics');
}

export function getIrrigationFields(): Promise<IrrigationField[]> {
  return irrigationRequest('/fields');
}

export function createIrrigationField(data: IrrigationFieldInput): Promise<IrrigationField> {
  return irrigationRequest('/fields', { method: 'POST', body: JSON.stringify(data) });
}

export function generateIrrigationRecommendation(
  fieldId: number,
  weather?: IrrigationWeatherInput
): Promise<IrrigationRecommendation> {
  return irrigationRequest('/recommendation/generate', {
    method: 'POST',
    body: JSON.stringify({ field_id: fieldId, ...(weather ? { weather } : {}) }),
  });
}

export function getIrrigationWeather(fieldId: number): Promise<IrrigationWeather> {
  return irrigationRequest(`/weather/?field_id=${encodeURIComponent(fieldId)}`);
}

export function createIrrigationSchedule(
  recommendationId: number,
  scheduledAt: string,
  notes?: string
): Promise<IrrigationSchedule> {
  return irrigationRequest('/schedule', {
    method: 'POST',
    body: JSON.stringify({
      recommendation_id: recommendationId,
      scheduled_at: scheduledAt,
      notes,
    }),
  });
}

export function postponeIrrigationSchedule(
  scheduleId: number,
  scheduledAt: string,
  notes?: string
): Promise<IrrigationSchedule> {
  return irrigationRequest(`/schedules/${scheduleId}/postpone`, {
    method: 'POST',
    body: JSON.stringify({ scheduled_at: scheduledAt, notes }),
  });
}

export function completeIrrigationSchedule(
  scheduleId: number,
  waterUsedLitres: number,
  durationMinutes?: number
): Promise<IrrigationSchedule> {
  return irrigationRequest(`/schedules/${scheduleId}/complete`, {
    method: 'POST',
    body: JSON.stringify({
      water_used_litres: waterUsedLitres,
      ...(durationMinutes ? { duration_minutes: durationMinutes } : {}),
    }),
  });
}

export function recordIrrigationHistory(data: {
  field_id: number;
  irrigated_at: string;
  water_used_litres: number;
  duration_minutes?: number;
  notes?: string;
}): Promise<IrrigationHistory> {
  return irrigationRequest('/history/', { method: 'POST', body: JSON.stringify(data) });
}

export function submitIrrigationSensorReading(
  fieldId: number,
  data: {
    soil_moisture_percent: number;
    temperature_c?: number;
    humidity_percent?: number;
    source: 'simulated' | 'hardware';
    device_id?: string;
  }
): Promise<IrrigationSensorReading> {
  return irrigationRequest(`/fields/${fieldId}/sensor-readings`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}
