import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  Check,
  CloudRain,
  Droplets,
  Gauge,
  Leaf,
  LoaderCircle,
  MapPin,
  Plus,
  RefreshCw,
  Sprout,
  ThermometerSun,
  Waves,
  X,
} from 'lucide-react';
import {
  ApiError,
  completeIrrigationSchedule,
  createIrrigationField,
  createIrrigationSchedule,
  generateIrrigationRecommendation,
  getIrrigationAnalytics,
  getIrrigationDashboard,
  getIrrigationWeather,
  postponeIrrigationSchedule,
  submitIrrigationSensorReading,
} from '../api/client';
import {
  IrrigationAnalytics,
  IrrigationDashboard,
  IrrigationFieldInput,
  IrrigationMethod,
  IrrigationRecommendation,
  IrrigationSchedule,
  IrrigationWeather,
  IrrigationWeatherInput,
} from '../types';

interface IrrigationPageProps {
  onSignIn: () => void;
}

interface FieldForm {
  field_name: string;
  crop_name: string;
  crop_variety: string;
  growth_stage: string;
  sowing_date: string;
  crop_duration_days: string;
  root_depth_m: string;
  kc: string;
  soil_type: string;
  soil_moisture_percent: string;
  field_capacity_percent: string;
  permanent_wilting_point_percent: string;
  soil_water_holding_capacity_mm_per_m: string;
  location: string;
  latitude: string;
  longitude: string;
  area_hectares: string;
  irrigation_method: IrrigationMethod;
  irrigation_efficiency: string;
  flow_rate_lpm: string;
  water_source: string;
}

interface WeatherForm {
  temperature_c: string;
  temp_min_c: string;
  temp_max_c: string;
  humidity_percent: string;
  wind_speed_m_s: string;
  solar_radiation_mj_m2_day: string;
  elevation_m: string;
  rainfall_mm: string;
  rainfall_probability_percent: string;
}

const EMPTY_WEATHER: WeatherForm = {
  temperature_c: '',
  temp_min_c: '',
  temp_max_c: '',
  humidity_percent: '',
  wind_speed_m_s: '',
  solar_radiation_mj_m2_day: '',
  elevation_m: '',
  rainfall_mm: '',
  rainfall_probability_percent: '',
};

const INITIAL_FIELD: FieldForm = {
  field_name: '',
  crop_name: 'Wheat',
  crop_variety: '',
  growth_stage: 'Mid season',
  sowing_date: '',
  crop_duration_days: '',
  root_depth_m: '0.6',
  kc: '',
  soil_type: 'loamy',
  soil_moisture_percent: '22',
  field_capacity_percent: '30',
  permanent_wilting_point_percent: '15',
  soil_water_holding_capacity_mm_per_m: '',
  location: '',
  latitude: '',
  longitude: '',
  area_hectares: '1',
  irrigation_method: 'drip',
  irrigation_efficiency: '',
  flow_rate_lpm: '30',
  water_source: '',
};

function numberValue(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function localDateTimeValue(daysFromNow: number, hour = 6): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  date.setHours(hour, 0, 0, 0);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  tone = 'green',
}: {
  icon: typeof Droplets;
  label: string;
  value: string;
  detail: string;
  tone?: 'green' | 'amber' | 'blue';
}) {
  const tones = {
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    blue: 'bg-sky-50 text-sky-700',
  };
  return (
    <article className="rounded-2xl border border-[#E8E4D8] bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-[#263B2C]">{value}</p>
          <p className="mt-1 text-xs text-slate-500">{detail}</p>
        </div>
        <span className={`rounded-xl p-2.5 ${tones[tone]}`}><Icon size={19} /></span>
      </div>
    </article>
  );
}

function PanelTitle({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-base font-semibold text-[#263B2C]">{title}</h2>
      {detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const style = status === 'Required'
    ? 'bg-rose-50 text-rose-700 ring-rose-200'
    : status === 'Not Required'
      ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
      : status === 'completed'
        ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
        : status === 'postponed'
          ? 'bg-sky-50 text-sky-700 ring-sky-200'
          : status === 'missed'
            ? 'bg-rose-50 text-rose-700 ring-rose-200'
            : 'bg-amber-50 text-amber-700 ring-amber-200';
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${style}`}>{status}</span>;
}

function EmptyChart({ message }: { message: string }) {
  return <div className="flex min-h-40 items-center justify-center rounded-xl bg-slate-50 px-4 text-center text-sm text-slate-500">{message}</div>;
}

function TrendChart({
  values,
  valueKey,
  color = '#2F855A',
}: {
  values: Array<Record<string, string | number>>;
  valueKey: string;
  color?: string;
}) {
  if (values.length < 2) return <EmptyChart message="More readings are needed to show a trend." />;
  const points = values.map((item, index) => {
    const value = Number(item[valueKey]);
    return { x: 18 + index * (564 / (values.length - 1)), value };
  });
  const min = Math.min(...points.map((point) => point.value));
  const max = Math.max(...points.map((point) => point.value));
  const span = max - min || 1;
  const coords = points.map((point) => `${point.x},${145 - ((point.value - min) / span) * 112}`).join(' ');
  return (
    <div>
      <svg viewBox="0 0 600 180" className="h-44 w-full" role="img" aria-label="Historical trend chart">
        {[30, 70, 110, 150].map((y) => <line key={y} x1="16" x2="584" y1={y} y2={y} stroke="#E8EEE8" strokeDasharray="4 5" />)}
        <polyline points={coords} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((point, index) => (
          <circle key={`${point.x}-${index}`} cx={point.x} cy={145 - ((point.value - min) / span) * 112} r="4" fill="white" stroke={color} strokeWidth="2" />
        ))}
      </svg>
      <div className="flex justify-between px-1 text-[10px] text-slate-400">
        <span>{String(values[0].date ?? '')}</span>
        <span>{String(values[values.length - 1].date ?? '')}</span>
      </div>
    </div>
  );
}

function BarChart({
  values,
  labelKey,
  valueKey,
  suffix,
  color = 'bg-emerald-500',
}: {
  values: Array<Record<string, string | number>>;
  labelKey: string;
  valueKey: string;
  suffix: string;
  color?: string;
}) {
  if (!values.length) return <EmptyChart message="Recorded activity will appear here." />;
  const max = Math.max(1, ...values.map((item) => Number(item[valueKey])));
  return (
    <div className="space-y-3">
      {values.slice(-7).map((item, index) => {
        const value = Number(item[valueKey]);
        const label = String(item[labelKey] ?? '');
        return (
          <div key={`${label}-${index}`} className="grid grid-cols-[minmax(4rem,6rem)_1fr_auto] items-center gap-2 text-xs">
            <span className="truncate text-slate-500">{label}</span>
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(3, (value / max) * 100)}%` }} />
            </div>
            <span className="font-medium text-slate-700">{value.toFixed(1)}{suffix}</span>
          </div>
        );
      })}
    </div>
  );
}

