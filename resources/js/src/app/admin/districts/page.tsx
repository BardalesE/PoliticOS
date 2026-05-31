"use client";

import { useCallback, useEffect, useState } from "react";
import { MapPin, Pencil, Trash2, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { adminApiExtended, type DistrictItem } from "@/lib/api";
import { PageHeader } from "@/components/admin/PageHeader";
import { Modal } from "@/components/admin/Modal";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { FormField } from "@/components/admin/FormField";

const EMPTY: Omit<DistrictItem, "id"> = {
  name: "", keywords: [], sort_order: 0, is_active: true,
};

export default function DistrictsPage() {
  const { token } = useAuth();
  const [districts, setDistricts] = useState<DistrictItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DistrictItem | null>(null);
  const [form, setForm] = useState<Omit<DistrictItem, "id">>(EMPTY);
  const [keywordsText, setKeywordsText] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    setLoading(true);
    adminApiExtended.districts
      .list(token)
      .then((r) => setDistricts(r.data))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY);
    setKeywordsText("");
    setModalOpen(true);
  };

  const openEdit = (d: DistrictItem) => {
    setEditing(d);
    setForm({ name: d.name, keywords: d.keywords, sort_order: d.sort_order, is_active: d.is_active });
    setKeywordsText(d.keywords.join(", "));
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSaving(true);
    const keywords = keywordsText
      .split(",")
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean);
    const data = { ...form, keywords };
    try {
      if (editing) {
        await adminApiExtended.districts.update(token, editing.id, data);
      } else {
        await adminApiExtended.districts.create(token, data);
      }
      setModalOpen(false);
      load();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!token || !deleteId) return;
    await adminApiExtended.districts.delete(token, deleteId);
    setDeleteId(null);
    load();
  };

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <PageHeader
        title="Distritos"
        subtitle="Palabras clave que el AI usa para detectar de qué distrito habla el ciudadano"
        onNew={openCreate}
        newLabel="Nuevo distrito"
      />

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 size={24} className="animate-spin text-brand-400" />
        </div>
      ) : districts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <MapPin size={40} className="mb-3 opacity-30" />
          <p className="text-sm">No hay distritos. Crea el primero.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {districts.map((d) => (
            <div
              key={d.id}
              className="bg-white border border-gray-200 rounded-2xl shadow-sm hover:shadow-md transition-all duration-200 p-5 flex flex-col gap-3"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 bg-brand-500/10 border border-brand-500/20">
                    <MapPin size={18} className="text-brand-500" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-gray-900 text-sm leading-tight truncate">{d.name}</h3>
                    <p className="text-xs text-gray-400 mt-0.5">Orden #{d.sort_order}</p>
                  </div>
                </div>
                <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                  d.is_active
                    ? "bg-green-50 text-green-700 border-green-100"
                    : "bg-gray-100 text-gray-500 border-gray-200"
                }`}>
                  {d.is_active ? "Activo" : "Inactivo"}
                </span>
              </div>

              {/* Keywords */}
              {d.keywords.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {d.keywords.map((k) => (
                    <span
                      key={k}
                      className="px-2 py-0.5 bg-gray-100 text-gray-600 border border-gray-200 rounded-full text-xs"
                    >
                      {k}
                    </span>
                  ))}
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center justify-end gap-1 pt-2 border-t border-gray-100 mt-auto">
                <button
                  onClick={() => openEdit(d)}
                  className="p-2 rounded-lg text-gray-400 hover:text-brand-500 hover:bg-brand-50 transition-colors"
                  title="Editar"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => setDeleteId(d.id)}
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

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Editar distrito" : "Nuevo distrito"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField
            label="Nombre del distrito *"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
          <FormField
            label="Palabras clave (separadas por coma)"
            value={keywordsText}
            onChange={(e) => setKeywordsText(e.target.value)}
            placeholder="san miguel, pallaques, san miguel de pallaques"
            required
          />
          <div className="grid grid-cols-2 gap-3 items-end">
            <FormField
              label="Orden"
              type="number"
              value={String(form.sort_order)}
              onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value) }))}
            />
            <label className="flex items-center gap-2 pb-2">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                className="w-4 h-4 accent-red-600"
              />
              <span className="text-gray-700 text-sm">Activo</span>
            </label>
          </div>
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
              {saving ? "Guardando..." : editing ? "Guardar cambios" : "Crear distrito"}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteId}
        onCancel={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Eliminar distrito"
        message="¿Eliminar este distrito? El AI no podrá detectarlo en conversaciones."
      />
    </div>
  );
}
