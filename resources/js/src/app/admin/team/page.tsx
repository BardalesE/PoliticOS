"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Trash2, Loader2, Pencil, Users, Upload } from "lucide-react";
import { adminApi, type TeamMember } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, SearchBar } from "@/components/admin/PageHeader";
import { Modal } from "@/components/admin/Modal";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { FormField } from "@/components/admin/FormField";
import { Pagination } from "@/components/admin/Pagination";

const EMPTY_FORM = {
  name: "", role: "", description: "",
  facebook_url: "", instagram_url: "",
  sort_order: 0, is_active: true,
};

export default function TeamPage() {
  const { token } = useAuth();
  const photoRef = useRef<HTMLInputElement>(null);

  const [items, setItems]               = useState<TeamMember[]>([]);
  const [page, setPage]                 = useState(1);
  const [meta, setMeta]                 = useState({ last_page: 1, total: 0, per_page: 20 });
  const [search, setSearch]             = useState("");
  const [loading, setLoading]           = useState(true);
  const [formOpen, setFormOpen]         = useState(false);
  const [editTarget, setEditTarget]     = useState<TeamMember | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TeamMember | null>(null);
  const [saving, setSaving]             = useState(false);
  const [deleting, setDeleting]         = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [form, setForm]                 = useState(EMPTY_FORM);
  const [photoFile, setPhotoFile]       = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const load = useCallback(async (p = 1) => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await adminApi.team.list(token, p);
      setItems(res.data);
      setMeta({ last_page: res.last_page, total: res.total, per_page: res.per_page });
      setPage(p);
    } catch { setError("Error cargando equipo."); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(1); }, [load]);

  function openCreate() {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setPhotoFile(null);
    setPhotoPreview(null);
    setError(null);
    setFormOpen(true);
  }

  function openEdit(m: TeamMember) {
    setEditTarget(m);
    setForm({
      name: m.name, role: m.role, description: m.description ?? "",
      facebook_url: m.facebook_url ?? "", instagram_url: m.instagram_url ?? "",
      sort_order: m.sort_order, is_active: m.is_active,
    });
    setPhotoFile(null);
    setPhotoPreview(m.photo_url ?? null);
    setError(null);
    setFormOpen(true);
  }

  function onPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setPhotoFile(f);
    setPhotoPreview(URL.createObjectURL(f));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSaving(true); setError(null);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) =>
        fd.append(k, typeof v === "boolean" ? (v ? "1" : "0") : String(v))
      );
      if (photoFile) fd.append("photo", photoFile);

      if (editTarget) {
        await adminApi.team.update(token, editTarget.id, fd);
      } else {
        await adminApi.team.create(token, fd);
      }
      setFormOpen(false);
      load(editTarget ? page : 1);
    } catch (err: any) {
      setError(err?.message ?? "Error guardando miembro.");
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!token || !deleteTarget) return;
    setDeleting(true);
    try {
      await adminApi.team.delete(token, deleteTarget.id);
      setDeleteTarget(null);
      load(page);
    } catch { setError("Error eliminando miembro."); }
    finally { setDeleting(false); }
  }

  const filtered = items.filter((m) =>
    !search ||
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.role.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-4 md:p-8">
      <PageHeader
        title="Equipo político"
        subtitle={`${meta.total} miembros registrados`}
        onNew={openCreate}
        newLabel="Agregar miembro"
      >
        <SearchBar value={search} onChange={setSearch} placeholder="Buscar por nombre o cargo..." className="w-52" />
      </PageHeader>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 size={24} className="animate-spin text-brand-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-ink-500">
          <Users size={40} className="mb-3 opacity-40" />
          <p className="text-sm">No hay miembros aún. Agrega el primero.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((m) => (
            <div key={m.id} className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm group">
              {/* Foto */}
              <div className="relative aspect-square bg-ink-800 flex items-center justify-center overflow-hidden">
                {m.photo_url ? (
                  <img src={m.photo_url} alt={m.name} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                ) : (
                  <div className="h-16 w-16 rounded-full bg-brand-600/30 flex items-center justify-center">
                    <span className="text-2xl font-bold text-brand-400">{m.name[0]}</span>
                  </div>
                )}
                <div className={`absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-medium ${m.is_active ? "bg-green-500/70 text-white" : "bg-gray-200 text-gray-500"}`}>
                  {m.is_active ? "Activo" : "Inactivo"}
                </div>
              </div>
              {/* Info */}
              <div className="p-4">
                <p className="text-[10px] uppercase tracking-wider text-brand-400 mb-0.5">{m.role}</p>
                <p className="text-sm font-semibold text-gray-900 truncate">{m.name}</p>
                {m.description && (
                  <p className="text-xs text-ink-400 mt-1 line-clamp-2">{m.description}</p>
                )}
                <p className="text-[10px] text-ink-600 mt-1">Orden: {m.sort_order}</p>
              </div>
              {/* Acciones */}
              <div className="flex border-t border-gray-100">
                <button
                  onClick={() => openEdit(m)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-ink-400 hover:text-brand-400 hover:bg-brand-500/5 transition-colors"
                >
                  <Pencil size={12} /> Editar
                </button>
                <div className="w-px bg-gray-200" />
                <button
                  onClick={() => setDeleteTarget(m)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-ink-400 hover:text-red-400 hover:bg-red-500/5 transition-colors"
                >
                  <Trash2 size={12} /> Eliminar
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

      {/* Modal form */}
      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editTarget ? "Editar miembro" : "Nuevo miembro"} size="md">
        <form onSubmit={handleSave} className="space-y-4">
          {/* Foto */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2">Foto</label>
            <div className="flex items-center gap-4">
              <div
                onClick={() => photoRef.current?.click()}
                className="h-20 w-20 rounded-2xl bg-gray-50 border border-dashed border-gray-300 flex items-center justify-center cursor-pointer hover:border-brand-500/40 overflow-hidden"
              >
                {photoPreview ? (
                  <img src={photoPreview} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Upload size={20} className="text-ink-500" />
                )}
              </div>
              <div>
                <p className="text-xs text-gray-500">{photoFile ? photoFile.name : "Click para subir foto"}</p>
                <p className="text-[10px] text-ink-500 mt-0.5">JPG, PNG, WebP — máx. 4 MB</p>
              </div>
              <input ref={photoRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={onPhotoChange} className="hidden" />
            </div>
          </div>

          <FormField label="Nombre completo *" value={form.name} onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))} placeholder="James Cueva" />
          <FormField label="Cargo *" value={form.role} onChange={(e) => setForm(p => ({ ...p, role: e.target.value }))} placeholder="Candidato a Alcalde" />
          <FormField as="textarea" label="Descripción" value={form.description} onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Breve descripción del miembro..." />

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Facebook URL" value={form.facebook_url} onChange={(e) => setForm(p => ({ ...p, facebook_url: e.target.value }))} placeholder="https://facebook.com/..." />
            <FormField label="Instagram URL" value={form.instagram_url} onChange={(e) => setForm(p => ({ ...p, instagram_url: e.target.value }))} placeholder="https://instagram.com/..." />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Orden de aparición" value={String(form.sort_order)} onChange={(e) => setForm(p => ({ ...p, sort_order: parseInt(e.target.value) || 0 }))} placeholder="0" />
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Estado</label>
              <button
                type="button"
                onClick={() => setForm(p => ({ ...p, is_active: !p.is_active }))}
                className={`w-full py-2.5 rounded-xl border text-xs font-medium transition-colors ${
                  form.is_active ? "border-green-500/30 bg-green-500/10 text-green-400" : "border-gray-200 text-gray-500"
                }`}
              >
                {form.is_active ? "Activo (visible)" : "Inactivo (oculto)"}
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={() => setFormOpen(false)}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50">
              {saving && <Loader2 size={14} className="animate-spin" />}
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="¿Eliminar miembro?"
        message="Se eliminará este miembro del equipo y su foto de forma permanente."
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