export function IrrigationPage({ onSignIn }: IrrigationPageProps) {
  const [dashboard, setDashboard] = useState<IrrigationDashboard | null>(null);
  const [analytics, setAnalytics] = useState<IrrigationAnalytics | null>(null);
  const [selectedFieldId, setSelectedFieldId] = useState<number | null>(null);
  const [recommendation, setRecommendation] = useState<IrrigationRecommendation | null>(null);
  const [inputsChanged, setInputsChanged] = useState(false);
  const [weather, setWeather] = useState<IrrigationWeather | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [showFieldForm, setShowFieldForm] = useState(false);
  const [fieldForm, setFieldForm] = useState<FieldForm>(INITIAL_FIELD);
  const [weatherForm, setWeatherForm] = useState<WeatherForm>(EMPTY_WEATHER);
  const [sensorMoisture, setSensorMoisture] = useState('');
  const [sensorSource, setSensorSource] = useState<'simulated' | 'hardware'>('simulated');
  const [scheduleAt, setScheduleAt] = useState(localDateTimeValue(1));
  const [completionSchedule, setCompletionSchedule] = useState<IrrigationSchedule | null>(null);
  const [actualWater, setActualWater] = useState('');
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [nextDashboard, nextAnalytics] = await Promise.all([
      getIrrigationDashboard(),
      getIrrigationAnalytics(),
    ]);
    setDashboard(nextDashboard);
    setAnalytics(nextAnalytics);
    setSelectedFieldId((current) => current ?? nextDashboard.fields[0]?.id ?? null);
    setRecommendation((current) => current ?? nextDashboard.recommendations[0] ?? null);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([getIrrigationDashboard(), getIrrigationAnalytics()])
      .then(([nextDashboard, nextAnalytics]) => {
        if (!active) return;
        setDashboard(nextDashboard);
        setAnalytics(nextAnalytics);
        setSelectedFieldId(nextDashboard.fields[0]?.id ?? null);
        setRecommendation(nextDashboard.recommendations[0] ?? null);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : 'Unable to load irrigation data.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const selectedField = useMemo(
    () => dashboard?.fields.find((field) => field.id === selectedFieldId) ?? null,
    [dashboard, selectedFieldId]
  );
  const selectedRecommendation = useMemo(
    () => recommendation?.field_id === selectedFieldId
      ? recommendation
      : dashboard?.recommendations.find((item) => item.field_id === selectedFieldId) ?? null,
    [dashboard, recommendation, selectedFieldId]
  );
  const recommendationStale = Boolean(
    selectedRecommendation &&
    (
      inputsChanged ||
      (selectedField?.moisture_updated_at &&
        new Date(selectedField.moisture_updated_at).getTime() > new Date(selectedRecommendation.generated_at).getTime())
    )
  );

  const handleActionError = (cause: unknown) => {
    if (cause instanceof ApiError && cause.status === 401) {
      setError('Sign in to save fields, recommendations, sensor readings, and irrigation schedules.');
    } else {
      setError(cause instanceof Error ? cause.message : 'The irrigation request could not be completed.');
    }
  };

  const handleCreateField = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFeedback(null);
    const input: IrrigationFieldInput = {
      field_name: fieldForm.field_name.trim(),
      crop_name: fieldForm.crop_name.trim(),
      crop_variety: fieldForm.crop_variety.trim() || undefined,
      growth_stage: fieldForm.growth_stage,
      sowing_date: fieldForm.sowing_date || undefined,
      crop_duration_days: numberValue(fieldForm.crop_duration_days),
      root_depth_m: Number(fieldForm.root_depth_m),
      kc: numberValue(fieldForm.kc),
      soil_type: fieldForm.soil_type,
      soil_moisture_percent: numberValue(fieldForm.soil_moisture_percent),
      field_capacity_percent: Number(fieldForm.field_capacity_percent),
      permanent_wilting_point_percent: Number(fieldForm.permanent_wilting_point_percent),
      soil_water_holding_capacity_mm_per_m: numberValue(fieldForm.soil_water_holding_capacity_mm_per_m),
      location: fieldForm.location.trim() || undefined,
      latitude: numberValue(fieldForm.latitude),
      longitude: numberValue(fieldForm.longitude),
      area_hectares: Number(fieldForm.area_hectares),
      irrigation_method: fieldForm.irrigation_method,
      irrigation_efficiency: numberValue(fieldForm.irrigation_efficiency),
      flow_rate_lpm: numberValue(fieldForm.flow_rate_lpm),
      water_source: fieldForm.water_source.trim() || undefined,
    };
    try {
      const field = await createIrrigationField(input);
      setSelectedFieldId(field.id);
      setInputsChanged(false);
      setWeather(null);
      setWeatherForm(EMPTY_WEATHER);
      setShowFieldForm(false);
      setFieldForm(INITIAL_FIELD);
      try {
        const nextRecommendation = await generateIrrigationRecommendation(field.id);
        setRecommendation(nextRecommendation);
        setInputsChanged(false);
        setFeedback('Field saved and an initial transparent recommendation was generated.');
      } catch (cause) {
        handleActionError(cause);
        setFeedback('Field saved. Generate its recommendation from the field panel.');
      }
      await refresh();
      setSelectedFieldId(field.id);
    } catch (cause) {
      handleActionError(cause);
    } finally {
      setBusy(false);
    }
  };

  const weatherPayload = (): IrrigationWeatherInput | undefined => {
    const payload: IrrigationWeatherInput = { source: 'manual' };
    let hasWeather = false;
    (Object.keys(EMPTY_WEATHER) as Array<keyof WeatherForm>).forEach((key) => {
      const value = numberValue(weatherForm[key]);
      if (value !== undefined) {
        payload[key] = value;
        hasWeather = true;
      }
    });
    return hasWeather ? payload : undefined;
  };

  const handleGenerate = async () => {
    if (!selectedField) return;
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      const next = await generateIrrigationRecommendation(selectedField.id, weatherPayload());
      setRecommendation(next);
      setInputsChanged(false);
      setScheduleAt(localDateTimeValue(1));
      setFeedback('Recommendation saved. It uses transparent rules; no irrigation ML model is configured.');
      await refresh();
      setRecommendation(next);
      setInputsChanged(false);
    } catch (cause) {
      handleActionError(cause);
    } finally {
      setBusy(false);
    }
  };

  const handleFetchWeather = async () => {
    if (!selectedField) return;
    setWeatherError(null);
    try {
      const nextWeather = await getIrrigationWeather(selectedField.id);
      setWeather(nextWeather);
      setInputsChanged(true);
    } catch (cause) {
      setWeatherError(cause instanceof Error ? cause.message : 'Unable to retrieve a live forecast.');
    }
  };

  const handleSensorSubmit = async () => {
    const moistureValue = numberValue(
      sensorMoisture || String(selectedField?.soil_moisture_percent ?? '')
    );
    if (!selectedField || moistureValue === undefined) return;
    setBusy(true);
    setError(null);
    try {
      await submitIrrigationSensorReading(selectedField.id, {
        soil_moisture_percent: moistureValue,
        source: sensorSource,
      });
      setFeedback(sensorSource === 'simulated'
        ? 'Simulated sensor reading saved and clearly labeled as simulated.'
        : 'Hardware reading saved with its hardware provenance.');
      await refresh();
    } catch (cause) {
      handleActionError(cause);
    } finally {
      setBusy(false);
    }
  };

  const handleSchedule = async () => {
    if (!selectedRecommendation || !scheduleAt) return;
    setBusy(true);
    setError(null);
    try {
      await createIrrigationSchedule(selectedRecommendation.id, new Date(scheduleAt).toISOString());
      setFeedback('Irrigation schedule added to your calendar.');
      await refresh();
    } catch (cause) {
      handleActionError(cause);
    } finally {
      setBusy(false);
    }
  };

  const handleCompleteSchedule = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!completionSchedule || numberValue(actualWater) === undefined) return;
    setBusy(true);
    setError(null);
    try {
      await completeIrrigationSchedule(completionSchedule.id, Number(actualWater));
      setCompletionSchedule(null);
      setActualWater('');
      setFeedback('Completed irrigation saved to field history using the actual water volume you entered.');
      await refresh();
    } catch (cause) {
      handleActionError(cause);
    } finally {
      setBusy(false);
    }
  };

  const handlePostpone = async (schedule: IrrigationSchedule) => {
    setBusy(true);
    setError(null);
    try {
      await postponeIrrigationSchedule(
        schedule.id,
        new Date(localDateTimeValue(1)).toISOString(),
        'Postponed from the irrigation dashboard'
      );
      setFeedback('Schedule marked postponed. Add a new schedule when the field is ready.');
      await refresh();
    } catch (cause) {
      handleActionError(cause);
    } finally {
      setBusy(false);
    }
  };

  const updateField = (key: keyof FieldForm, value: string) => {
    setFieldForm((previous) => ({ ...previous, [key]: value }));
  };

  const updateWeather = (key: keyof WeatherForm, value: string) => {
    setWeatherForm((previous) => ({ ...previous, [key]: value }));
    setInputsChanged(true);
  };

  const selectField = (fieldId: number) => {
    setSelectedFieldId(fieldId);
    setRecommendation(null);
    setWeather(null);
    setWeatherForm(EMPTY_WEATHER);
    setInputsChanged(false);
  };

  const alertCount = dashboard?.alerts.length ?? 0;
  if (loading) {
    return (
      <main className="flex flex-1 items-center justify-center bg-[#FAFCF8] p-8">
        <div className="flex items-center gap-3 text-sm text-slate-600"><LoaderCircle className="animate-spin" size={20} />Loading your irrigation data…</div>
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto bg-[#FAFCF8] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Farm Insight / Water management</p>
            <h1 className="mt-2 text-2xl font-semibold text-[#263B2C] sm:text-3xl">Smart irrigation</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Field-specific irrigation guidance from root-zone water balance, crop coefficients, measured moisture, and available weather data.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setNotificationOpen((open) => !open)} className="relative inline-flex items-center gap-2 rounded-xl border border-[#E5E0D0] bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" aria-expanded={notificationOpen}>
              <AlertTriangle size={16} /> Alerts
              {alertCount > 0 && <span className="rounded-full bg-rose-600 px-1.5 text-[10px] font-bold text-white">{alertCount}</span>}
            </button>
            <button type="button" onClick={() => setShowFieldForm((open) => !open)} className="inline-flex items-center gap-2 rounded-xl bg-[#28613E] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1F4E32]">
              <Plus size={16} /> Add field
            </button>
          </div>
        </header>

        {error && (
          <div role="alert" className="flex flex-col justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 sm:flex-row sm:items-center">
            <span>{error}</span>
            <div className="flex gap-2">
              {error.toLowerCase().includes('sign in') && <button type="button" onClick={onSignIn} className="rounded-lg bg-rose-700 px-3 py-1.5 font-semibold text-white">Sign in</button>}
              <button type="button" onClick={() => { setError(null); void refresh().catch(handleActionError); }} className="rounded-lg border border-rose-300 px-3 py-1.5 font-semibold">Retry</button>
            </div>
          </div>
        )}
        {feedback && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{feedback}</div>}

        {notificationOpen && (
          <section aria-label="Irrigation alerts" className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-semibold text-amber-950">Field alerts</h2>
              <button type="button" onClick={() => setNotificationOpen(false)} aria-label="Close alerts"><X size={17} /></button>
            </div>
            {dashboard?.alerts.length ? (
              <ul className="space-y-2 text-sm text-amber-900">{dashboard.alerts.map((message, index) => <li key={`${message}-${index}`} className="flex gap-2"><AlertTriangle size={16} className="mt-0.5 shrink-0" />{message}</li>)}</ul>
            ) : <p className="text-sm text-amber-900">No active alerts. Alerts require current field, sensor, schedule, or forecast data.</p>}
          </section>
        )}

        {showFieldForm && (
          <section className="rounded-2xl border border-[#E5E0D0] bg-white p-4 shadow-sm sm:p-6">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div><h2 className="text-lg font-semibold text-[#263B2C]">Register a field</h2><p className="mt-1 text-sm text-slate-500">Manual soil/crop data is saved to your account. Unknown crop coefficients must be entered.</p></div>
              <button type="button" onClick={() => setShowFieldForm(false)} aria-label="Close field form" className="rounded-lg p-2 hover:bg-slate-100"><X size={18} /></button>
            </div>
            <form onSubmit={handleCreateField} className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <FormInput label="Field name" value={fieldForm.field_name} onChange={(value) => updateField('field_name', value)} required />
                <FormInput label="Crop" value={fieldForm.crop_name} onChange={(value) => updateField('crop_name', value)} required />
                <FormInput label="Variety" value={fieldForm.crop_variety} onChange={(value) => updateField('crop_variety', value)} />
                <FormInput label="Growth stage" value={fieldForm.growth_stage} onChange={(value) => updateField('growth_stage', value)} required />
                <FormInput label="Sowing date" type="date" value={fieldForm.sowing_date} onChange={(value) => updateField('sowing_date', value)} />
                <FormInput label="Crop duration (days)" type="number" min="1" value={fieldForm.crop_duration_days} onChange={(value) => updateField('crop_duration_days', value)} />
                <FormInput label="Root depth (m)" type="number" step="0.01" min="0.01" value={fieldForm.root_depth_m} onChange={(value) => updateField('root_depth_m', value)} required />
                <FormInput label="Crop Kc (blank = reference)" type="number" step="0.01" min="0.01" max="2.5" value={fieldForm.kc} onChange={(value) => updateField('kc', value)} />
                <FormSelect label="Soil type" value={fieldForm.soil_type} onChange={(value) => updateField('soil_type', value)} options={['sandy', 'loamy', 'clay', 'black', 'red']} />
                <FormInput label="Soil moisture (%)" type="number" step="0.1" min="0" max="100" value={fieldForm.soil_moisture_percent} onChange={(value) => updateField('soil_moisture_percent', value)} />
                <FormInput label="Field capacity (%)" type="number" step="0.1" min="0.1" max="100" value={fieldForm.field_capacity_percent} onChange={(value) => updateField('field_capacity_percent', value)} required />
                <FormInput label="Wilting point (%)" type="number" step="0.1" min="0" max="100" value={fieldForm.permanent_wilting_point_percent} onChange={(value) => updateField('permanent_wilting_point_percent', value)} required />
                <FormInput label="Available water (mm/m, optional)" type="number" step="1" min="1" value={fieldForm.soil_water_holding_capacity_mm_per_m} onChange={(value) => updateField('soil_water_holding_capacity_mm_per_m', value)} />
                <FormInput label="Farm location (for live weather)" value={fieldForm.location} onChange={(value) => updateField('location', value)} placeholder="City, district, or town" />
                <FormInput label="Latitude (optional)" type="number" step="any" min="-90" max="90" value={fieldForm.latitude} onChange={(value) => updateField('latitude', value)} />
                <FormInput label="Longitude (optional)" type="number" step="any" min="-180" max="180" value={fieldForm.longitude} onChange={(value) => updateField('longitude', value)} />
                <FormInput label="Field area (ha)" type="number" step="0.01" min="0.01" value={fieldForm.area_hectares} onChange={(value) => updateField('area_hectares', value)} required />
                <FormSelect label="Irrigation method" value={fieldForm.irrigation_method} onChange={(value) => updateField('irrigation_method', value as IrrigationMethod)} options={['drip', 'micro_sprinkler', 'sprinkler', 'surface']} />
                <FormInput label="Efficiency override (0-1)" type="number" step="0.01" min="0.01" max="1" value={fieldForm.irrigation_efficiency} onChange={(value) => updateField('irrigation_efficiency', value)} placeholder="Use typical method value" />
                <FormInput label="System flow (L/min)" type="number" step="0.1" min="0.1" value={fieldForm.flow_rate_lpm} onChange={(value) => updateField('flow_rate_lpm', value)} />
                <FormInput label="Water source" value={fieldForm.water_source} onChange={(value) => updateField('water_source', value)} placeholder="Well, canal, tank…" />
              </div>
              <p className="text-xs text-slate-500">Typical method efficiencies are planning assumptions (drip 90%, micro-sprinkler 85%, sprinkler 75%, surface 60%); override them with field measurements when available.</p>
              <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-[#28613E] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
                {busy ? <LoaderCircle size={16} className="animate-spin" /> : <Plus size={16} />} Save field
              </button>
            </form>
          </section>
        )}

        {alertCount > 0 && !notificationOpen && (
          <section className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
            <span>{alertCount} active field alert{alertCount === 1 ? '' : 's'} need review.</span>
            <button type="button" onClick={() => setNotificationOpen(true)} className="ml-auto font-semibold underline">Review alerts</button>
          </section>
        )}

        {dashboard && (
          <>
            <section aria-label="Irrigation overview" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard icon={Sprout} label="Monitored fields" value={String(dashboard.total_fields)} detail="Fields in your account" />
              <MetricCard icon={AlertTriangle} label="Irrigation required" value={String(dashboard.fields_requiring_irrigation)} detail="Latest saved recommendation" tone="amber" />
              <MetricCard icon={Waves} label="Average soil moisture" value={dashboard.average_soil_moisture_percent === null ? '—' : `${dashboard.average_soil_moisture_percent.toFixed(1)}%`} detail="Current field readings" tone="blue" />
              <MetricCard icon={Droplets} label="Water estimate" value={`${Math.round(dashboard.estimated_water_requirement_litres).toLocaleString()} L`} detail={`Potential rain savings ${Math.round(dashboard.potential_water_savings_litres).toLocaleString()} L`} />
            </section>

            {dashboard.fields.length === 0 ? (
              <section className="rounded-2xl border border-dashed border-emerald-300 bg-white px-5 py-12 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><Droplets size={26} /></div>
                <h2 className="text-lg font-semibold text-[#263B2C]">Start with your first field</h2>
                <p className="mx-auto mt-2 max-w-lg text-sm text-slate-500">Register crop stage, root-zone soil limits, field size, and irrigation equipment. Recommendations will use measured values and clearly label any missing weather data.</p>
                <button type="button" onClick={() => setShowFieldForm(true)} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#28613E] px-4 py-2.5 text-sm font-semibold text-white"><Plus size={16} /> Register a field</button>
              </section>
            ) : (
              <>
                <section className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
                  <article className="rounded-2xl border border-[#E5E0D0] bg-white p-5 shadow-sm sm:p-6">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Field recommendation</p>
                        <h2 className="mt-1 text-xl font-semibold text-[#263B2C]">{selectedField?.field_name ?? 'Select a field'}</h2>
                        {selectedField && <p className="mt-1 text-sm text-slate-500">{selectedField.crop_name}{selectedField.crop_variety ? ` · ${selectedField.crop_variety}` : ''} · {selectedField.growth_stage}</p>}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {selectedRecommendation && <StatusBadge status={selectedRecommendation.status} />}
                        <button type="button" disabled={!selectedField || busy} onClick={() => void handleGenerate()} className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-50">
                          {busy ? <LoaderCircle size={14} className="animate-spin" /> : <RefreshCw size={14} />} Recalculate
                        </button>
                      </div>
                    </div>
                    {selectedRecommendation ? (
                      <div className="mt-5">
                        {recommendationStale && <p role="status" className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Field readings or weather inputs changed after this recommendation. Recalculate before scheduling.</p>}
                        <p className="text-sm leading-6 text-slate-700">{selectedRecommendation.explanation}</p>
                        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                          <ValueTile label="Water requirement" value={selectedRecommendation.required_water_litres === null ? 'Unknown' : `${Math.round(selectedRecommendation.required_water_litres).toLocaleString()} L`} />
                          <ValueTile label="Irrigation depth" value={selectedRecommendation.gross_requirement_mm === null ? '—' : `${selectedRecommendation.gross_requirement_mm.toFixed(1)} mm`} />
                          <ValueTile label="Run time" value={selectedRecommendation.estimated_duration_minutes === null ? 'Flow needed' : `${Math.ceil(selectedRecommendation.estimated_duration_minutes)} min`} />
                          <ValueTile label="Best time" value={selectedRecommendation.recommended_date ? `${new Date(`${selectedRecommendation.recommended_date}T00:00:00`).toLocaleDateString()} · ${selectedRecommendation.recommended_time ?? '06:00'}` : 'Monitor conditions'} />
                        </div>
                        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500">
                          <span>ET₀ {selectedRecommendation.et0_mm_day === null ? 'not available' : `${selectedRecommendation.et0_mm_day.toFixed(2)} mm/day`}</span>
                          <span>ETc {selectedRecommendation.etc_mm_day === null ? 'not available' : `${selectedRecommendation.etc_mm_day.toFixed(2)} mm/day`}</span>
                          <span>Method {selectedRecommendation.recommended_method.replace('_', ' ')}</span>
                          <span>Weather: {selectedRecommendation.weather_source}</span>
                        </div>
                        {selectedRecommendation.alerts.length > 0 && (
                          <ul className="mt-4 space-y-1.5 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
                            {selectedRecommendation.alerts.map((message, index) => <li key={`${message}-${index}`} className="flex gap-2"><AlertTriangle size={14} className="mt-0.5 shrink-0" />{message}</li>)}
                          </ul>
                        )}
                        <div className="mt-5 flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-end">
                          <label className="flex-1 text-xs font-medium text-slate-600">Schedule irrigation
                            <input type="datetime-local" value={scheduleAt} onChange={(event) => setScheduleAt(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                          </label>
                          <button type="button" disabled={busy || recommendationStale || selectedRecommendation.status === 'Not Required' || !selectedRecommendation.required_water_litres} onClick={() => void handleSchedule()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
                            <CalendarDays size={15} /> Add to calendar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-6 rounded-xl bg-slate-50 p-5 text-sm text-slate-600">Generate a recommendation to see water quantity, timing, duration, and calculation details.</div>
                    )}
                  </article>

                  <article className="rounded-2xl border border-[#E5E0D0] bg-white p-5 shadow-sm">
                    <PanelTitle title="Field controls" detail="Select a field to update sensor readings and weather inputs." />
                    {selectedField ? (
                      <>
                        <div className="mb-4 flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">
                          <MapPin size={16} />
                          <span>{selectedField.location || 'No location set'}</span>
                        </div>
                        <label className="block text-xs font-medium text-slate-600">Selected field
                          <select value={selectedField.id} onChange={(event) => selectField(Number(event.target.value))} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                            {dashboard.fields.map((field) => <option key={field.id} value={field.id}>{field.field_name} · {field.crop_name}</option>)}
                          </select>
                        </label>
                        <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                          <div className="rounded-xl bg-slate-50 p-3"><span className="text-slate-500">Soil</span><p className="mt-1 font-semibold capitalize text-slate-800">{selectedField.soil_type}</p></div>
                          <div className="rounded-xl bg-slate-50 p-3"><span className="text-slate-500">Kc</span><p className="mt-1 font-semibold text-slate-800">{selectedField.kc.toFixed(2)} · {selectedField.kc_source === 'farmer_input' ? 'manual' : 'reference'}</p></div>
                        </div>
                        <div className="mt-5 border-t border-slate-100 pt-4">
                          <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800"><Gauge size={15} /> Sensor reading</p>
                          <div className="flex gap-2">
                            <input aria-label="Sensor soil moisture percentage" type="number" min="0" max="100" step="0.1" value={sensorMoisture || String(selectedField.soil_moisture_percent ?? '')} onChange={(event) => setSensorMoisture(event.target.value)} placeholder="Moisture %" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                            <select aria-label="Sensor reading source" value={sensorSource} onChange={(event) => setSensorSource(event.target.value as 'simulated' | 'hardware')} className="rounded-lg border border-slate-200 bg-white px-2 text-xs">
                              <option value="simulated">Simulated</option><option value="hardware">Hardware</option>
                            </select>
                          </div>
                          <button type="button" disabled={busy} onClick={() => void handleSensorSubmit()} className="mt-2 w-full rounded-lg border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-50">Save {sensorSource} reading</button>
                          {selectedField.moisture_source && <p className="mt-2 text-[11px] text-slate-500">Last source: {selectedField.moisture_source} · {selectedField.moisture_updated_at ? new Date(selectedField.moisture_updated_at).toLocaleString() : 'time unavailable'}</p>}
                        </div>
                        <div className="mt-5 border-t border-slate-100 pt-4">
                          <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800"><CloudRain size={15} /> Weather input</p>
                          <div className="grid grid-cols-2 gap-2">
                            <WeatherInput label="Temp °C" value={weatherForm.temperature_c} onChange={(value) => updateWeather('temperature_c', value)} />
                            <WeatherInput label="Tmin °C" value={weatherForm.temp_min_c} onChange={(value) => updateWeather('temp_min_c', value)} />
                            <WeatherInput label="Tmax °C" value={weatherForm.temp_max_c} onChange={(value) => updateWeather('temp_max_c', value)} />
                            <WeatherInput label="RH %" value={weatherForm.humidity_percent} onChange={(value) => updateWeather('humidity_percent', value)} />
                            <WeatherInput label="Wind at 2m (m/s)" value={weatherForm.wind_speed_m_s} onChange={(value) => updateWeather('wind_speed_m_s', value)} />
                            <WeatherInput label="Radiation MJ/m²" value={weatherForm.solar_radiation_mj_m2_day} onChange={(value) => updateWeather('solar_radiation_mj_m2_day', value)} />
                            <WeatherInput label="Elevation m" value={weatherForm.elevation_m} onChange={(value) => updateWeather('elevation_m', value)} />
                            <WeatherInput label="Rain mm" value={weatherForm.rainfall_mm} onChange={(value) => updateWeather('rainfall_mm', value)} />
                            <WeatherInput label="Rain chance %" value={weatherForm.rainfall_probability_percent} onChange={(value) => updateWeather('rainfall_probability_percent', value)} />
                          </div>
                          <p className="mt-2 text-[11px] text-slate-500">Enter Tmin/Tmax and elevation, and register latitude, to enable FAO-56 ET₀. Leave blank to request live weather for the field location.</p>
                        </div>
                      </>
                    ) : <EmptyChart message="Select or add a field to manage readings." />}
                  </article>
                </section>

                <section className="grid gap-5 lg:grid-cols-2">
                  <article className="rounded-2xl border border-[#E5E0D0] bg-white p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <PanelTitle title="7-day weather" detail={weather?.location ?? 'Forecast from Open-Meteo when configured and field location is available.'} />
                      <button type="button" onClick={() => void handleFetchWeather()} disabled={!selectedField?.location} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-40"><RefreshCw size={13} /> Refresh</button>
                    </div>
                    {weatherError && <p role="alert" className="mb-3 rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{weatherError}</p>}
                    {weather?.forecast.length ? (
                      <>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
                        {weather.forecast.map((day) => (
                          <div key={day.date} className="rounded-xl bg-slate-50 p-3">
                            <p className="text-[11px] font-semibold text-slate-500">{new Date(`${day.date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short' })}</p>
                            <p className="mt-2 text-sm font-semibold text-slate-800">{day.temp_max_c === null ? '—' : `${Math.round(day.temp_max_c)}°`}</p>
                            <p className="mt-1 flex items-center gap-1 text-[11px] text-sky-700"><CloudRain size={12} />{day.rainfall_mm.toFixed(1)} mm</p>
                            <p className="mt-1 text-[10px] text-slate-500">{Math.round(day.rainfall_probability_percent)}% rain chance</p>
                          </div>
                        ))}
                      </div>
                      <div className="mt-4 border-t border-slate-100 pt-4">
                        <p className="mb-3 text-xs font-medium text-slate-500">Forecast rainfall (mm)</p>
                        <BarChart values={weather.forecast.map((day) => ({ date: day.date.slice(5), rainfall: day.rainfall_mm }))} labelKey="date" valueKey="rainfall" suffix=" mm" color="bg-sky-500" />
                      </div>
                      </>
                    ) : <EmptyChart message={selectedField?.location ? 'Use Refresh to fetch the current 7-day forecast.' : 'Add a city or district to the field to request a live forecast. Recommendations remain available with soil data.'} />}
                  </article>
                  <article className="rounded-2xl border border-[#E5E0D0] bg-white p-5 shadow-sm">
                    <PanelTitle title="Irrigation calendar" detail="Upcoming, completed, postponed, and missed events." />
                    {dashboard.schedules.length ? (
                      <div className="max-h-72 space-y-2 overflow-y-auto">
                        {dashboard.schedules.map((schedule) => {
                          const field = dashboard.fields.find((item) => item.id === schedule.field_id);
                          return (
                            <div key={schedule.id} className="flex flex-col justify-between gap-3 rounded-xl border border-slate-100 p-3 sm:flex-row sm:items-center">
                              <div>
                                <p className="text-sm font-semibold text-slate-800">{field?.field_name ?? 'Field'} · {new Date(schedule.scheduled_at).toLocaleString()}</p>
                                <p className="mt-1 text-xs text-slate-500">{schedule.planned_water_litres === null ? 'Water quantity unavailable' : `${Math.round(schedule.planned_water_litres).toLocaleString()} L planned`}{schedule.notes ? ` · ${schedule.notes}` : ''}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <StatusBadge status={schedule.status} />
                                {(schedule.status === 'scheduled' || schedule.status === 'missed' || schedule.status === 'postponed') && <>
                                  <button type="button" onClick={() => { setCompletionSchedule(schedule); setActualWater(schedule.planned_water_litres ? String(Math.round(schedule.planned_water_litres)) : ''); }} className="rounded-lg p-2 text-emerald-700 hover:bg-emerald-50" aria-label={`Complete irrigation for ${field?.field_name ?? 'field'}`}><Check size={16} /></button>
                                  <button type="button" onClick={() => void handlePostpone(schedule)} className="rounded-lg p-2 text-sky-700 hover:bg-sky-50" aria-label={`Postpone irrigation for ${field?.field_name ?? 'field'}`}><CalendarDays size={16} /></button>
                                </>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : <EmptyChart message="Schedules appear here after you add a recommendation to your calendar." />}
                  </article>
                </section>

                <section className="grid gap-5 xl:grid-cols-3">
                  <article className="rounded-2xl border border-[#E5E0D0] bg-white p-5 shadow-sm">
                    <PanelTitle title="Soil moisture trend" detail="Manual and sensor readings, by time recorded." />
                    {analytics?.soil_moisture_trend.length ? <TrendChart values={analytics.soil_moisture_trend} valueKey="moisture_percent" /> : <EmptyChart message="Save more than one field or sensor reading to build a trend." />}
                  </article>
                  <article className="rounded-2xl border border-[#E5E0D0] bg-white p-5 shadow-sm">
                    <PanelTitle title="Crop water demand" detail="ETc derived from ET₀ × crop Kc when weather data is complete." />
                    {analytics?.crop_water_demand.length ? <BarChart values={analytics.crop_water_demand.map((item) => ({ label: `${item.field_name} · ${item.crop}`, demand: item.etc_mm_day }))} labelKey="label" valueKey="demand" suffix=" mm/day" color="bg-sky-500" /> : <EmptyChart message="Complete weather inputs are needed before crop-demand estimates appear." />}
                  </article>
                  <article className="rounded-2xl border border-[#E5E0D0] bg-white p-5 shadow-sm">
                    <PanelTitle title="Measured water use" detail={`Last 30 days · ${Math.round(analytics?.water_used_litres ?? 0).toLocaleString()} L recorded`} />
                    {analytics?.water_consumption.length ? <BarChart values={analytics.water_consumption} labelKey="date" valueKey="litres" suffix=" L" /> : <EmptyChart message="Completed or manually recorded irrigation creates water-use analytics." />}
                  </article>
                </section>

                <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(300px,0.7fr)]">
                  <article className="rounded-2xl border border-[#E5E0D0] bg-white p-5 shadow-sm">
                    <PanelTitle title="Field monitoring" detail="Current root-zone status and last irrigation." />
                    <div className="grid gap-3 md:grid-cols-2">
                      {dashboard.fields.map((field) => {
                        const fieldRecommendation = dashboard.recommendations.find((item) => item.field_id === field.id);
                        return (
                          <button key={field.id} type="button" onClick={() => selectField(field.id)} className={`rounded-xl border p-4 text-left transition-colors ${field.id === selectedFieldId ? 'border-emerald-400 bg-emerald-50/50' : 'border-slate-100 hover:border-emerald-200 hover:bg-slate-50'}`}>
                            <div className="flex items-start justify-between gap-2">
                              <div><p className="font-semibold text-slate-800">{field.field_name}</p><p className="mt-1 text-xs text-slate-500">{field.crop_name} · <span className="capitalize">{field.soil_type}</span></p></div>
                              {fieldRecommendation && <StatusBadge status={fieldRecommendation.status} />}
                            </div>
                            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-600">
                              <span className="inline-flex items-center gap-1"><Waves size={13} />{field.soil_moisture_percent === null ? 'No moisture reading' : `${field.soil_moisture_percent.toFixed(1)}%`}</span>
                              <span className="inline-flex items-center gap-1"><CalendarDays size={13} />{field.last_irrigation_at ? new Date(field.last_irrigation_at).toLocaleDateString() : 'Not recorded'}</span>
                              <span className="inline-flex items-center gap-1"><Droplets size={13} />{field.area_hectares} ha</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </article>
                  <article className="rounded-2xl border border-[#E5E0D0] bg-white p-5 shadow-sm">
                    <PanelTitle title="Water optimization" detail="Savings are estimates from effective forecast rainfall, not measured historical savings." />
                    <div className="rounded-xl bg-sky-50 p-4">
                      <div className="flex items-center gap-2 text-sky-900"><CloudRain size={18} /><span className="text-sm font-semibold">Potential rainfall offset</span></div>
                      <p className="mt-3 text-2xl font-semibold text-sky-950">{Math.round(dashboard.potential_water_savings_litres).toLocaleString()} L</p>
                      <p className="mt-1 text-xs leading-5 text-sky-800">Estimated from the latest saved recommendation per field. No baseline irrigation consumption is assumed.</p>
                    </div>
                    <div className="mt-4 space-y-2 text-xs leading-5 text-slate-600">
                      <p className="flex gap-2"><Leaf size={14} className="mt-0.5 shrink-0 text-emerald-700" /> Irrigate during cooler, calmer hours to reduce evaporation and wind drift.</p>
                      <p className="flex gap-2"><Droplets size={14} className="mt-0.5 shrink-0 text-emerald-700" /> Check distribution uniformity and system flow before changing runtime.</p>
                      <p className="flex gap-2"><ThermometerSun size={14} className="mt-0.5 shrink-0 text-emerald-700" /> Calibrate soil probes against a field soil sample before relying on thresholds.</p>
                    </div>
                  </article>
                </section>

                <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-600">
                  <strong className="text-slate-700">Calculation notes:</strong> Root-zone depletion uses volumetric moisture, field capacity, wilting point, and root depth. Generic crop Kc references and method efficiencies are planning estimates, not local calibration.                   ET₀ uses FAO-56 Penman–Monteith only when Tmin/Tmax, mean humidity, wind at 2 m, solar radiation, latitude and elevation are available; otherwise recommendations explicitly fall back to soil-water balance. No trained irrigation ML model is configured.
                </section>
              </>
            )}
          </>
        )}
      </div>

      {completionSchedule && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/40 p-4">
          <form onSubmit={handleCompleteSchedule} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between"><div><h2 className="font-semibold text-slate-900">Record completed irrigation</h2><p className="mt-1 text-xs text-slate-500">Enter measured use; this is stored as actual history.</p></div><button type="button" onClick={() => setCompletionSchedule(null)} aria-label="Close completion form"><X size={18} /></button></div>
            <FormInput label="Actual water used (litres)" type="number" min="0.1" step="0.1" value={actualWater} onChange={setActualWater} required />
            <div className="flex justify-end gap-2"><button type="button" onClick={() => setCompletionSchedule(null)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">Cancel</button><button type="submit" disabled={busy} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Save completed irrigation</button></div>
          </form>
        </div>
      )}
    </main>
  );
}

function ValueTile({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-[#F6F8F3] p-3"><p className="text-[11px] text-slate-500">{label}</p><p className="mt-1 text-sm font-semibold text-[#263B2C]">{value}</p></div>;
}

function FormInput({
  label,
  value,
  onChange,
  type = 'text',
  required = false,
  placeholder,
  min,
  max,
  step,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
  min?: string;
  max?: string;
  step?: string;
}) {
  return (
    <label className="block text-xs font-medium text-slate-600">
      {label}
      <input type={type} required={required} min={min} max={max} step={step} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" />
    </label>
  );
}

function FormSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-xs font-medium capitalize text-slate-600">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm capitalize text-slate-800">
        {options.map((option) => <option key={option} value={option}>{option.replace('_', ' ')}</option>)}
      </select>
    </label>
  );
}

function WeatherInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="text-[10px] font-medium text-slate-500">{label}<input type="number" step="any" value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs" /></label>;
}
