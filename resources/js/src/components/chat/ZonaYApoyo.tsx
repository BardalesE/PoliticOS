"use client";
import { useMemo, useState } from "react";
import { MapPin, ThumbsDown, ThumbsUp } from "lucide-react";
import { prettyPlace, type Ubicaciones } from "@/lib/directorio";
import type { ZonaInfo, ZonaSeleccion } from "@/lib/segmentacion";

const selectCls =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400";

/**
 * Elegir zona (departamento → provincia → distrito). Solo ofrece lugares que ya
 * tienen candidatos publicados: la regla la aplica el API (/directorio/ubicaciones).
 */
export function ZonePicker({
  ubicaciones, busy, onPick, onCancel,
}: {
  ubicaciones: Ubicaciones;
  busy: boolean;
  onPick: (sel: ZonaSeleccion) => void;
  onCancel?: () => void;
}) {
  const [dep, setDep] = useState("");
  const [prov, setProv] = useState("");
  const [dist, setDist] = useState("");

  const provincias = useMemo(
    () => ubicaciones.departamentos.find((d) => String(d.id) === dep)?.provincias ?? [],
    [ubicaciones, dep],
  );
  const distritos = useMemo(
    () => provincias.find((p) => String(p.id) === prov)?.distritos ?? [],
    [provincias, prov],
  );

  return (
    <div className="max-w-3xl mx-auto mt-2.5 rounded-xl border border-gray-200 bg-gray-50 p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-700">
        <MapPin size={13} aria-hidden /> ¿Dónde votas? Elige tu zona y te mostramos sus candidatos
      </p>
      <p className="mt-0.5 text-[11px] text-gray-500">
        Solo departamento: todos los de ese departamento. Con provincia: los de toda la provincia. Con distrito: solo los de ese distrito.
      </p>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <select aria-label="Departamento" className={selectCls} value={dep}
          onChange={(e) => { setDep(e.target.value); setProv(""); setDist(""); }}>
          <option value="">Departamento</option>
          {ubicaciones.departamentos.map((d) => <option key={d.id} value={d.id}>{prettyPlace(d.nombre)}</option>)}
        </select>
        <select aria-label="Provincia" className={selectCls} value={prov} disabled={!dep}
          onChange={(e) => { setProv(e.target.value); setDist(""); }}>
          <option value="">Todas las provincias</option>
          {provincias.map((p) => <option key={p.id} value={p.id}>{prettyPlace(p.nombre)}</option>)}
        </select>
        <select aria-label="Distrito" className={selectCls} value={dist} disabled={!prov}
          onChange={(e) => setDist(e.target.value)}>
          <option value="">Todos los distritos</option>
          {distritos.map((d) => <option key={d.id} value={d.id}>{prettyPlace(d.nombre)}</option>)}
        </select>
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        <button
          type="button"
          disabled={!dep || busy}
          onClick={() => onPick(dist ? { distrito_id: Number(dist) } : prov ? { provincia_id: Number(prov) } : { departamento_id: Number(dep) })}
          className="rounded-full bg-gray-900 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Buscando..." : "Ver candidatos"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="text-xs text-gray-500 underline hover:text-gray-700">
            Cancelar
          </button>
        )}
      </div>
    </div>
  );
}

/** "Tu zona: San Gregorio, San Miguel · Cambiar". */
export function ZoneBadge({ zona, onChange }: { zona: ZonaInfo; onChange: () => void }) {
  return (
    <p className="mb-1.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-gray-500">
      <MapPin size={11} aria-hidden />
      <span>
        Tu zona: <span className="font-semibold text-gray-700">
          {[zona.distrito, zona.provincia, zona.departamento].filter(Boolean).map((n) => prettyPlace(String(n))).join(", ")}
        </span>
      </span>
      <button type="button" onClick={onChange} className="underline hover:text-gray-700">Cambiar</button>
    </p>
  );
}

/** Mini encuesta "¿Apoyas a X?" — un voto por candidato, editable. */
export function SupportPoll({
  name, vote, busy, onVote,
}: {
  name: string;
  vote: boolean | undefined;
  busy: boolean;
  onVote: (supports: boolean) => void;
}) {
  const btn = (active: boolean, tone: "yes" | "no") =>
    `inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-50 ${
      active
        ? tone === "yes" ? "border-green-600 bg-green-600 text-white" : "border-red-600 bg-red-600 text-white"
        : "border-gray-300 bg-white text-gray-600 hover:border-gray-400"
    }`;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2">
      <p className="text-xs font-semibold text-gray-800">¿Apoyas a {name}?</p>
      <div className="flex gap-1.5" role="group" aria-label={`¿Apoyas a ${name}?`}>
        <button type="button" disabled={busy} aria-pressed={vote === true} onClick={() => onVote(true)} className={btn(vote === true, "yes")}>
          <ThumbsUp size={12} aria-hidden /> Sí
        </button>
        <button type="button" disabled={busy} aria-pressed={vote === false} onClick={() => onVote(false)} className={btn(vote === false, "no")}>
          <ThumbsDown size={12} aria-hidden /> No
        </button>
      </div>
      <p className="basis-full text-[10px] text-gray-400">
        Anónimo. Sirve para conocer el sentir de cada zona; no es una encuesta científica ni un resultado oficial.
      </p>
    </div>
  );
}
