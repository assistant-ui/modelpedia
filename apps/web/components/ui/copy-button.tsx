"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";

export function CopyButton({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center justify-center rounded-md p-1 text-muted-foreground transition-colors duration-200 hover:bg-accent hover:text-foreground",
        className,
      )}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}
