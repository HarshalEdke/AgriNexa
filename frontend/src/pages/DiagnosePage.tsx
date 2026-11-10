import { useState, useRef, useEffect, ChangeEvent, DragEvent } from 'react';
import {
  Leaf,
  Upload,
  Trash2,
  RefreshCw,
  AlertCircle,
  Loader2,
  Sparkles,
  ArrowRight,
  FileText,
  ShieldCheck,
  Cpu,
  CheckCircle2,
  Layers,
} from 'lucide-react';
import { Button } from '../components/Button';
import { DiagnosisResult } from '../components/diagnosis/DiagnosisResult';
import { ModelUnavailable } from '../components/diagnosis/ModelUnavailable';
import { BonusFeaturesSection } from '../components/crop/BonusFeaturesSection';
import { predictDisease, ApiError } from '../api/client';
import { useDiagnosis } from '../context/DiagnosisContext';

import { PredictionResponse } from '../types';

/** Maximum allowed image upload size: 10 MB */
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Supported crop options */
const CROP_OPTIONS = [
  'Apple',
  'Corn (Maize)',
  'Potato',
  'Tomato',
];

interface StepItem {
  number: number;
  label: string;
  description: string;
  icon: typeof Upload;
  leafBg: string;
  stepBg: string;
  stepText: string;
}

const HOW_IT_WORKS_STEPS: StepItem[] = [
  {
    number: 1,
    label: 'Upload Leaf Image',
    description: 'Choose or drag & drop a crop foliage photograph.',
    icon: Upload,
    leafBg: '#1E4D35',
    stepBg: '#E7F2EC',
    stepText: '#1E4D35',
  },
  {
    number: 2,
    label: 'AI Visual Diagnosis',
    description: 'Neural vision classifier analyzes plant pathology markers.',
    icon: Sparkles,
    leafBg: '#6B462C',
    stepBg: '#F5ECE5',
    stepText: '#6B462C',
  },
  {
    number: 3,
    label: 'Agronomic Insights',
    description: 'View the full analysis breakdown and crop details.',
    icon: FileText,
    leafBg: '#967226',
    stepBg: '#FAF3E3',
    stepText: '#967226',
  },
  {
    number: 4,
    label: 'Targeted Action',
    description: 'Apply sustainable cultural and organic interventions.',
    icon: Leaf,
    leafBg: '#586A34',
    stepBg: '#EEF3E3',
    stepText: '#586A34',
  },
];

