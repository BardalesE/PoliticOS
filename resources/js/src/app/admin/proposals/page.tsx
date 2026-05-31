"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pencil, Trash2, Loader2, FileText, MapPin, Upload, X, Image as ImageIcon, FileUp } from "lucide-react";
import { FilePreviewModal } from "@/components/admin/FilePreviewModal";
import { adminApi, type Proposal } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useCandidate } from "@/context/CandidateContext";
import { PageHeader, SearchBar } from "@/components/admin/PageHeader";
import { Modal } from "@/components/admin/Modal";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { FormField } from "@/components/admin/FormField";
import { Pagination } from "@/components/admin/Pagination";
import { Badge } from "@/components/admin/Badge";
import { cn } from "@/lib/utils";

const STATUSES = [
  { value: "propuesta",  label: "Propuesta" },
  { value: "en_curso",   label: "En curso" },
  { value: "completada", label: "Completada" },
];

type FormData = {
  title: string; description: string; district: string; topic: string;
  budget: string; priority: string; status: string;
  image: string; document_url: string;
};

const empty: FormData = {
  title: "", description: "", district: "", topic: "agua",
  budget: "", priority: "5", status: "propuesta", image: "", document_url: "",
};

function toFormData(p: Proposal): FormData {
  return {
    title: p.title, description: p.description, district: p.district ?? "",
    topic: p.topic, budget: p.budget?.toString() ?? "", priority: p.priority?.toString() ?? "5",
    status: p.status, image: p.image ?? "", document_url: p.document_url ?? "",
  };
}

const STATUS_COLORS: Record<string, string> = {
  propuesta:  "#3B82F6",
  en_curso:   "#F59E0B",
  completada: "#22C55E",
};

// ── Drop zone genérico ──────────────────────────────────────────────────────

type DropZoneProps = {
  label: string;
  accept: string;
  hint: string;
  icon: React.ReactNode;
  currentUrl: string;
  file: File | null;
  onFile: (f: File | null) => void;
  onClearUrl: () => void;
  isImage?: boolean;
};

