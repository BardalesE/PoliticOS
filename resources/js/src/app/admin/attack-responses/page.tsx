"use client";
import { PlanGate } from "@/components/admin/PlanGate";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { request } from "@/lib/api";
import { PageHeader } from "@/components/admin/PageHeader";
import { EmptyState } from "@/components/admin/EmptyState";
import { Shield } from "lucide-react";

const adminGet  = (token: string, path: string) =>
  request<any>(`/admin${path}`, {}, token);
const adminPost = (token: string, path: string, data: unknown) =>
  request<any>(`/admin${path}`, { method: "POST", body: JSON.stringify(data) }, token);
const adminPut  = (token: string, path: string, data: unknown) =>
  request<any>(`/admin${path}`, { method: "PUT", body: JSON.stringify(data) }, token);
const adminDel  = (token: string, path: string) =>
  request<any>(`/admin${path}`, { method: "DELETE" }, token);

interface AttackResponse {
  id: number;
  attack_keyword: string;
  synonyms: string[];
  attack_category: string;
  response_template: string;
  deflection_topic?: string;
  priority: number;
  is_active: boolean;
  times_used: number;
}

const CATEGORIES = ["personal","partido","pasado","propuesta","rival","otro"];

function AttackResponsesPageInner() {
  const { token } = useAuth();
  const [items, setItems] = useState<AttackResponse[]>([]);
  const [editing, setEditing] = useState<Partial<AttackResponse> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (token) load(); }, [token]);

  const load = async () => {
    setLoading(true);
    const r = await adminGet(token!, "/attack-responses");
    setItems(r.data || r);
    setLoading(false);
  };

  const save = async () => {
    if (!editing) return;
    const payload = { ...editing, synonyms: editing.synonyms || [] };
    if (editing.id) {
      await adminPut(token!, `/attack-responses/${editing.id}`, payload);
    } else {
      await adminPost(token!, "/attack-responses", payload);
    }
    setEditing(null);
    load();
  };

  const remove = async (id: number) => {
    if (!confirm("¿Eliminar esta respuesta? La IA dejará de usarla.")) return;
    await adminDel(token!, `/attack-responses/${id}`);
    load();
  };

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <PageHeader
        title="Respuestas a Ataques"
        subtitle="Plantillas que la IA usa cuando detecta un ataque al candidato"
        onNew={() => setEditing({ priority: 50, attack_category: "otro", synonyms: [], is_active: true })}
        newLabel="Nueva"
      />

      {loading ? (
        <p className="text-gray-500">Cargando...</p>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Shield}
          title="Sin respuestas configuradas"
          message="Crea plantillas de respuesta para que la IA sepa cómo reaccionar ante ataques al candidato."
          className="bg-white border border-gray-200 rounded-2xl py-16"
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {items.map((r) => (
            <div key={r.id} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h3 className="font-bold text-gray-900">{r.attack_keyword}</h3>
                  <div className="flex gap-1 mt-1 flex-wrap">
                    <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                      {r.attack_category}
                    </span>
                    {r.deflection_topic && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                        → {r.deflection_topic}
                      </span>
                    )}
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                      P{r.priority}
                    </span>
                    {r.is_active ? (
                      <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">ON</span>
                    ) : (
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">OFF</span>
                    )}
                  </div>
                </div>
                <div className="text-xs text-gray-400">{r.times_used} usos</div>
              </div>
              <p className="text-xs text-gray-600 line-clamp-3 mb-2">{r.response_template}</p>
              <div className="flex gap-2">
                <button onClick={() => setEditing(r)} className="text-xs text-blue-600 hover:underline">Editar</button>
                <button onClick={() => remove(r.id)} className="text-xs text-red-600 hover:underline">Borrar</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-5">
            <h2 className="font-bold text-lg mb-4">{editing.id ? "Editar" : "Nueva"} respuesta</h2>

            <label className="text-xs font-medium text-gray-700">Keyword principal (detecta el ataque)</label>
            <input
              type="text"
              value={editing.attack_keyword || ""}
              onChange={(e) => setEditing({ ...editing, attack_keyword: e.target.value })}
              className="w-full mt-1 mb-3 border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="ej: corrupcion"
            />

            <label className="text-xs font-medium text-gray-700">Sinónimos (separados por coma)</label>
            <input
              type="text"
              value={(editing.synonyms || []).join(", ")}
              onChange={(e) => setEditing({ ...editing, synonyms: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })}
              className="w-full mt-1 mb-3 border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="corrupto, coima, soborno"
            />

            <label className="text-xs font-medium text-gray-700">Categoría</label>
            <select
              value={editing.attack_category || "otro"}
              onChange={(e) => setEditing({ ...editing, attack_category: e.target.value })}
              className="w-full mt-1 mb-3 border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>

            <label className="text-xs font-medium text-gray-700">Tema al que redirigir (opcional)</label>
            <input
              type="text"
              value={editing.deflection_topic || ""}
              onChange={(e) => setEditing({ ...editing, deflection_topic: e.target.value })}
              className="w-full mt-1 mb-3 border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="ej: seguridad"
            />

            <label className="text-xs font-medium text-gray-700">Instrucción a la IA (qué hacer cuando detecte este ataque)</label>
            <textarea
              value={editing.response_template || ""}
              onChange={(e) => setEditing({ ...editing, response_template: e.target.value })}
              className="w-full mt-1 mb-3 border border-gray-300 rounded-lg px-3 py-2 text-sm h-32"
              placeholder="Reconoce la preocupación... no te defiendas atacando... redirige a propuestas concretas..."
            />

            <label className="text-xs font-medium text-gray-700">Prioridad (0-100, mayor primero)</label>
            <input
              type="number"
              value={editing.priority ?? 50}
              onChange={(e) => setEditing({ ...editing, priority: parseInt(e.target.value) })}
              className="w-full mt-1 mb-3 border border-gray-300 rounded-lg px-3 py-2 text-sm"
              min={0} max={100}
            />

            <label className="flex items-center gap-2 mb-4">
              <input
                type="checkbox"
                checked={editing.is_active ?? true}
                onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })}
              />
              <span className="text-sm text-gray-700">Activa</span>
            </label>

            <div className="flex gap-2 justify-end">
              <button onClick={() => setEditing(null)} className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg">
                Cancelar
              </button>
              <button onClick={save} className="px-4 py-2 text-sm bg-brand-600 hover:bg-brand-500 text-white rounded-lg font-semibold transition-colors">
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AttackResponsesPage() {
  return (
    <PlanGate feature="attack_responses">
      <AttackResponsesPageInner />
    </PlanGate>
  );
}
