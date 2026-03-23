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
import { PROVIDER_TYPE_TIER } from "@/lib/constants";
import { getProvider } from "@/lib/data";
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
      if (e.key === "Escape" && mounted) {
        e.preventDefault();
        close();
      }
    }
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [mounted, close, open]);

  const filteredPages = useMemo(
    () => (query ? multiSearch(pages, query, { target: (p) => p.name }) : []),
    [query, pages],
  );

  const filteredProviders = useMemo(
    () =>
      query ? multiSearch(providers, query, { target: (p) => p.name }) : [],
    [query, providers],
  );

  const filteredModels = useMemo(
    () =>
      query.length < 2
        ? []
        : multiSearch(models, query, {
            target: (m) => `${m.name} ${m.sub ?? ""} ${m.id}`,
            bonus: (m) => {
              let b = 0;
              if (m.name.toLowerCase() === query.toLowerCase()) b += 30;
              const provider = m.href.split("/")[1];
              b +=
                PROVIDER_TYPE_TIER[getProvider(provider)?.type ?? "direct"] ??
                0;
              return b;
            },
            limit: 20,
          }),
    [query, models],
  );

  function select(href: string) {
    close();
    setTimeout(() => router.push(href), 200);
  }

  const hasResults =
    filteredPages.length > 0 ||
    filteredProviders.length > 0 ||
    filteredModels.length > 0;

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
                {query.length > 0 && !hasResults && (
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

                {filteredModels.length > 0 && (
                  <CommandGroup heading="Models">
                    {filteredModels.map((item) => (
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
