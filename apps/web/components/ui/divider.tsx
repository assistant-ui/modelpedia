import { cn } from "@/lib/cn";

function Divider({ className }: { className?: string }) {
  return (
    <div
      role="separator"
      className={cn(
        "my-8 h-px bg-gradient-to-r from-transparent via-border to-transparent",
        className,
      )}
    />
  );
}

export { Divider };
