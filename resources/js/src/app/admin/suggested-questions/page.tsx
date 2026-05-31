"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageSquare, Pencil, Trash2, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { adminApiExtended, type SuggestedQuestion, type TopicItem } from "@/lib/api";
import { PageHeader } from "@/components/admin/PageHeader";
import { Modal } from "@/components/admin/Modal";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { FormField } from "@/components/admin/FormField";

const EMPTY: Omit<SuggestedQuestion, "id"> = {
  question: "", topic: null, sort_order: 0, is_active: true,
};

export default function SuggestedQuestionsPage() {
  const { token } = useAuth();
  const [questions, setQuestions] = useState<SuggestedQuestion[]>([]);
  const [topics, setTopics] = useState<TopicItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SuggestedQuestion | null>(null);
  const [form, setForm] = useState<Omit<SuggestedQuestion, "id">>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    setLoading(true);
    Promise.all([
      adminApiExtended.suggestedQuestions.list(token),
      adminApiExtended.topics.list(token),
    ])
      .then(([q, t]) => {
        setQuestions(q.data);
        setTopics(t.data);
      })
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY);
    setModalOpen(true);
  };

  const openEdit = (q: SuggestedQuestion) => {
    setEditing(q);
    setForm({ question: q.question, topic: q.topic, sort_order: q.sort_order, is_active: q.is_active });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSaving(true);
    try {
      if (editing?.id) {
        await adminApiExtended.suggestedQuestions.update(token, editing.id, form);
      } else {
        await adminApiExtended.suggestedQuestions.create(token, form);
      }
      setModalOpen(false);
      load();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!token || !deleteId) return;
    await adminApiExtended.suggestedQuestions.delete(token, deleteId);
    setDeleteId(null);
    load();
  };

  const topicForName = (name: string | null) =>
    name ? topics.find((t) => t.name === name) : undefined;

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <PageHeader
        title="Preguntas sugeridas"
        subtitle="Aparecen como chips de sugerencia en la pantalla de inicio del chat"
        onNew={openCreate}
        newLabel="Nueva pregunta"
      />

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 size={24} className="animate-spin text-brand-400" />
        </div>
      ) : questions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <MessageSquare size={40} className="mb-3 opacity-30" />
          <p className="text-sm">No hay preguntas sugeridas. Crea la primera.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {questions.map((q) => {
            const topic = topicForName(q.topic);
            return (
              <div
                key={q.id}
                className="bg-white border border-gray-200 rounded-2xl shadow-sm hover:shadow-md transition-all duration-200 p-5 flex flex-col gap-3"
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center shrink-0">
                      <MessageSquare size={16} className="text-brand-500" />
                    </div>
                    <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                      #{q.sort_order}
                    </span>
                  </div>
                  <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                    q.is_active
                      ? "bg-green-50 text-green-700 border-green-100"
                      : "bg-gray-100 text-gray-500 border-gray-200"
                  }`}>
                    {q.is_active ? "Activa" : "Inactiva"}
                  </span>
                </div>

                {/* Question text */}
                <p className="text-sm font-medium text-gray-900 leading-snug line-clamp-3 flex-1">
                  {q.question}
                </p>

                {/* Topic chip */}
                {topic && (
                  <div>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 border border-gray-200 rounded-full text-xs text-gray-600">
                      <span>{topic.emoji}</span>
                      <span>{topic.label}</span>
                    </span>
                  </div>
                )}

                {/* Footer */}
                <div className="flex items-center justify-end gap-1 pt-2 border-t border-gray-100 mt-auto">
                  <button
                    onClick={() => openEdit(q)}
                    className="p-2 rounded-lg text-gray-400 hover:text-brand-500 hover:bg-brand-50 transition-colors"
                    title="Editar"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => setDeleteId(q.id!)}
                    className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                    title="Eliminar"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Editar pregunta" : "Nueva pregunta sugerida"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField
            as="textarea"
            label="Pregunta *"
            value={form.question}
            onChange={(e) => setForm((f) => ({ ...f, question: e.target.value }))}
            required
            placeholder="¿Qué harás por el agua en los caseríos?"
            rows={3}
          />
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <FormField
                as="select"
                label="Tema (opcional)"
                value={form.topic ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, topic: e.target.value || null }))}
              >
                <option value="">Sin tema</option>
                {topics.map((t) => (
                  <option key={t.name} value={t.name}>{t.emoji} {t.label}</option>
                ))}
              </FormField>
            </div>
            <FormField
              label="Orden"
              type="number"
              value={String(form.sort_order)}
              onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value) }))}
            />
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
              className="w-4 h-4 accent-red-600"
            />
            <span className="text-gray-700 text-sm">Mostrar en el chat</span>
          </label>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="flex-1 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-white rounded-xl text-sm font-semibold transition-colors"
            >
              {saving ? "Guardando..." : editing ? "Guardar" : "Crear pregunta"}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteId}
        onCancel={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Eliminar pregunta"
        message="¿Eliminar esta pregunta sugerida? Ya no aparecerá en el chat."
      />
    </div>
  );
}
