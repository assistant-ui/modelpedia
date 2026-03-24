"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/cn";
import { multiSearch } from "@/lib/search";

interface SearchItem {
  type: "model" | "provider" | "page";
  id: string;
  name: string;
  href: string;
  sub?: string;
  icon?: string;
}

function ItemIcon({ html, size }: { html: string; size: string }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center text-foreground [&>svg]:h-full [&>svg]:w-full",
        size,
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function CommandPalette({
  pages,
  providers,
}: {
  pages: SearchItem[];
  providers: SearchItem[];
}) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState("");
  const [modelResults, setModelResults] = useState<SearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const closingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const open = useCallback(() => {
    if (closingRef.current) return;
    setMounted(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setVisible(true));
    });
  }, []);

  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setVisible(false);
    setTimeout(() => {
      setMounted(false);
      setQuery("");
      setModelResults([]);
      closingRef.current = false;
    }, 200);
  }, []);

  useEffect(() => {
    function down(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (mounted) close();
        else open();
      }
      if (e.key === "/" && !mounted) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if ((e.target as HTMLElement)?.isContentEditable) return;
        // Let SearchBar handle "/" on the home page
        const searchInput = document.querySelector<HTMLInputElement>(
          'input[placeholder="Search models..."]',
        );
        if (searchInput) {
          e.preventDefault();
          searchInput.focus();
          return;
        }
        e.preventDefault();
        open();
      }
      if (e.key === "Escape" && mounted) {
        e.preventDefault();
        close();
      }
    }
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [mounted, close, open]);

  // Fetch model results from API when query changes
  useEffect(() => {
    if (query.length < 2) {
      setModelResults([]);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    fetch(`/api/search?q=${encodeURIComponent(query)}`, {
      signal: controller.signal,
    })
      .then((res) => res.json())
      .then((data) => {
        if (!controller.signal.aborted) {
          setModelResults(data.models ?? []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [query]);

  const filteredPages = useMemo(
    () => (query ? multiSearch(pages, query, { target: (p) => p.name }) : []),
    [query, pages],
  );

  const filteredProviders = useMemo(
    () =>
      query ? multiSearch(providers, query, { target: (p) => p.name }) : [],
    [query, providers],
  );

  function select(href: string) {
    close();
    setTimeout(() => router.push(href), 200);
  }

  const hasResults =
    filteredPages.length > 0 ||
    filteredProviders.length > 0 ||
    modelResults.length > 0;

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="inline-flex items-center justify-center rounded-md p-1 text-muted-foreground transition-colors duration-200 hover:bg-accent hover:text-foreground"
      >
        <Search size={16} />
      </button>

      {mounted && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          onClick={close}
        >
          <div
            className={cn(
              "fixed inset-0 bg-background/80 transition-opacity duration-200",
              visible ? "opacity-100" : "opacity-0",
            )}
          />
          <div
            className={cn(
              "relative mx-4 w-full max-w-lg transition-all duration-200",
              visible ? "scale-100 opacity-100" : "scale-95 opacity-0",
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <Command shouldFilter={false}>
              <CommandInput
                placeholder="Search models, providers..."
                value={query}
                onValueChange={setQuery}
                autoFocus
              />
              <CommandList>
                {query.length > 0 && !hasResults && !loading && (
                  <CommandEmpty>No results found.</CommandEmpty>
                )}

                {!query && (
                  <>
                    <CommandGroup heading="Pages">
                      {pages.map((item) => (
                        <CommandItem
                          key={item.id}
                          value={item.name}
                          onSelect={() => select(item.href)}
                        >
                          {item.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                    <CommandGroup heading="Providers">
                      {providers.map((item) => (
                        <CommandItem
                          key={item.id}
                          value={item.name}
                          onSelect={() => select(item.href)}
                        >
                          {item.icon && (
                            <ItemIcon html={item.icon} size="h-4 w-4" />
                          )}
                          {item.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </>
                )}

                {filteredPages.length > 0 && (
                  <CommandGroup heading="Pages">
                    {filteredPages.map((item) => (
                      <CommandItem
                        key={item.id}
                        value={item.name}
                        onSelect={() => select(item.href)}
                      >
                        {item.name}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}

                {filteredProviders.length > 0 && (
                  <CommandGroup heading="Providers">
                    {filteredProviders.map((item) => (
                      <CommandItem
                        key={item.id}
                        value={item.name}
                        onSelect={() => select(item.href)}
                      >
                        {item.icon && (
                          <ItemIcon html={item.icon} size="h-4 w-4" />
                        )}
                        {item.name}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}

                {modelResults.length > 0 && (
                  <CommandGroup heading="Models">
                    {modelResults.map((item) => (
                      <CommandItem
                        key={item.id}
                        value={item.id}
                        onSelect={() => select(item.href)}
                      >
                        {item.icon && (
                          <ItemIcon html={item.icon} size="h-3.5 w-3.5" />
                        )}
                        <span className="min-w-0 flex-1 truncate">
                          {item.name}
                        </span>
                        <span className="shrink-0 font-mono text-muted-foreground text-xs">
                          {item.sub}
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
          </div>
        </div>
      )}
    </>
  );
}
