"use client";
import { useEffect, useState } from "react";
import { Loader2, AlertCircle, FileText, MapPin, HelpCircle } from "lucide-react";
import { Modal } from "@/components/admin/Modal";
import { adminApi, type KnowledgeAnalysisDetail } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export function KnowledgeAnalysisModal({
  docId,
  title,
  onClose,
}: {
  docId: number | null;
  title: string;
  onClose: () => void;
}) {
  const { token } = useAuth();
  const [data, setData] = useState<KnowledgeAnalysisDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!docId || !token) return;
    setLoading(true);
    setError(null);
    setData(null);
    adminApi.knowledge.analysisDetail(token, docId)
      .then(setData)
      .catch((e: any) => setError(e?.message ?? "No se pudo cargar el análisis."))
      .finally(() => setLoading(false));
  }, [docId, token]);

  return (
    <Modal open={!!docId} onClose={onClose} title={`Análisis — ${title}`} size="xl">
      {loading && (
        <div className="flex justify-center py-12">
          <Loader2 size={20} className="animate-spin text-brand-400" />
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {data && (
        <div className="space-y-6">
          {/* Cobertura */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-gray-50 border border-gray-100 p-3 text-center">
              <p className="text-lg font-bold text-gray-900">{data.pages_total ?? "—"}</p>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">Páginas del PDF</p>
            </div>
            <div className="rounded-xl bg-gray-50 border border-gray-100 p-3 text-center">
              <p className="text-lg font-bold text-gray-900">{data.pages_covered}</p>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">Páginas cubiertas</p>
            </div>
            <div className="rounded-xl bg-gray-50 border border-gray-100 p-3 text-center">
              <p className="text-lg font-bold text-gray-900">{data.sections_count}</p>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">Secciones</p>
            </div>
          </div>

          {/* Resumen ejecutivo */}
          {data.resumen_ejecutivo && (
            <section>
              <h4 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">Resumen ejecutivo</h4>
              <p className="text-sm text-gray-700 leading-relaxed">{data.resumen_ejecutivo}</p>
            </section>
          )}

          {/* Índice */}
          {data.indice_estructurado.length > 0 && (
            <section>
              <h4 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">Índice</h4>
              <ol className="space-y-1">
                {data.indice_estructurado
                  .sort((a, b) => a.orden - b.orden)
                  .map((item, i) => (
                    <li key={i} className="text-sm text-gray-700 flex gap-2">
                      <span className="text-gray-400">{item.orden}.</span> {item.titulo}
                    </li>
                  ))}
              </ol>
            </section>
          )}

          {/* Propuestas por eje */}
          {Object.keys(data.propuestas_por_eje).length > 0 && (
            <section>
              <h4 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2 flex items-center gap-1.5">
                <FileText size={12} /> Propuestas por eje
              </h4>
              <div className="space-y-3">
                {Object.entries(data.propuestas_por_eje).map(([key, eje]) => (
                  <div key={key} className="rounded-xl border border-gray-100 p-3">
                    <p className="text-sm font-semibold text-gray-900 mb-1">{eje.eje ?? key}</p>
                    {eje.resumen && <p className="text-xs text-gray-500 mb-2">{eje.resumen}</p>}
                    {eje.propuestas?.length > 0 && (
                      <ul className="space-y-1">
                        {eje.propuestas.map((p, i) => (
                          <li key={i} className="text-xs text-gray-700 flex gap-1.5">
                            <span className="text-brand-400">•</span>
                            <span>
                              {p.texto}
                              {p.paginas?.length > 0 && (
                                <span className="text-gray-400"> (pág. {p.paginas.join(", ")})</span>
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Propuestas por región */}
          {data.propuestas_por_region.length > 0 && (
            <section>
              <h4 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2 flex items-center gap-1.5">
                <MapPin size={12} /> Propuestas por región
              </h4>
              <div className="space-y-3">
                {data.propuestas_por_region.map((r, i) => (
                  <div key={i} className="rounded-xl border border-gray-100 p-3">
                    <p className="text-sm font-semibold text-gray-900 mb-1">{r.nombre}</p>
                    {r.propuestas?.length > 0 && (
                      <ul className="space-y-1">
                        {r.propuestas.map((p, j) => (
                          <li key={j} className="text-xs text-gray-700 flex gap-1.5">
                            <span className="text-brand-400">•</span>
                            <span>
                              {p.texto}
                              {p.paginas?.length > 0 && (
                                <span className="text-gray-400"> (pág. {p.paginas.join(", ")})</span>
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* FAQs */}
          {data.faqs.length > 0 && (
            <section>
              <h4 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2 flex items-center gap-1.5">
                <HelpCircle size={12} /> Preguntas frecuentes ({data.faqs.length})
              </h4>
              <div className="space-y-2">
                {data.faqs.map((faq, i) => (
                  <details key={i} className="rounded-xl border border-gray-100 p-3 group">
                    <summary className="text-sm font-medium text-gray-900 cursor-pointer list-none">
                      {faq.pregunta}
                    </summary>
                    <p className="text-xs text-gray-600 mt-2 leading-relaxed">{faq.respuesta}</p>
                    {faq.paginas?.length > 0 && (
                      <p className="text-[10px] text-gray-400 mt-1">Pág. {faq.paginas.join(", ")}</p>
                    )}
                  </details>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </Modal>
  );
}
