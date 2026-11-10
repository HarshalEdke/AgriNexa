import { ArrowRight } from 'lucide-react';

interface LandingHeroProps {
  onGetStarted: () => void;
}

export function LandingHero({ onGetStarted }: LandingHeroProps) {
  return (
    <section
      aria-label="AgriNexa AI Introduction"
      className="relative overflow-hidden bg-[#FAF7EE] pt-8 pb-12 sm:pt-12 sm:pb-16 lg:pt-16 lg:pb-20"
    >
      {/* Background Soft Glow Accents */}
      <div
        className="pointer-events-none absolute -top-24 left-1/4 h-96 w-96 rounded-full bg-emerald-200/20 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute bottom-0 right-10 h-80 w-80 rounded-full bg-amber-100/30 blur-2xl"
        aria-hidden="true"
      />

      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-12">
          
          {/* Left Column: Headline, Eyebrow, Supporting Copy & Primary Action */}
          <div className="text-center lg:col-span-6 lg:text-left space-y-6">
            
            {/* Eyebrow Label matching Reference Image 1 */}
            <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[#2D5A3D]/90 sm:text-[13px]">
              <span>SMARTER FARMING</span>
              <span className="text-[#2D5A3D]/40 font-black">•</span>
              <span>BRIGHTER TOMORROWS</span>
            </div>

            {/* Editorial Serif Heading matching Reference Image 1 */}
            <h1 className="text-4xl sm:text-5xl lg:text-[54px] font-extrabold tracking-tight text-[#163824] leading-[1.12]">
              Where Agriculture <br className="hidden sm:inline" />
              Meets <span className="font-serif italic font-normal text-[#2D6A4F]">AI</span>
            </h1>

            {/* Description Copy */}
            <p className="mx-auto max-w-lg text-base sm:text-lg text-slate-600 leading-relaxed lg:mx-0 font-normal">
              AgriNexa AI empowers farmers with intelligent insights, helping them make better decisions, improve crop health, and build a more sustainable future.
            </p>

            {/* Get Started Action Button */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4">
              <button
                type="button"
                onClick={onGetStarted}
                className="group inline-flex items-center gap-3 rounded-full bg-[#234E37] px-8 py-3.5 text-base font-bold text-white shadow-md transition-all duration-200 hover:bg-[#1A3C2A] hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.98] cursor-pointer"
                aria-label="Get Started with AgriNexa AI"
              >
                <span>Get Started</span>
                <ArrowRight
                  size={18}
                  className="transition-transform duration-200 group-hover:translate-x-1"
                />
              </button>
            </div>

          </div>

          {/* Right Column: Organic Curved Farm Image matching Reference Image 1 */}
          <div className="flex justify-center lg:col-span-6 lg:justify-end">
            <div className="relative w-full max-w-md sm:max-w-lg lg:max-w-none">
              
              {/* Organic Curved Mask Container matching Reference Image 1 */}
              <div
                className="relative mx-auto aspect-[4/3] w-full max-w-[500px] overflow-hidden shadow-[0_20px_45px_rgba(20,50,30,0.12)] border-[3px] border-white/80 transition-transform duration-300 hover:scale-[1.01]"
                style={{
                  borderRadius: '45% 55% 48% 52% / 44% 46% 54% 56%',
                }}
              >
                <img
                  src="/images/hero-seedling.jpg"
                  alt="Young vibrant green crop seedling growing in rich agricultural soil at golden sunrise"
                  className="h-full w-full object-cover object-center"
                  loading="eager"
                />
                <div
                  className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent"
                  aria-hidden="true"
                />
              </div>

              {/* Decorative Subtle Floating Pill Badge */}
              <div
                className="absolute -bottom-3 left-6 sm:left-10 rounded-2xl border border-emerald-200/80 bg-white/95 backdrop-blur-md px-4 py-2.5 shadow-md flex items-center gap-2.5 animate-bounce-subtle"
                aria-hidden="true"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                  <span className="text-sm font-bold">🌱</span>
                </div>
                <div className="text-left">
                  <div className="text-[11px] font-extrabold text-[#163824]">Next-Gen Precision</div>
                  <div className="text-[10px] font-medium text-slate-500">AI Pathology + Sensors</div>
                </div>
              </div>

            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
