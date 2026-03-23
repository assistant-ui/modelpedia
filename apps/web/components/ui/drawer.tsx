"use client";

import { Drawer as BaseDrawer } from "@base-ui/react/drawer";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Drawer({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <BaseDrawer.Root open={open} onOpenChange={onOpenChange}>
      {children}
    </BaseDrawer.Root>
  );
}

export function DrawerContent({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <BaseDrawer.Portal>
      <BaseDrawer.Backdrop className="fixed inset-0 z-40 bg-black/20 transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
      <BaseDrawer.Popup
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-hidden rounded-t-xl bg-background ring-1 ring-border transition-transform duration-200 data-[ending-style]:translate-y-full data-[starting-style]:translate-y-full",
          className,
        )}
      >
        {/* Drag handle */}
        <div className="flex justify-center py-2">
          <div className="h-1 w-8 rounded-full bg-border" />
        </div>
        <div
          className="overflow-y-auto p-4"
          style={{ maxHeight: "calc(85vh - 2rem)" }}
        >
          {children}
        </div>
      </BaseDrawer.Popup>
    </BaseDrawer.Portal>
  );
}
