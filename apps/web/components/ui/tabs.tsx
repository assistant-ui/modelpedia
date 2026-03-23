"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  className,
}: {
  items: readonly T[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const indicator = indicatorRef.current;
    if (!container || !indicator) return;

    const idx = items.indexOf(value);
    const button = container.querySelectorAll<HTMLButtonElement>("button")[idx];
    if (!button) return;

    const containerRect = container.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    indicator.style.left = `${buttonRect.left - containerRect.left}px`;
    indicator.style.width = `${buttonRect.width}px`;
  }, [value, items]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative flex gap-0.5 rounded bg-muted p-0.5 ring-1 ring-border",
        className,
      )}
    >
      <div
        ref={indicatorRef}
        className="absolute top-0.5 bottom-0.5 rounded bg-background shadow-sm ring-1 ring-border transition-all duration-200 ease-in-out"
      />
      {items.map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => onChange(item)}
          className={cn(
            "relative z-10 rounded px-1.5 py-0.5 font-mono text-xs transition-colors duration-200",
            value === item
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {item}
        </button>
      ))}
    </div>
  );
}
