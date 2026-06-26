/**
 * lib/surveysDB.ts
 * Almacenamiento local offline-first para el módulo de encuestas de campaña.
 * Usa IndexedDB nativo (sin dependencias) — el celular acumula respuestas sin
 * internet y luego se sincronizan en lote vía adminApi.surveys.sync().
 *
 * Cada respuesta lleva un client_uuid generado aquí para deduplicar en el
 * servidor: reenviar el mismo lote no duplica votos.
 */

const DB_NAME = "politicos_surveys";
const DB_VERSION = 1;
const STORE_JOURNEYS = "journeys";
const STORE_RESPONSES = "responses";

export type LocalJourney = {
  client_uuid: string;
  place: string;
  district: string | null;
  province: string | null;
  surveyed_on: string; // YYYY-MM-DD
};

export type VoteIntention = "si" | "no" | "indeciso";

export type LocalResponse = {
  client_uuid: string;
  journey_uuid: string;          // FK local → LocalJourney.client_uuid
  vote_intention: VoteIntention; // único obligatorio
  knew_proposal: boolean | null; // ¿conocía la propuesta? (opcional)
  consent: boolean;              // si false → no se envían datos personales
  name: string | null;
  phone: string | null;
  dni: string | null;
  age: number | null;
  sex: "M" | "F" | "otro" | null;
  captured_at: string;           // ISO
  synced: 0 | 1;                 // 0 = pendiente de sincronizar
};

export function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Fallback simple
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_JOURNEYS)) {
        db.createObjectStore(STORE_JOURNEYS, { keyPath: "client_uuid" });
      }
      if (!db.objectStoreNames.contains(STORE_RESPONSES)) {
        const store = db.createObjectStore(STORE_RESPONSES, { keyPath: "client_uuid" });
        store.createIndex("by_journey", "journey_uuid", { unique: false });
        store.createIndex("by_synced", "synced", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      })
  );
}

function getAll<T>(store: string): Promise<T[]> {
  return tx<T[]>(store, "readonly", (s) => s.getAll() as IDBRequest<T[]>);
}

// ─── Jornadas ──────────────────────────────────────────────────────────
export async function saveJourney(j: LocalJourney): Promise<void> {
  await tx(STORE_JOURNEYS, "readwrite", (s) => s.put(j));
}

export function getJourneys(): Promise<LocalJourney[]> {
  return getAll<LocalJourney>(STORE_JOURNEYS);
}

// ─── Respuestas ────────────────────────────────────────────────────────
export async function saveResponse(r: LocalResponse): Promise<void> {
  await tx(STORE_RESPONSES, "readwrite", (s) => s.put(r));
}

export function getResponses(): Promise<LocalResponse[]> {
  return getAll<LocalResponse>(STORE_RESPONSES);
}

export async function getPendingResponses(): Promise<LocalResponse[]> {
  const all = await getResponses();
  return all.filter((r) => r.synced === 0);
}

export async function countByJourney(journeyUuid: string): Promise<number> {
  const all = await getResponses();
  return all.filter((r) => r.journey_uuid === journeyUuid).length;
}

export async function markSynced(clientUuids: string[]): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(STORE_RESPONSES, "readwrite");
    const store = t.objectStore(STORE_RESPONSES);
    clientUuids.forEach((id) => {
      const get = store.get(id);
      get.onsuccess = () => {
        const r = get.result as LocalResponse | undefined;
        if (r) {
          r.synced = 1;
          store.put(r);
        }
      };
    });
    t.oncomplete = () => { db.close(); resolve(); };
    t.onerror = () => reject(t.error);
  });
}

// Limpia respuestas ya sincronizadas (libera espacio en el dispositivo)
export async function purgeSynced(): Promise<void> {
  const all = await getResponses();
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(STORE_RESPONSES, "readwrite");
    const store = t.objectStore(STORE_RESPONSES);
    all.filter((r) => r.synced === 1).forEach((r) => store.delete(r.client_uuid));
    t.oncomplete = () => { db.close(); resolve(); };
    t.onerror = () => reject(t.error);
  });
}
