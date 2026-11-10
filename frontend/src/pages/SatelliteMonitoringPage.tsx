import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LatLngBoundsExpression, Map as LeafletMap } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  AlertTriangle,
  CalendarDays,
  Download,
  Eye,
  FileUp,
  Leaf,
  LoaderCircle,
  MapPin,
  RefreshCw,
  Satellite,
  ShieldCheck,
} from 'lucide-react';
import {
  analyzeSatelliteField,
  downloadSatelliteReport,
  getSatelliteDemo,
  getSatelliteFields,
  getSatelliteHistory,
  getSatelliteInsights,
  getSatelliteMap,
  getSatelliteStatus,
  saveSatelliteBoundary,
  uploadSatelliteBoundary,
} from '../api/client';
import { useAuth } from '../context/AuthContext';
import {
  SatelliteAvailability,
  SatelliteDemo,
  SatelliteField,
  SatelliteInsights,
  SatelliteObservation,
} from '../types/satellite';

interface SatelliteMonitoringPageProps {
  onSignIn: () => void;
  onOpenIrrigation: () => void;
}

function SatelliteMap({
  field,
  imageUrl,
}: {
  field: SatelliteField | null;
  imageUrl: string | null;
}) {
  const mapElement = useRef<HTMLDivElement>(null);
  const [mapError, setMapError] = useState(false);

  useEffect(() => {
    if (!mapElement.current) return;
    let active = true;
    let map: LeafletMap | null = null;
    let resize: (() => void) | null = null;
    setMapError(false);
    const initialize = async () => {
      try {
        const { default: L } = await import('leaflet');
        if (!active || !mapElement.current) return;

        map = L.map(mapElement.current, { scrollWheelZoom: true });
        const satellite = L.tileLayer(
          'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          { attribution: 'Tiles &copy; Esri' }
        );
        const streets = L.tileLayer(
          'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
          { attribution: '&copy; OpenStreetMap contributors' }
        );
        satellite.addTo(map);
        const overlays: Record<string, L.Layer> = {};
        let boundaryLayer: L.GeoJSON | null = null;
        let vegetationLayer: L.ImageOverlay | null = null;

        const summary = field?.geometry_summary;
        if (summary) {
          const [west, south, east, north] = summary.bounds;
          const bounds: LatLngBoundsExpression = [[south, west], [north, east]];
          if (field.boundary) {
            boundaryLayer = L.geoJSON(field.boundary, {
              style: { color: '#f5c84c', weight: 3, fillOpacity: 0.05 },
            });
            overlays['Field boundary'] = boundaryLayer;
          }
          if (imageUrl) {
            vegetationLayer = L.imageOverlay(imageUrl, bounds, { opacity: 0.82, interactive: true });
            overlays['NDVI overlay'] = vegetationLayer;
          }
          map.fitBounds(bounds, { padding: [24, 24], maxZoom: 17 });
        } else {
          map.setView([20.5937, 78.9629], 4);
        }
        L.control.layers(
          { 'Satellite basemap': satellite, 'Street map': streets },
          overlays
        ).addTo(map);
        boundaryLayer?.addTo(map);
        vegetationLayer?.addTo(map);

        resize = () => map?.invalidateSize();
        window.addEventListener('resize', resize);
      } catch {
        if (active) setMapError(true);
      }
    };
    void initialize();
    return () => {
      active = false;
      if (resize) window.removeEventListener('resize', resize);
      map?.remove();
    };
  }, [field, imageUrl]);

  return (
    <>
      <div ref={mapElement} className="h-[360px] w-full rounded-2xl bg-slate-100 sm:h-[440px]" aria-label="Interactive farm satellite map" />
      {mapError && <p role="alert" className="mt-2 text-sm text-red-700">The interactive map could not be loaded.</p>}
    </>
  );
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-2xl border border-[#E8E3D5] bg-white p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-bold text-[#234E37]">{value}</div>
      {detail && <div className="mt-1 text-xs text-slate-500">{detail}</div>}
    </div>
  );
}

function formatValue(value: number | null | undefined, digits = 2): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '—';
}