function DropZone({ label, accept, hint, icon, currentUrl, file, onFile, onClearUrl, isImage }: DropZoneProps) {
  const ref = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const preview = file ? URL.createObjectURL(file) : currentUrl;

  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1.5">{label}</label>
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}
        onClick={() => !preview && ref.current?.click()}
        className={cn(
          "relative rounded-xl border-2 transition-all duration-200 overflow-hidden",
          preview
            ? "border-gray-200 cursor-default"
            : drag
            ? "border-brand-500 bg-brand-50 cursor-pointer"
            : "border-dashed border-gray-200 hover:border-brand-400 hover:bg-gray-50 cursor-pointer"
        )}
      >
        <input
          ref={ref} type="file" accept={accept} className="sr-only"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }}
        />

        {preview ? (
          isImage ? (
            <div className="relative aspect-video group">
              <img src={preview} alt="" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <button type="button" onClick={(e) => { e.stopPropagation(); ref.current?.click(); }}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/90 text-gray-900 text-xs font-medium">
                  <Upload size={11} /> Cambiar
                </button>
                <button type="button" onClick={(e) => { e.stopPropagation(); onFile(null); onClearUrl(); }}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-500/90 text-white text-xs font-medium">
                  <X size={11} /> Quitar
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 p-3">
              <FileText size={20} className="text-brand-500 shrink-0" />
              <span className="text-xs text-gray-700 truncate flex-1">
                {file ? file.name : preview.split("/").pop()}
              </span>
              <button type="button" onClick={(e) => { e.stopPropagation(); onFile(null); onClearUrl(); }}
                className="p-1 rounded-lg text-red-400 hover:bg-red-50">
                <X size={14} />
              </button>
            </div>
          )
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 py-6 px-4">
            <div className="h-9 w-9 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-500">
              {icon}
            </div>
            <p className="text-xs text-gray-500 text-center">
              Arrastra o <span className="text-brand-500 font-medium">haz clic</span> para subir
            </p>
            <p className="text-[10px] text-gray-400">{hint}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function ProposalsPage() {
  const { token } = useAuth();
  const { topics } = useCandidate();
  const [items, setItems]           = useState<Proposal[]>([]);
  const [page, setPage]             = useState(1);
  const [meta, setMeta]             = useState({ last_page: 1, total: 0, per_page: 20 });
  const [search, setSearch]         = useState("");
  const [loading, setLoading]       = useState(true);
  const [modalOpen, setModalOpen]   = useState(false);
  const [editing, setEditing]       = useState<Proposal | null>(null);
  const [form, setForm]             = useState<FormData>(empty);
  const [imgFile, setImgFile]       = useState<File | null>(null);
  const [docFile, setDocFile]       = useState<File | null>(null);
  const [saving, setSaving]         = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Proposal | null>(null);
  const [deleting, setDeleting]     = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [preview, setPreview]       = useState<{ url: string; title: string } | null>(null);

  const load = useCallback(async (p = 1) => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await adminApi.proposals.list(token, p);
      setItems(res.data);
      setMeta({ last_page: res.last_page, total: res.total, per_page: res.per_page });
      setPage(p);
    } catch { setError("Error cargando propuestas."); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(1); }, [load]);

  function openNew() {
    setEditing(null); setForm(empty);
    setImgFile(null); setDocFile(null);
    setError(null); setModalOpen(true);
  }
  function openEdit(p: Proposal) {
    setEditing(p); setForm(toFormData(p));
    setImgFile(null); setDocFile(null);
    setError(null); setModalOpen(true);
  }
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
      const fd = new FormData();
      fd.append("title", form.title);
      fd.append("description", form.description);
      if (form.district) fd.append("district", form.district);
      fd.append("topic", form.topic);
      if (form.budget) fd.append("budget", form.budget);
      fd.append("priority", form.priority);
      fd.append("status", form.status);
      if (imgFile) {
        fd.append("image_file", imgFile);
      } else if (form.image) {
        fd.append("image", form.image);
      }
      if (docFile) {
        fd.append("document_file", docFile);
      } else if (form.document_url) {
        fd.append("document_url", form.document_url);
      }

      if (editing) {
        await adminApi.proposals.update(token, editing.id, fd);
      } else {
        await adminApi.proposals.create(token, fd);
      }
      closeModal(); load(page);
    } catch (err: any) {
      setError(err?.message ?? "Error guardando propuesta.");
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!token || !deleteTarget) return;
    setDeleting(true);
    try {
      await adminApi.proposals.delete(token, deleteTarget.id);
      setDeleteTarget(null); load(page);
    } catch { setError("Error eliminando propuesta."); }
    finally { setDeleting(false); }
  }

  const filtered = items.filter((p) =>
    !search || p.title.toLowerCase().includes(search.toLowerCase()) ||
    (p.district ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <PageHeader
        title="Propuestas"
        subtitle={`${meta.total} propuestas en total`}
        onNew={openNew}
        newLabel="Nueva propuesta"
      >
        <SearchBar value={search} onChange={setSearch} placeholder="Buscar por título o distrito..." className="w-64" />
      </PageHeader>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 size={24} className="animate-spin text-brand-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <FileText size={40} className="mb-3 opacity-30" />
          <p className="text-sm">No hay propuestas aún.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((p) => {
            const color = STATUS_COLORS[p.status] ?? "#6B7280";
            return (
              <div
                key={p.id}
                className="bg-white border border-gray-200 rounded-2xl shadow-sm hover:shadow-md transition-all duration-200 p-5 flex flex-col"
              >
                {p.image && (
                  <div
                    className="mb-3 rounded-xl overflow-hidden aspect-video bg-gray-100 cursor-pointer"
                    onClick={() => setPreview({ url: p.image!, title: p.title })}
                  >
                    <img src={p.image} alt="" className="w-full h-full object-cover hover:opacity-90 transition-opacity" />
                  </div>
                )}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div
                    className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: color + "18", border: `1px solid ${color}30` }}
                  >
                    <FileText size={15} style={{ color }} />
                  </div>
                  <Badge variant={p.status as any} />
                </div>
                <h3 className="font-semibold text-gray-900 text-sm leading-snug mb-1 line-clamp-2">{p.title}</h3>
                <p className="text-xs text-gray-500 leading-relaxed line-clamp-2 mb-3 flex-1">{p.description}</p>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {p.district && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-600 border border-gray-200 rounded-full text-xs">
                      <MapPin size={9} /> {p.district}
                    </span>
                  )}
                  <span className="px-2 py-0.5 bg-brand-50 text-brand-600 border border-brand-100 rounded-full text-xs capitalize">{p.topic}</span>
                  {p.budget && (
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-600 border border-gray-200 rounded-full text-xs">
                      S/ {Number(p.budget).toLocaleString()}
                    </span>
                  )}
                  {p.document_url && (
                    <button
                      onClick={() => setPreview({ url: p.document_url!, title: p.title })}
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-600 border border-blue-100 rounded-full text-xs hover:bg-blue-100 transition-colors"
                    >
                      <FileUp size={9} /> Doc
                    </button>
                  )}
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  <span className="text-[11px] text-gray-400">Prioridad #{p.priority}</span>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(p)}
                      className="p-2 rounded-lg text-gray-400 hover:text-brand-500 hover:bg-brand-50 transition-colors" title="Editar">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => setDeleteTarget(p)}
                      className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Eliminar">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && meta.last_page > 1 && (
        <div className="mt-6">
          <Pagination currentPage={page} lastPage={meta.last_page} total={meta.total} perPage={meta.per_page} onPage={load} />
        </div>
      )}

      <Modal open={modalOpen} onClose={closeModal} title={editing ? "Editar propuesta" : "Nueva propuesta"} size="xl">
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Título *" required value={form.title} onChange={set("title")}
              placeholder="Mejoramiento del sistema de agua..." className="col-span-2" />
            <FormField as="textarea" label="Descripción *" required value={form.description}
              onChange={set("description")} rows={3} placeholder="Descripción detallada..."
              className="col-span-2" />
            <FormField label="Distrito" value={form.district} onChange={set("district")} placeholder="San Miguel de Pallaques" />
            <FormField as="select" label="Tema *" required value={form.topic} onChange={set("topic")}
              options={topics.length > 0
                ? topics.map((t) => ({ value: t.name, label: `${t.emoji} ${t.label}` }))
                : ["agua","agricultura","vias","salud","educacion","seguridad","empleo","turismo"].map((t) => ({ value: t, label: t.charAt(0).toUpperCase() + t.slice(1) }))
              }
            />
            <FormField label="Presupuesto (S/)" type="number" value={form.budget} onChange={set("budget")} placeholder="0.00" />
            <FormField label="Prioridad (1–10)" type="number" value={form.priority} onChange={set("priority")} min="1" max="10" />
            <FormField as="select" label="Estado" value={form.status} onChange={set("status")} options={STATUSES} className="col-span-2" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <DropZone
              label="Imagen de la propuesta"
              accept="image/jpeg,image/png,image/webp,image/gif"
              hint="JPG, PNG, WebP · máx. 8 MB"
              icon={<ImageIcon size={18} />}
              currentUrl={form.image}
              file={imgFile}
              onFile={setImgFile}
              onClearUrl={() => setForm(p => ({ ...p, image: "" }))}
              isImage
            />
            <DropZone
              label="Documento adjunto"
              accept=".pdf,.doc,.docx,.xlsx,.pptx"
              hint="PDF, Word, Excel · máx. 20 MB"
              icon={<FileUp size={18} />}
              currentUrl={form.document_url}
              file={docFile}
              onFile={setDocFile}
              onClearUrl={() => setForm(p => ({ ...p, document_url: "" }))}
            />
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
              {editing ? "Guardar cambios" : "Crear propuesta"}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="¿Eliminar propuesta?"
        message={`Se eliminará "${deleteTarget?.title}" de forma permanente.`}
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <FilePreviewModal
        open={!!preview}
        onClose={() => setPreview(null)}
        url={preview?.url ?? ""}
        title={preview?.title}
      />
    </div>
  );
}
