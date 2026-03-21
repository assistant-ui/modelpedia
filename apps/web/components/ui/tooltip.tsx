"use client";

import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";

export function TooltipProvider({ children }: { children: React.ReactNode }) {
  return <BaseTooltip.Provider delay={200}>{children}</BaseTooltip.Provider>;
}

export function Tooltip({
  children,
  content,
}: {
  children: React.ReactNode;
  content: React.ReactNode;
}) {
  return (
    <BaseTooltip.Root>
      <BaseTooltip.Trigger render={children as React.ReactElement} />
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner sideOffset={6}>
          <BaseTooltip.Popup className="rounded-md bg-foreground px-2.5 py-1.5 text-background text-xs transition-all duration-150 data-[ending-style]:scale-95 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0">
            {content}
            <BaseTooltip.Arrow className="data-[side=bottom]:top-[-4px] data-[side=left]:right-[-4px] data-[side=top]:bottom-[-4px] data-[side=right]:left-[-4px]">
              <svg width="10" height="5" viewBox="0 0 10 5">
                <path d="M0 5L5 0L10 5" className="fill-foreground" />
              </svg>
            </BaseTooltip.Arrow>
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  );
}
