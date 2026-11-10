import { useState } from 'react';
import { Menu, X, ChevronDown } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { AgriNexaLogo } from './AgriNexaLogo';

interface HeaderProps {
  activeView?: 'landing' | 'home' | 'diagnose' | 'crop-recommendation' | 'sustainability' | 'weather-intelligence' | 'irrigation' | 'satellite' | 'login' | 'signup';
  onNavigateHome?: () => void;
  onNavigateDiagnose?: () => void;
  onNavigateCropRecommendation?: () => void;
  onNavigateSustainability?: () => void;
  onNavigateWeatherIntelligence?: () => void;
  onNavigateIrrigation?: () => void;
  onNavigateSatellite?: () => void;
  onNavigateModelInfo?: () => void;
  onNavigateHowItWorks?: () => void;
  onNavigateLogin?: () => void;
  onNavigateSignup?: () => void;
  onOpenAuth?: () => void;
}

export function Header({
  activeView = 'home',
  onNavigateHome,
  onNavigateDiagnose,
  onNavigateCropRecommendation,
  onNavigateSustainability: _onNavigateSustainability,
  onNavigateWeatherIntelligence,
  onNavigateIrrigation,
  onNavigateSatellite,
  onNavigateModelInfo,
  onNavigateHowItWorks,
  onNavigateLogin,
  onNavigateSignup,
  onOpenAuth,
}: HeaderProps = {}) {
  const { status, user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileFarmInsightOpen, setMobileFarmInsightOpen] = useState(true);

  const handleBrandClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (onNavigateHome) {
      onNavigateHome();
    } else if (onNavigateDiagnose) {
      onNavigateDiagnose();
    }
  };

  const handleHomeClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (onNavigateDiagnose) {
      onNavigateDiagnose();
    } else if (onNavigateHome) {
      onNavigateHome();
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

  const handleLoginClick = () => {
    if (onNavigateLogin) {
      onNavigateLogin();
    } else if (onOpenAuth) {
      onOpenAuth();
    }
  };

  const handleSignupClick = () => {
    if (onNavigateSignup) {
      onNavigateSignup();
    } else if (onOpenAuth) {
      onOpenAuth();
    }
  };

  return (
    <header
      role="banner"
      className="sticky top-0 z-50 border-b border-[#EFE9D7] bg-white/95 backdrop-blur-md"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 sm:h-20 items-center justify-between gap-4">

          {/* Left Side: Logo & AgriNexa AI Branding */}
          <a
            href="#diagnose"
            aria-label="AgriNexa AI — home"
            onClick={handleBrandClick}
            className="flex items-center gap-2.5 no-underline hover:no-underline focus-visible:rounded-lg shrink-0 min-w-0"
          >
            <div
              className="flex h-9 w-9 max-h-9 max-w-9 items-center justify-center rounded-full bg-[#FEF7E1] p-1 transition-transform hover:scale-105 shrink-0 overflow-hidden"
              aria-hidden="true"
            >
              <AgriNexaLogo variant="navbar" size={32} />
            </div>
            <span className="text-xl font-medium tracking-tight text-[#35322D] shrink-0 whitespace-nowrap">
              AgriNexa <span className="text-[#6CBE03]">AI</span>
            </span>
          </a>

          {/* Right Side: Auth / User actions + Mobile toggle */}
          <div className="flex items-center gap-2 sm:gap-3">
            {status === 'authenticated' && user ? (
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[#163824]">
                  {user.name || user.email || 'Account'}
                </span>
                <button
                  type="button"
                  onClick={logout}
                  className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 cursor-pointer transition-colors"
                  aria-label="Sign Out"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {/* Action: Login */}
                <button
                  type="button"
                  onClick={handleLoginClick}
                  className="min-h-10 rounded-full border border-[#6CBE03]/50 bg-white px-4 py-2 text-sm font-medium text-[#2A4D11] transition-colors hover:bg-[#EAF6DA] cursor-pointer"
                  aria-label="Login"
                >
                  Login
                </button>

                {/* Primary Action: Sign Up */}
                <button
                  type="button"
                  onClick={handleSignupClick}
                  className="min-h-10 rounded-full bg-[#FFB700] px-4 py-2 text-sm font-semibold text-[#212529] transition-colors hover:bg-[#F2AD00] cursor-pointer"
                  aria-label="Sign Up"
                >
                  Sign Up
                </button>
              </div>
            )}

            {/* Mobile Menu Hamburger Button */}
            <div className="flex md:hidden ml-1">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="rounded-xl p-2 text-slate-700 hover:bg-slate-200/60 hover:text-slate-900 cursor-pointer"
                aria-expanded={mobileMenuOpen}
                aria-label="Toggle navigation menu"
              >
                {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
              </button>
            </div>
          </div>

        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <nav
            aria-label="Mobile navigation"
            className="md:hidden border-t border-[#E5E0D0] py-3 space-y-1"
          >
            <a
              href="#diagnose"
              onClick={(e) => {
                setMobileMenuOpen(false);
                handleHomeClick(e);
              }}
              className={`block rounded-xl px-3.5 py-2.5 text-base font-medium transition-colors ${
                activeView === 'home' || activeView === 'diagnose' || activeView === 'landing'
                  ? 'text-[#1E4D35] bg-[#E4EFE7] font-semibold'
                  : 'text-slate-700 hover:bg-[#EAE5D4] hover:text-[#1E4D35]'
              }`}
            >
              Home
            </a>
            {/* Mobile Farm Insight Expandable */}
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => setMobileFarmInsightOpen(!mobileFarmInsightOpen)}
                aria-expanded={mobileFarmInsightOpen}
                aria-label="Farm Insight"
                className={`flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-base font-medium cursor-pointer transition-colors ${
                  activeView === 'crop-recommendation' || activeView === 'sustainability' || activeView === 'weather-intelligence' || activeView === 'irrigation' || activeView === 'satellite'
                    ? 'text-[#1E4D35] bg-[#E4EFE7] font-semibold'
                    : 'text-slate-700 hover:bg-[#EAE5D4] hover:text-[#1E4D35]'
                }`}
              >
                <span>Farm Insight</span>
                <ChevronDown
                  size={18}
                  className={`text-slate-500 transition-transform duration-200 ${
                    mobileFarmInsightOpen ? 'rotate-180 text-[#1E4D35]' : ''
                  }`}
                  aria-hidden="true"
                />
              </button>

              {mobileFarmInsightOpen && (
                <div className="pl-4 pr-1 space-y-1 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onNavigateCropRecommendation?.();
                    }}
                    aria-label="Farm Insight — Crop Recommendation"
                    className={`block w-full text-left rounded-xl px-3 py-2 text-sm font-medium transition-colors cursor-pointer ${
                      activeView === 'crop-recommendation'
                        ? 'bg-[#234E37] text-white font-bold'
                        : 'text-slate-600 hover:bg-[#EAE5D4] hover:text-[#1E4D35]'
                    }`}
                  >
                    Crop Recommendation
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      _onNavigateSustainability?.();
                    }}
                    aria-label="Farm Insight — Sustainability Score"
                    className={`block w-full text-left rounded-xl px-3 py-2 text-sm font-medium transition-colors cursor-pointer ${
                      activeView === 'sustainability'
                        ? 'bg-[#234E37] text-white font-bold'
                        : 'text-slate-600 hover:bg-[#EAE5D4] hover:text-[#1E4D35]'
                    }`}
                  >
                    Sustainability Score
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onNavigateWeatherIntelligence?.();
                    }}
                    aria-label="Farm Insight — Weather Intelligence"
                    className={`block w-full text-left rounded-xl px-3 py-2 text-sm font-medium transition-colors cursor-pointer ${
                      activeView === 'weather-intelligence'
                        ? 'bg-[#234E37] text-white font-bold'
                        : 'text-slate-600 hover:bg-[#EAE5D4] hover:text-[#1E4D35]'
                    }`}
                  >
                    Weather Intelligence
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onNavigateIrrigation?.();
                    }}
                    aria-label="Farm Insight — Smart Irrigation"
                    className={`block w-full text-left rounded-xl px-3 py-2 text-sm font-medium transition-colors cursor-pointer ${
                      activeView === 'irrigation'
                        ? 'bg-[#234E37] text-white font-bold'
                        : 'text-slate-600 hover:bg-[#EAE5D4] hover:text-[#1E4D35]'
                    }`}
                  >
                    Smart Irrigation
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onNavigateSatellite?.();
                    }}
                    aria-label="Farm Insight — Satellite Farm Health"
                    className={`block w-full text-left rounded-xl px-3 py-2 text-sm font-medium transition-colors cursor-pointer ${
                      activeView === 'satellite'
                        ? 'bg-[#234E37] text-white font-bold'
                        : 'text-slate-600 hover:bg-[#EAE5D4] hover:text-[#1E4D35]'
                    }`}
                  >
                    Satellite Farm Health
                  </button>
                </div>
              )}
            </div>

            <a
              href="#model-info"
              onClick={(e) => {
                setMobileMenuOpen(false);
                handleModelInfoClick(e);
              }}
              className="block rounded-xl px-3.5 py-2.5 text-base font-medium text-slate-700 hover:bg-[#EAE5D4] hover:text-[#1E4D35] transition-colors"
            >
              Model Info
            </a>
            <a
              href="#how-it-works"
              onClick={(e) => {
                setMobileMenuOpen(false);
                handleHowItWorksClick(e);
              }}
              className="block rounded-xl px-3.5 py-2.5 text-base font-medium text-slate-700 hover:bg-[#EAE5D4] hover:text-[#1E4D35] transition-colors"
            >
              How It Works
            </a>
          </nav>
        )}
      </div>
    </header>
  );
}

export default Header;
