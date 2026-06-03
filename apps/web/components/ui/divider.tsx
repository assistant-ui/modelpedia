import { cn } from "@/lib/cn";

export function Divider({ className }: { className?: string }) {
  return (
    <div
      role="separator"
      className={cn(
        "via-border my-8 h-px bg-gradient-to-r from-transparent to-transparent",
        className,
      )}
    />
  );
}
