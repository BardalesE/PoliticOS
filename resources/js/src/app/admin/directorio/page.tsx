"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Camera, CheckCircle2, ChevronDown, Link2, Loader2, MapPin, Plus, Upload, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { normalizeApiBase, tenantHeaders } from "@/lib/api";
import {
  directorioAdmin, ubigeoApi, prettyPlace,
  type AdminCandidato, type UbigeoItem,
} from "@/lib/directorio";
import { cn } from "@/lib/utils";
import { CandidatosTabla } from "@/components/admin/directorio/CandidatosTabla";

/**
 * Alta manual de candidatos del directorio público.
 * Flujo: 1) crear candidato (borrador)  2) subir su Hoja de Vida y Plan de
 * Gobierno (PDF, se procesan solos)  3) publicar → su distrito se enciende en la
 * home. Un lugar solo aparece cuando hay ≥1 documento procesado.
 */

const CARGOS = [
  "Candidato a Alcalde Distrital", "Candidato a Alcalde Provincial", "Candidato a Gobernador Regional",
  "Candidato a Vicegobernador Regional", "Candidato a Regidor Distrital", "Candidato a Regidor Provincial",
];

const inputCls =
  "w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 " +
  "focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-gray-50 disabled:text-gray-400";

const EMPTY = {
  name: "", title: "", party: "", list_number: "", photo_url: "", logo_url: "", tagline: "", bio: "",
  facebook_url: "", instagram_url: "", tiktok_url: "", completado: false,
};

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-gray-600">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-gray-400">{hint}</span>}
    </label>
  );
}

// ─── Foto: subir desde el dispositivo (o pegar un enlace) ─────────────

