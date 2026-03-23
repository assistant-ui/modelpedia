"use client";

import { Toast } from "@base-ui/react/toast";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export const toastManager = Toast.createToastManager();

export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <Toast.Provider toastManager={toastManager}>
      {children}
      <Toasts />
    </Toast.Provider>
  );
}

function Toasts() {
  const { toasts } = Toast.useToastManager();

  return (
    <Toast.Portal>
      <Toast.Viewport className="fixed top-4 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
        {toasts.map((toast) => (
          <Toast.Root
            key={toast.id}
            toast={toast}
            className={cn(
              "rounded-md bg-foreground px-4 py-2 text-background text-sm shadow-lg transition-all duration-200",
              "data-[ending-style]:-translate-y-2 data-[ending-style]:opacity-0",
              "data-[starting-style]:-translate-y-2 data-[starting-style]:opacity-0",
            )}
          >
            <Toast.Content>
              {toast.title && (
                <Toast.Title className="font-medium">{toast.title}</Toast.Title>
              )}
              {toast.description && (
                <Toast.Description>{toast.description}</Toast.Description>
              )}
            </Toast.Content>
          </Toast.Root>
        ))}
      </Toast.Viewport>
    </Toast.Portal>
  );
}
