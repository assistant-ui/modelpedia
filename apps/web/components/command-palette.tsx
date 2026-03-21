"use client";

import { Command } from "cmdk";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

interface SearchItem {
  type: "model" | "provider" | "page";
  id: string;
  name: string;
  href: string;
  sub?: string;
  icon?: string;
}

export function CommandPalette({
  pages,
  providers,
  models,
}: {
  pages: SearchItem[];
  providers: SearchItem[];
  models: SearchItem[];
}) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();
  const closingRef = useRef(false);

  function open() {
    if (closingRef.current) return;
    setMounted(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setVisible(true));
    });
  }

  function close() {
    if (closingRef.current) return;
    closingRef.current = true;
    setVisible(false);
    setTimeout(() => {
      setMounted(false);
      setQuery("");
      closingRef.current = false;
    }, 200);
  }

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (mounted) close();
        else open();
      }
      if (e.key === "Escape" && mounted) {
        e.preventDefault();
        close();
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [mounted]);

  const filteredPages = useMemo(() => {
    if (!query) return [];
    const q = query.toLowerCase();
    return pages.filter((p) => p.name.toLowerCase().includes(q));
  }, [query, pages]);

  const filteredProviders = useMemo(() => {
    if (!query) return [];
    const q = query.toLowerCase();
    return providers.filter((p) => p.name.toLowerCase().includes(q));
  }, [query, providers]);

  // Official/direct providers rank higher than aggregators
  const OFFICIAL_PROVIDERS = new Set([
    "openai", "anthropic", "google", "mistral", "deepseek", "xai",
    "cohere", "meta", "zhipu", "minimax", "alibaba", "qwen",
  ]);

  // Only search models when query is 2+ chars
  const filteredModels = useMemo(() => {
    if (query.length < 2) return [];
    const q = query.toLowerCase();
    const results: { item: SearchItem; score: number }[] = [];
    for (const m of models) {
      const target = `${m.name} ${m.sub ?? ""} ${m.id}`.toLowerCase();
      if (target.includes(q)) {
        let score =
          target.indexOf(q) === 0 ? 20 : target.includes(` ${q}`) ? 10 : 0;
        // Boost official providers
        const provider = m.href.split("/")[1];
        if (OFFICIAL_PROVIDERS.has(provider)) score += 5;
        // Boost exact name match
        if (m.name.toLowerCase() === q) score += 30;
        results.push({ item: m, score });
      }
    }
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
      .map((r) => r.item);
  }, [query, models]);

  function select(href: string) {
    close();
    setTimeout(() => router.push(href), 200);
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="flex items-center gap-2 rounded-md px-2 py-1 text-muted-foreground text-xs transition-colors duration-200 hover:text-foreground"
      >
        <Search size={14} />
        <kbd className="hidden rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline">
          ⌘K
        </kbd>
      </button>

      {mounted && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]"
          onClick={close}
        >
          <div
            className={`fixed inset-0 bg-background/80 transition-opacity duration-200 ${visible ? "opacity-100" : "opacity-0"}`}
          />
          <div
            className={`relative mx-4 w-full max-w-lg transition-all duration-200 ${visible ? "scale-100 opacity-100" : "scale-95 opacity-0"}`}
            onClick={(e) => e.stopPropagation()}
          >
            <Command
              className="overflow-hidden rounded-lg bg-background shadow-2xl ring-1 ring-border"
              shouldFilter={false}
            >
              <div className="flex items-center border-border border-b px-3">
                <Search size={14} className="shrink-0 text-muted-foreground" />
                <Command.Input
                  placeholder="Search models, providers..."
                  className="flex-1 bg-transparent px-3 py-3 text-foreground text-sm placeholder-muted-foreground outline-none"
                  value={query}
                  onValueChange={setQuery}
                  autoFocus
                />
              </div>
              <Command.List className="h-72 overflow-y-auto p-2">
                {query.length > 0 &&
                  filteredModels.length === 0 &&
                  filteredProviders.length === 0 &&
                  filteredPages.length === 0 && (
                    <div className="flex h-full items-center justify-center text-muted-foreground text-xs">
                      No results found.
                    </div>
                  )}

                {!query && (
                  <>
                    <Command.Group
                      heading="Pages"
                      className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:text-xs"
                    >
                      {pages.map((item) => (
                        <Command.Item
                          key={item.id}
                          value={item.name}
                          onSelect={() => select(item.href)}
                          className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-foreground text-sm aria-selected:bg-accent"
                        >
                          {item.name}
                        </Command.Item>
                      ))}
                    </Command.Group>
                    <Command.Group
                      heading="Providers"
                      className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:text-xs"
                    >
                      {providers.map((item) => (
                        <Command.Item
                          key={item.id}
                          value={item.name}
                          onSelect={() => select(item.href)}
                          className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm aria-selected:bg-accent"
                        >
                          {item.icon && (
                            <span
                              className="flex h-4 w-4 shrink-0 items-center justify-center text-foreground [&>svg]:h-full [&>svg]:w-full"
                              dangerouslySetInnerHTML={{ __html: item.icon }}
                            />
                          )}
                          <span className="text-foreground">{item.name}</span>
                        </Command.Item>
                      ))}
                    </Command.Group>
                  </>
                )}

                {filteredPages.length > 0 && (
                  <Command.Group
                    heading="Pages"
                    className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:text-xs"
                  >
                    {filteredPages.map((item) => (
                      <Command.Item
                        key={item.id}
                        value={item.name}
                        onSelect={() => select(item.href)}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-foreground text-sm aria-selected:bg-accent"
                      >
                        {item.name}
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}

                {filteredProviders.length > 0 && (
                  <Command.Group
                    heading="Providers"
                    className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:text-xs"
                  >
                    {filteredProviders.map((item) => (
                      <Command.Item
                        key={item.id}
                        value={item.name}
                        onSelect={() => select(item.href)}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm aria-selected:bg-accent"
                      >
                        {item.icon && (
                          <span
                            className="flex h-4 w-4 shrink-0 items-center justify-center text-foreground [&>svg]:h-full [&>svg]:w-full"
                            dangerouslySetInnerHTML={{ __html: item.icon }}
                          />
                        )}
                        <span className="text-foreground">{item.name}</span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}

                {filteredModels.length > 0 && (
                  <Command.Group
                    heading="Models"
                    className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:text-xs"
                  >
                    {filteredModels.map((item) => (
                      <Command.Item
                        key={item.id}
                        value={item.id}
                        onSelect={() => select(item.href)}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm aria-selected:bg-accent"
                      >
                        {item.icon && (
                          <span
                            className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-foreground [&>svg]:h-full [&>svg]:w-full"
                            dangerouslySetInnerHTML={{ __html: item.icon }}
                          />
                        )}
                        <span className="min-w-0 flex-1 truncate text-foreground">
                          {item.name}
                        </span>
                        <span className="shrink-0 font-mono text-muted-foreground text-xs">
                          {item.sub}
                        </span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}
              </Command.List>
            </Command>
          </div>
        </div>
      )}
    </>
  );
}