function NdviTrend({ observations }: { observations: SatelliteObservation[] }) {
  const values = useMemo(
    () =>
      [...observations]
        .filter((item) => typeof item.statistics.mean === 'number')
        .sort((left, right) => left.acquisition_date.localeCompare(right.acquisition_date)),
    [observations]
  );
  if (values.length < 2) {
    return (
      <p className="text-sm text-slate-500">
        At least two actual satellite observations are needed to draw a trend. Missing dates are not interpolated.
      </p>
    );
  }
  const points = values.map((item, index) => {
    const x = 36 + (index / (values.length - 1)) * 560;
    const y = 18 + ((1 - (item.statistics.mean ?? 0)) / 2) * 145;
    return { x, y, item };
  });
  const line = points.map((point) => `${point.x},${point.y}`).join(' ');
  return (
    <div>
      <svg viewBox="0 0 620 195" role="img" aria-label="Observed NDVI values over time" className="w-full">
        <line x1="36" y1="18" x2="36" y2="163" stroke="#CBD5E1" />
        <line x1="36" y1="163" x2="596" y2="163" stroke="#CBD5E1" />
        <text x="2" y="23" className="fill-slate-500 text-[11px]">1.0</text>
        <text x="2" y="93" className="fill-slate-500 text-[11px]">0.0</text>
        <text x="2" y="164" className="fill-slate-500 text-[11px]">-1.0</text>
        <polyline points={line} fill="none" stroke="#2D7A46" strokeWidth="3" />
        {points.map(({ x, y, item }) => (
          <g key={item.id}>
            <circle cx={x} cy={y} r="5" fill="#2D7A46" />
            <title>{`${item.acquisition_date}: NDVI ${formatValue(item.statistics.mean)}`}</title>
          </g>
        ))}
        <text x="36" y="184" className="fill-slate-500 text-[10px]">{values[0].acquisition_date}</text>
        <text x="596" y="184" textAnchor="end" className="fill-slate-500 text-[10px]">{values[values.length - 1].acquisition_date}</text>
      </svg>
      <p className="text-xs text-slate-500">Each point represents an observation returned by Copernicus.</p>
    </div>
  );
}

