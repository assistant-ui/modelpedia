"use client";

import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import type { ReactElement, ReactNode } from "react";
import { cn } from "@/lib/cn";

export function TooltipProvider({ children }: { children: ReactNode }) {
  return <BaseTooltip.Provider delay={200}>{children}</BaseTooltip.Provider>;
}

export function Tooltip({
  children,
  content,
  side,
  className,
}: {
  children: ReactNode;
  content: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
}) {
  return (
    <BaseTooltip.Root>
      <BaseTooltip.Trigger render={children as ReactElement} />
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner sideOffset={6} side={side}>
          <BaseTooltip.Popup
            className={cn(
              "z-50 rounded-md bg-foreground px-2.5 py-1.5 text-background text-xs shadow-md transition-all duration-150 data-[ending-style]:scale-95 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
              className,
            )}
          >
            {content}
            <BaseTooltip.Arrow className="data-[side=bottom]:top-[-4px] data-[side=left]:right-[-4px] data-[side=top]:bottom-[-4px] data-[side=right]:left-[-4px]">
              <svg width="10" height="5" viewBox="0 0 10 5">
                <path d="M0 0L5 5L10 0" className="fill-foreground" />
              </svg>
            </BaseTooltip.Arrow>
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  );
}
