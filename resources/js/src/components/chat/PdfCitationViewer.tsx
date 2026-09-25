"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, Loader2, X } from "lucide-react";
import { normalizeApiBase, resolveTenantSlug } from "@/lib/api";

/**
 * Visor de la fuente de una respuesta: abre el PDF original en la página citada
 * y RESALTA el fragmento exacto que leyó la IA, para que el ciudadano compruebe
 * que la respuesta sale del documento.
 *
 * El PDF llega por el API (/directorio/documentos/{id}/pdf, mismo origen permitido
 * por CSP y CORS); pdf.js se carga solo al abrir el visor (build "legacy": trae
 * polyfills para celulares con navegadores antiguos).
 */

const API = normalizeApiBase(process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api");

export interface ViewerCitation {
  id: string;
  title: string;
  page: number | null;
  excerpt: string;
  url: string | null;
  document_id?: number | null;
}

interface Box { left: number; top: number; width: number; height: number }

/** minúsculas, sin tildes, solo letras/números y un espacio entre palabras. */
const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9ñ]+/g, " ").trim();

type PdfjsModule = typeof import("pdfjs-dist");
let pdfjsPromise: Promise<PdfjsModule> | null = null;
function loadPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist/legacy/build/pdf.mjs").then((m) => {
      const mod = m as unknown as PdfjsModule;
      mod.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
      return mod;
    });
  }
  return pdfjsPromise;
}

/**
 * Qué trozos de texto de la página forman el fragmento citado. Primero busca el
 * fragmento como secuencia continua (inicio y fin); si el texto del PDF viene en
 * otro orden, marca los trozos que aparecen dentro del fragmento.
 */
function matchItems(items: string[], excerpt: string): Set<number> {
  const target = norm(excerpt);
  const hit = new Set<number>();
  if (!target) return hit;

  let joined = "";
  const spans: { start: number; end: number }[] = [];
  items.forEach((t) => {
    const n = norm(t);
    const start = joined.length;
    joined += n + " ";
    spans.push({ start, end: start + n.length });
  });

  const head = target.slice(0, 60);
  const tail = target.slice(-60);
  const from = joined.indexOf(head);
  if (from >= 0) {
    const tailAt = joined.indexOf(tail, from);
    const to = tailAt >= 0 ? tailAt + tail.length : from + target.length;
    spans.forEach((s, i) => { if (s.end > from && s.start < to && s.end > s.start) hit.add(i); });
    if (hit.size) return hit;
  }

  items.forEach((t, i) => {
    const n = norm(t);
    if (n.length >= 5 && target.includes(n)) hit.add(i);
  });
  return hit;
}

