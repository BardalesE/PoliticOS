"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Trash2, Loader2, Tag } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { adminApiExtended, type TopicFull } from "@/lib/api";
import { PageHeader } from "@/components/admin/PageHeader";
import { Modal } from "@/components/admin/Modal";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { FormField } from "@/components/admin/FormField";

const EMPTY: Omit<TopicFull, "id"> = {
  name: "", label: "", emoji: "📋", keywords: [], color: "#D91023", sort_order: 0, is_active: true,
};

export default function TopicsPage() {
  const { token } = useAuth();
  const [topics, setTopics]     = useState<TopicFull[]>([]);
  const [loading, setLoading]   = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing]   = useState<TopicFull | null>(null);
  const [form, setForm]         = useState<Omit<TopicFull, "id">>(EMPTY);
  const [keywordsText, setKeywordsText] = useState("");
  const [saving, setSaving]     = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const deleteTarget = topics.find((t) => t.id === deleteId);

  const load = useCallback(() => {
    if (!token) return;
    setLoading(true);
    adminApiExtended.topics.list(token)
      .then((r) => setTopics(r.data))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditing(null); setForm(EMPTY); setKeywordsText(""); setModalOpen(true);
  };

  const openEdit = (t: TopicFull) => {
    setEditing(t);
    setForm({ name: t.name, label: t.label, emoji: t.emoji, keywords: t.keywords, color: t.color, sort_order: t.sort_order, is_active: t.is_active });
    setKeywordsText(t.keywords.join(", "));
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSaving(true);
    const keywords = keywordsText.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean);
    try {
      if (editing) {
        await adminApiExtended.topics.update(token, editing.id, { ...form, keywords });
      } else {
        await adminApiExtended.topics.create(token, { ...form, keywords });
      }
      setModalOpen(false);
      load();
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!token || !deleteId) return;
    await adminApiExtended.topics.delete(token, deleteId);
    setDeleteId(null);
    load();
  };

  return (
    <div className="p-4 md:p-8">
      <PageHeader
        title="Temas de campaña"
        subtitle={`${topics.length} temas configurados`}
        onNew={openCreate}
        newLabel="Nuevo tema"
      />

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 size={24} className="animate-spin text-brand-500" />
        </div>
      ) : topics.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <Tag size={36} className="mb-3 opacity-30" />
          <p className="text-sm">No hay temas configurados aún.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {topics.map((t) => (
            <div
              key={t.id}
              className="bg-white border border-gray-200 rounded-2xl shadow-sm hover:shadow-md transition-shadow p-5"
            >
              {/* Header del card */}
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex items-center gap-3">
                  <div
                    className="h-11 w-11 rounded-xl flex items-center justify-center text-xl shrink-0 shadow-sm"
                    style={{ backgroundColor: t.color + "18", border: `2px solid ${t.color}30` }}
                  >
                    {t.emoji}
                  </div>
                  <div className="min-w-0">
                    <p className="font-serif font-bold text-gray-900 text-base leading-tight">{t.label}</p>
                    <p className="text-xs text-gray-400 font-mono mt-0.5">{t.name}</p>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => openEdit(t)}
                    className="p-2 rounded-xl text-gray-400 hover:text-brand-500 hover:bg-brand-50 transition-colors"
                    title="Editar"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => setDeleteId(t.id)}
                    className="p-2 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                    title="Eliminar"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              {/* Keywords */}
              {t.keywords.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {t.keywords.slice(0, 5).map((k) => (
                    <span
                      key={k}
                      className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-600 border border-gray-200"
                    >
                      {k}
                    </span>
                  ))}
                  {t.keywords.length > 5 && (
                    <span className="px-2 py-0.5 rounded-full text-[11px] bg-gray-100 text-gray-400">
                      +{t.keywords.length - 5}
                    </span>
                  )}
                </div>
              )}

              {/* Footer: color + orden + estado */}
              <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 rounded-full border border-gray-200 shadow-sm" style={{ backgroundColor: t.color }} />
                  <span className="text-[11px] text-gray-400 font-mono">{t.color}</span>
                  <span className="text-gray-300 text-[11px]">·</span>
                  <span className="text-[11px] text-gray-400">#{t.sort_order}</span>
                </div>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                  t.is_active
                    ? "bg-green-50 text-green-700 border-green-100"
                    : "bg-gray-100 text-gray-500 border-gray-200"
                }`}>
                  {t.is_active ? "Activo" : "Inactivo"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal crear / editar */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Editar tema" : "Nuevo tema"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <FormField
              label="Slug (ID único)"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: (e.target as HTMLInputElement).value.toLowerCase().replace(/\s/g, "_") }))}
              required
              disabled={!!editing}
              placeholder="agua"
            />
            <FormField
              label="Emoji"
              value={form.emoji}
              onChange={(e) => setForm((f) => ({ ...f, emoji: (e.target as HTMLInputElement).value }))}
              placeholder="💧"
            />
          </div>

          <FormField
            label="Nombre visible"
            value={form.label}
            onChange={(e) => setForm((f) => ({ ...f, label: (e.target as HTMLInputElement).value }))}
            required
            placeholder="Agua Potable"
          />

          <FormField
            label="Palabras clave (separadas por coma)"
            value={keywordsText}
            onChange={(e) => setKeywordsText((e.target as HTMLInputElement).value)}
            required
            placeholder="agua, potable, saneamiento, desagüe"
          />

          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.color}
                  onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                  className="h-10 w-10 rounded-xl border border-gray-200 cursor-pointer bg-white p-0.5"
                />
                <input
                  value={form.color}
                  onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                  className="flex-1 px-2 py-2 bg-white border border-gray-200 rounded-xl text-gray-900 text-xs font-mono focus:outline-none focus:border-brand-500"
                />
              </div>
            </div>

            <FormField
              label="Orden"
              type="number"
              value={form.sort_order.toString()}
              onChange={(e) => setForm((f) => ({ ...f, sort_order: Number((e.target as HTMLInputElement).value) }))}
            />

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Estado</label>
              <label className="flex items-center gap-2 mt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                  className="w-4 h-4 accent-brand-600 rounded"
                />
                <span className="text-sm text-gray-700">Activo</span>
              </label>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {editing ? "Guardar cambios" : "Crear tema"}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteId}
        onCancel={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="¿Eliminar tema?"
        message={`Se eliminará "${deleteTarget?.label ?? ""}" y el AI dejará de detectar sus palabras clave.`}
      />
    </div>
  );
}
