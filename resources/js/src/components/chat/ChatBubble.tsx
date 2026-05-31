"use client";
import { motion } from "framer-motion";
import { FileText, PlayCircle, MapPin } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Message, MediaAttachment } from "@/types/chat";

const mediaIcon = (t: MediaAttachment["type"]) =>
  t === "video" ? PlayCircle : t === "map" ? MapPin : FileText;

type Props = {
  msg: Message;
  candidateInitial?: string;
};

export function ChatBubble({ msg, candidateInitial = "J" }: Props) {
  const isUser = msg.role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}
    >
      {!isUser && (
        <div className="grid place-items-center h-9 w-9 rounded-full bg-brand-500 text-white
                        font-serif font-bold text-sm shrink-0 shadow-sm">
          {candidateInitial}
        </div>
      )}

      <div className={`max-w-[85%] sm:max-w-[75%] flex flex-col ${isUser ? "items-end" : "items-start"}`}>
        <div className={`
          rounded-2xl px-4 py-3 text-[15px] leading-relaxed
          ${isUser
            ? "bg-chat-500 text-white rounded-tr-md shadow-md shadow-chat-500/20"
            : "bg-white border border-gray-200 text-gray-800 rounded-tl-md shadow-sm"}
        `}>
          {msg.pending ? (
            <div className="flex items-center gap-1.5 py-1">
              <span className="h-2 w-2 rounded-full bg-chat-500 animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="h-2 w-2 rounded-full bg-chat-500 animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="h-2 w-2 rounded-full bg-chat-500 animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          ) : (
            <div className="[&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:mb-2 [&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:mb-2 [&_li]:leading-relaxed [&_strong]:font-semibold [&_em]:italic [&_code]:bg-black/10 [&_code]:px-1 [&_code]:rounded [&_code]:text-[13px] [&_code]:font-mono">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {msg.content}
              </ReactMarkdown>
              {!isUser && msg.content !== "" && msg.media === undefined && (
                <span className="inline-block w-0.5 h-4 bg-gray-400 ml-0.5 animate-pulse align-text-bottom" />
              )}
            </div>
          )}
        </div>

        {!msg.pending && msg.media && msg.media.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {msg.media.map((m, i) => {
              const Icon = mediaIcon(m.type);
              return (
                <motion.a
                  key={i}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.2 + i * 0.05 }}
                  href={m.url}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white
                             border border-gray-200 hover:border-brand-500/50
                             text-xs text-gray-600 hover:text-brand-600 transition-colors shadow-sm"
                >
                  <Icon size={14} className="text-brand-500" />
                  {m.title ?? m.type.toUpperCase()}
                </motion.a>
              );
            })}
          </div>
        )}
      </div>

      {isUser && (
        <div className="grid place-items-center h-9 w-9 rounded-full bg-ink-800 text-white text-xs shrink-0 font-semibold">
          Tú
        </div>
      )}
    </motion.div>
  );
}