export default function PdfCitationViewer({ cite, onClose }: { cite: ViewerCitation; onClose: () => void }) {
  const [page, setPage]       = useState(cite.page ?? 1);
  const [pages, setPages]     = useState<number | null>(null);
  const [boxes, setBoxes]     = useState<Box[]>([]);
  const [size, setSize]       = useState<{ w: number; h: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed]   = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef   = useRef<HTMLDivElement>(null);
  const firstHit  = useRef<HTMLDivElement>(null);
  const docRef    = useRef<import("pdfjs-dist").PDFDocumentProxy | null>(null);

  // Cerrar con Escape y bloquear el scroll de fondo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  // Cargar el documento una vez.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const pdfjs = await loadPdfjs();
        const tenant = resolveTenantSlug();
        const url = `${API}/directorio/documentos/${cite.document_id}/pdf${tenant ? `?tenant=${encodeURIComponent(tenant)}` : ""}`;
        const doc = await pdfjs.getDocument({ url, httpHeaders: tenant ? { "X-Tenant": tenant } : undefined }).promise;
        if (!alive) return;
        docRef.current = doc;
        setPages(doc.numPages);
      } catch {
        if (alive) { setFailed(true); setLoading(false); }
      }
    })();
    return () => { alive = false; docRef.current?.destroy(); };
  }, [cite.document_id]);

  // Dibujar la página y calcular los resaltados.
  useEffect(() => {
    const doc = docRef.current;
    if (!doc || !pages) return;
    let cancelled = false;
    let task: { cancel: () => void; promise: Promise<void> } | null = null;
    setLoading(true);
    (async () => {
      try {
        const pdfjs = await loadPdfjs();
        const p = await doc.getPage(Math.min(Math.max(1, page), pages));
        const width = Math.min(wrapRef.current?.clientWidth ?? 800, 900);
        const base = p.getViewport({ scale: 1 });
        const viewport = p.getViewport({ scale: width / base.width });
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        task = p.render({ canvasContext: ctx, viewport, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined });
        await task.promise;
        if (cancelled) return;
        setSize({ w: viewport.width, h: viewport.height });

        // Resaltar solo en la página citada.
        if (page === (cite.page ?? 1)) {
          const tc = await p.getTextContent();
          const items = tc.items.filter((i): i is import("pdfjs-dist/types/src/display/api").TextItem => "str" in i);
          const hits = matchItems(items.map((i) => i.str), cite.excerpt);
          const out: Box[] = [];
          items.forEach((it, i) => {
            if (!hits.has(i) || !it.str.trim()) return;
            const t = pdfjs.Util.transform(viewport.transform, it.transform);
            const h = Math.hypot(t[2], t[3]);
            out.push({ left: t[4], top: t[5] - h, width: it.width * viewport.scale, height: h * 1.15 });
          });
          if (!cancelled) setBoxes(out);
        } else {
          setBoxes([]);
        }
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; task?.cancel(); };
  }, [page, pages, cite.page, cite.excerpt]);

  // Llevar la vista al primer resaltado.
  useEffect(() => {
    if (boxes.length) firstHit.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [boxes]);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={`Fuente ${cite.id}: ${cite.title}`}>
      <button type="button" aria-label="Cerrar" className="absolute inset-0" onClick={onClose} />
      <div className="relative flex h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:h-[88dvh] sm:rounded-2xl">
        {/* Barra superior */}
        <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-3">
          <span className="rounded bg-yellow-200 px-1.5 text-[11px] font-bold text-gray-800">{cite.id}</span>
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-800">{cite.title}</p>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        <p className="border-b border-gray-100 bg-yellow-50 px-4 py-2 text-[12px] text-gray-600">
          <span className="mr-1 inline-block h-2.5 w-5 rounded-sm bg-yellow-300 align-middle" aria-hidden />
          En amarillo: el texto del documento que usó la IA para responder.
        </p>

        {/* Página */}
        <div ref={wrapRef} className="relative flex-1 overflow-auto bg-gray-100 p-2 sm:p-4">
          {failed ? (
            <div className="mx-auto max-w-2xl rounded-xl bg-white p-4">
              <p className="text-sm font-semibold text-gray-700">No pudimos mostrar el PDF aquí.</p>
              <p className="mt-1 text-[12px] text-gray-500">Este es el fragmento exacto que recibió la IA{cite.page ? ` (página ${cite.page})` : ""}:</p>
              <blockquote className="mt-2 border-l-4 border-yellow-300 bg-yellow-50 p-3 text-[13px] leading-relaxed text-gray-800">…{cite.excerpt}…</blockquote>
            </div>
          ) : (
            <div className="relative mx-auto bg-white shadow" style={size ? { width: size.w, height: size.h } : undefined}>
              <canvas ref={canvasRef} className="block" />
              {boxes.map((b, i) => (
                <div
                  key={i}
                  ref={i === 0 ? firstHit : undefined}
                  className="pointer-events-none absolute rounded-[2px] bg-yellow-300/50 mix-blend-multiply"
                  style={{ left: b.left, top: b.top, width: b.width, height: b.height }}
                />
              ))}
              {loading && (
                <div className="absolute inset-0 flex min-h-[200px] items-center justify-center bg-white/60">
                  <Loader2 className="animate-spin text-gray-400" aria-label="Cargando documento" />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Navegación */}
        <div className="flex items-center justify-between gap-2 border-t border-gray-200 px-4 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
          <div className="flex items-center gap-1">
            <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}
              className="rounded-full p-2 text-gray-600 hover:bg-gray-100 disabled:opacity-30" aria-label="Página anterior">
              <ChevronLeft size={18} />
            </button>
            <span className="text-xs text-gray-600">Pág. {page}{pages ? ` de ${pages}` : ""}</span>
            <button type="button" disabled={!pages || page >= pages || loading} onClick={() => setPage((p) => p + 1)}
              className="rounded-full p-2 text-gray-600 hover:bg-gray-100 disabled:opacity-30" aria-label="Página siguiente">
              <ChevronRight size={18} />
            </button>
            {cite.page && page !== cite.page && (
              <button type="button" onClick={() => setPage(cite.page!)} className="ml-1 text-xs font-semibold text-yellow-700 underline">
                Volver a la cita
              </button>
            )}
          </div>
          {cite.url && (
            <a href={`${cite.url}${cite.page ? `#page=${cite.page}` : ""}`} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-gray-900">
              PDF original <ExternalLink size={13} />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
