import { useState, useEffect, Component, ReactNode, ErrorInfo } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { LandingPage } from './pages/LandingPage';
import { DiagnosePage } from './pages/DiagnosePage';
import { CropRecommendationPage } from './pages/CropRecommendationPage';
import { SustainabilityScorePage } from './pages/SustainabilityScorePage';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';
import { AuthProvider } from './context/AuthContext';
import { AuthModal } from './components/auth/AuthModal';
import { AgriNexaLogo } from './components/AgriNexaLogo';
import { DiagnosisProvider, useDiagnosis } from './context/DiagnosisContext';
import { DiagnosisChatAssistant } from './components/chat/DiagnosisChatAssistant';
import { WeatherIntelligenceCard } from './components/weather/WeatherIntelligenceCard';
import { IrrigationPage } from './pages/IrrigationPage';
import { SatelliteMonitoringPage } from './pages/SatelliteMonitoringPage';

function GlobalModals({ onNavigateDiagnose }: { onNavigateDiagnose: () => void }) {
  const { 
    activeDiagnosis, 
    isAgronomistOpen, closeAgronomist,
    isMissingDiagnosisOpen, closeMissingDiagnosis
  } = useDiagnosis();

  return (
    <>
      {activeDiagnosis && (
        <DiagnosisChatAssistant
          isOpen={isAgronomistOpen}
          onClose={closeAgronomist}
          result={activeDiagnosis}
        />
      )}

      {isMissingDiagnosisOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden">
            <div className="p-6 sm:p-8 text-center space-y-4">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-600 mb-2">
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-slate-900">No Active Diagnosis Found</h2>
              <p className="text-slate-600 text-sm leading-relaxed">
                To get accurate organic remedies, dosage calculators, or spray advisories, please upload and diagnose a crop/leaf image first.
              </p>
              <div className="pt-4 flex gap-3">
                <button
                  onClick={closeMissingDiagnosis}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-medium hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    closeMissingDiagnosis();
                    onNavigateDiagnose();
                  }}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-600 text-white font-medium hover:bg-emerald-700 transition-colors shadow-sm"
                >
                  Go to Plant Diagnosis
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export type AppView = 'landing' | 'diagnose' | 'crop-recommendation' | 'sustainability' | 'weather-intelligence' | 'irrigation' | 'satellite' | 'login' | 'signup';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackView?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('AgriNexa AI UI Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="flex-1 flex items-center justify-center p-8 text-center bg-[#FAF7EE]">
          <div className="max-w-md rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900 mb-2">Display Error Detected</h2>
            <p className="text-sm text-slate-600 mb-4">
              An unexpected display issue occurred while rendering. You can safely return to the home screen.
            </p>
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false });
                if (this.props.fallbackView) {
                  this.props.fallbackView();
                } else {
                  window.location.reload();
                }
              }}
              className="px-4 py-2 text-sm font-semibold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer transition-colors"
            >
              Return to Home
            </button>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}

function Footer() {
  return (
    <footer
      className="border-t border-[#EFE9D7] bg-white py-8"
      role="contentinfo"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
          
          {/* Logo & Tagline */}
          <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-3.5">
            <div className="flex items-center gap-2">
              <div
                className="flex h-7 w-7 max-h-7 max-w-7 items-center justify-center rounded-full bg-[#FEF7E1] p-0.5 shrink-0 overflow-hidden"
                aria-hidden="true"
              >
                <AgriNexaLogo variant="footer" size={24} />
              </div>
              <span className="text-sm font-medium text-[#35322D]">
                AgriNexa <span className="text-[#6CBE03]">AI</span>
              </span>
            </div>
            <span className="hidden sm:inline-block h-3.5 w-px bg-slate-300" aria-hidden="true" />
            <span className="text-xs text-slate-500 font-medium">
              Intelligent Agriculture for a Sustainable Future
            </span>
          </div>

        </div>
      </div>
    </footer>
  );
}