export function SatelliteMonitoringPage({
  onSignIn,
  onOpenIrrigation,
}: SatelliteMonitoringPageProps) {
  const { status: authStatus } = useAuth();
  const [provider, setProvider] = useState<SatelliteAvailability | null>(null);
  const [demoData, setDemoData] = useState<SatelliteDemo | null>(null);
  const [fields, setFields] = useState<SatelliteField[]>([]);
  const [fieldId, setFieldId] = useState<number | null>(null);
  const [observations, setObservations] = useState<SatelliteObservation[]>([]);
  const [selectedObservationId, setSelectedObservationId] = useState<number | null>(null);
  const [insights, setInsights] = useState<SatelliteInsights | null>(null);
  const [mapUrl, setMapUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [startDate, setStartDate] = useState(() => {
    const start = new Date();
    start.setDate(start.getDate() - 90);
    return start.toISOString().slice(0, 10);
  });
  const endDate = new Date().toISOString().slice(0, 10);
  const field = fields.find((item) => item.id === fieldId) ?? null;
  const latest = observations[0] ?? null;
  const selectedObservation =
    observations.find((item) => item.id === selectedObservationId) ?? latest;

  const refreshFieldData = useCallback(async (selectedFieldId: number) => {
    const [history, healthInsights] = await Promise.all([
      getSatelliteHistory(selectedFieldId),
      getSatelliteInsights(selectedFieldId),
    ]);
    setObservations(history);
    setSelectedObservationId((current) =>
      history.some((item) => item.id === current) ? current : history[0]?.id ?? null
    );
    setInsights(healthInsights);
  }, []);

  useEffect(() => {
    if (authStatus === 'loading' || authStatus !== 'authenticated') return;
    let active = true;
    Promise.all([getSatelliteStatus(), getSatelliteFields()])
      .then(([availability, availableFields]) => {
        if (!active) return;
        setProvider(availability);
        setFields(availableFields);
        if (availableFields.length) setFieldId((current) => current ?? availableFields[0].id);
      })
      .catch((cause: Error) => {
        if (active) setError(cause.message);
      });
    return () => {
      active = false;
    };
  }, [authStatus]);

  useEffect(() => {
    if (fieldId === null || authStatus !== 'authenticated') {
      setObservations([]);
      setInsights(null);
      return;
    }
    let active = true;
    refreshFieldData(fieldId).catch((cause: Error) => {
      if (active) setError(cause.message);
    });
    return () => {
      active = false;
    };
  }, [authStatus, fieldId, refreshFieldData]);

  useEffect(() => {
    if (!field || !selectedObservation) {
      setMapUrl(null);
      return;
    }
    setMapUrl(null);
    let active = true;
    let objectUrl: string | null = null;
    getSatelliteMap(field.id, selectedObservation.acquisition_date)
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setMapUrl(objectUrl);
      })
      .catch((cause: Error) => {
        if (active) {
          setMapUrl(null);
          setError(cause.message);
        }
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [field, selectedObservation]);

  const handleBoundaryUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !field) return;
    setBusy(true);
    setError('');
    try {
      const updatedField = /\.(geojson|json)$/i.test(file.name)
        ? await saveSatelliteBoundary(field.id, JSON.parse(await file.text()) as Record<string, unknown>)
        : await uploadSatelliteBoundary(field.id, file);
      setFields((current) => current.map((item) => item.id === updatedField.id ? updatedField : item));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Boundary upload failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleAnalyze = async () => {
    if (!field) return;
    setBusy(true);
    setError('');
    try {
      await analyzeSatelliteField(field.id, startDate, endDate);
      await refreshFieldData(field.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Satellite analysis failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadReport = async () => {
    if (!field) return;
    setBusy(true);
    setError('');
    try {
      const file = await downloadSatelliteReport(field.id);
      const objectUrl = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `farm-health-${field.id}.pdf`;
      link.click();
      URL.revokeObjectURL(objectUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Farm health report could not be downloaded.');
    } finally {
      setBusy(false);
    }
  };

  const handleShowDemo = async () => {
    setBusy(true);
    setError('');
    try {
      setDemoData(await getSatelliteDemo());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The calculation demo could not be loaded.');
    } finally {
      setBusy(false);
    }
  };

  if (authStatus === 'loading') {
    return <div className="p-8 text-sm text-slate-600" role="status">Loading your farm session…</div>;
  }
  if (authStatus !== 'authenticated') {
    return (
      <main className="flex-1 bg-[#FAF7EE] p-5 sm:p-8">
        <section className="mx-auto max-w-3xl rounded-3xl border border-[#E8E3D5] bg-white p-8 text-center">
          <Satellite className="mx-auto mb-4 text-[#2D7A46]" size={36} />
          <h1 className="text-2xl font-bold text-[#234E37]">Satellite Farm Health</h1>
          <p className="mt-3 text-sm text-slate-600">Sign in to register boundaries and monitor your own fields.</p>
          <button type="button" onClick={onSignIn} className="mt-6 rounded-xl bg-[#234E37] px-5 py-3 text-sm font-semibold text-white">Sign in to continue</button>
        </section>
      </main>
    );
  }

  const distribution = selectedObservation?.statistics.vegetation_distribution;
  const classLabels = [
    ['non_vegetated_or_water', 'Non-vegetated / water', '#6B7280'],
    ['very_low', 'Very low', '#B94A32'],
    ['low', 'Low', '#E4A33B'],
    ['moderate', 'Moderate', '#D6CD4F'],
    ['high', 'High', '#78B349'],
    ['very_high', 'Very high', '#267947'],
  ] as const;
  const monitoredArea = fields.reduce(
    (total, item) => total + (item.geometry_summary?.area_hectares ?? 0),
    0
  );

  return (
    <main className="flex-1 min-w-0 overflow-y-auto bg-[#FAF7EE] p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#2D7A46]">
              <Satellite size={18} /> Field monitoring
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-[#234E37] sm:text-3xl">Satellite Farm Health</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">Review actual Sentinel-2 vegetation observations over your registered field boundaries.</p>
          </div>
          <button
            type="button"
            onClick={handleDownloadReport}
            disabled={!latest || busy}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#234E37] px-4 py-2.5 text-sm font-semibold text-[#234E37] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download size={16} /> Download health report
          </button>
        </header>

        {error && (
          <div role="alert" className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <AlertTriangle className="mt-0.5 shrink-0" size={18} /> <span>{error}</span>
          </div>
        )}

        {provider && (
          <div className={`flex items-start gap-3 rounded-2xl border p-4 text-sm ${provider.configured ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
            <Satellite size={18} className="mt-0.5 shrink-0" />
            <div><strong>{provider.configured ? 'Sentinel-2 provider configured' : 'Satellite data unavailable'}</strong><p className="mt-1">{provider.message}</p></div>
          </div>
        )}
        {provider && !provider.configured && (
          <button type="button" onClick={handleShowDemo} disabled={busy} className="rounded-xl border border-amber-300 bg-white px-4 py-2.5 text-sm font-semibold text-amber-900 disabled:opacity-50">
            View synthetic NDVI calculation demo
          </button>
        )}
        {demoData && (
          <section aria-label="Synthetic NDVI calculation demonstration" className="rounded-3xl border-2 border-dashed border-amber-400 bg-amber-50 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-bold text-amber-950">DEMO ONLY — synthetic reflectance values</h2>
              <span className="rounded-full bg-amber-200 px-3 py-1 text-xs font-bold text-amber-950">Not satellite imagery</span>
            </div>
            <p className="mt-2 text-sm text-amber-950">{demoData.notice}</p>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="Demo mean NDVI" value={formatValue(demoData.statistics.mean)} />
              <Metric label="Demo min / max" value={`${formatValue(demoData.statistics.minimum)} / ${formatValue(demoData.statistics.maximum)}`} />
              <Metric label="Demo valid pixels" value={demoData.statistics.valid_pixels?.toLocaleString() ?? '—'} />
              <Metric label="Demo valid share" value={demoData.statistics.valid_pixel_percentage == null ? '—' : `${demoData.statistics.valid_pixel_percentage.toFixed(1)}%`} />
            </div>
          </section>
        )}

        {!fields.length ? (
          <section className="rounded-3xl border border-[#E8E3D5] bg-white p-6 sm:p-8">
            <h2 className="text-lg font-bold text-[#234E37]">Register a field before monitoring</h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">Satellite monitoring reuses your irrigation fields, so crop, area, and account details are not duplicated.</p>
            <button type="button" onClick={onOpenIrrigation} className="mt-5 rounded-xl bg-[#234E37] px-4 py-2.5 text-sm font-semibold text-white">Open field management</button>
          </section>
        ) : (
          <>
            <section className="grid gap-3 sm:grid-cols-3">
              <Metric label="Registered fields" value={String(fields.length)} detail={`${fields.filter((item) => item.geometry_summary).length} with valid boundaries`} />
              <Metric label="Monitored boundary area" value={`${monitoredArea.toFixed(2)} ha`} detail="Fields with saved boundaries only" />
              <Metric label="Last selected observation" value={selectedObservation?.acquisition_date ?? '—'} detail={selectedObservation ? selectedObservation.source : 'No satellite observation'} />
            </section>
            <section className="grid gap-3 rounded-3xl border border-[#E8E3D5] bg-white p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-[1.4fr_1fr_1fr_auto]">
              <label className="text-xs font-semibold text-slate-600">Field
                <select value={fieldId ?? ''} onChange={(event) => setFieldId(Number(event.target.value))} className="mt-2 block w-full rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-800">
                  {fields.map((item) => <option key={item.id} value={item.id}>{item.field_name} — {item.crop_name}</option>)}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-600">From
                <input type="date" value={startDate} max={endDate} onChange={(event) => setStartDate(event.target.value)} className="mt-2 block w-full rounded-xl border border-slate-300 p-3 text-sm text-slate-800" />
              </label>
              <label className="text-xs font-semibold text-slate-600">To
                <input type="date" value={endDate} readOnly className="mt-2 block w-full rounded-xl border border-slate-300 bg-slate-50 p-3 text-sm text-slate-500" />
              </label>
              <button type="button" onClick={handleAnalyze} disabled={!field?.boundary || busy || !provider?.configured} className="mt-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#234E37] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
                {busy ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                Analyze field
              </button>
              <label className="sm:col-span-2 lg:col-span-4">
                <span className="sr-only">Upload GeoJSON, KML, or zipped shapefile boundary</span>
                <span className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  <FileUp size={16} /> {field?.geometry_summary ? 'Replace field boundary' : 'Upload field boundary (.geojson, .kml, .zip)'}
                  <input type="file" accept=".geojson,.json,.kml,.zip" onChange={handleBoundaryUpload} className="sr-only" />
                </span>
                <span className="ml-3 text-xs text-slate-500">GeoJSON, KML, or WGS84 zipped shapefile</span>
              </label>
              {field && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 sm:col-span-2 lg:col-span-4">
                  <span className="inline-flex items-center gap-1"><MapPin size={13} /> {field.geometry_summary ? `${field.geometry_summary.area_hectares.toFixed(3)} ha · ${field.geometry_summary.area_acres.toFixed(3)} acres` : `${field.area_hectares.toFixed(2)} ha (field record)`}</span>
                  {field.geometry_summary && <span>Perimeter {field.geometry_summary.perimeter_metres.toFixed(0)} m · centroid {field.geometry_summary.centroid[1].toFixed(5)}, {field.geometry_summary.centroid[0].toFixed(5)}</span>}
                </div>
              )}
            </section>

            <section className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
              <div className="rounded-3xl border border-[#E8E3D5] bg-white p-4 sm:p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div><h2 className="font-bold text-[#234E37]">Field map</h2><p className="text-xs text-slate-500">{selectedObservation ? `Sentinel-2 L2A · ${selectedObservation.acquisition_date} · NDVI overlay` : 'Satellite basemap and registered field boundary'}</p></div>
                  <Eye size={18} className="text-[#2D7A46]" />
                </div>
                {observations.length > 0 && (
                  <label className="mb-3 block text-xs font-semibold text-slate-600">Observation date
                    <select
                      value={selectedObservation?.id ?? ''}
                      onChange={(event) => setSelectedObservationId(Number(event.target.value))}
                      className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2 text-sm"
                    >
                      {observations.map((item) => <option key={item.id} value={item.id}>{item.acquisition_date}</option>)}
                    </select>
                  </label>
                )}
                <SatelliteMap field={field} imageUrl={mapUrl} />
                {!field?.geometry_summary && <p className="mt-3 text-sm text-amber-700">Upload a valid boundary to position this field on the map.</p>}
                {field?.geometry_summary && selectedObservation && !mapUrl && <p className="mt-3 text-sm text-amber-700">The selected observation is saved; its NDVI map overlay is unavailable.</p>}
                <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-600">
                  <span className="inline-flex items-center gap-1"><i className="h-3 w-3 rounded-sm bg-[#F5C84C]" /> Field boundary</span>
                  <span className="inline-flex flex-wrap gap-2">
                    {classLabels.map(([, label, color]) => <span key={label} className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />{label}</span>)}
                  </span>
                  <span>NDVI overlay uses the selected observation date. Cloud and cloud-shadow pixels are masked.</span>
                </div>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Metric label="Mean NDVI" value={formatValue(selectedObservation?.statistics.mean)} detail={selectedObservation ? selectedObservation.acquisition_date : 'No observation'} />
                  <Metric label="Observation source" value={selectedObservation ? 'Sentinel-2' : '—'} detail={selectedObservation?.source ?? 'No satellite data'} />
                  <Metric label="Valid pixels" value={selectedObservation?.statistics.valid_pixels?.toLocaleString() ?? '—'} />
                  <Metric label="Cloud coverage" value={selectedObservation?.cloud_coverage_percent == null ? 'Not reported' : `${selectedObservation.cloud_coverage_percent.toFixed(1)}%`} detail="No cloud value is inferred" />
                </div>
                <div className="rounded-3xl border border-[#E8E3D5] bg-white p-5">
                  <h2 className="mb-4 font-bold text-[#234E37]">Latest NDVI analysis</h2>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <dt className="text-slate-500">Minimum</dt><dd className="text-right font-semibold">{formatValue(selectedObservation?.statistics.minimum)}</dd>
                    <dt className="text-slate-500">Maximum</dt><dd className="text-right font-semibold">{formatValue(selectedObservation?.statistics.maximum)}</dd>
                    <dt className="text-slate-500">Median</dt><dd className="text-right font-semibold">{formatValue(selectedObservation?.statistics.median)}</dd>
                    <dt className="text-slate-500">Std. deviation</dt><dd className="text-right font-semibold">{formatValue(selectedObservation?.statistics.standard_deviation)}</dd>
                  </dl>
                  {selectedObservation?.statistics.quality_note && <p className="mt-4 border-t pt-3 text-xs leading-relaxed text-slate-500">{selectedObservation.statistics.quality_note}</p>}
                </div>
              </div>
            </section>

            <section className="grid gap-5 lg:grid-cols-2">
              <div className="rounded-3xl border border-[#E8E3D5] bg-white p-5">
                <h2 className="mb-4 flex items-center gap-2 font-bold text-[#234E37]"><Leaf size={17} /> Vegetation distribution</h2>
                {distribution ? (
                  <div className="space-y-3">
                    {classLabels.map(([key, label, color]) => {
                      const percentage = distribution[key]?.percentage;
                      return (
                        <div key={key} className="grid grid-cols-[150px_1fr_48px] items-center gap-3 text-xs">
                          <span className="text-slate-600">{label}</span>
                          <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${Math.min(Math.max(percentage ?? 0, 0), 100)}%`, backgroundColor: color }} /></div>
                          <span className="text-right font-semibold">{typeof percentage === 'number' ? `${percentage.toFixed(1)}%` : '—'}</span>
                        </div>
                      );
                    })}
                    <p className="pt-2 text-xs text-slate-500">Illustrative NDVI ranges only; bare soil and crop growth stage can naturally produce low values.</p>
                  </div>
                ) : <p className="text-sm text-slate-500">No measured vegetation distribution is available for this observation.</p>}
              </div>
              <div className="rounded-3xl border border-[#E8E3D5] bg-white p-5">
                <h2 className="mb-4 flex items-center gap-2 font-bold text-[#234E37]"><CalendarDays size={17} /> Observation history</h2>
                <NdviTrend observations={observations} />
              </div>
            </section>

            <section className="rounded-3xl border border-[#E8E3D5] bg-white p-5">
              <h2 className="mb-4 flex items-center gap-2 font-bold text-[#234E37]"><ShieldCheck size={17} /> Potential field signals</h2>
              {insights?.insights.length ? (
                <div className="space-y-3">{insights.insights.map((item) => <article key={item.type} className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><h3 className="font-semibold text-amber-900">{item.message}</h3><p className="mt-1 text-sm text-amber-900/80">{item.explanation}</p><p className="mt-2 text-sm font-medium text-amber-900">Suggested action: {item.recommendation}</p></article>)}</div>
              ) : <p className="text-sm text-slate-600">No decline pattern was identified from the saved observations.</p>}
              <p className="mt-4 text-xs leading-relaxed text-slate-500">{insights?.disclaimer ?? 'NDVI alone cannot confirm disease, nutrient deficiency, or water stress. Field verification is required.'}</p>
            </section>

            <section className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
              <strong>Data limitations.</strong> Results are tied to the listed acquisition dates and provider coverage. Clouds and cloud shadows are excluded; missing observations are not interpolated. NDVI is a screening indicator, not a crop diagnosis or irrigation instruction.
            </section>
          </>
        )}

        <div className="sr-only" aria-live="polite">{busy ? 'Satellite request in progress' : ''}</div>
      </div>
    </main>
  );
}
