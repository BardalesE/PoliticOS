"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  UserCircle, BookOpen, MessageSquare, CheckCircle, Loader2,
  AlertCircle, RefreshCw, ArrowRight, ArrowLeft, Rocket, ExternalLink,
} from "lucide-react";
import { adminApi, adminApiExtended, type OnboardingStatus, type CandidateProfile, type CandidatePreset } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { FormField } from "@/components/admin/FormField";
import { KnowledgeUploadPanel } from "@/components/admin/KnowledgeUploadPanel";
import { cn } from "@/lib/utils";

// El provisioning siembra estos placeholders; en el form se muestran vacíos
// para que el admin escriba el valor real.
const PLACEHOLDER = "Por definir";

type Step = 1 | 2 | 3;

const STEPS: { step: Step; label: string; icon: React.ElementType }[] = [
  { step: 1, label: "Perfil del candidato", icon: UserCircle },
  { step: 2, label: "Documentos",           icon: BookOpen },
  { step: 3, label: "Probar el chat",       icon: MessageSquare },
];

type ProfileForm = {
  name: string;
  title: string;
  party: string;
  location: string;
  list_number: string;
  tagline: string;
  election_date: string;
  photo_url: string;
  bio: string;
};

const emptyForm: ProfileForm = {
  name: "", title: "", party: "", location: "", list_number: "",
  tagline: "", election_date: "", photo_url: "", bio: "",
};

function cleanPlaceholder(value: string | null | undefined): string {
  const v = (value ?? "").trim();
  return v === PLACEHOLDER ? "" : v;
}

