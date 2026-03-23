"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownTrigger,
} from "@/components/ui/dropdown";

const THEMES = ["light", "dark", "system"] as const;

function ThemeIcon({
  mounted,
  resolvedTheme,
}: {
  mounted: boolean;
  resolvedTheme?: string;
}) {
  if (!mounted) return <span className="opacity-0">☽</span>;
  return <>{resolvedTheme === "light" ? "☀" : "☽"}</>;
}

export function ThemeToggle() {
  const { setTheme, theme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  return (
    <Dropdown>
      <DropdownTrigger>
        <button
          className="text-base text-muted-foreground leading-none transition-colors duration-200 hover:text-foreground"
          title="Settings"
        >
          <ThemeIcon mounted={mounted} resolvedTheme={resolvedTheme} />
        </button>
      </DropdownTrigger>
      <DropdownContent>
        {THEMES.map((t) => (
          <DropdownItem key={t} onSelect={() => setTheme(t)}>
            <span className="flex-1 text-sm capitalize">{t}</span>
            {mounted && theme === t && (
              <span className="text-foreground text-xs">✓</span>
            )}
          </DropdownItem>
        ))}
      </DropdownContent>
    </Dropdown>
  );
}
