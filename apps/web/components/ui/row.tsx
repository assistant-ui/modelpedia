"use client";

import type { ReactNode } from "react";
import { toastManager } from "@/components/ui/toast";
import { cn } from "@/lib/cn";

export function Row({
  label,
  value,
  href,
  mono,
  copyValue,
  className,
}: {
  label: string;
  value: ReactNode;
  href?: string;
  mono?: boolean;
  copyValue?: string;
  className?: string;
}) {
  const valCls = cn(mono && "font-mono", "text-foreground");

  function handleCopy() {
    if (!copyValue) return;
    navigator.clipboard.writeText(copyValue).then(() => {
      toastManager.add({ title: "Copied to clipboard", timeout: 1500 });
    });
  }

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 border-border border-t px-4 py-2.5 text-sm first:border-t-0",
        className,
      )}
    >
      <span className="shrink-0 text-muted-foreground">{label}</span>
      {href ? (
        <a
          href={href}
          {...(href.startsWith("http") && {
            target: "_blank",
            rel: "noopener noreferrer",
          })}
          className={cn(
            valCls,
            "truncate transition-colors duration-200 hover:text-foreground/70",
          )}
        >
          {value}
        </a>
      ) : copyValue ? (
        <button
          type="button"
          onClick={handleCopy}
          className={cn(
            valCls,
            "cursor-pointer truncate transition-colors duration-200 hover:text-foreground/70",
          )}
          title="Click to copy"
        >
          {value}
        </button>
      ) : (
        <span className={cn(valCls, "truncate")}>{value}</span>
      )}
    </div>
  );
}