export default function OnboardingPage() {
  const { token } = useAuth();
  const [step, setStep]       = useState<Step>(1);
  const [status, setStatus]   = useState<OnboardingStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const [form, setForm]       = useState<ProfileForm>(emptyForm);
  const [candidates, setCandidates] = useState<CandidatePreset[]>([]);
  const [saving, setSaving]   = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);

  const refreshStatus = useCallback(async () => {
    if (!token) return null;
    try {
      const s = await adminApi.onboarding.status(token);
      setStatus(s);
      return s;
    } catch { return null; }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    (async () => {
      setLoading(true);
      try {
        const [s, profile, presets] = await Promise.all([
          adminApi.onboarding.status(token),
          adminApiExtended.candidateProfile.get(token),
          adminApiExtended.candidatePresets.list(token),
        ]);
        setStatus(s);
        setCandidates(presets);
        setForm({
          name:          cleanPlaceholder(profile?.name),
          title:         cleanPlaceholder(profile?.title),
          party:         cleanPlaceholder(profile?.party),
          location:      cleanPlaceholder(profile?.location),
          list_number:   cleanPlaceholder(profile?.list_number),
          tagline:       cleanPlaceholder(profile?.tagline),
          election_date: cleanPlaceholder(profile?.election_date),
          photo_url:     cleanPlaceholder(profile?.photo_url),
          // La bio sembrada por el provisioning ("Editar desde el panel...")
          // también cuenta como vacía.
          bio: (profile?.bio ?? "").includes("Editar desde el panel de administración")
            ? "" : (profile?.bio ?? "").trim(),
        });
        // Retomar donde quedó: perfil listo → paso 2; con docs → paso 3
        if (s.profile.complete) setStep(s.knowledge.total > 0 ? 3 : 2);
      } catch {}
      finally { setLoading(false); }
    })();
  }, [token]);

  function set<K extends keyof ProfileForm>(k: K, v: ProfileForm[K]) {
    setForm(prev => ({ ...prev, [k]: v }));
  }

  const profileValid =
    form.name.trim() && form.title.trim() && form.party.trim() &&
    form.location.trim() && form.bio.trim();

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !profileValid) return;
    setSaving(true);
    setSaveError(null);
    try {
      const payload: Partial<CandidateProfile> = {
        name:     form.name.trim(),
        title:    form.title.trim(),
        party:    form.party.trim(),
        location: form.location.trim(),
        bio:      form.bio.trim(),
      };
      if (form.list_number.trim())   payload.list_number   = form.list_number.trim();
      if (form.tagline.trim())       payload.tagline       = form.tagline.trim();
      if (form.election_date.trim()) payload.election_date = form.election_date.trim();
      if (form.photo_url.trim())     payload.photo_url     = form.photo_url.trim();

      await adminApiExtended.candidateProfile.update(token, payload);
      await refreshStatus();
      setStep(2);
    } catch (err: any) {
      setSaveError(err?.message ?? "No se pudo guardar el perfil.");
    } finally {
      setSaving(false);
    }
  }

  async function handleFinish() {
    if (!token) return;
    setFinishing(true);
    try {
      await adminApi.onboarding.complete(token);
      await refreshStatus();
    } catch {}
    finally { setFinishing(false); }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 size={24} className="animate-spin text-brand-400" />
      </div>
    );
  }

  const done = !!status?.completed_at;

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <Rocket size={20} className="text-brand-500" />
          <h1 className="font-serif text-xl font-bold text-gray-900">Configura tu campaña</h1>
        </div>
        <p className="text-sm text-gray-400">
          Tres pasos para dejar el asistente listo: completa el perfil, sube documentos y prueba el chat.
        </p>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-2 mb-8">
        {STEPS.map(({ step: s, label, icon: Icon }, i) => {
          const isActive = step === s;
          const isDone =
            (s === 1 && !!status?.profile.complete) ||
            (s === 2 && (status?.knowledge.total ?? 0) > 0) ||
            (s === 3 && done);
          return (
            <div key={s} className="flex items-center gap-2 flex-1 min-w-0">
              {i > 0 && <div className={cn("h-px flex-1", isDone || isActive ? "bg-brand-300" : "bg-gray-200")} />}
              <button
                onClick={() => setStep(s)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-colors shrink-0",
                  isActive ? "bg-brand-500 text-white shadow-sm"
                    : isDone ? "bg-green-50 text-green-700 border border-green-200 hover:bg-green-100"
                    : "bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100"
                )}
              >
                {isDone && !isActive ? <CheckCircle size={13} /> : <Icon size={13} />}
                <span className="hidden sm:inline">{label}</span>
                <span className="sm:hidden">{s}</span>
              </button>
            </div>
          );
        })}
      </div>

      {/* ── Paso 1: Perfil ── */}
      {step === 1 && (
        <form onSubmit={handleSaveProfile} className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Paso 1 · Perfil del candidato</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Nombre completo" required value={form.name}
              onChange={(e) => set("name", e.target.value)} placeholder="María García López" />
            <FormField label="Cargo al que postula" required value={form.title}
              onChange={(e) => set("title", e.target.value)} placeholder="Candidata a la Alcaldía de Lima" />
            <FormField label="Partido o movimiento" required value={form.party}
              onChange={(e) => set("party", e.target.value)} placeholder="Partido Renovación" />
            <FormField label="Ubicación" required value={form.location}
              onChange={(e) => set("location", e.target.value)} placeholder="Lima, Perú" />
            <FormField label="Número de lista" value={form.list_number}
              onChange={(e) => set("list_number", e.target.value)} placeholder="3" />
            <FormField label="Fecha de elección" value={form.election_date}
              onChange={(e) => set("election_date", e.target.value)} placeholder="4 de octubre de 2026" />
          </div>
          <FormField label="Lema de campaña" value={form.tagline}
            onChange={(e) => set("tagline", e.target.value)} placeholder="Por el bien de todos" />
          <FormField label="URL de foto del candidato" value={form.photo_url}
            onChange={(e) => set("photo_url", e.target.value)} placeholder="https://..." />
          <FormField as="textarea" label="Biografía" required rows={5} value={form.bio}
            onChange={(e) => set("bio", e.target.value)}
            placeholder="Trayectoria, experiencia y por qué postula. El asistente la usa para presentar al candidato." />

          {saveError && (
            <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
              <AlertCircle size={14} /> {saveError}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <button type="submit" disabled={!profileValid || saving}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold transition-colors disabled:opacity-40 shadow-sm">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
              Guardar y continuar
            </button>
          </div>
        </form>
      )}

      {/* ── Paso 2: Documentos ── */}
      {step === 2 && (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-5">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Paso 2 · Base de conocimiento</p>
          <p className="text-sm text-gray-600 leading-relaxed">
            Sube el plan de gobierno, propuestas o entrevistas en PDF. El asistente responde citando estos
            documentos: sin ellos solo conoce el perfil del candidato.
          </p>

          <div className="flex items-center gap-4">
            <div className="flex-1 rounded-2xl border border-gray-200 bg-gray-50 px-5 py-4">
              <p className="text-2xl font-bold text-gray-900">{status?.knowledge.total ?? 0}</p>
              <p className="text-xs text-gray-400">documentos subidos</p>
            </div>
            <div className="flex-1 rounded-2xl border border-gray-200 bg-gray-50 px-5 py-4">
              <p className="text-2xl font-bold text-gray-900">{status?.knowledge.indexed ?? 0}</p>
              <p className="text-xs text-gray-400">indexados para búsqueda</p>
            </div>
            <button onClick={refreshStatus}
              className="p-2.5 rounded-xl text-gray-400 hover:text-brand-500 hover:bg-brand-50 border border-gray-200 transition-colors"
              title="Actualizar conteo">
              <RefreshCw size={15} />
            </button>
          </div>

          <KnowledgeUploadPanel
            candidates={candidates}
            onUploaded={() => refreshStatus()}
          />

          <Link href="/admin/knowledge"
            className="flex items-center justify-center gap-1.5 text-xs text-gray-400 hover:text-brand-500 transition-colors">
            Ver y gestionar todos los documentos en la base de conocimiento
            <ExternalLink size={11} />
          </Link>

          <div className="flex justify-between pt-2">
            <button onClick={() => setStep(1)}
              className="flex items-center gap-2 px-5 py-3 rounded-xl text-gray-500 hover:bg-gray-50 text-sm font-semibold transition-colors">
              <ArrowLeft size={14} /> Volver
            </button>
            <button onClick={() => setStep(3)} disabled={(status?.knowledge.total ?? 0) === 0}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold transition-colors disabled:opacity-40 shadow-sm">
              Continuar <ArrowRight size={14} />
            </button>
          </div>
          {(status?.knowledge.total ?? 0) === 0 && (
            <p className="text-xs text-gray-400 text-right">Sube al menos un documento para continuar.</p>
          )}
        </div>
      )}

      {/* ── Paso 3: Probar el chat ── */}
      {step === 3 && (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-5">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Paso 3 · Probar el chat</p>

          <ul className="space-y-2">
            <li className="flex items-center gap-2 text-sm">
              {status?.profile.complete
                ? <CheckCircle size={15} className="text-green-500" />
                : <AlertCircle size={15} className="text-amber-500" />}
              <span className={status?.profile.complete ? "text-gray-700" : "text-amber-700"}>
                Perfil del candidato {status?.profile.complete ? "completo" : `incompleto (falta: ${status?.profile.missing.join(", ")})`}
              </span>
            </li>
            <li className="flex items-center gap-2 text-sm">
              {(status?.knowledge.total ?? 0) > 0
                ? <CheckCircle size={15} className="text-green-500" />
                : <AlertCircle size={15} className="text-amber-500" />}
              <span className="text-gray-700">
                {status?.knowledge.total ?? 0} documento(s), {status?.knowledge.indexed ?? 0} indexado(s)
              </span>
            </li>
          </ul>

          <p className="text-sm text-gray-600 leading-relaxed">
            Abre el chat y hazle 2-3 preguntas sobre las propuestas. Verifica que responda usando los
            documentos subidos y que cite las fuentes.
          </p>

          <a href="/chat" target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl border-2 border-dashed border-brand-300 text-brand-600 hover:bg-brand-50 text-sm font-semibold transition-colors">
            <MessageSquare size={15} />
            Abrir el chat en una pestaña nueva
            <ExternalLink size={13} />
          </a>

          {done ? (
            <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-100 rounded-xl px-4 py-3">
              <CheckCircle size={14} /> Onboarding completado. Puedes seguir gestionando todo desde el panel.
            </div>
          ) : (
            <div className="flex justify-between pt-2">
              <button onClick={() => setStep(2)}
                className="flex items-center gap-2 px-5 py-3 rounded-xl text-gray-500 hover:bg-gray-50 text-sm font-semibold transition-colors">
                <ArrowLeft size={14} /> Volver
              </button>
              <button onClick={handleFinish} disabled={finishing || !status?.profile.complete}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-semibold transition-colors disabled:opacity-40 shadow-sm">
                {finishing ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                Finalizar onboarding
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
