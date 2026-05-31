"use client";
import { useCallback, useEffect, useState } from "react";
import { Pencil, Trash2, Loader2, HelpCircle } from "lucide-react";
import { adminApi, type Faq } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, SearchBar } from "@/components/admin/PageHeader";
import { Modal } from "@/components/admin/Modal";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { FormField } from "@/components/admin/FormField";
import { Pagination } from "@/components/admin/Pagination";

const TOPICS = [
  { value: "", label: "Sin tema" },
  ...["agua","agricultura","vias","salud","educacion","seguridad","empleo","turismo","identidad"]
    .map((t) => ({ value: t, label: t.charAt(0).toUpperCase() + t.slice(1) })),
];

type FormData = { question: string; answer: string; topic: string; priority: string };
const empty: FormData = { question: "", answer: "", topic: "", priority: "5" };
const toFormData = (f: Faq): FormData => ({
  question: f.question, answer: f.answer, topic: f.topic ?? "", priority: f.priority.toString(),
});

export default function FaqsPage() {
  const { token } = useAuth();
  const [items, setItems]               = useState<Faq[]>([]);
  const [page, setPage]                 = useState(1);
  const [meta, setMeta]                 = useState({ last_page: 1, total: 0, per_page: 20 });
  const [search, setSearch]             = useState("");
  const [loading, setLoading]           = useState(true);
  const [modalOpen, setModalOpen]       = useState(false);
  const [editing, setEditing]           = useState<Faq | null>(null);
  const [form, setForm]                 = useState<FormData>(empty);
  const [saving, setSaving]             = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Faq | null>(null);
  const [deleting, setDeleting]         = useState(false);
  const [error, setError]               = useState<string | null>(null);

  const load = useCallback(async (p = 1) => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await adminApi.faqs.list(token, p);
      setItems(res.data);
      setMeta({ last_page: res.last_page, total: res.total, per_page: res.per_page });
      setPage(p);
    } catch { setError("Error cargando FAQs."); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(1); }, [load]);

  function openNew() { setEditing(null); setForm(empty); setModalOpen(true); }
  function openEdit(f: Faq) { setEditing(f); setForm(toFormData(f)); setModalOpen(true); }
  function closeModal() { setModalOpen(false); setError(null); }

  function set(field: keyof FormData) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSaving(true); setError(null);
    try {
      const payload = {
        question: form.question, answer: form.answer,
        topic: form.topic || null, priority: parseInt(form.priority) || 5,
      };
      if (editing) {
        await adminApi.faqs.update(token, editing.id, payload);
      } else {
        await adminApi.faqs.create(token, payload as any);
      }
      closeModal(); load(page);
    } catch (err: any) {
      setError(err?.message ?? "Error guardando FAQ.");
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!token || !deleteTarget) return;
    setDeleting(true);
    try {
      await adminApi.faqs.delete(token, deleteTarget.id);
      setDeleteTarget(null); load(page);
    } catch { setError("Error eliminando FAQ."); }
    finally { setDeleting(false); }
  }

  const filtered = items.filter((f) =>
    !search ||
    f.question.toLowerCase().includes(search.toLowerCase()) ||
    f.answer.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <PageHeader
        title="Preguntas frecuentes"
        subtitle={`${meta.total} FAQs registradas`}
        onNew={openNew}
        newLabel="Nueva FAQ"
      >
        <SearchBar value={search} onChange={setSearch} placeholder="Buscar pregunta..." className="w-56" />
      </PageHeader>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 size={24} className="animate-spin text-brand-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <HelpCircle size={40} className="mb-3 opacity-30" />
          <p className="text-sm">No hay FAQs registradas aún.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((f) => (
            <div
              key={f.id}
              className="bg-white border border-gray-200 rounded-2xl shadow-sm hover:shadow-md transition-all duration-200 p-5 flex flex-col"
            >
              {/* Icon + Priority */}
              <div className="flex items-center justify-between mb-3">
                <div className="h-9 w-9 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center shrink-0">
                  <HelpCircle size={16} className="text-purple-500" />
                </div>
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  Prioridad #{f.priority}
                </span>
              </div>

              {/* Question */}
              <h3 className="font-semibold text-gray-900 text-sm leading-snug mb-2 line-clamp-2">
                {f.question}
              </h3>

              {/* Answer preview */}
              <p className="text-xs text-gray-500 leading-relaxed line-clamp-3 flex-1 mb-3">
                {f.answer}
              </p>

              {/* Topic chip */}
              {f.topic && (
                <div className="mb-3">
                  <span className="px-2.5 py-0.5 bg-brand-50 text-brand-600 border border-brand-100 rounded-full text-xs capitalize">
                    {f.topic}
                  </span>
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center justify-end gap-1 pt-3 border-t border-gray-100 mt-auto">
                <button
                  onClick={() => openEdit(f)}
                  className="p-2 rounded-lg text-gray-400 hover:text-brand-500 hover:bg-brand-50 transition-colors"
                  title="Editar"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => setDeleteTarget(f)}
                  className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                  title="Eliminar"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && meta.last_page > 1 && (
        <div className="mt-6">
          <Pagination currentPage={page} lastPage={meta.last_page} total={meta.total} perPage={meta.per_page} onPage={load} />
        </div>
      )}

      <Modal open={modalOpen} onClose={closeModal} title={editing ? "Editar FAQ" : "Nueva FAQ"}>
        <form onSubmit={handleSave} className="space-y-4">
          <FormField label="Pregunta *" required value={form.question} onChange={set("question")}
            placeholder="¿Qué harás por el agua potable?" />
          <FormField as="textarea" label="Respuesta *" required value={form.answer}
            onChange={set("answer")} rows={5} placeholder="Como alcalde, mi compromiso es..." />
          <div className="grid grid-cols-2 gap-4">
            <FormField as="select" label="Tema" value={form.topic} onChange={set("topic")} options={TOPICS} />
            <FormField label="Prioridad (1–10)" type="number" value={form.priority} onChange={set("priority")} min="1" max="10" />
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={closeModal}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-60">
              {saving && <Loader2 size={14} className="animate-spin" />}
              {editing ? "Guardar cambios" : "Crear FAQ"}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="¿Eliminar FAQ?"
        message={`Se eliminará "${deleteTarget?.question}" de forma permanente.`}
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
