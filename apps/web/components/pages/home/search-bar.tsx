"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { ProviderIcon } from "@/components/shared/provider-icon";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/cn";
import { multiSearch } from "@/lib/search";

interface SearchItem {
  id: string;
  name: string;
  href: string;
  sub: string;
  icon?: string;
  type: "model" | "provider";
  providerType?: string;
}

export function SearchBar({ items }: { items: SearchItem[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);

  const results = useMemo(() => {
    if (query.trim().length < 2) return [];
    return multiSearch(items, query, {
      target: (item) => `${item.name} ${item.sub} ${item.id}`,
      bonus: (item) => {
        if (item.type === "provider") return 10;
        if (item.providerType === "direct") return 5;
        if (item.providerType === "cloud") return 2;
        return 0;
      },
      limit: 8,
    });
  }, [items, query]);

  const showDropdown = focused && query.trim().length >= 2;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (q) {
      router.push(`/models?q=${encodeURIComponent(q)}`);
      inputRef.current?.blur();
    }
  }

  function clear() {
    setQuery("");
    inputRef.current?.focus();
  }

  return (
    <div className="relative">
      <form onSubmit={handleSubmit}>
        <div className="relative">
          <Input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            placeholder="Search models..."
          />
          <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center gap-1.5">
            {query ? (
              <button
                type="button"
                className="pointer-events-auto rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                onClick={clear}
                tabIndex={-1}
              >
                <X size={14} />
              </button>
            ) : (
              <Kbd className="text-[10px]">/</Kbd>
            )}
          </div>
        </div>
      </form>

      <div
        className={cn(
          "absolute top-full right-0 left-0 z-30 mt-1 origin-top overflow-hidden rounded-md bg-muted ring-1 ring-border transition-all duration-150",
          showDropdown && results.length > 0
            ? "scale-y-100 opacity-100"
            : "pointer-events-none scale-y-95 opacity-0",
        )}
      >
        {results.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className="flex items-center gap-2.5 px-3 py-2 text-sm transition-colors duration-150 hover:bg-accent"
          >
            <ProviderIcon
              provider={item.icon ? { icon: item.icon } : null}
              size={14}
            />
            <span className="truncate text-foreground">{item.name}</span>
            <span className="ml-auto shrink-0 text-muted-foreground text-xs">
              {item.sub}
            </span>
          </Link>
        ))}
        {query.trim().length >= 2 && (
          <div className="border-border border-t px-3 py-2 text-muted-foreground text-xs">
            Press <Kbd className="text-[10px]">Enter</Kbd> for all results
          </div>
        )}
      </div>
    </div>
  );
}
