"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { useCandidate } from "@/context/CandidateContext";
import { request, resolveTenantSlug } from "@/lib/api";
import {
  User, Phone, Mail, MapPin, CheckCircle2, Loader2,
  Star, Share2, Gift, AlertCircle,
} from "lucide-react";

type FormState = {
  name: string;
  phone_whatsapp: string;
  email: string;
  district: string;
  voting_intention: string;
  consent: boolean;
};

type ReferralInfo = { valid: boolean; referrer_name?: string; referral_count?: number };
type RegisterResult = { status: string; citizen_id: number; referral_code: string; points: number; share_url: string; message: string };

export default function RegistroPage() {
  const searchParams   = useSearchParams();
  const refCode        = searchParams.get("ref");
  const { profile }    = useCandidate();

  const [form, setForm] = useState<FormState>({
    name: "", phone_whatsapp: "", email: "",
    district: "", voting_intention: "", consent: false,
  });
  const [referralInfo, setReferralInfo] = useState<ReferralInfo | null>(null);
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState<RegisterResult | null>(null);
  const [error, setError]       = useState<string | null>(null);

  const candidateName = profile?.name && profile.name !== "Candidato" ? profile.name : "la campaña";
  const firstName     = candidateName !== "la campaña" ? candidateName.split(" ")[0] : "el candidato";

  // Cargar info del referidor
  useEffect(() => {
    if (!refCode) return;
    request<ReferralInfo>(`/citizen/referral/${refCode}`)
      .then(setReferralInfo)
      .catch(() => {});
  }, [refCode]);

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.consent) {
      setError("Debes aceptar los términos para continuar.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const visitorCookie = document.cookie.match(/politicos_visitor_id=([^;]+)/)?.[1];
      const body: Record<string, unknown> = {
        ...form,
        consent: true,
        source: refCode ? "referral" : "web_form",
        visitor_uuid: visitorCookie ?? null,
      };
      if (refCode) body.referred_by_code = refCode;

      const res = await request<RegisterResult>("/citizen/register", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setResult(res);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e.message ?? "Error al registrar. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  function shareReferral() {
    if (!result) return;
    const text = `Únete a la campaña de ${firstName} y participa en su plan de gobierno. ¡Ya soy parte del movimiento! ${result.share_url}`;
    if (navigator.share) {
      navigator.share({ title: `Apoya a ${firstName}`, text, url: result.share_url });
    } else {
      navigator.clipboard.writeText(result.share_url);
    }
  }

  // ── Pantalla de éxito ──
  if (result) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-sm text-center"
        >
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-green-100 mb-5">
            <CheckCircle2 size={32} className="text-green-600" />
          </div>
          <h1 className="font-serif text-2xl font-bold text-gray-900 mb-2">¡Registro exitoso!</h1>
          <p className="text-gray-500 text-sm mb-6">{result.message}</p>

          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm mb-5">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Tus puntos</p>
            <div className="flex items-center justify-center gap-2">
              <Star size={20} className="text-amber-500" />
              <span className="font-serif text-3xl font-bold text-gray-900">{result.points}</span>
              <span className="text-gray-500 text-sm">puntos</span>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 mb-5">
            <div className="flex items-center gap-2 mb-2">
              <Gift size={16} className="text-amber-600" />
              <p className="text-sm font-semibold text-amber-800">¡Invita y gana más puntos!</p>
            </div>
            <p className="text-xs text-amber-700 mb-3">
              Por cada persona que se registre con tu enlace, ganas <strong>100 puntos</strong>.
            </p>
            <button
              onClick={shareReferral}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-amber-500 hover:bg-amber-400
                         text-white font-semibold text-sm rounded-xl transition"
            >
              <Share2 size={15} />
              Compartir mi enlace
            </button>
          </div>

          <a
            href="/chat"
            className="text-sm text-brand-600 hover:text-brand-500 underline"
          >
            Volver al chat con {firstName} →
          </a>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        {/* Banner de referido */}
        {referralInfo?.valid && (
          <div className="bg-brand-50 border border-brand-200 rounded-2xl px-4 py-3 mb-4 flex items-center gap-3">
            <Gift size={18} className="text-brand-600 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-brand-900">
                {referralInfo.referrer_name} te invitó
              </p>
              <p className="text-xs text-brand-700">
                Al registrarte, ambos ganan puntos extra.
              </p>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="text-center mb-6">
          {profile?.photo_url && (
            <img
              src={profile.photo_url} alt={candidateName}
              className="h-14 w-14 rounded-2xl object-cover mx-auto mb-3 shadow ring-2 ring-brand-500/20"
            />
          )}
          <span className="eyebrow-red block mb-1">Campaña {candidateName}</span>
          <h1 className="font-serif text-2xl font-bold text-gray-900">Únete al movimiento</h1>
          <p className="text-sm text-gray-500 mt-1">
            Regístrate y sé parte del plan de gobierno de {firstName}.
            Gana puntos por participar.
          </p>
        </div>

        {/* Puntos por registrarse */}
        <div className="flex items-center justify-center gap-4 mb-6">
          {[
            { pts: 50,  label: "Por registrarte" },
            { pts: 5,   label: "Por cada conversación" },
            { pts: 100, label: "Por cada referido" },
          ].map(({ pts, label }) => (
            <div key={label} className="text-center">
              <div className="flex items-center justify-center gap-1 text-amber-600 font-bold text-sm">
                <Star size={13} />+{pts}
              </div>
              <p className="text-[10px] text-gray-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Formulario */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Nombre */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                Nombre completo *
              </label>
              <div className="relative">
                <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="Tu nombre"
                  required
                  className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
                />
              </div>
            </div>

            {/* WhatsApp */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                WhatsApp <span className="text-gray-400 normal-case font-normal">(recomendado)</span>
              </label>
              <div className="relative">
                <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={form.phone_whatsapp}
                  onChange={(e) => set("phone_whatsapp", e.target.value)}
                  placeholder="+51 987 654 321"
                  type="tel"
                  className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                Correo electrónico <span className="text-gray-400 normal-case font-normal">(opcional)</span>
              </label>
              <div className="relative">
                <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  placeholder="tu@correo.com"
                  type="email"
                  className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
                />
              </div>
            </div>

            {/* Distrito */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                Distrito
              </label>
              <div className="relative">
                <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={form.district}
                  onChange={(e) => set("district", e.target.value)}
                  placeholder="¿En qué distrito vives?"
                  className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
                />
              </div>
            </div>

            {/* Intención de voto */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                ¿Cómo describes tu apoyo?
              </label>
              <select
                value={form.voting_intention}
                onChange={(e) => set("voting_intention", e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:border-brand-500 bg-white"
              >
                <option value="">Prefiero no decir</option>
                <option value="alta">Lo apoyo totalmente</option>
                <option value="media">Lo apoyo con reservas</option>
                <option value="indeciso">Estoy evaluando</option>
                <option value="baja">Poco convencido</option>
                <option value="opositor">No lo apoyaría</option>
              </select>
            </div>

            {/* Consentimiento */}
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.consent}
                onChange={(e) => set("consent", e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded accent-brand-500 cursor-pointer"
                required
              />
              <span className="text-xs text-gray-500">
                Acepto que mis datos sean usados para información de campaña de {candidateName}.
                No se compartirán con terceros. Puedes solicitar eliminación en cualquier momento.
                (Ley N° 29733)
              </span>
            </label>

            {error && (
              <div className="flex items-start gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !form.name}
              className="w-full flex items-center justify-center gap-2 py-3 bg-brand-600 hover:bg-brand-500
                         disabled:opacity-60 text-white font-semibold text-sm rounded-xl transition shadow-sm"
            >
              {loading ? (
                <><Loader2 size={15} className="animate-spin" /> Registrando...</>
              ) : (
                <>Registrarme y ganar puntos →</>
              )}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
