"use client";

import { useEffect, useRef, useState } from "react";
import { ProviderIcon } from "@/components/provider-icon";
import { PROVIDER_TIER } from "@/lib/constants";
import { multiSearch } from "@/lib/search";

interface PickerModel {
  id: string;
  name: string;
  provider: string;
  providerName: string;
  providerIcon?: string;
}

export function ModelPicker({
  models,
  selected,
  onSelect,
  label,
}: {
  models: PickerModel[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(null);

  const current = selected
    ? models.find((m) => `${m.provider}/${m.id}` === selected)
    : null;

  const filtered = query
    ? multiSearch(models, query, {
        target: (m) => `${m.providerName} ${m.name} ${m.id}`,
        bonus: (m) => PROVIDER_TIER[m.provider] ?? 0,
        limit: 30,
      })
    : [];

  function show() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setVisible(true);
    requestAnimationFrame(() => {
      setOpen(true);
      inputRef.current?.focus();
    });
  }

  function hide() {
    setOpen(false);
    timeoutRef.current = setTimeout(() => {
      setVisible(false);
      setQuery("");
    }, 150);
  }

  useEffect(() => {
    if (!visible) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) hide();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [visible, hide]);

  function select(key: string | null) {
    onSelect(key);
    hide();
  }

  return (
    <div className="relative flex-1" ref={ref}>
      <button
        onClick={show}
        className="flex w-full items-center gap-2 rounded-md bg-muted px-3 py-2.5 text-left text-sm ring-1 ring-border transition-colors duration-200 hover:bg-accent"
      >
        {current ? (
          <span className="flex min-w-0 items-center gap-2 truncate text-foreground">
            <ProviderIcon
              provider={
                current.providerIcon ? { icon: current.providerIcon } : null
              }
              size={14}
            />
            {current.name}
          </span>
        ) : (
          <span className="text-muted-foreground">{label}</span>
        )}
      </button>
      {visible && (
        <div
          className={`absolute top-12 right-0 left-0 z-20 origin-top overflow-hidden rounded-md bg-muted ring-1 ring-border transition-all duration-150 ${
            open
              ? "scale-100 opacity-100"
              : "pointer-events-none scale-95 opacity-0"
          }`}
        >
          <div className="p-2">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search models..."
              className="w-full rounded-md bg-background px-3 py-2 text-foreground text-sm placeholder-muted-foreground ring-1 ring-border transition-[box-shadow,ring-color] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="max-h-60 overflow-y-auto overscroll-contain">
            {selected && (
              <button
                onClick={() => select(null)}
                className="w-full px-3 py-2 text-left text-muted-foreground text-xs transition-colors duration-200 hover:bg-accent"
              >
                Clear selection
              </button>
            )}
            {query && filtered.length === 0 && (
              <div className="px-3 py-4 text-center text-muted-foreground text-xs">
                No models found
              </div>
            )}
            {filtered.map((m) => {
              const key = `${m.provider}/${m.id}`;
              return (
                <button
                  key={key}
                  onClick={() => select(key)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors duration-200 hover:bg-accent ${
                    key === selected ? "bg-accent" : ""
                  }`}
                >
                  <ProviderIcon
                    provider={m.providerIcon ? { icon: m.providerIcon } : null}
                    size={13}
                  />
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-foreground">
                      {m.name}
                    </span>
                    <span className="block truncate font-mono text-muted-foreground text-xs">
                      {m.id}
                    </span>
                  </div>
                </button>
              );
            })}
            {!query && (
              <div className="px-3 py-4 text-center text-muted-foreground text-xs">
                Type to search
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