/** Stylized wheat and corn stalk watermark illustration */
function CropWatermark() {
  return (
    <div
      className="pointer-events-none absolute bottom-0 left-0 right-0 h-44 sm:h-52 overflow-hidden select-none flex justify-center items-end opacity-35 z-0"
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 1000 220"
        className="w-full max-w-4xl h-full fill-none stroke-[#C8BE9E] text-[#DDD5BE]"
        preserveAspectRatio="xMidYMax meet"
      >
        {/* Wheat Stalk Left 1 */}
        <g transform="translate(150, 20)">
          <path d="M 40 200 Q 40 100 40 0" stroke="currentColor" strokeWidth="2.5" />
          <path d="M 40 160 Q 15 130 0 140 Q 20 160 40 165" fill="currentColor" opacity="0.7" />
          <path d="M 40 140 Q 65 110 80 120 Q 60 140 40 145" fill="currentColor" opacity="0.7" />
          {[0, 15, 30, 45, 60, 75, 90].map((y, i) => (
            <g key={`wl1-${i}`} transform={`translate(40, ${y})`}>
              <path d="M 0 0 C -12 -5 -15 -18 0 -22 C 15 -18 12 -5 0 0" fill="currentColor" />
              <line x1="0" y1="-20" x2={i % 2 === 0 ? -10 : 10} y2="-32" stroke="currentColor" strokeWidth="1.5" />
            </g>
          ))}
        </g>
        {/* Wheat Stalk Left 2 */}
        <g transform="translate(260, 40)">
          <path d="M 30 180 Q 25 90 20 0" stroke="currentColor" strokeWidth="2.5" />
          <path d="M 28 140 Q 5 110 -5 120 Q 10 140 28 145" fill="currentColor" opacity="0.7" />
          {[0, 16, 32, 48, 64].map((y, i) => (
            <g key={`wl2-${i}`} transform={`translate(22, ${y})`}>
              <path d="M 0 0 C -10 -4 -13 -15 0 -18 C 13 -15 10 -4 0 0" fill="currentColor" />
            </g>
          ))}
        </g>

        {/* Corn Stalk Center-Left */}
        <g transform="translate(380, 10)">
          <path d="M 50 210 Q 50 100 50 0" stroke="currentColor" strokeWidth="3" />
          <path d="M 50 170 Q 10 140 -20 160 Q 15 175 50 180" fill="currentColor" opacity="0.6" />
          <path d="M 50 140 Q 90 110 120 130 Q 85 145 50 150" fill="currentColor" opacity="0.6" />
          <g transform="translate(35, 45)">
            <ellipse cx="15" cy="45" rx="14" ry="42" fill="currentColor" opacity="0.85" />
            <path d="M 6 25 Q 15 20 24 25 M 5 35 Q 15 30 25 35 M 4 45 Q 15 40 26 45 M 5 55 Q 15 50 25 55 M 6 65 Q 15 60 24 65" stroke="#FAF7EE" strokeWidth="1.5" />
            <path d="M 12 5 Q 10 -15 5 -20 M 15 5 Q 15 -18 15 -25 M 18 5 Q 20 -15 25 -20" stroke="currentColor" strokeWidth="1.5" />
          </g>
        </g>

        {/* Corn Stalk Center-Right */}
        <g transform="translate(570, 10)">
          <path d="M 50 210 Q 50 100 50 0" stroke="currentColor" strokeWidth="3" />
          <path d="M 50 170 Q 90 140 120 160 Q 85 175 50 180" fill="currentColor" opacity="0.6" />
          <path d="M 50 140 Q 10 110 -20 130 Q 15 145 50 150" fill="currentColor" opacity="0.6" />
          <g transform="translate(35, 45)">
            <ellipse cx="15" cy="45" rx="14" ry="42" fill="currentColor" opacity="0.85" />
            <path d="M 6 25 Q 15 20 24 25 M 5 35 Q 15 30 25 35 M 4 45 Q 15 40 26 45 M 5 55 Q 15 50 25 55 M 6 65 Q 15 60 24 65" stroke="#FAF7EE" strokeWidth="1.5" />
            <path d="M 12 5 Q 10 -15 5 -20 M 15 5 Q 15 -18 15 -25 M 18 5 Q 20 -15 25 -20" stroke="currentColor" strokeWidth="1.5" />
          </g>
        </g>

        {/* Wheat Stalk Right 1 */}
        <g transform="translate(710, 40)">
          <path d="M 30 180 Q 35 90 40 0" stroke="currentColor" strokeWidth="2.5" />
          <path d="M 32 140 Q 55 110 65 120 Q 50 140 32 145" fill="currentColor" opacity="0.7" />
          {[0, 16, 32, 48, 64].map((y, i) => (
            <g key={`wr1-${i}`} transform={`translate(38, ${y})`}>
              <path d="M 0 0 C -10 -4 -13 -15 0 -18 C 13 -15 10 -4 0 0" fill="currentColor" />
            </g>
          ))}
        </g>
        {/* Wheat Stalk Right 2 */}
        <g transform="translate(820, 20)">
          <path d="M 40 200 Q 40 100 40 0" stroke="currentColor" strokeWidth="2.5" />
          <path d="M 40 160 Q 65 130 80 140 Q 60 160 40 165" fill="currentColor" opacity="0.7" />
          <path d="M 40 140 Q 15 110 0 120 Q 20 140 40 145" fill="currentColor" opacity="0.7" />
          {[0, 15, 30, 45, 60, 75, 90].map((y, i) => (
            <g key={`wr2-${i}`} transform={`translate(40, ${y})`}>
              <path d="M 0 0 C -12 -5 -15 -18 0 -22 C 15 -18 12 -5 0 0" fill="currentColor" />
              <line x1="0" y1="-20" x2={i % 2 === 0 ? 10 : -10} y2="-32" stroke="currentColor" strokeWidth="1.5" />
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface DiagnosePageProps {
  initialResult?: PredictionResponse | null;
  onOpenCropRecommendation?: () => void;
  onOpenSustainabilityScore?: () => void;
  onOpenWeatherIntelligence?: () => void;
  onOpenIrrigation?: () => void;
  onOpenSatellite?: () => void;
}

export function DiagnosePage({
  initialResult = null,
  onOpenCropRecommendation,
  onOpenSustainabilityScore,
  onOpenWeatherIntelligence,
  onOpenIrrigation,
  onOpenSatellite,
}: DiagnosePageProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cropType, setCropType] = useState<string>('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isPredicting, setIsPredicting] = useState<boolean>(false);
  const [isModelUnavailable, setIsModelUnavailable] = useState<boolean>(false);
  const { activeDiagnosis: predictionResult, setActiveDiagnosis: setPredictionResult } = useDiagnosis();
  const [isDragging, setIsDragging] = useState<boolean>(false);

  useEffect(() => {
    if (initialResult && !predictionResult) {
      setPredictionResult(initialResult);
    }
  }, [initialResult, predictionResult, setPredictionResult]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const consoleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleScrollToDiagnose = () => {
    consoleRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const validateFile = (file: File): { isValid: boolean; error?: string } => {
    if (!file) {
      return { isValid: false, error: 'Please select an image file.' };
    }
    if (!file.type.startsWith('image/') || !ALLOWED_MIME_TYPES.includes(file.type)) {
      return {
        isValid: false,
        error: 'Please select a valid image file (JPG, PNG, or WebP).',
      };
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return {
        isValid: false,
        error: 'Image size exceeds the 10 MB limit. Please select a smaller photo.',
      };
    }
    return { isValid: true };
  };

  const processFile = (file: File) => {
    setValidationError(null);
    setApiError(null);
    const { isValid, error } = validateFile(file);

    if (!isValid) {
      setValidationError(error ?? 'Invalid file selected.');
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      setSelectedFile(null);
      setPreviewUrl(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isPredicting) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (isPredicting) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleRemove = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setSelectedFile(null);
    setPreviewUrl(null);
    setValidationError(null);
    setApiError(null);
    setIsPredicting(false);
    setIsModelUnavailable(false);
    setPredictionResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleChangeImageClick = () => {
    if (isPredicting) return;
    fileInputRef.current?.click();
  };

  const handlePredict = async () => {
    if (!selectedFile || isPredicting) return;
    setValidationError(null);
    setApiError(null);
    setIsPredicting(true);

    try {
      const result = await predictDisease(selectedFile);
      setPredictionResult(result);
      setIsModelUnavailable(false);
      setApiError(null);
    } catch (err: unknown) {
      const status =
        err instanceof ApiError || (typeof err === 'object' && err !== null && 'status' in err)
          ? (err as { status: number }).status
          : 0;

      if (status === 503) {
        setIsModelUnavailable(true);
        setPredictionResult(null);
        setApiError(null);
      } else if (status === 400) {
        const message =
          err instanceof Error && err.message
            ? err.message
            : 'Invalid image file or parameters. Please try again with a valid crop photo.';
        setApiError(message);
        setIsModelUnavailable(false);
        setPredictionResult(null);
      } else {
        setApiError('Unable to process diagnosis due to a server error. Please try again in a few moments.');
        setIsModelUnavailable(false);
        setPredictionResult(null);
      }
    } finally {
      setIsPredicting(false);
    }
  };

  return (
    <main
      id="diagnose"
      aria-label="Plant disease diagnosis"
      className="flex-1 relative bg-mesh-agri overflow-hidden"
    >
      {/* ── Diagnosis Workbench & Output Console ── */}
      <section
        id="diagnose-console"
        ref={consoleRef}
        className="relative pt-10 pb-16 sm:pt-14 sm:pb-20 scroll-mt-20"
      >
        {/* Wheat and Corn vector watermark silhouette */}
        <CropWatermark />

        <div
          className={`relative z-10 mx-auto w-full px-4 sm:px-6 transition-all duration-300 ${
            predictionResult ? 'max-w-6xl sm:max-w-7xl' : 'max-w-3xl flex flex-col items-center text-center'
          }`}
        >
          {/* Section Header (avoiding duplicate huge branding name) */}
          <div className="mb-6 w-full text-center">
            <h1
              aria-label="AgriNexa AI — Plant Disease Diagnosis"
              className="mb-2 w-full text-2xl font-extrabold leading-tight tracking-tight text-[#163824] sm:text-3xl lg:text-4xl"
            >
              Plant Disease Diagnosis
            </h1>
            <p className="mx-auto block w-full max-w-2xl text-center text-sm font-normal leading-relaxed text-slate-600 sm:text-base">
              Upload a crop or leaf image to detect disease and get AI-powered insights.
            </p>
          </div>

          {/* Hidden File Input for Keyboard/Screen-reader accessibility */}
          <input
            ref={fileInputRef}
            id="leaf-image-upload"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            aria-label="Upload crop or leaf image"
            onChange={handleFileInputChange}
            disabled={isPredicting}
          />

          {/* ── Upload & Diagnosis Card (or Full-Screen Result View) ── */}
          <div
            className={`w-full transition-all text-left ${
              predictionResult
                ? 'p-0'
                : 'rounded-3xl border border-[#E5DEC9] bg-white p-6 sm:p-8 shadow-[0_12px_35px_rgba(20,40,25,0.06)]'
            }`}
            role="region"
            aria-label="Diagnosis workbench"
          >
            {/* Validation Error Banner */}
            {validationError && (
              <div
                role="alert"
                aria-live="polite"
                className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/90 p-4 text-left text-sm text-amber-900 shadow-xs"
              >
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
                <div>
                  <strong className="font-semibold text-amber-950">Image Validation Alert</strong>
                  <p className="mt-0.5 text-amber-800">{validationError}</p>
                </div>
              </div>
            )}

            {/* API Error Banner */}
            {apiError && (
              <div
                role="alert"
                aria-live="polite"
                className="mb-6 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50/90 p-4 text-left text-sm text-red-900 shadow-xs"
              >
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden="true" />
                <div className="flex-1">
                  <strong className="font-semibold text-red-950">Diagnosis Request Issue</strong>
                  <p className="mt-0.5 text-red-800">{apiError}</p>
                </div>
              </div>
            )}

            {/* State A: Diagnosis Result Display (Full-Width Dashboard) */}
            {predictionResult ? (
              <DiagnosisResult
                result={predictionResult}
                imagePreviewUrl={previewUrl}
                fileName={selectedFile?.name}
                cropType={cropType}
                onReset={handleRemove}
              />
            ) : isModelUnavailable ? (
              /* State B: Model Unavailable Notice */
              <ModelUnavailable
                fileName={selectedFile?.name}
                imagePreviewUrl={previewUrl}
                onReset={handleRemove}
              />
            ) : !selectedFile ? (
              /* State C: No file selected -> Clean Mint Dashed Dropzone */
              <div className="space-y-6">
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={handleChangeImageClick}
                  className={`group cursor-pointer rounded-2xl border-2 border-dashed p-8 transition-all duration-200 sm:p-10 ${
                    isDragging
                      ? 'border-[#10B981] bg-[#ECFDF5]'
                      : 'border-[#10B981]/60 bg-[#F0FDF4]/50 hover:border-[#10B981] hover:bg-[#ECFDF5]'
                  }`}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleChangeImageClick();
                    }
                  }}
                  aria-label="Click or drag and drop to select a crop leaf image"
                >
                  {/* Upload Icon */}
                  <div
                    className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl text-[#1E4D35] bg-emerald-100/80 transition-transform group-hover:scale-105 shadow-2xs"
                    aria-hidden="true"
                  >
                    <Upload size={28} strokeWidth={2.2} />
                  </div>

                  <h3 className="mb-1 text-lg font-bold text-slate-900 text-center">
                    Upload Leaf Image
                  </h3>
                  <p className="sr-only">Upload a crop or leaf image</p>
                  <p className="sr-only">Use a clear photo of the affected leaf or crop for better diagnosis.</p>
                  
                  <p className="mb-2 text-sm text-slate-500 text-center">
                    Drag & drop or <span className="font-semibold text-emerald-700 group-hover:underline">browse</span>
                  </p>

                  <p className="text-xs font-medium text-slate-400 text-center">
                    Supports JPG, JPEG, PNG, WebP (up to 10 MB)
                  </p>

                  {/* Accessible Select Image button */}
                  <Button
                    type="button"
                    variant="primary"
                    className="sr-only"
                    tabIndex={-1}
                  >
                    Select Image
                  </Button>
                </div>

                {/* Bottom Row: Crop Type Selector + Diagnose Button */}
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pt-2 text-left">
                  {/* Crop Type Selector */}
                  <div className="flex-1">
                    <label
                      htmlFor="crop-type-select-initial"
                      className="block text-xs font-semibold text-slate-700 mb-1.5"
                    >
                      Crop Type <span className="text-slate-400 font-normal">(Optional)</span>
                    </label>
                    <div className="relative">
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-emerald-700">
                        <Leaf size={16} />
                      </div>
                      <select
                        id="crop-type-select-initial"
                        aria-label="Crop Type (Optional)"
                        value={cropType}
                        onChange={(e) => setCropType(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-8 text-sm text-slate-800 transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 hover:border-slate-300 cursor-pointer"
                      >
                        <option value="">Select crop type</option>
                        {CROP_OPTIONS.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Diagnose Action Button */}
                  <div className="w-full sm:w-auto">
                    <Button
                      type="button"
                      variant="primary"
                      onClick={handleChangeImageClick}
                      className="w-full sm:w-auto py-3 px-6 text-sm font-bold rounded-full bg-[#234E37] hover:bg-[#1A3C2A] text-white shadow-xs"
                      aria-label="Diagnose crop"
                    >
                      <Sparkles size={16} aria-hidden="true" />
                      <span>Diagnose Crop</span>
                      <ArrowRight size={15} aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              /* State D: Image Selected -> Preview & Actions */
              <div className="space-y-6 text-left">

                {/* Preview Frame */}
                <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-[#FAF7EE] p-2 sm:p-3">
                  <img
                    src={previewUrl!}
                    alt="Selected crop leaf preview"
                    className="max-h-80 w-full rounded-xl object-contain bg-slate-900/5"
                  />
                </div>

                {/* File Details & Action Buttons */}
                <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-[#FAF7EE] p-3.5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-800" title={selectedFile.name}>
                      {selectedFile.name}
                    </p>
                    <p className="text-xs text-slate-500 font-medium">
                      {formatFileSize(selectedFile.size)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleChangeImageClick}
                      disabled={isPredicting}
                      aria-label="Change selected image"
                      className="px-3.5 py-2 text-xs rounded-xl font-medium"
                    >
                      <RefreshCw size={14} aria-hidden="true" />
                      Change
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      onClick={handleRemove}
                      disabled={isPredicting}
                      aria-label="Remove selected image"
                      className="px-3.5 py-2 text-xs rounded-xl font-medium"
                    >
                      <Trash2 size={14} aria-hidden="true" />
                      Remove
                    </Button>
                  </div>
                </div>

                {/* Crop Type Selector & Diagnose Action */}
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pt-1">
                  <div className="flex-1">
                    <label
                      htmlFor="crop-type-select"
                      className="block text-xs font-semibold text-slate-700 mb-1.5"
                    >
                      Crop Type <span className="text-slate-400 font-normal">(Optional)</span>
                    </label>
                    <div className="relative">
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-emerald-700">
                        <Leaf size={16} />
                      </div>
                      <select
                        id="crop-type-select"
                        aria-label="Crop Type (Optional)"
                        value={cropType}
                        onChange={(e) => setCropType(e.target.value)}
                        disabled={isPredicting}
                        className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-8 text-sm text-slate-800 transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:opacity-60 cursor-pointer"
                      >
                        <option value="">Select crop (optional)</option>
                        {CROP_OPTIONS.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {!isPredicting && (
                    <div className="w-full sm:w-auto">
                      <Button
                        type="button"
                        variant="primary"
                        onClick={handlePredict}
                        disabled={!selectedFile || isPredicting}
                        aria-label="Predict disease"
                        className="w-full sm:w-auto py-3 px-7 text-sm font-bold rounded-full bg-[#234E37] hover:bg-[#1A3C2A] text-white shadow-xs"
                      >
                        <Sparkles size={16} aria-hidden="true" />
                        <span>Diagnose Crop</span>
                        <ArrowRight size={15} aria-hidden="true" />
                      </Button>
                    </div>
                  )}
                </div>

                {/* Predicting / Loading State Notice */}
                {isPredicting && (
                  <div
                    role="status"
                    aria-live="polite"
                    className="rounded-2xl border border-emerald-200 bg-emerald-50/90 p-5 text-center shadow-xs"
                  >
                    <div className="flex items-center justify-center gap-2.5 text-emerald-900">
                      <Loader2 className="h-5 w-5 animate-spin text-emerald-700" aria-hidden="true" />
                      <span className="font-bold text-sm">Analyzing your crop image...</span>
                    </div>
                    <p className="mt-1 text-xs text-emerald-800">
                      Processing visual foliage patterns and evaluating model availability.
                    </p>
                  </div>
                )}

              </div>
            )}

          </div>

        </div>
      </section>

      {/* ── 3. How It Works ── */}
      <section
        id="how-it-works"
        className="py-10 sm:py-14"
        aria-label="How it works"
      >
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          {/* Top 4 Colored Leaf Badges Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6 mb-4">
            {HOW_IT_WORKS_STEPS.map((step) => {
              const IconComponent = step.icon;
              return (
                <div key={`badge-${step.number}`} className="flex flex-col items-center text-center">
                  <div
                    className="flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-2xl shadow-sm transition-transform hover:scale-105"
                    style={{
                      backgroundColor: step.leafBg,
                      borderRadius: '30% 70% 70% 30% / 30% 30% 70% 70%',
                    }}
                    aria-hidden="true"
                  >
                    <IconComponent size={24} strokeWidth={2.2} color="#FFFFFF" />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Stepper Card */}
          <div
            className="rounded-3xl border border-[#E5DEC9] bg-white/95 p-6 sm:p-8 shadow-[0_8px_30px_rgba(20,40,25,0.04)]"
          >
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6 relative">
              {HOW_IT_WORKS_STEPS.map((step, idx) => {
                return (
                  <div key={step.number} className="relative flex flex-col items-center text-center sm:items-start sm:text-left">
                    {/* Step Number & Label Pill */}
                    <div className="flex items-center gap-2 mb-2.5">
                      <span
                        className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold"
                        style={{ backgroundColor: step.stepBg, color: step.stepText }}
                        aria-hidden="true"
                      >
                        {step.number}
                      </span>
                      <span className="text-xs font-bold tracking-wide uppercase" style={{ color: step.stepText }}>
                        Step {step.number}
                      </span>

                      {/* Arrow divider for desktop */}
                      {idx < HOW_IT_WORKS_STEPS.length - 1 && (
                        <ArrowRight
                          size={14}
                          className="hidden lg:block absolute -right-3 top-1 text-slate-300"
                          aria-hidden="true"
                        />
                      )}
                    </div>

                    <h3 className="mb-1 text-sm sm:text-base font-bold text-[#0F172A]">
                      {step.label}
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ── Live Weather & Farm Intelligence Section ── */}
      {/* ── 4. Bonus Features Section (Crop Recommendation & Sustainability Score) ── */}
      <BonusFeaturesSection
        onSelectCropRecommendation={onOpenCropRecommendation}
        onSelectSustainabilityScore={onOpenSustainabilityScore}
        onSelectWeatherIntelligence={onOpenWeatherIntelligence}
        onSelectIrrigation={onOpenIrrigation}
        onSelectSatellite={onOpenSatellite}
      />


      {/* ── 5. Model Info Section (Updated to exactly 4 Crop Types & 10 Disease Classes) ── */}
      <section
        id="model-info"
        className="py-12 sm:py-16 scroll-mt-20"
        aria-label="Model information and architecture"
      >
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="rounded-3xl border border-[#E5DEC9] bg-white p-6 sm:p-10 shadow-[0_10px_35px_rgba(20,40,25,0.04)]">

            {/* Header with Title & Badges */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 pb-6 border-b border-slate-100">
              <div className="flex items-center gap-3.5">
                <div
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#E8F3EC] text-[#1E4D35] shadow-2xs"
                  aria-hidden="true"
                >
                  <Cpu size={26} strokeWidth={2.2} />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#163824]">
                      Model Architecture & Intelligence
                    </h2>
                    <span className="rounded-full bg-[#E8F3EC] px-3 py-0.5 text-xs font-bold text-[#1E4D35] border border-emerald-200">
                      SigLIP ViT + MobileNet
                    </span>
                  </div>
                  <p className="mt-1 text-xs sm:text-sm text-slate-600">
                    Dual-engine computer vision pipeline calibrated for agricultural field conditions.
                  </p>
                </div>
              </div>

              <a
                href="#diagnose"
                onClick={(e) => {
                  e.preventDefault();
                  handleScrollToDiagnose();
                }}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-800 hover:text-emerald-900 hover:underline cursor-pointer w-fit"
              >
                <span>Diagnose a Crop</span>
                <ArrowRight size={13} />
              </a>
            </div>

            {/* 3 Pillars of Deep Specifications */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              {/* Pillar 1 */}
              <div className="rounded-2xl border border-slate-200/80 bg-[#FAF7EE]/60 p-5">
                <div className="flex items-center gap-2 mb-2 text-[#1E4D35] font-bold text-sm">
                  <Layers size={16} />
                  <span>10 Pathology Classes</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Trained on curated high-resolution leaf imagery across 4 core crop types (Apple, Corn, Potato, Tomato), classifying 10 distinct pathology and healthy foliage states.
                </p>
              </div>

              {/* Pillar 2 */}
              <div className="rounded-2xl border border-slate-200/80 bg-[#FAF7EE]/60 p-5">
                <div className="flex items-center gap-2 mb-2 text-[#1E4D35] font-bold text-sm">
                  <ShieldCheck size={16} />
                  <span>Dual-Tier Safety & Fallback</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Calibrated probability distributions automatically detect ambiguous imagery, with an offline deterministic heuristic backup ensuring rural field uptime.
                </p>
              </div>

              {/* Pillar 3 */}
              <div className="rounded-2xl border border-slate-200/80 bg-[#FAF7EE]/60 p-5">
                <div className="flex items-center gap-2 mb-2 text-[#1E4D35] font-bold text-sm">
                  <CheckCircle2 size={16} />
                  <span>Grounded Action Guides</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Every prediction links to verified, chemical-safe agronomic remedies, preventive organic practices, and real-time interactive Agro AI assistance.
                </p>
              </div>
            </div>

            {/* Metric Counters Strip - Showing exactly Crop types: 4 and Disease Classes: 10 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-5 rounded-2xl bg-[#F4FAF6] border border-emerald-200/80 text-center">
              <div className="p-2">
                <span className="block text-2xl sm:text-3xl font-black text-[#163824]">4</span>
                <span className="text-xs font-bold text-[#2D5A3D] uppercase tracking-wider mt-1 block">
                  Crop types
                </span>
              </div>
              <div className="p-2">
                <span className="block text-2xl sm:text-3xl font-black text-[#163824]">10</span>
                <span className="text-xs font-bold text-[#2D5A3D] uppercase tracking-wider mt-1 block">
                  Disease Classes
                </span>
              </div>
              <div className="p-2">
                <span className="block text-2xl sm:text-3xl font-black text-[#163824]">&lt; 450ms</span>
                <span className="text-xs font-bold text-[#2D5A3D] uppercase tracking-wider mt-1 block">
                  Inference Speed
                </span>
              </div>
              <div className="p-2">
                <span className="block text-2xl sm:text-3xl font-black text-[#163824]">100%</span>
                <span className="text-xs font-bold text-[#2D5A3D] uppercase tracking-wider mt-1 block">
                  Offline Fallback
                </span>
              </div>
            </div>

          </div>
        </div>
      </section>

    </main>
  );
}