interface AppShellProps {
  initialView?: AppView;
}

export function AppShell({ initialView }: AppShellProps = {}) {
  const getInitialView = (): AppView => {
    if (initialView) return initialView;
    if (typeof window !== 'undefined') {
      const hash = window.location.hash;
      if (hash === '#diagnose' || hash === '#diagnose-console' || hash === '#model-info' || hash === '#how-it-works') {
        return 'diagnose';
      }
      if (hash === '#weather-intelligence') return 'weather-intelligence';
      if (hash === '#irrigation') return 'irrigation';
      if (hash === '#satellite') return 'satellite';
      if (hash === '#crop-recommendation') return 'crop-recommendation';
      if (hash === '#sustainability') return 'sustainability';
    }
    return 'landing';
  };

  const [activeView, setActiveView] = useState<AppView>(getInitialView);
  const [previousView, setPreviousView] = useState<AppView>('landing');
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // Sync with browser back/forward buttons
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (e.state && e.state.view) {
        setActiveView(e.state.view);
      } else {
        const hash = window.location.hash;
        if (hash === '#diagnose' || hash === '#diagnose-console' || hash === '#model-info' || hash === '#how-it-works') {
          setActiveView('diagnose');
        } else if (hash === '#weather-intelligence') {
          setActiveView('weather-intelligence');
        } else if (hash === '#irrigation') {
          setActiveView('irrigation');
        } else if (hash === '#satellite') {
          setActiveView('satellite');
        } else if (hash === '#crop-recommendation') {
          setActiveView('crop-recommendation');
        } else if (hash === '#sustainability') {
          setActiveView('sustainability');
        } else {
          setActiveView('landing');
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateTo = (view: AppView, targetHash?: string) => {
    if (activeView !== 'login' && activeView !== 'signup') {
      setPreviousView(activeView);
    }
    setActiveView(view);

    if (typeof window !== 'undefined') {
      const newHash = targetHash || (view === 'diagnose' ? '#diagnose' : view === 'crop-recommendation' ? '#crop-recommendation' : view === 'sustainability' ? '#sustainability' : view === 'weather-intelligence' ? '#weather-intelligence' : view === 'irrigation' ? '#irrigation' : view === 'satellite' ? '#satellite' : '');
      window.history.pushState({ view }, '', newHash ? `${window.location.pathname}${newHash}` : window.location.pathname);
    }

    if (targetHash) {
      setTimeout(() => {
        const el = document.querySelector(targetHash);
        el?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleNavigateLanding = () => navigateTo('landing');
  const handleNavigateDiagnose = (hash?: string) => navigateTo('diagnose', hash);
  const handleOpenWeatherIntelligence = () => navigateTo('weather-intelligence');
  const handleOpenIrrigation = () => navigateTo('irrigation');
  const handleOpenSatellite = () => navigateTo('satellite');
  const handleOpenCropRecommendation = () => navigateTo('crop-recommendation');
  const handleOpenSustainability = () => navigateTo('sustainability');
  const handleNavigateLogin = () => navigateTo('login');
  const handleNavigateSignup = () => navigateTo('signup');

  const handleReturnToPrevious = () => {
    setActiveView(previousView);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div id="app-shell" className="flex min-h-screen flex-col bg-white">
      {activeView !== 'landing' && (
        <Header
          activeView={activeView === 'diagnose' ? 'home' : activeView}
          onNavigateHome={() => navigateTo('landing')}
          onNavigateDiagnose={() => navigateTo('diagnose')}
          onNavigateCropRecommendation={handleOpenCropRecommendation}
          onNavigateSustainability={handleOpenSustainability}
          onNavigateWeatherIntelligence={handleOpenWeatherIntelligence}
          onNavigateIrrigation={handleOpenIrrigation}
          onNavigateSatellite={handleOpenSatellite}
          onNavigateModelInfo={() => navigateTo('diagnose', '#model-info')}
          onNavigateHowItWorks={() => navigateTo('diagnose', '#how-it-works')}
          onNavigateLogin={handleNavigateLogin}
          onNavigateSignup={handleNavigateSignup}
          onOpenAuth={() => setIsAuthModalOpen(true)}
        />
      )}
      <GlobalModals onNavigateDiagnose={() => handleNavigateDiagnose()} />
      {/* Main Body Shell */}
      <ErrorBoundary fallbackView={handleNavigateLanding}>
        {/* Exactly ONE Intro / Landing Screen when site opens */}
        {activeView === 'landing' ? (
          <LandingPage onGetStarted={() => handleNavigateDiagnose()} />
        ) : activeView === 'login' ? (
          <LoginPage
            onBack={handleReturnToPrevious}
            onNavigateSignup={handleNavigateSignup}
            onSuccess={handleReturnToPrevious}
          />
        ) : activeView === 'signup' ? (
          <SignupPage
            onBack={handleReturnToPrevious}
            onNavigateLogin={handleNavigateLogin}
            onSuccess={handleReturnToPrevious}
          />
        ) : (
          /* Main Application with Left Sidebar & Full-Width Content */
          <div className="flex-1 flex flex-col md:flex-row min-h-0">
            {/* Left Sidebar (Desktop) */}
            <Sidebar
              activeView={activeView}
              onNavigateDiagnose={() => handleNavigateDiagnose()}
              onNavigateCropRecommendation={handleOpenCropRecommendation}
              onNavigateSustainability={handleOpenSustainability}
              onNavigateWeatherIntelligence={handleOpenWeatherIntelligence}
              onNavigateIrrigation={handleOpenIrrigation}
              onNavigateSatellite={handleOpenSatellite}
              onNavigateModelInfo={() => navigateTo('diagnose', '#model-info')}
              onNavigateHowItWorks={() => navigateTo('diagnose', '#how-it-works')}
              className="hidden md:flex"
            />

            {/* Main Content Area */}
            <div className="flex-1 min-w-0 flex flex-col">
              {activeView === 'diagnose' && (
                <DiagnosePage
                  onOpenCropRecommendation={handleOpenCropRecommendation}
                  onOpenSustainabilityScore={handleOpenSustainability}
                  onOpenWeatherIntelligence={handleOpenWeatherIntelligence}
                  onOpenIrrigation={handleOpenIrrigation}
                  onOpenSatellite={handleOpenSatellite}
                />
              )}

              {activeView === 'crop-recommendation' && (
                <CropRecommendationPage
                  onBack={() => handleNavigateDiagnose()}
                  onNavigateSustainability={handleOpenSustainability}
                />
              )}

              {activeView === 'sustainability' && (
                <SustainabilityScorePage
                  onBack={() => handleNavigateDiagnose()}
                  onNavigateCropRecommendation={handleOpenCropRecommendation}
                />
              )}

              {activeView === 'weather-intelligence' && (
                <div className="flex-1 p-4 sm:p-6 lg:p-8 bg-mesh-agri overflow-y-auto">
                  <div className="mx-auto max-w-5xl">
                    <WeatherIntelligenceCard
                      initialLocation="Pune"
                      onNavigateSustainability={handleOpenSustainability}
                    />
                  </div>
                </div>
              )}

              {activeView === 'irrigation' && (
                <IrrigationPage onSignIn={handleNavigateLogin} />
              )}

              {activeView === 'satellite' && (
                <SatelliteMonitoringPage
                  onSignIn={handleNavigateLogin}
                  onOpenIrrigation={handleOpenIrrigation}
                />
              )}
            </div>
          </div>
        )}
      </ErrorBoundary>
      <Footer />
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
      />
    </div>
  );
}

export default function App({ initialView }: AppShellProps = {}) {
  return (
    <AuthProvider>
      <DiagnosisProvider>
        <AppShell initialView={initialView} />
      </DiagnosisProvider>
    </AuthProvider>
  );
}
