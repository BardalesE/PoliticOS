"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type PaginationProps = {
  currentPage: number;
  lastPage: number;
  total: number;
  perPage: number;
  onPage: (page: number) => void;
};

export function Pagination({ currentPage, lastPage, total, perPage, onPage }: PaginationProps) {
  if (lastPage <= 1) return null;

  const from = (currentPage - 1) * perPage + 1;
  const to   = Math.min(currentPage * perPage, total);

  const pages: (number | "...")[] = [];
  for (let i = 1; i <= lastPage; i++) {
    if (i === 1 || i === lastPage || Math.abs(i - currentPage) <= 1) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== "...") {
      pages.push("...");
    }
  }

  return (
    <div className="flex items-center justify-between gap-4 pt-4 border-t border-gray-100">
      <p className="text-xs text-gray-500">
        Mostrando {from}–{to} de {total}
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPage(currentPage - 1)}
          disabled={currentPage === 1}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft size={15} />
        </button>
        {pages.map((p, i) =>
          p === "..." ? (
            <span key={`ellipsis-${i}`} className="px-2 text-gray-400 text-sm">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onPage(p as number)}
              className={cn(
                "h-7 w-7 rounded-lg text-xs font-medium transition-colors",
                p === currentPage
                  ? "bg-brand-600 text-white"
                  : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
              )}
            >
              {p}
            </button>
          )
        )}
        <button
          onClick={() => onPage(currentPage + 1)}
          disabled={currentPage === lastPage}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}
