"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ProviderIcon } from "@/components/shared/provider-icon";
import { cn } from "@/lib/cn";
import { PROVIDER_TYPE_TIER } from "@/lib/constants";
import { getProvider } from "@/lib/data";
import { multiSearch } from "@/lib/search";

interface PickerModel {
  id: string;
  name: string;
  provider: string;
  providerName: string;
  providerIcon?: string;
}

function toIconProp(icon?: string) {
  return icon ? { icon } : null;
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
        bonus: (m) =>
          PROVIDER_TYPE_TIER[getProvider(m.provider)?.type ?? "direct"] ?? 0,
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

  const hide = useCallback(() => {
    setOpen(false);
    timeoutRef.current = setTimeout(() => {
      setVisible(false);
      setQuery("");
    }, 150);
  }, []);

  useEffect(() => {
    if (!visible) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) hide();
    }
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
        className="bg-muted ring-border hover:bg-accent flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm ring-1 transition-colors duration-200"
      >
        {current ? (
          <span className="text-foreground flex min-w-0 items-center gap-2 truncate">
            <ProviderIcon
              provider={toIconProp(current.providerIcon)}
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
          className={cn(
            "bg-muted ring-border absolute top-12 right-0 left-0 z-20 origin-top overflow-hidden rounded-md ring-1 transition-all duration-150",
            open
              ? "scale-100 opacity-100"
              : "pointer-events-none scale-95 opacity-0",
          )}
        >
          <div className="p-2">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search models..."
              className="bg-background text-foreground placeholder-muted-foreground ring-border focus-visible:ring-ring w-full rounded-md px-3 py-2 text-sm ring-1 transition-[box-shadow,ring-color] duration-200 focus-visible:ring-2 focus-visible:outline-none"
            />
          </div>
          <div className="max-h-60 overflow-y-auto overscroll-contain">
            {selected && (
              <button
                onClick={() => select(null)}
                className="text-muted-foreground hover:bg-accent w-full px-3 py-2 text-left text-xs transition-colors duration-200"
              >
                Clear selection
              </button>
            )}
            {query && filtered.length === 0 && (
              <div className="text-muted-foreground px-3 py-4 text-center text-xs">
                No models found
              </div>
            )}
            {filtered.map((m) => {
              const key = `${m.provider}/${m.id}`;
              return (
                <button
                  key={key}
                  onClick={() => select(key)}
                  className={cn(
                    "hover:bg-accent flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors duration-200",
                    key === selected && "bg-accent",
                  )}
                >
                  <ProviderIcon
                    provider={toIconProp(m.providerIcon)}
                    size={13}
                  />
                  <div className="min-w-0 flex-1">
                    <span className="text-foreground block truncate">
                      {m.name}
                    </span>
                    <span className="text-muted-foreground block truncate font-mono text-xs">
                      {m.id}
                    </span>
                  </div>
                </button>
              );
            })}
            {!query && (
              <div className="text-muted-foreground px-3 py-4 text-center text-xs">
                Type to search
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
