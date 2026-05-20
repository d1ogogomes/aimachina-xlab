import { useState } from 'react'
import { Shader, Swirl, ChromaFlow, FlutedGlass, FilmGrain } from 'shaders/react'
import { ArrowRight, Globe, ChevronDown, Check } from 'lucide-react'

type AppReactProps = {
  onSelectTab: (tab: 'cv' | 'llm') => void
  locale?: string
  t?: (key: string) => string
  onChangeLanguage?: (lang: string) => void
}

export default function AppReact({ 
  onSelectTab, 
  locale = 'pt', 
  t = (key) => key, 
  onChangeLanguage = () => {} 
}: AppReactProps) {
  const [langOpen, setLangOpen] = useState(false);

  const languages = [
    { code: 'pt', label: 'Português', short: 'PT' },
    { code: 'en', label: 'English',   short: 'EN' },
    { code: 'fr', label: 'Français',  short: 'FR' },
  ];

  const currentLang = languages.find(l => l.code === locale) || languages[0];

  return (
    <div className="min-h-screen w-full bg-[#FAF9FC] overflow-hidden flex flex-col justify-center items-center relative">
      
      {/* Full-screen animated shader overlay styled with teal/indigo flow colors */}
      <div className="absolute inset-0 z-10 pointer-events-none w-full h-full">
        <Shader className="w-full h-full">
          <Swirl colorA="#ffffff" colorB="#faf9fc" detail={1.7} />
          <ChromaFlow baseColor="#ffffff" downColor="#6366f1" leftColor="#4f46e5" rightColor="#0d9488" upColor="#14b8a6" momentum={13} radius={3.5} />
          <FlutedGlass aberration={0.61} angle={31} frequency={8} highlight={0.12} highlightSoftness={0} lightAngle={-90} refraction={4} shape="rounded" softness={1} speed={0.15} />
          <FilmGrain strength={0.05} />
        </Shader>
      </div>

      {/* Top Right Floating Language Switcher */}
      <div className="absolute top-6 right-8 z-30">
        <div className="relative">
          <button
            onClick={() => setLangOpen(!langOpen)}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-zinc-700 bg-white/80 backdrop-blur-md border border-white/50 rounded-full hover:bg-zinc-100/50 hover:border-zinc-300 transition-all duration-300 shadow-[0_4px_12px_rgba(0,0,0,0.03)] cursor-pointer"
          >
            <Globe size={13} className="text-zinc-500" />
            <span>{currentLang.short}</span>
            <ChevronDown size={10} className={`text-zinc-500 transition-transform duration-300 ${langOpen ? 'rotate-180' : ''}`} />
          </button>

          {langOpen && (
            <>
              {/* Overlay clickable background to close dropdown */}
              <div 
                className="fixed inset-0 z-40 bg-transparent" 
                onClick={() => setLangOpen(false)}
              />
              <div className="absolute right-0 mt-2 w-36 bg-white/95 backdrop-blur-md border border-zinc-200/80 rounded-2xl shadow-xl z-50 overflow-hidden py-1 animate-in fade-in slide-in-from-top-1 duration-200">
                {languages.map(lang => (
                  <button
                    key={lang.code}
                    onClick={() => {
                      onChangeLanguage(lang.code);
                      setLangOpen(false);
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-zinc-50 transition-colors cursor-pointer text-left ${locale === lang.code ? 'font-bold text-indigo-600 bg-indigo-50/50' : 'text-zinc-700'}`}
                  >
                    <span className="font-mono text-[10px] w-5 text-center bg-zinc-100 rounded px-1 py-0.5">{lang.short}</span>
                    <span>{lang.label}</span>
                    {locale === lang.code && (
                      <Check size={10} className="ml-auto text-indigo-600" />
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Main Content (Only the premium text and entrance buttons) */}
      <div className="w-full max-w-[1440px] px-6 sm:px-12 z-20 relative text-center flex flex-col items-center justify-center">
        <h1 className="text-[clamp(2.5rem,7vw,5.5rem)] font-black leading-[1.05] tracking-[-0.03em] text-transparent bg-clip-text bg-gradient-to-b from-zinc-950 via-zinc-900 to-indigo-950 max-w-[1100px] mx-auto mb-4 select-none">
          AIMachina <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-teal-600">XLab</span>
        </h1>
        
        <p className="text-lg sm:text-[22px] font-bold text-zinc-800 max-w-3xl mx-auto leading-snug mb-6 select-none">
          {t('home_hero_subtitle_xlab')}
        </p>

        <p className="text-base sm:text-[17px] text-zinc-500 max-w-2xl mx-auto font-normal leading-relaxed mb-10 select-none">
          {t('home_hero_desc_xlab')}
        </p>

        {/* Primary action entry buttons for the 2 projects on the page body */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <button 
            onClick={() => onSelectTab('cv')}
            className="group flex items-center justify-between sm:justify-start gap-4 bg-indigo-600 hover:bg-indigo-700 text-white text-[14px] font-bold rounded-full pl-6 pr-2 py-2 transition-colors duration-300 shadow-[0_4px_14px_rgba(79,70,229,0.25)] w-full sm:w-auto cursor-pointer"
          >
            <span className="relative overflow-hidden h-[20px] flex flex-col">
              <span className="flex flex-col transition-transform duration-500 ease-[cubic-bezier(0.25,0.1,0.25,1)] group-hover:-translate-y-1/2">
                <span className="h-[20px] flex items-center">{t('home_cv_btn_xlab')}</span>
                <span className="h-[20px] flex items-center">{t('home_cv_btn_xlab')}</span>
              </span>
            </span>
            <span className="w-8 h-8 rounded-full bg-white flex items-center justify-center transform transition-transform duration-500 ease-[cubic-bezier(0.25,0.1,0.25,1)] group-hover:-rotate-45">
              <ArrowRight size={15} className="text-indigo-600" />
            </span>
          </button>

          <button 
            onClick={() => onSelectTab('llm')}
            className="group flex items-center justify-between sm:justify-start gap-4 bg-teal-600 hover:bg-teal-700 text-white text-[14px] font-bold rounded-full pl-6 pr-2 py-2 transition-colors duration-300 shadow-[0_4px_14px_rgba(13,148,136,0.25)] w-full sm:w-auto cursor-pointer"
          >
            <span className="relative overflow-hidden h-[20px] flex flex-col">
              <span className="flex flex-col transition-transform duration-500 ease-[cubic-bezier(0.25,0.1,0.25,1)] group-hover:-translate-y-1/2">
                <span className="h-[20px] flex items-center">{t('home_llm_btn_xlab')}</span>
                <span className="h-[20px] flex items-center">{t('home_llm_btn_xlab')}</span>
              </span>
            </span>
            <span className="w-8 h-8 rounded-full bg-white flex items-center justify-center transform transition-transform duration-500 ease-[cubic-bezier(0.25,0.1,0.25,1)] group-hover:-rotate-45">
              <ArrowRight size={15} className="text-teal-600" />
            </span>
          </button>
        </div>
      </div>

    </div>
  )
}
