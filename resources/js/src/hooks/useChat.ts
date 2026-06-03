"use client";
import { useState, useCallback, useRef } from "react";
import type { Message } from "@/types/chat";
import { findMockResponse } from "@/lib/mockResponses";
import { resolveTenantSlug } from "@/lib/api";

const API_URL  = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";
const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === "true";

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const mockDelay = () => new Promise<void>((r) => setTimeout(r, 200 + Math.random() * 500));

function tenantHeaders(): Record<string, string> {
  const slug = resolveTenantSlug();
  return slug ? { "X-Tenant": slug } : {};
}

export function useChat(initialMessages: Message[] = []) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [sending, setSending]   = useState(false);
  const SESSION_KEY = `chat_session_${resolveTenantSlug() || "default"}`;
  const sessionId = useRef<string | undefined>(
    typeof window !== "undefined" ? (localStorage.getItem(SESSION_KEY) ?? undefined) : undefined
  );

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    const userMsg: Message = {
      id: uid(), role: "user", content: trimmed, timestamp: Date.now(),
    };
    const placeholderId = uid();
    const placeholder: Message = {
      id: placeholderId, role: "james", content: "", timestamp: Date.now(), pending: true,
    };

    setMessages((prev) => [...prev, userMsg, placeholder]);
    setSending(true);

    try {
      if (USE_MOCK) {
        await mockDelay();
        const mock = findMockResponse(trimmed);
        sessionId.current = sessionId.current ?? uid();
        setMessages((prev) =>
          prev.map((m) =>
            m.id === placeholderId
              ? { ...m, content: mock.reply, media: mock.media, topic: mock.topic, pending: false }
              : m
          )
        );
        return;
      }

      // ── Intentar streaming SSE ────────────────────────────────────
      const streamed = await sendStreaming(trimmed, placeholderId, setMessages);

      if (streamed) return;

      // ── Fallback: petición normal (sin streaming) ─────────────────
      const res = await fetch(`${API_URL}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...tenantHeaders(),
        },
        body: JSON.stringify({ message: trimmed, session_id: sessionId.current }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      sessionId.current = data.sessionId;

      setMessages((prev) =>
        prev.map((m) =>
          m.id === placeholderId
            ? { ...m, content: data.reply, media: data.media, topic: data.topic, pending: false }
            : m
        )
      );
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === placeholderId
            ? { ...m, content: "No se pudo conectar con el asistente. Por favor intenta de nuevo en unos momentos.", media: [], topic: undefined, pending: false }
            : m
        )
      );
    } finally {
      setSending(false);
    }

    // Helper: enviar mensaje con SSE y actualizar estado en tiempo real
    async function sendStreaming(
      message: string,
      msgId: string,
      update: typeof setMessages
    ): Promise<boolean> {
      try {
        const res = await fetch(`${API_URL}/chat/stream`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
            ...tenantHeaders(),
          },
          body: JSON.stringify({ message, session_id: sessionId.current }),
        });

        if (res.status === 429) {
          update((prev) =>
            prev.map((m) =>
              m.id === msgId
                ? { ...m, content: "Estás enviando mensajes muy rápido. Espera unos segundos e intenta de nuevo.", media: [], pending: false }
                : m
            )
          );
          return true;
        }

        if (!res.ok || !res.body) return false;

        const reader  = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer    = "";

        // Convertir pending → false en el primer chunk
        let firstChunk = true;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Procesar líneas SSE completas
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;

            const payload = JSON.parse(line.slice(6));

            if (payload.chunk !== undefined) {
              const chunk = payload.chunk as string;
              update((prev) =>
                prev.map((m) => {
                  if (m.id !== msgId) return m;
                  return {
                    ...m,
                    content: (firstChunk ? "" : m.content) + chunk,
                    pending: false,
                  };
                })
              );
              firstChunk = false;
            }

            if (payload.done) {
              const newId = payload.sessionId ?? sessionId.current;
              sessionId.current = newId;
              if (newId) localStorage.setItem(SESSION_KEY, newId);
              update((prev) =>
                prev.map((m) =>
                  m.id === msgId
                    ? { ...m, media: payload.media ?? [], topic: payload.topic ?? null, pending: false }
                    : m
                )
              );
            }
          }
        }

        return true;
      } catch {
        return false;
      }
    }

  }, [sending]);

  return { messages, sending, sendMessage, setMessages };
}