const API_BASE = normalizeApiBase(process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api");
const MAX_MB = 5;

function PhotoField({
  value, onChange, token, label = "Foto del candidato", noun = "foto", square = false,
}: {
  value: string; onChange: (url: string) => void; token: string | null;
  label?: string; noun?: string; square?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [showUrl, setShowUrl] = useState(false);
  const [drag, setDrag]       = useState(false);

  async function subir(file: File) {
    setError(null);
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { setError(`El archivo debe ser JPG, PNG o WEBP.`); return; }
    if (file.size > MAX_MB * 1024 * 1024) { setError(`El archivo pesa más de ${MAX_MB} MB.`); return; }
    if (!token) { setError("Tu sesión expiró. Vuelve a ingresar."); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch(`${API_BASE}/admin/directorio/foto`, {
        method: "POST",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}`, ...tenantHeaders() },
        body: fd,
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.errors?.file?.[0] ?? j?.message ?? "No se pudo subir la foto.");
      onChange(j.url as string);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo subir la foto.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      <span className="mb-1 block text-xs font-semibold text-gray-600">{label}</span>
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) subir(f); }}
        className={cn("flex items-center gap-3 rounded-xl border-2 border-dashed p-3 transition-colors",
          drag ? "border-brand-500 bg-brand-50" : "border-gray-200 bg-white")}
      >
        <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
          className={cn("relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden bg-gray-100 ring-1 ring-gray-200 hover:ring-brand-500",
            square ? "rounded-xl bg-white" : "rounded-full")}
          aria-label={value ? `Cambiar ${noun}` : `Subir ${noun}`}>
          {value
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={value} alt="" className={cn("h-full w-full", square ? "object-contain p-1" : "object-cover")} />
            : <Camera className="h-6 w-6 text-gray-400" aria-hidden />}
          {busy && <span className="absolute inset-0 flex items-center justify-center bg-white/70"><Loader2 className="h-5 w-5 animate-spin text-brand-600" /></span>}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">
              <Upload className="h-3.5 w-3.5" aria-hidden /> {value ? `Cambiar ${noun}` : `Subir ${noun}`}
            </button>
            {value && (
              <button type="button" onClick={() => onChange("")} disabled={busy}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50">
                <X className="h-3.5 w-3.5" aria-hidden /> Quitar
              </button>
            )}
          </div>
          <p className="mt-1 text-[11px] text-gray-400">JPG, PNG o WEBP, hasta {MAX_MB} MB. También puedes arrastrarla aquí.</p>
        </div>
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) subir(f); }} />
      </div>
      {error && <p className="mt-1 text-[11px] font-medium text-red-600">{error}</p>}
      <button type="button" onClick={() => setShowUrl((v) => !v)} className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-gray-500 hover:text-gray-700">
        <Link2 className="h-3 w-3" aria-hidden /> {showUrl ? "Ocultar enlace" : "O pegar un enlace"}
      </button>
      {showUrl && (
        <input type="url" className={cn(inputCls, "mt-1.5")} value={value} onChange={(e) => onChange(e.target.value)} placeholder="https://…" />
      )}
    </div>
  );
}

// ─── Página ────────────────────────────────────────────────────────────

export default function DirectorioAdminPage() {
  const { token } = useAuth();
  const [rows, setRows] = useState<AdminCandidato[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [editing, setEditing] = useState<AdminCandidato | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [deps, setDeps] = useState<UbigeoItem[]>([]);
  const [provs, setProvs] = useState<UbigeoItem[]>([]);
  const [dists, setDists] = useState<UbigeoItem[]>([]);
  const [depId, setDepId] = useState("");
  const [provId, setProvId] = useState("");
  const [distId, setDistId] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadFor, setUploadFor] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const data = await directorioAdmin.list(token);
      setRows(data);
      if (data.length === 0) setFormOpen(true); // primer uso: el formulario a la vista
    } catch {} finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { ubigeoApi.departamentos().then(setDeps).catch(() => {}); }, []);

  // Los PDF se procesan en segundo plano: refresca mientras haya alguno en curso.
  useEffect(() => {
    if (!rows.some((r) => r.documentos_procesando > 0)) return;
    const t = setTimeout(load, 3000);
    return () => clearTimeout(t);
  }, [rows, load]);

  async function pickDep(id: string, keepProv = "", keepDist = "") {
    setDepId(id); setProvId(keepProv); setDistId(keepDist); setDists([]);
    setProvs(id ? await ubigeoApi.provincias(Number(id)).catch(() => []) : []);
  }
  async function pickProv(id: string, keepDist = "") {
    setProvId(id); setDistId(keepDist);
    setDists(id ? await ubigeoApi.distritos(Number(id)).catch(() => []) : []);
  }

  function reset() {
    setFormOpen(false);
    setEditing(null); setForm(EMPTY); setDepId(""); setProvId(""); setDistId(""); setProvs([]); setDists([]);
  }

  async function startEdit(c: AdminCandidato) {
    setEditing(c);
    setForm({
      name: c.name, title: c.title, party: c.party, list_number: c.list_number ?? "", photo_url: c.photo_url ?? "", logo_url: c.logo_url ?? "",
      tagline: c.tagline ?? "", bio: c.bio ?? "", facebook_url: c.facebook_url ?? "",
      instagram_url: c.instagram_url ?? "", tiktok_url: c.tiktok_url ?? "",
      completado: c.tipo_cuenta === "cliente_pago",
    });
    if (c.departamento_id) {
      setDepId(String(c.departamento_id));
      setProvs(await ubigeoApi.provincias(c.departamento_id).catch(() => []));
    }
    if (c.provincia_id) {
      setProvId(String(c.provincia_id));
      setDists(await ubigeoApi.distritos(c.provincia_id).catch(() => []));
    }
    setDistId(c.distrito_id ? String(c.distrito_id) : "");
    setFormOpen(true);
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !distId) return;
    setSaving(true); setMsg(null);
    const nullIfEmpty = (v: string) => (v.trim() === "" ? null : v.trim());
    // "facebook.com/juan" o "@juan" en TikTok/Instagram → URL completa; el API exige URL válida.
    const redUrl = (v: string, base: string) => {
      const t = v.trim();
      if (!t) return null;
      if (/^https?:\/\//i.test(t)) return t;
      if (t.startsWith("@")) return `${base}${base.includes("tiktok") ? t : t.slice(1)}`;
      return `https://${t.replace(/^\/+/, "")}`;
    };
    const payload = {
      name: form.name.trim(), title: form.title.trim(), party: form.party.trim(), distrito_id: Number(distId),
      list_number: nullIfEmpty(form.list_number), photo_url: nullIfEmpty(form.photo_url), logo_url: nullIfEmpty(form.logo_url),
      tagline: nullIfEmpty(form.tagline), bio: nullIfEmpty(form.bio),
      facebook_url: redUrl(form.facebook_url, "https://www.facebook.com/"),
      instagram_url: redUrl(form.instagram_url, "https://www.instagram.com/"),
      tiktok_url: redUrl(form.tiktok_url, "https://www.tiktok.com/"),
      tipo_cuenta: (form.completado ? "cliente_pago" : "publico_gratuito") as "cliente_pago" | "publico_gratuito",
    };
    try {
      if (editing) {
        await directorioAdmin.update(token, editing.id, payload);
        setMsg({ ok: true, text: "Cambios guardados." });
      } else {
        const created = await directorioAdmin.create(token, payload);
        setUploadFor(created.id);
        setMsg({ ok: true, text: `Candidato creado como borrador. Ahora sube su Hoja de Vida y su Plan de Gobierno.` });
      }
      reset();
      await load();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "No se pudo guardar." });
    } finally {
      setSaving(false);
    }
  }

  async function act(fn: () => Promise<unknown>, okText?: string) {
    setMsg(null);
    try { await fn(); if (okText) setMsg({ ok: true, text: okText }); await load(); }
    catch (err) { setMsg({ ok: false, text: err instanceof Error ? err.message : "La acción falló." }); }
  }

  const set = (k: Exclude<keyof typeof EMPTY, "completado">) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <div className="mb-6">
        <div className="mb-1 flex items-center gap-3">
          <MapPin size={20} className="text-brand-500" />
          <h1 className="font-serif text-xl font-bold text-gray-900">Directorio público</h1>
        </div>
        <p className="text-sm text-gray-500">
          Carga candidatos uno por uno. Un distrito aparece en la página principal solo cuando tiene un candidato publicado con al menos un documento procesado.
        </p>
      </div>

      {msg && (
        <div className={cn("mb-4 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm", msg.ok ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-700")} role="status">
          {msg.ok ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <AlertCircle size={16} className="mt-0.5 shrink-0" />}
          <span className="flex-1">{msg.text}</span>
          <button type="button" onClick={() => setMsg(null)} aria-label="Cerrar"><X size={14} /></button>
        </div>
      )}

      <div className="space-y-6">
        {/* Formulario (plegable: la tabla es la vista principal) */}
        {!formOpen ? (
          <button
            type="button" onClick={() => setFormOpen(true)}
            className="flex w-full items-center justify-between gap-3 rounded-2xl border border-dashed border-gray-300 bg-white px-5 py-4 text-left hover:border-brand-500 hover:bg-brand-500/5"
          >
            <span className="inline-flex items-center gap-2 text-sm font-bold text-gray-900"><Plus size={16} className="text-brand-500" /> Nuevo candidato</span>
            <ChevronDown size={16} className="text-gray-400" aria-hidden />
          </button>
        ) : (
        <form ref={formRef} onSubmit={save} className="grid scroll-mt-4 grid-cols-1 gap-3 rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 md:grid-cols-2 md:gap-x-5">
          <div className="flex items-center justify-between gap-3 md:col-span-2">
            <p className="min-w-0 truncate text-xs font-bold uppercase tracking-widest text-gray-500">{editing ? `Editando: ${editing.name}` : "Nuevo candidato"}</p>
            <button type="button" onClick={reset} className="shrink-0 text-xs font-semibold text-gray-500 hover:text-gray-800">{editing ? "Cancelar" : "Cerrar"}</button>
          </div>

          <Field label="Nombre completo *"><input required className={inputCls} value={form.name} onChange={set("name")} maxLength={150} /></Field>
          <Field label="Cargo al que postula *">
            <input required list="cargos" className={inputCls} value={form.title} onChange={set("title")} maxLength={200} placeholder="Candidato a Alcalde Distrital" />
            <datalist id="cargos">{CARGOS.map((c) => <option key={c} value={c} />)}</datalist>
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2"><Field label="Partido / movimiento *"><input required className={inputCls} value={form.party} onChange={set("party")} maxLength={100} /></Field></div>
            <Field label="N.º lista"><input className={inputCls} value={form.list_number} onChange={set("list_number")} maxLength={10} /></Field>
          </div>

          <fieldset className="grid gap-3 rounded-xl bg-gray-50 p-3 sm:grid-cols-3 md:col-span-2">
            <legend className="px-1 text-xs font-semibold text-gray-600">Ubicación *</legend>
            <select required className={inputCls} value={depId} onChange={(e) => pickDep(e.target.value)} aria-label="Departamento">
              <option value="">Departamento…</option>
              {deps.map((d) => <option key={d.id} value={d.id}>{prettyPlace(d.nombre)}</option>)}
            </select>
            <select required className={inputCls} value={provId} disabled={!depId} onChange={(e) => pickProv(e.target.value)} aria-label="Provincia">
              <option value="">Provincia…</option>
              {provs.map((p) => <option key={p.id} value={p.id}>{prettyPlace(p.nombre)}</option>)}
            </select>
            <select required className={inputCls} value={distId} disabled={!provId} onChange={(e) => setDistId(e.target.value)} aria-label="Distrito">
              <option value="">Distrito…</option>
              {dists.map((d) => <option key={d.id} value={d.id}>{prettyPlace(d.nombre)}</option>)}
            </select>
          </fieldset>

          <PhotoField value={form.photo_url} onChange={(url) => setForm((f) => ({ ...f, photo_url: url }))} token={token} />
          <PhotoField
            label="Símbolo del partido" noun="símbolo" square
            value={form.logo_url} onChange={(url) => setForm((f) => ({ ...f, logo_url: url }))} token={token}
          />
          <Field label="Lema (opcional)"><input className={inputCls} value={form.tagline} onChange={set("tagline")} maxLength={300} /></Field>
          <div className="md:col-span-2"><Field label="Biografía breve (opcional)"><textarea rows={3} className={inputCls} value={form.bio} onChange={set("bio")} maxLength={5000} /></Field></div>
          <details className="rounded-xl bg-gray-50 p-3 md:col-span-2">
            <summary className="cursor-pointer text-xs font-semibold text-gray-600">Redes sociales (opcional)</summary>
            <div className="mt-3 space-y-3">
              <Field label="Facebook"><input type="text" inputMode="url" className={inputCls} value={form.facebook_url} onChange={set("facebook_url")} placeholder="facebook.com/tu-pagina" /></Field>
              <Field label="Instagram"><input type="text" inputMode="url" className={inputCls} value={form.instagram_url} onChange={set("instagram_url")} placeholder="@usuario o instagram.com/usuario" /></Field>
              <Field label="TikTok"><input type="text" inputMode="url" className={inputCls} value={form.tiktok_url} onChange={set("tiktok_url")} placeholder="@usuario o tiktok.com/@usuario" /></Field>
            </div>
          </details>

          <label className="flex items-start gap-3 rounded-xl border border-brand-500/30 bg-brand-500/5 p-3 md:col-span-2">
            <input
              type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-500"
              checked={form.completado}
              onChange={(e) => setForm((f) => ({ ...f, completado: e.target.checked }))}
            />
            <span className="text-xs text-gray-700">
              <span className="block font-semibold">Perfil completado por el candidato</span>
              Muestra el sello ✓ en su ficha pública. Márcalo solo cuando el candidato aportó su información
              (foto, biografía, documentos de campaña). No cambia el orden ni cómo responde la IA.
            </span>
          </label>

          <button type="submit" disabled={saving || !distId} className="inline-flex w-full items-center md:col-span-2 justify-center gap-2 rounded-xl bg-brand-500 px-4 py-3 text-sm font-bold text-white disabled:opacity-40">
            {saving && <Loader2 size={15} className="animate-spin" />}
            {editing ? "Guardar cambios" : "Crear candidato (borrador)"}
          </button>
        </form>
        )}

        {/* Tabla agrupada por Departamento › Provincia › Distrito */}
        <CandidatosTabla
          rows={rows} loading={loading} token={token}
          onEdit={startEdit} onChanged={load} act={act}
          openId={uploadFor} setOpenId={setUploadFor}
        />
      </div>
    </div>
  );
}
