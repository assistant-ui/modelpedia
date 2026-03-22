"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownTrigger,
} from "./ui/dropdown";

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
          {mounted ? (
            resolvedTheme === "light" ? (
              "☀"
            ) : (
              "☽"
            )
          ) : (
            <span className="opacity-0">☽</span>
          )}
        </button>
      </DropdownTrigger>
      <DropdownContent>
        <DropdownItem onSelect={() => setTheme("light")}>
          <span className="flex-1 text-sm">Light</span>
          {mounted && theme === "light" && (
            <span className="text-foreground text-xs">✓</span>
          )}
        </DropdownItem>
        <DropdownItem onSelect={() => setTheme("dark")}>
          <span className="flex-1 text-sm">Dark</span>
          {mounted && theme === "dark" && (
            <span className="text-foreground text-xs">✓</span>
          )}
        </DropdownItem>
        <DropdownItem onSelect={() => setTheme("system")}>
          <span className="flex-1 text-sm">System</span>
          {mounted && theme === "system" && (
            <span className="text-foreground text-xs">✓</span>
          )}
        </DropdownItem>
      </DropdownContent>
    </Dropdown>
  );
}
