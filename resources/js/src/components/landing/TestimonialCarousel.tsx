"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { Quote, User } from "lucide-react";
import { homeApi, type Testimonial } from "@/lib/api";

function TestimonialCard({ t }: { t: Testimonial }) {
  return (
    <div
      className="shrink-0 w-[86%] sm:w-[380px] snap-center bg-white rounded-[20px] p-6 sm:p-7 flex flex-col"
      style={{ border: "1px solid var(--page-line)" }}
    >
      <Quote size={28} style={{ color: "rgb(var(--brand-primary-rgb))" }} className="mb-3 opacity-60" aria-hidden />
      <p className="text-[15px] leading-relaxed flex-1" style={{ color: "var(--page-ink)" }}>
        “{t.quote}”
      </p>
      <div className="flex items-center gap-3 mt-5 pt-4" style={{ borderTop: "1px solid var(--page-line)" }}>
        <div className="relative w-10 h-10 rounded-full overflow-hidden shrink-0 bg-brand-50 grid place-items-center">
          {t.photo_url ? (
            <Image src={t.photo_url} alt={t.name} fill sizes="40px" className="object-cover" />
          ) : (
            <User size={18} className="text-brand-300" />
          )}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold truncate" style={{ color: "var(--page-ink)" }}>{t.name}</p>
          <p className="text-xs truncate" style={{ color: "var(--page-ink-soft)" }}>
            {[t.role, t.district].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * "Testimonios" — carrusel horizontal con scroll-snap nativo (sin librería
 * de carrusel adicional). Los puntos de abajo son navegación clicable y
 * también reflejan la tarjeta más visible mientras el usuario hace scroll.
 */
export function TestimonialCarousel() {
  const [testimonials, setTestimonials] = useState<Testimonial[] | null>(null);
  const [active, setActive] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    homeApi.testimonials()
      .then((data) => { if (!cancelled) setTestimonials(data.filter((t) => t.is_active)); })
      .catch(() => { if (!cancelled) setTestimonials([]); });
    return () => { cancelled = true; };
  }, []);

  const scrollToIndex = (i: number) => {
    const track = trackRef.current;
    if (!track) return;
    const card = track.children[i] as HTMLElement | undefined;
    card?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  };

  const handleScroll = () => {
    const track = trackRef.current;
    if (!track || !testimonials) return;
    const trackCenter = track.scrollLeft + track.clientWidth / 2;
    let closest = 0;
    let closestDist = Infinity;
    Array.from(track.children).forEach((child, i) => {
      const el = child as HTMLElement;
      const dist = Math.abs(el.offsetLeft + el.clientWidth / 2 - trackCenter);
      if (dist < closestDist) { closestDist = dist; closest = i; }
    });
    setActive(closest);
  };

  if (!testimonials || testimonials.length === 0) return null;

  return (
    <section id="testimonios" className="py-20 md:py-28 px-5 overflow-hidden" style={{ background: "var(--page-bg)" }}>
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5 }}
          className="mb-10 max-w-xl"
        >
          <span
            className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.2em] mb-4"
            style={{ color: "rgb(var(--brand-primary-rgb))" }}
          >
            <span className="w-2 h-2 rounded-full" style={{ background: "rgb(var(--brand-primary-rgb))" }} />
            Voces del vecindario
          </span>
          <h2
            className="font-serif font-semibold leading-[1.04] tracking-tight mt-2"
            style={{ fontSize: "clamp(31px,4.4vw,50px)", color: "var(--page-ink)" }}
          >
            No lo digo yo,{" "}
            <em className="not-italic" style={{ color: "rgb(var(--brand-dark-rgb))" }}>
              lo dicen ellos.
            </em>
          </h2>
        </motion.div>

        <div
          ref={trackRef}
          onScroll={handleScroll}
          className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-2 -mx-5 px-5"
          style={{ scrollbarWidth: "thin" }}
        >
          {testimonials.map((t) => (
            <TestimonialCard key={t.id} t={t} />
          ))}
        </div>

        {testimonials.length > 1 && (
          <div className="flex items-center justify-center gap-2 mt-6">
            {testimonials.map((t, i) => (
              <button
                key={t.id}
                onClick={() => scrollToIndex(i)}
                aria-label={`Ver testimonio de ${t.name}`}
                className="h-2 rounded-full transition-all duration-200"
                style={{
                  width: active === i ? "22px" : "8px",
                  background: active === i
                    ? "rgb(var(--brand-primary-rgb))"
                    : "color-mix(in srgb, rgb(var(--brand-primary-rgb)) 25%, transparent)",
                }}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
