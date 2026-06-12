"use client";
import { useCallback, useEffect, useState } from "react";
import { Pencil, Trash2, Loader2, ShieldCheck, Shield } from "lucide-react";
import { adminApi, type AdminUser } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, SearchBar } from "@/components/admin/PageHeader";
import { Modal } from "@/components/admin/Modal";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { FormField } from "@/components/admin/FormField";
import { Pagination } from "@/components/admin/Pagination";
import { Badge } from "@/components/admin/Badge";

// "editor" reservado para v3 — AuthController::login rechaza ese rol con 403,
// así que no se ofrece al crear usuarios.
const ROLES = [
  { value: "admin", label: "Admin" },
];

type FormData = { name: string; email: string; password: string; role: string };
const empty: FormData = { name: "", email: "", password: "", role: "admin" };
const toFormData = (u: AdminUser): FormData => ({
  name: u.name, email: u.email, password: "", role: u.role,
});

export default function UsersPage() {
  const { token, user: me } = useAuth();
  const [items, setItems]               = useState<AdminUser[]>([]);
  const [page, setPage]                 = useState(1);
  const [meta, setMeta]                 = useState({ last_page: 1, total: 0, per_page: 20 });
  const [search, setSearch]             = useState("");
  const [loading, setLoading]           = useState(true);
  const [modalOpen, setModalOpen]       = useState(false);
  const [editing, setEditing]           = useState<AdminUser | null>(null);
  const [form, setForm]                 = useState<FormData>(empty);
  const [saving, setSaving]             = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [deleting, setDeleting]         = useState(false);
  const [error, setError]               = useState<string | null>(null);

  const load = useCallback(async (p = 1) => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await adminApi.users.list(token, p);
      setItems(res.data);
      setMeta({ last_page: res.last_page, total: res.total, per_page: res.per_page });
      setPage(p);
    } catch { setError("Error cargando usuarios."); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(1); }, [load]);

  function openNew() { setEditing(null); setForm(empty); setModalOpen(true); }
  function openEdit(u: AdminUser) { setEditing(u); setForm(toFormData(u)); setModalOpen(true); }
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
      if (editing) {
        const payload: any = { name: form.name, email: form.email, role: form.role };
        if (form.password) payload.password = form.password;
        await adminApi.users.update(token, editing.id, payload);
      } else {
        if (!form.password) { setError("La contraseña es requerida."); setSaving(false); return; }
        await adminApi.users.create(token, {
          name: form.name, email: form.email, password: form.password, role: form.role,
        });
      }
      closeModal(); load(page);
    } catch (err: any) {
      setError(err?.message ?? "Error guardando usuario.");
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!token || !deleteTarget) return;
    setDeleting(true);
    try {
      await adminApi.users.delete(token, deleteTarget.id);
      setDeleteTarget(null); load(page);
    } catch (err: any) {
      setError(err?.message ?? "Error eliminando usuario.");
    } finally { setDeleting(false); }
  }

  const filtered = items.filter((u) =>
    !search ||
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-4 md:p-8">
      <PageHeader
        title="Usuarios"
        subtitle={`${meta.total} usuarios del panel`}
        onNew={openNew}
        newLabel="Nuevo usuario"
      >
        <SearchBar value={search} onChange={setSearch} placeholder="Buscar por nombre o email..." className="w-64" />
      </PageHeader>

      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-x-auto">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 size={24} className="animate-spin text-brand-400" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center py-16 text-gray-400 text-sm">No hay usuarios.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50/60">
                {["Usuario", "Rol", "Registrado", ""].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-[11px] font-medium text-gray-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="">
              {filtered.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50/70 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-brand-600/20 flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-brand-400">{u.name[0].toUpperCase()}</span>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 flex items-center gap-1.5">
                          {u.name}
                          {u.id === me?.id && (
                            <span className="text-[10px] text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded-full">Tú</span>
                          )}
                        </p>
                        <p className="text-xs text-ink-400">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {u.role === "admin"
                        ? <ShieldCheck size={13} className="text-brand-400" />
                        : <Shield size={13} className="text-purple-400" />
                      }
                      <Badge variant={u.role as any} />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {u.created_at ? new Date(u.created_at).toLocaleDateString("es-PE") : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => openEdit(u)}
                        className="p-1.5 rounded-lg text-ink-400 hover:text-brand-400 hover:bg-brand-500/10 transition-colors">
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(u)}
                        disabled={u.id === me?.id}
                        className="p-1.5 rounded-lg text-ink-400 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                        title={u.id === me?.id ? "No puedes eliminarte a ti mismo" : "Eliminar"}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
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

      <Modal open={modalOpen} onClose={closeModal} title={editing ? "Editar usuario" : "Nuevo usuario"}>
        <form onSubmit={handleSave} className="space-y-4">
          <FormField label="Nombre" required value={form.name} onChange={set("name")} placeholder="Juan Pérez" />
          <FormField label="Correo electrónico" required type="email" value={form.email} onChange={set("email")} placeholder="juan@politicos.pe" />
          <FormField
            label={editing ? "Nueva contraseña (dejar vacío para no cambiar)" : "Contraseña"}
            type="password" value={form.password} onChange={set("password")}
            placeholder="Mínimo 8 caracteres"
            required={!editing}
          />
          <FormField
            as="select" label="Rol" required value={form.role} onChange={set("role")}
            options={ROLES}
          />

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={closeModal}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-60">
              {saving && <Loader2 size={14} className="animate-spin" />}
              {editing ? "Guardar cambios" : "Crear usuario"}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="¿Eliminar usuario?"
        message={`Se eliminará la cuenta de "${deleteTarget?.name}" y todas sus sesiones activas.`}
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
