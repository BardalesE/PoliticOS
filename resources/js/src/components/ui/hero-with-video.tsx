"use client";
import React, { useState, useRef, useEffect } from "react";
import { useTheme } from "next-themes";
import { Play, Pause, Mail, ArrowRight, Menu, ChevronDown, Sun, Moon } from "lucide-react";

interface NavbarHeroProps {
  brandName?: string;
  heroTitle?: string;
  heroSubtitle?: string;
  heroDescription?: string;
  backgroundImage?: string;
  videoUrl?: string;
  emailPlaceholder?: string;
  showNavbar?: boolean;
  /** Dark variant: white text on dark/navy background */
  dark?: boolean;
  /** Override the <main> background class (e.g. "bg-transparent" when inside a styled wrapper) */
  mainClassName?: string;
}

const NavbarHero: React.FC<NavbarHeroProps> = ({
  brandName = "nexus",
  heroTitle = "Innovation Meets Simplicity",
  heroSubtitle = "Join the community",
  heroDescription = "Discover cutting-edge solutions designed for the modern digital landscape.",
  backgroundImage = "https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?ixlib=rb-4.0.3&auto=format&fit=crop&w=2072&q=80",
  videoUrl = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
  emailPlaceholder = "enter@email.com",
  showNavbar = true,
  dark = false,
  mainClassName,
}) => {
  const [email, setEmail] = useState("");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [isVideoPaused, setIsVideoPaused] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const handleEmailSubmit = () => { console.log("Email submitted:", email); };
  const toggleDropdown = (name: string) => setOpenDropdown(openDropdown === name ? null : name);

  const handlePlayVideo = () => {
    if (videoRef.current) { videoRef.current.play(); setIsVideoPlaying(true); setIsVideoPaused(false); }
  };
  const handlePauseVideo = () => {
    if (videoRef.current) { videoRef.current.pause(); setIsVideoPaused(true); }
  };
  const handleResumeVideo = () => {
    if (videoRef.current) { videoRef.current.play(); setIsVideoPaused(false); }
  };
  const handleVideoEnded = () => { setIsVideoPlaying(false); setIsVideoPaused(false); };

  // ── Color tokens depending on dark/light variant ──────────────────────────
  const t = {
    text:        dark ? "text-white"           : "text-foreground",
    textMuted:   dark ? "text-white/60"        : "text-muted-foreground",
    inputBg:     dark ? "bg-white/10 border-white/20 text-white placeholder:text-white/40 backdrop-blur-sm"
                      : "bg-muted border-border text-foreground placeholder:text-muted-foreground",
    inputIcon:   dark ? "text-white/40"        : "text-muted-foreground",
    btnPrimary:  dark
      ? "bg-white hover:bg-white/90 text-[#0B1E42] font-semibold shadow-lg shadow-black/30 hover:shadow-xl"
      : "bg-foreground hover:bg-muted-foreground text-background shadow-md shadow-black/15 hover:shadow-lg",
    btnOutline:  dark
      ? "border border-white/30 text-white hover:bg-white/10"
      : "border border-border text-foreground hover:bg-muted",
    navText:     dark ? "text-white/70 hover:text-white" : "text-muted-foreground hover:text-foreground",
    navBrand:    dark ? "text-white"            : "text-foreground",
    mobileMenu:  dark ? "bg-white/10 backdrop-blur-xl border-white/20" : "bg-card border-border",
    toggleBg:    dark ? "bg-white/10 hover:bg-white/20" : "bg-muted hover:bg-border",
    toggleIcon:  dark ? "text-white"            : "text-foreground",
  };

  const ThemeToggleButton = () => {
    if (!mounted) return <div className="w-10 h-10" />;
    return (
      <button
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        className={`${t.toggleBg} flex-shrink-0 p-2 rounded-full transition-colors`}
        aria-label="Toggle theme"
      >
        {theme === "light"
          ? <Moon className={`h-4 w-4 ${t.toggleIcon}`} />
          : <Sun  className={`h-4 w-4 ${t.toggleIcon}`} />}
      </button>
    );
  };

  const mainCls = mainClassName ?? "absolute inset-0 bg-background overflow-y-auto";

  return (
    <main className={mainCls}>
      <div className="w-full max-w-6xl mx-auto p-4 sm:p-6 lg:p-8">

        {/* ── Navbar ── */}
        {showNavbar && (
          <div className="py-2 relative z-20 flex items-center justify-between gap-4">
            <div className="flex items-center gap-6">
              <a href="#" className={`font-bold text-2xl pb-1 ${t.navBrand} cursor-pointer flex-shrink-0`}>
                {brandName}
              </a>
              <nav className={`hidden lg:flex font-medium`}>
                <ul className="flex items-center space-x-1">
                  {["About", "Blog"].map((item) => (
                    <li key={item}>
                      <a href="#" className={`${t.navText} px-3 py-2 text-sm transition-colors rounded-lg`}>{item}</a>
                    </li>
                  ))}
                  {["Resources", "Plans & Pricing"].map((item) => {
                    const key = `desktop-${item.toLowerCase().replace(/\s/g, "-")}`;
                    return (
                      <li key={item} className="relative">
                        <button
                          onClick={() => toggleDropdown(key)}
                          className={`flex items-center ${t.navText} px-3 py-2 text-sm transition-colors rounded-lg`}
                        >
                          {item}
                          <ChevronDown className={`h-4 w-4 ml-1 transition-transform ${openDropdown === key ? "rotate-180" : ""}`} />
                        </button>
                        {openDropdown === key && (
                          <ul className={`absolute top-full left-0 mt-2 p-2 shadow-xl ${dark ? "bg-[#0B1E42]/95 border-white/20 backdrop-blur-xl" : "bg-card border-border"} border rounded-xl z-20 w-48`}>
                            {["Opción 1", "Opción 2"].map((s) => (
                              <li key={s}><a href="#" className={`block px-3 py-2 text-sm ${t.navText} rounded-lg`}>{s}</a></li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </nav>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden lg:flex items-center gap-2">
                <a href="#" className={`${t.navText} py-1.5 px-4 text-sm font-medium transition-colors rounded-xl`}>
                  Login
                </a>
                <button className={`${t.btnPrimary} py-1.5 px-5 text-sm rounded-xl font-medium transition-all flex items-center gap-2`}>
                  Get Started <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
              <ThemeToggleButton />
              <div className="lg:hidden relative">
                <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className={`${t.toggleBg} p-2 rounded-xl transition-colors`}>
                  <Menu className={`h-5 w-5 ${t.toggleIcon}`} />
                </button>
                {isMobileMenuOpen && (
                  <ul className={`absolute top-full right-0 mt-2 p-2 shadow-xl ${t.mobileMenu} border rounded-xl w-56 z-30`}>
                    {["About", "Blog"].map((item) => (
                      <li key={item}><a href="#" className={`block px-3 py-2 text-sm ${t.text} hover:bg-white/5 rounded-lg`}>{item}</a></li>
                    ))}
                    <li className={`border-t ${dark ? "border-white/10" : "border-border"} mt-2 pt-2 space-y-1.5`}>
                      <a href="#" className={`block w-full text-center px-3 py-2 text-sm ${t.text} rounded-lg`}>Login</a>
                      <button className={`w-full ${t.btnPrimary} px-3 py-2 text-sm rounded-lg flex items-center justify-center gap-2 font-medium transition-all`}>
                        Get Started <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Hero text + email CTA ── */}
        <div className={`${showNavbar ? "pt-4 pb-10 sm:pt-6 sm:pb-12" : "pt-8 pb-8 sm:pt-10 sm:pb-10"} text-center`}>
          <div className="max-w-2xl mx-auto">
            <h1 className={`text-3xl sm:text-5xl ${t.text} font-bold tracking-tight leading-tight`}>
              {heroTitle}
            </h1>
            <p className={`mt-4 text-base sm:text-lg ${t.textMuted} leading-relaxed`}>
              {heroDescription}
            </p>
            <div className="mt-7 flex items-center justify-center gap-3 flex-wrap">
              <div className="relative">
                <Mail className={`absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 ${t.inputIcon}`} />
                <input
                  type="email"
                  placeholder={emailPlaceholder}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`w-full max-w-[220px] sm:max-w-xs ${t.inputBg} border font-medium pl-9 pr-3 py-2 text-sm rounded-full focus:outline-none focus:ring-2 focus:ring-white/30`}
                />
              </div>
              <button
                onClick={handleEmailSubmit}
                className={`${t.btnPrimary} px-5 py-2 text-sm rounded-full font-semibold transition-all flex items-center gap-2`}
              >
                Unirse ahora <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* ── Video player ── */}
        <header className={`relative w-full aspect-video rounded-2xl overflow-hidden ${dark ? "shadow-2xl shadow-black/50 ring-1 ring-white/10" : "shadow-xl"}`}>
          <img
            src={backgroundImage}
            alt="Hero background"
            className={`w-full h-full absolute inset-0 object-cover transition-opacity duration-500 ${isVideoPlaying ? "opacity-0" : "opacity-100"}`}
          />
          <video
            ref={videoRef}
            src={videoUrl}
            className={`w-full h-full absolute inset-0 object-cover transition-opacity duration-500 ${isVideoPlaying ? "opacity-100" : "opacity-0"}`}
            onEnded={handleVideoEnded}
            playsInline
            muted
          />
          {/* Subtle bottom gradient */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />

          <div className="absolute bottom-4 right-4 z-10">
            <button
              onClick={!isVideoPlaying ? handlePlayVideo : isVideoPaused ? handleResumeVideo : handlePauseVideo}
              className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center hover:bg-white/35 hover:scale-110 transition-all duration-200 shadow-lg shadow-black/30"
            >
              {!isVideoPlaying || isVideoPaused
                ? <Play  className="h-5 w-5 text-white fill-white ml-0.5" />
                : <Pause className="h-5 w-5 text-white fill-white" />}
            </button>
          </div>
        </header>

      </div>
    </main>
  );
};

export { NavbarHero };
