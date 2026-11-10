import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { AgriNexaLogo } from '../components/AgriNexaLogo';

interface LandingPageProps {
  onGetStarted: () => void;
}

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function LandingPage({ onGetStarted }: LandingPageProps) {
  const [shouldPlayBackground, setShouldPlayBackground] = useState(
    () => !prefersReducedMotion(),
  );

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;

    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePlayback = (event: MediaQueryListEvent) => {
      setShouldPlayBackground(!event.matches);
    };

    motionPreference.addEventListener('change', updatePlayback);
    return () => motionPreference.removeEventListener('change', updatePlayback);
  }, []);

  return (
    <main
      id="landing-screen"
      aria-label="AgriNexa AI Introduction"
      className="relative isolate flex min-h-screen items-center overflow-hidden bg-[#17251A] px-5 py-16 sm:px-8 lg:px-12"
    >
      <div className="absolute inset-0 z-0" aria-hidden="true">
        <video
          className="h-full w-full object-cover"
          autoPlay={shouldPlayBackground}
          loop
          muted
          playsInline
          preload="metadata"
          poster="/images/hero-seedling.jpg"
        >
          <source src="/videos/farm-background.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/50 to-black/35" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-7xl">
        <section className="max-w-3xl space-y-7 text-center lg:text-left">
          <div className="flex items-center justify-center gap-3 lg:justify-start">
            <AgriNexaLogo variant="intro" size={48} animated={false} />
            <span className="text-2xl font-medium tracking-tight text-white sm:text-3xl">
              AgriNexa <span className="text-[#A7E64C]">AI</span>
            </span>
          </div>

          <div className="space-y-5">
            <p className="text-base font-medium text-[#C8F29A] sm:text-lg">
              Digital intelligence for healthier crops
            </p>
            <h1 className="mx-auto max-w-2xl text-4xl font-medium leading-tight tracking-tight text-white sm:text-5xl lg:mx-0 lg:text-[56px]">
              <span style={{ color: '#75F94D' }}>A smarter way to care for your </span>
              <span style={{ color: '#fff' }}>crops.</span>
            </h1>
            <p className="mx-auto max-w-lg text-base leading-relaxed text-white/85 sm:text-lg lg:mx-0">
              Make confident farm decisions with crop diagnosis, local weather insights, and practical recommendations—all in one place.
            </p>
          </div>

          <div className="flex justify-center lg:justify-start">
            <button
              type="button"
              onClick={onGetStarted}
              className="group inline-flex min-h-12 items-center justify-center gap-3 rounded-full bg-[#FFB700] px-8 py-3 text-base font-semibold text-[#212529] shadow-[0_3px_12px_rgba(255,183,0,0.22)] transition hover:bg-[#F2AD00] hover:shadow-[0_5px_18px_rgba(255,183,0,0.3)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C8F29A] active:scale-[0.98]"
              aria-label="Get Started with AgriNexa AI"
            >
              <span>Get Started</span>
              <ArrowRight
                size={18}
                className="transition-transform duration-200 group-hover:translate-x-1"
              />
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}

export default LandingPage;
