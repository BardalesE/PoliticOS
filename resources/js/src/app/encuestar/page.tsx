"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { surveysApi, type SurveySyncPayload } from "@/lib/api";
import {
  uuid, saveJourney, getJourneys, saveResponse, getPendingResponses,
  markSynced, countByJourney,
  type LocalJourney, type LocalResponse, type VoteIntention,
} from "@/lib/surveysDB";
import {
  Check, X, HelpCircle, Wifi, WifiOff, RefreshCw, MapPin,
  CloudUpload, BarChart3, Loader2, ShieldCheck, ChevronLeft,
} from "lucide-react";

const INTENTIONS: { value: VoteIntention; label: string; color: string; icon: typeof Check }[] = [
  { value: "si",       label: "Sí apoya",  color: "#16A34A", icon: Check },
  { value: "no",       label: "No apoya",  color: "#DC2626", icon: X },
  { value: "indeciso", label: "Indeciso",  color: "#94A3B8", icon: HelpCircle },
];

export default function SurveyCapturePage() {
  const { token } = useAuth();

  const [online, setOnline]       = useState(true);
  const [journeys, setJourneys]   = useState<LocalJourney[]>([]);
  const [activeJourney, setActiveJourney] = useState<string | null>(null);
  const [journeyCount, setJourneyCount]   = useState(0);
  const [pendingCount, setPendingCount]   = useState(0);
  const [syncing, setSyncing]     = useState(false);
  const [syncMsg, setSyncMsg]     = useState<string | null>(null);
  const [showNewJourney, setShowNewJourney] = useState(false);

  // ─── Formulario de captura ──────────────────────────────────────────
  const [intention, setIntention]     = useState<VoteIntention | null>(null);
  const [knewProposal, setKnewProposal] = useState<boolean | null>(null);
  const [consent, setConsent]         = useState(false);
  const [name, setName]   = useState("");
  const [phone, setPhone] = useState("");
  const [dni, setDni]     = useState("");
  const [age, setAge]     = useState("");
  const [sex, setSex]     = useState<"" | "M" | "F" | "otro">("");
  const [justSaved, setJustSaved] = useState(false);

  // ─── Nueva jornada ──────────────────────────────────────────────────
  const [place, setPlace]       = useState("");
  const [district, setDistrict] = useState("");
  const [province, setProvince] = useState("");
  const [date, setDate]         = useState(new Date().toISOString().slice(0, 10));

  const refreshCounters = useCallback(async (journeyUuid: string | null) => {
    setPendingCount((await getPendingResponses()).length);
    if (journeyUuid) setJourneyCount(await countByJourney(journeyUuid));
  }, []);

  const loadJourneys = useCallback(async () => {
    const js = await getJourneys();
    setJourneys(js);
    if (!activeJourney && js.length) setActiveJourney(js[0].client_uuid);
  }, [activeJourney]);

  useEffect(() => {
    loadJourneys();
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, [loadJourneys]);

  useEffect(() => { refreshCounters(activeJourney); }, [activeJourney, refreshCounters]);

  async function createJourney(e: React.FormEvent) {
    e.preventDefault();
    if (!place.trim()) return;
    const j: LocalJourney = {
      client_uuid: uuid(),
      place: place.trim(),
      district: district.trim() || null,
      province: province.trim() || null,
      surveyed_on: date,
    };
    await saveJourney(j);
    setActiveJourney(j.client_uuid);
    setShowNewJourney(false);
    setPlace(""); setDistrict(""); setProvince("");
    await loadJourneys();
  }

  function resetForm() {
    setIntention(null);
    setKnewProposal(null);
    setConsent(false);
    setName(""); setPhone(""); setDni(""); setAge(""); setSex("");
  }

  async function saveCapture() {
    if (!activeJourney || !intention) return;
    const r: LocalResponse = {
      client_uuid: uuid(),
      journey_uuid: activeJourney,
      vote_intention: intention,
      knew_proposal: knewProposal,
      consent,
      name:  consent ? (name.trim()  || null) : null,
      phone: consent ? (phone.trim() || null) : null,
      dni:   consent ? (dni.trim()   || null) : null,
      age:   consent && age ? Number(age) : null,
      sex:   consent ? (sex || null) : null,
      captured_at: new Date().toISOString(),
      synced: 0,
    };
    await saveResponse(r);
    resetForm();
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 1200);
    await refreshCounters(activeJourney);
  }

  async function syncNow() {
    if (!token) { setSyncMsg("Inicia sesión para sincronizar."); return; }
    setSyncing(true);
    setSyncMsg(null);
    try {
      const pending = await getPendingResponses();
      if (!pending.length) { setSyncMsg("No hay respuestas pendientes."); setSyncing(false); return; }

      const allJourneys = await getJourneys();
      const byJourney = new Map<string, LocalResponse[]>();
      for (const r of pending) {
        if (!byJourney.has(r.journey_uuid)) byJourney.set(r.journey_uuid, []);
        byJourney.get(r.journey_uuid)!.push(r);
      }

      let created = 0, duplicated = 0;
      for (const [juuid, responses] of byJourney) {
        const j = allJourneys.find((x) => x.client_uuid === juuid);
        if (!j) continue;
        const payload: SurveySyncPayload = {
          journey: {
            client_uuid: j.client_uuid,
            place: j.place,
            district: j.district,
            province: j.province,
            surveyed_on: j.surveyed_on,
          },
          responses: responses.map((r) => ({
            client_uuid: r.client_uuid,
            vote_intention: r.vote_intention,
            knew_proposal: r.knew_proposal,
            consent: r.consent,
            name: r.name, phone: r.phone, dni: r.dni, age: r.age, sex: r.sex,
            captured_at: r.captured_at,
          })),
        };
        const res = await surveysApi.sync(token, payload);
        created += res.created;
        duplicated += res.duplicated;
        await markSynced(responses.map((r) => r.client_uuid));
      }

      setSyncMsg(`Sincronizado: ${created} nuevas${duplicated ? `, ${duplicated} ya existían (sin duplicar)` : ""}.`);
      await refreshCounters(activeJourney);
    } catch {
      setSyncMsg("No se pudo sincronizar. Tus respuestas siguen guardadas; reintenta con internet.");
    } finally {
      setSyncing(false);
    }
  }

  const current = journeys.find((j) => j.client_uuid === activeJourney);

  return (
    <div className="min-h-screen bg-zinc-50 max-w-md mx-auto p-4 space-y-4">

      {/* Header + estado de conexión */}
      <div className="flex items-center justify-between">
        <Link href="/admin/surveys" className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900">
          <ChevronLeft size={16} /> Dashboard
        </Link>
        <span className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${
          online ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
        }`}>
          {online ? <Wifi size={13} /> : <WifiOff size={13} />}
          {online ? "En línea" : "Sin conexión"}
        </span>
      </div>

      <div>
        <h1 className="font-serif text-2xl font-bold text-gray-900">Encuesta en campo</h1>
        <p className="text-xs text-gray-500 mt-0.5">Funciona sin internet. Guarda y sincroniza después.</p>
      </div>

      {/* Selector de jornada */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
            <MapPin size={13} /> Jornada
          </p>
          <button onClick={() => setShowNewJourney((v) => !v)} className="text-xs font-semibold text-brand-600 hover:text-brand-500">
            {showNewJourney ? "Cancelar" : "+ Nueva jornada"}
          </button>
        </div>

        {showNewJourney ? (
          <form onSubmit={createJourney} className="space-y-2">
            <input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Lugar (ej: San Gregorio)" required
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-brand-500" />
            <div className="grid grid-cols-2 gap-2">
              <input value={district} onChange={(e) => setDistrict(e.target.value)} placeholder="Distrito"
                className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-brand-500" />
              <input value={province} onChange={(e) => setProvince(e.target.value)} placeholder="Provincia"
                className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-brand-500" />
            </div>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-brand-500" />
            <button type="submit" className="w-full py-2 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-700 transition">
              Crear jornada
            </button>
          </form>
        ) : journeys.length === 0 ? (
          <p className="text-sm text-gray-400 py-2">Crea una jornada para empezar a encuestar.</p>
        ) : (
          <select value={activeJourney ?? ""} onChange={(e) => setActiveJourney(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-brand-500">
            {journeys.map((j) => (
              <option key={j.client_uuid} value={j.client_uuid}>
                {j.place}{j.district ? ` · ${j.district}` : ""} — {j.surveyed_on.split("-").reverse().join("/")}
              </option>
            ))}
          </select>
        )}

        {current && (
          <p className="text-xs text-gray-400">{journeyCount} encuestas en esta jornada</p>
        )}
      </div>

      {/* Formulario de captura */}
      {current && (
        <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm space-y-4">
          {/* Intención de voto — obligatorio */}
          <div>
            <p className="text-sm font-semibold text-gray-900 mb-2">Intención de voto <span className="text-red-500">*</span></p>
            <div className="grid grid-cols-3 gap-2">
              {INTENTIONS.map(({ value, label, color, icon: Icon }) => {
                const active = intention === value;
                return (
                  <button key={value} onClick={() => setIntention(value)}
                    className={`flex flex-col items-center gap-1 py-3 rounded-xl border-2 transition ${
                      active ? "border-transparent text-white" : "border-gray-200 text-gray-600 hover:border-gray-300"
                    }`}
                    style={active ? { backgroundColor: color } : undefined}>
                    <Icon size={20} />
                    <span className="text-xs font-semibold">{label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ¿Conocía la propuesta? — opcional */}
          <div>
            <p className="text-sm font-semibold text-gray-900 mb-2">¿Conocía la propuesta? <span className="text-xs font-normal text-gray-400">(opcional)</span></p>
            <div className="grid grid-cols-3 gap-2">
              {[{ v: true, l: "Sí" }, { v: false, l: "No" }, { v: null, l: "N/A" }].map(({ v, l }) => {
                const active = knewProposal === v;
                return (
                  <button key={String(l)} onClick={() => setKnewProposal(v)}
                    className={`py-2 rounded-xl border-2 text-xs font-semibold transition ${
                      active ? "border-brand-500 bg-brand-50 text-brand-700" : "border-gray-200 text-gray-600 hover:border-gray-300"
                    }`}>
                    {l}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Consentimiento (Ley 29733) */}
          <div className="border-t border-gray-100 pt-3">
            <label className="flex items-start gap-2 cursor-pointer">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
              <span className="text-xs text-gray-600 flex items-start gap-1">
                <ShieldCheck size={14} className="text-emerald-600 shrink-0 mt-0.5" />
                La persona autoriza registrar sus datos personales (Ley 29733). Sin autorización, solo se guarda su intención de voto.
              </span>
            </label>

            {consent && (
              <div className="mt-3 space-y-2">
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-brand-500" />
                <div className="grid grid-cols-2 gap-2">
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Celular" inputMode="tel"
                    className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-brand-500" />
                  <input value={dni} onChange={(e) => setDni(e.target.value)} placeholder="DNI" inputMode="numeric"
                    className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-brand-500" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input value={age} onChange={(e) => setAge(e.target.value)} placeholder="Edad" inputMode="numeric"
                    className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-brand-500" />
                  <select value={sex} onChange={(e) => setSex(e.target.value as typeof sex)}
                    className="px-3 py-2 border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:border-brand-500">
                    <option value="">Sexo</option>
                    <option value="M">Masculino</option>
                    <option value="F">Femenino</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Guardar */}
          <button onClick={saveCapture} disabled={!intention}
            className={`w-full py-3 rounded-xl text-sm font-bold transition ${
              justSaved ? "bg-emerald-600 text-white"
              : intention ? "bg-brand-600 hover:bg-brand-500 text-white"
              : "bg-gray-200 text-gray-400 cursor-not-allowed"
            }`}>
            {justSaved ? "✓ Guardado" : "Guardar respuesta"}
          </button>
        </div>
      )}

      {/* Barra de sincronización */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm space-y-3 sticky bottom-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CloudUpload size={18} className={pendingCount ? "text-amber-500" : "text-emerald-500"} />
            <span className="text-sm font-semibold text-gray-900">
              {pendingCount} pendiente{pendingCount === 1 ? "" : "s"} de sincronizar
            </span>
          </div>
          <Link href="/admin/surveys" className="text-gray-400 hover:text-gray-700"><BarChart3 size={18} /></Link>
        </div>
        <button onClick={syncNow} disabled={syncing || !pendingCount}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-gray-900 hover:bg-gray-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition">
          {syncing ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
          Sincronizar ahora
        </button>
        {syncMsg && <p className="text-xs text-center text-gray-500">{syncMsg}</p>}
      </div>
    </div>
  );
}
