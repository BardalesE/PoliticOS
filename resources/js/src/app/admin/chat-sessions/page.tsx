"use client";
import { useCallback, useEffect, useState } from "react";
import { Eye, Loader2, MessageSquare, Monitor } from "lucide-react";
import { adminApi, type ChatSession } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, SearchBar } from "@/components/admin/PageHeader";
import { Pagination } from "@/components/admin/Pagination";
import { Modal } from "@/components/admin/Modal";
import { cn } from "@/lib/utils";

export default function ChatSessionsPage() {
  const { token } = useAuth();
  const [items, setItems]       = useState<ChatSession[]>([]);
  const [page, setPage]         = useState(1);
  const [meta, setMeta]         = useState({ last_page: 1, total: 0, per_page: 20 });
  const [search, setSearch]     = useState("");
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState<ChatSession | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const load = useCallback(async (p = 1) => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await adminApi.chatSessions.list(token, p);
      setItems(res.data);
      setMeta({ last_page: res.last_page, total: res.total, per_page: res.per_page });
      setPage(p);
    } catch {}
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(1); }, [load]);

  async function openSession(id: number) {
    if (!token) return;
    setLoadingDetail(true);
    try {
      const session = await adminApi.chatSessions.show(token, id);
      setSelected(session);
    } catch {}
    finally { setLoadingDetail(false); }
  }

  const filtered = items.filter((s) =>
    !search ||
    s.session_id.toLowerCase().includes(search.toLowerCase()) ||
    (s.ip ?? "").includes(search)
  );

  return (
    <div className="p-4 md:p-8">
      <PageHeader title="Conversaciones" subtitle={`${meta.total} sesiones registradas`}>
        <SearchBar value={search} onChange={setSearch} placeholder="Buscar por IP o sesión..." className="w-64" />
      </PageHeader>

      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-x-auto">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 size={24} className="animate-spin text-brand-400" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center py-16 text-gray-400 text-sm">No hay conversaciones aún.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50/60">
                {["Sesión", "IP", "Mensajes", "Iniciada", ""].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-[11px] font-medium text-gray-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="">
              {filtered.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50/70 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <MessageSquare size={13} className="text-brand-400 shrink-0" />
                      <span className="font-mono text-xs text-gray-600 truncate max-w-[180px]">{s.session_id}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 text-gray-500">
                      <Monitor size={12} className="text-ink-500" />
                      {s.ip ?? "—"}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded-full">
                      {s.messages_count ?? 0} msgs
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                    {s.started_at
                      ? new Date(s.started_at).toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" })
                      : new Date(s.created_at).toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" })
                    }
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => openSession(s.id)}
                      disabled={loadingDetail}
                      className="p-1.5 rounded-lg text-ink-400 hover:text-brand-400 hover:bg-brand-500/10 transition-colors disabled:opacity-40"
                    >
                      {loadingDetail ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && meta.last_page > 1 && (
          <div className="px-5 pb-4">
            <Pagination currentPage={page} lastPage={meta.last_page} total={meta.total} perPage={meta.per_page} onPage={load} />
          </div>
        )}
      </div>

      {/* Session detail modal */}
      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title="Detalle de conversación"
        size="lg"
      >
        {selected && (
          <div>
            {/* Meta */}
            <div className="grid grid-cols-2 gap-3 mb-5 text-xs">
              <div className="bg-gray-50 rounded-xl px-4 py-3">
                <p className="text-ink-500 mb-0.5">ID de sesión</p>
                <p className="font-mono text-gray-600 break-all">{selected.session_id}</p>
              </div>
              <div className="bg-gray-50 rounded-xl px-4 py-3">
                <p className="text-ink-500 mb-0.5">IP</p>
                <p className="text-gray-600">{selected.ip ?? "—"}</p>
              </div>
            </div>

            {/* Messages */}
            <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
              {selected.messages && selected.messages.length > 0 ? (
                selected.messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      "flex gap-2.5",
                      msg.role === "user" ? "flex-row" : "flex-row-reverse"
                    )}
                  >
                    <div className={cn(
                      "h-6 w-6 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold mt-0.5",
                      msg.role === "user"
                        ? "bg-white/[0.08] text-gray-500"
                        : "bg-brand-600/20 text-brand-400"
                    )}>
                      {msg.role === "user" ? "U" : "J"}
                    </div>
                    <div className={cn(
                      "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm",
                      msg.role === "user"
                        ? "bg-gray-100 text-gray-800 rounded-tl-sm"
                        : "bg-brand-50 text-brand-900 rounded-tr-sm"
                    )}>
                      <p className="leading-relaxed">{msg.content}</p>
                      <p className="text-[10px] text-gray-400 mt-1">
                        {new Date(msg.created_at).toLocaleTimeString("es-PE", { timeStyle: "short" })}
                        {msg.topic && <span className="ml-2 capitalize">· {msg.topic}</span>}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-center text-gray-400 text-sm py-6">Sin mensajes.</p>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
