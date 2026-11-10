import { useState, useEffect } from 'react';
import { Home, Sprout, Cpu, Sparkles, ChevronDown, Leaf, CloudSun, Bot, Droplets, Satellite } from 'lucide-react';
import { useDiagnosis } from '../context/DiagnosisContext';

export type AppView =
  | 'landing'
  | 'home'
  | 'diagnose'
  | 'crop-recommendation'
  | 'sustainability'
  | 'weather-intelligence'
  | 'irrigation'
  | 'satellite'
  | 'login'
  | 'signup';

interface SidebarProps {
  activeView?: AppView;
  onNavigateHome?: () => void;
  onNavigateDiagnose?: () => void;
  onNavigateCropRecommendation?: () => void;
  onNavigateSustainability?: () => void;
  onNavigateWeatherIntelligence?: () => void;
  onNavigateIrrigation?: () => void;
  onNavigateSatellite?: () => void;
  onNavigateModelInfo?: () => void;
  onNavigateHowItWorks?: () => void;
  className?: string;
}

export function Sidebar({
  activeView = 'diagnose',
  onNavigateDiagnose,
  onNavigateCropRecommendation,
  onNavigateSustainability,
  onNavigateWeatherIntelligence,
  onNavigateIrrigation,
  onNavigateSatellite,
  onNavigateModelInfo,
  onNavigateHowItWorks,
  className = '',
}: SidebarProps) {
  const { activeDiagnosis, isAgronomistOpen, isMissingDiagnosisOpen, openAgronomist, openMissingDiagnosis } = useDiagnosis();

  const [currentHash, setCurrentHash] = useState(
    typeof window !== 'undefined' ? window.location.hash : ''
  );

  useEffect(() => {
    const handleHashChange = () => setCurrentHash(window.location.hash);
    
    // Sync hash state when activeView changes (since AppShell uses pushState without triggering hashchange)
    setCurrentHash(window.location.hash);
    
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [activeView]);

  const isCropRecActive = activeView === 'crop-recommendation';
  const isSustainActive = activeView === 'sustainability';
  const isWeatherActive = activeView === 'weather-intelligence' || currentHash === '#weather-intelligence';
  const isIrrigationActive = activeView === 'irrigation' || currentHash === '#irrigation';
  const isSatelliteActive = activeView === 'satellite' || currentHash === '#satellite';
  const isAgronomistActive = isAgronomistOpen || isMissingDiagnosisOpen;

  const isFarmInsightActive = isCropRecActive || isSustainActive || isWeatherActive || isIrrigationActive || isSatelliteActive || isAgronomistActive;
  const isDiagnoseActive = (activeView === 'diagnose' || activeView === 'home') && !isWeatherActive && !isAgronomistActive;

  // Submenu starts expanded if currently on a child route, or true by default
  const [isFarmInsightOpen, setIsFarmInsightOpen] = useState(true);

  // Automatically expand Farm Insight submenu when navigating to its child routes
  useEffect(() => {
    if (isFarmInsightActive) {
      setIsFarmInsightOpen(true);
    }
  }, [isFarmInsightActive]);

  const handleHomeClick = (e: React.MouseEvent) => {
    e.preventDefault();
    onNavigateDiagnose?.();
  };

  const handleToggleFarmInsight = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsFarmInsightOpen((prev) => !prev);
  };

  const handleCropRecClick = (e: React.MouseEvent) => {
    e.preventDefault();
    onNavigateCropRecommendation?.();
  };

  const handleSustainClick = (e: React.MouseEvent) => {
    e.preventDefault();
    onNavigateSustainability?.();
  };

  const handleWeatherClick = (e: React.MouseEvent) => {
    e.preventDefault();
    onNavigateWeatherIntelligence?.();
  };

  const handleIrrigationClick = (e: React.MouseEvent) => {
    e.preventDefault();
    onNavigateIrrigation?.();
  };

  const handleSatelliteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    onNavigateSatellite?.();
  };

  const handleAgronomistClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (activeDiagnosis) {
      openAgronomist();
    } else {
      openMissingDiagnosis();
    }
  };

  const handleModelInfoClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (onNavigateModelInfo) {
      onNavigateModelInfo();
    } else {
      const el = document.querySelector('#model-info');
      el?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleHowItWorksClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (onNavigateHowItWorks) {
      onNavigateHowItWorks();
    } else {
      const el = document.querySelector('#how-it-works');
      el?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <aside
      aria-label="Main application sidebar"
      className={`w-64 shrink-0 border-r border-[#EFE9D7] bg-white py-6 px-3 flex flex-col justify-between ${className}`}
    >
      <div className="space-y-6">
        {/* Sidebar Nav Header / Section title */}
        <div className="px-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#2D5A3D]/70">
            Navigation
          </p>
        </div>

        {/* Navigation items list */}
        <nav aria-label="Sidebar navigation" className="space-y-1.5">
          {/* 1. Home / Plant Disease Diagnosis */}
          <a
            href="#diagnose"
            onClick={handleHomeClick}
            aria-current={isDiagnoseActive ? 'page' : undefined}
            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-sm font-semibold transition-all no-underline ${
              isDiagnoseActive
                ? 'bg-[#E4EFE7] text-[#1E4D35] shadow-2xs border border-emerald-200/70 font-bold'
                : 'text-slate-700 hover:bg-[#EAE5D4] hover:text-[#1E4D35]'
            }`}
          >
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-xl transition-colors ${
                isDiagnoseActive
                  ? 'bg-[#234E37] text-white shadow-2xs'
                  : 'bg-[#E8F3EC] text-[#234E37]'
              }`}
              aria-hidden="true"
            >
              <Home size={16} strokeWidth={2.2} />
            </span>
            <span>Home</span>
          </a>

          {/* 2. Farm Insight (Expandable Parent with Submenu) */}
          <div className="space-y-1">
            <button
              type="button"
              onClick={handleToggleFarmInsight}
              aria-expanded={isFarmInsightOpen}
              aria-controls="farm-insight-submenu"
              aria-label="Farm Insight"
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-sm font-semibold transition-all cursor-pointer text-left ${
                isFarmInsightActive
                  ? 'bg-[#E4EFE7] text-[#1E4D35] shadow-2xs border border-emerald-200/70 font-bold'
                  : 'text-slate-700 hover:bg-[#EAE5D4] hover:text-[#1E4D35]'
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-xl transition-colors ${
                    isFarmInsightActive
                      ? 'bg-[#234E37] text-white shadow-2xs'
                      : 'bg-[#E8F3EC] text-[#234E37]'
                  }`}
                  aria-hidden="true"
                >
                  <Sprout size={16} strokeWidth={2.2} />
                </span>
                <span>Farm Insight</span>
              </div>
              <ChevronDown
                size={16}
                className={`text-slate-500 transition-transform duration-200 shrink-0 ${
                  isFarmInsightOpen ? 'rotate-180 text-[#1E4D35]' : ''
                }`}
                aria-hidden="true"
              />
            </button>

            {/* Farm Insight Submenu List */}
            {isFarmInsightOpen && (
              <div
                id="farm-insight-submenu"
                role="region"
                aria-label="Farm Insight Submenu"
                className="pl-4 pr-1 pt-1 space-y-1 transition-all duration-200"
              >
                {/* 2a. Crop Recommendation */}
                <button
                  type="button"
                  onClick={handleCropRecClick}
                  aria-current={isCropRecActive ? 'page' : undefined}
                  aria-label="Farm Insight — Crop Recommendation"
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer text-left ${
                    isCropRecActive
                      ? 'bg-[#234E37] text-white shadow-2xs font-bold'
                      : 'text-slate-600 hover:bg-[#EAE5D4] hover:text-[#1E4D35]'
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-lg ${
                      isCropRecActive
                        ? 'bg-white/20 text-white'
                        : 'bg-[#E8F3EC] text-[#234E37]'
                    }`}
                    aria-hidden="true"
                  >
                    <Sprout size={13} strokeWidth={2.2} />
                  </span>
                  <span className="truncate">Crop Recommendation</span>
                </button>

                {/* 2b. Sustainability Score */}
                <button
                  type="button"
                  onClick={handleSustainClick}
                  aria-current={isSustainActive ? 'page' : undefined}
                  aria-label="Farm Insight — Sustainability Score"
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer text-left ${
                    isSustainActive
                      ? 'bg-[#234E37] text-white shadow-2xs font-bold'
                      : 'text-slate-600 hover:bg-[#EAE5D4] hover:text-[#1E4D35]'
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-lg ${
                      isSustainActive
                        ? 'bg-white/20 text-white'
                        : 'bg-[#E8F3EC] text-[#234E37]'
                    }`}
                    aria-hidden="true"
                  >
                    <Leaf size={13} strokeWidth={2.2} />
                  </span>
                  <span className="truncate">Sustainability Score</span>
                </button>

                {/* 2c. Weather Intelligence */}
                <button
                  type="button"
                  onClick={handleWeatherClick}
                  aria-current={isWeatherActive ? 'page' : undefined}
                  aria-label="Farm Insight — Weather Intelligence"
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer text-left ${
                    isWeatherActive
                      ? 'bg-[#234E37] text-white shadow-2xs font-bold'
                      : 'text-slate-600 hover:bg-[#EAE5D4] hover:text-[#1E4D35]'
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-lg ${
                      isWeatherActive
                        ? 'bg-white/20 text-white'
                        : 'bg-[#E8F3EC] text-[#234E37]'
                    }`}
                    aria-hidden="true"
                  >
                    <CloudSun size={13} strokeWidth={2.2} />
                  </span>
                  <span className="truncate">Weather Intelligence</span>
                </button>

                <button
                  type="button"
                  onClick={handleIrrigationClick}
                  aria-current={isIrrigationActive ? 'page' : undefined}
                  aria-label="Farm Insight — Smart Irrigation"
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer text-left ${
                    isIrrigationActive
                      ? 'bg-[#234E37] text-white shadow-2xs font-bold'
                      : 'text-slate-600 hover:bg-[#EAE5D4] hover:text-[#1E4D35]'
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-lg ${
                      isIrrigationActive ? 'bg-white/20 text-white' : 'bg-[#E8F3EC] text-[#234E37]'
                    }`}
                    aria-hidden="true"
                  >
                    <Droplets size={13} strokeWidth={2.2} />
                  </span>
                  <span className="truncate">Smart Irrigation</span>
                </button>

                <button
                  type="button"
                  onClick={handleSatelliteClick}
                  aria-current={isSatelliteActive ? 'page' : undefined}
                  aria-label="Farm Insight — Satellite Farm Health"
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer text-left ${
                    isSatelliteActive
                      ? 'bg-[#234E37] text-white shadow-2xs font-bold'
                      : 'text-slate-600 hover:bg-[#EAE5D4] hover:text-[#1E4D35]'
                  }`}
                >
                  <span className={`flex h-6 w-6 items-center justify-center rounded-lg ${
                    isSatelliteActive ? 'bg-white/20 text-white' : 'bg-[#E8F3EC] text-[#234E37]'
                  }`} aria-hidden="true">
                    <Satellite size={13} strokeWidth={2.2} />
                  </span>
                  <span className="truncate">Satellite Farm Health</span>
                </button>

                {/* 2d. AI Agronomist */}
                <button
                  type="button"
                  onClick={handleAgronomistClick}
                  aria-current={isAgronomistActive ? 'page' : undefined}
                  aria-label="Farm Insight — AI Agronomist"
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer text-left ${
                    isAgronomistActive
                      ? 'bg-[#234E37] text-white shadow-2xs font-bold'
                      : 'text-slate-600 hover:bg-[#EAE5D4] hover:text-[#1E4D35]'
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-lg ${
                      isAgronomistActive
                        ? 'bg-white/20 text-white'
                        : 'bg-[#E8F3EC] text-[#234E37]'
                    }`}
                    aria-hidden="true"
                  >
                    <Bot size={13} strokeWidth={2.2} />
                  </span>
                  <span className="truncate">AI Agronomist</span>
                </button>
              </div>
            )}
          </div>

          {/* 3. Model Info */}
          <a
            href="#model-info"
            onClick={handleModelInfoClick}
            className="flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-sm font-semibold text-slate-700 hover:bg-[#EAE5D4] hover:text-[#1E4D35] transition-all no-underline"
          >
            <span
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#E8F3EC] text-[#234E37]"
              aria-hidden="true"
            >
              <Cpu size={16} strokeWidth={2.2} />
            </span>
            <span>Model Info</span>
          </a>

          {/* 4. How It Works */}
          <a
            href="#how-it-works"
            onClick={handleHowItWorksClick}
            className="flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-sm font-semibold text-slate-700 hover:bg-[#EAE5D4] hover:text-[#1E4D35] transition-all no-underline"
          >
            <span
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#E8F3EC] text-[#234E37]"
              aria-hidden="true"
            >
              <Sparkles size={16} strokeWidth={2.2} />
            </span>
            <span>How It Works</span>
          </a>
        </nav>
      </div>

      {/* Sidebar Footer Badge */}
      <div className="px-3 pt-6 border-t border-[#E5E0D0]/80">
        <div className="rounded-2xl bg-white/70 border border-[#E5E0D0] p-3 text-center">
          <div className="text-[11px] font-bold text-[#163824]">AgriNexa AI v0.1</div>
          <div className="text-[10px] text-slate-500 font-medium mt-0.5">Dual-Engine Diagnostics</div>
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;
