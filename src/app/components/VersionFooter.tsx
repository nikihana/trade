"use client";

import { useState } from "react";

const VERSION = "v1.000035";

function parseChangelog(raw: string) {
  return raw.split(/^## /m).filter(Boolean).map((block) => {
    const [title, ...lines] = block.trim().split("\n");
    return {
      title: title.trim(),
      items: lines
        .map((l) => l.replace(/^- /, "").trim())
        .filter(Boolean),
    };
  });
}

export function VersionFooter() {
  const [open, setOpen] = useState(false);
  const [changelog, setChangelog] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleOpen() {
    setOpen(true);
    if (!changelog) {
      setLoading(true);
      try {
        const res = await fetch("/api/changelog");
        const data = await res.json();
        setChangelog(data.content || "");
      } catch {
        setChangelog("Failed to load changelog.");
      }
      setLoading(false);
    }
  }

  const entries = changelog ? parseChangelog(changelog) : [];

  return (
    <>
      {/* Footer */}
      <div className="flex items-center justify-center gap-2 py-4 text-xs text-zinc-600">
        <span className="font-mono">{VERSION}</span>
        <button
          onClick={handleOpen}
          className="w-5 h-5 rounded-full border border-zinc-700 text-zinc-500 hover:text-white hover:border-zinc-500 transition-colors flex items-center justify-center text-[10px] font-bold"
          aria-label="View changelog"
        >
          i
        </button>
      </div>

      {/* Modal */}
      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-zinc-900 border border-zinc-700 rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[70vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
              <h2 className="text-sm font-bold text-white">Changelog</h2>
              <button
                onClick={() => setOpen(false)}
                className="text-zinc-500 hover:text-white text-lg transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Scrollable content */}
            <div className="overflow-y-auto px-4 py-3 space-y-4">
              {loading ? (
                <p className="text-xs text-zinc-400 animate-pulse">Loading...</p>
              ) : entries.length > 0 ? (
                entries.map((entry, i) => (
                  <div key={i}>
                    <h3 className="text-xs font-bold text-blue-400 mb-1">
                      {entry.title}
                    </h3>
                    <ul className="space-y-0.5">
                      {entry.items.map((item, j) => (
                        <li
                          key={j}
                          className="text-xs text-zinc-400 pl-3 relative before:content-['·'] before:absolute before:left-0 before:text-zinc-600"
                        >
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              ) : (
                <p className="text-xs text-zinc-500">No changelog available.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
