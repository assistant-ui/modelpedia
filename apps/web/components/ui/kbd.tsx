import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function Kbd({ className, ...props }: ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "border-border bg-muted text-muted-foreground inline-flex h-5 items-center justify-center rounded border px-1.5 font-mono text-[10px]",
        className,
      )}
      {...props}
    />
  );
}
