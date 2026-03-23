"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export function OverlayPanel({
  backHref,
  header,
  subheader,
  children,
}: {
  backHref: string;
  header: React.ReactNode;
  subheader?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  const router = useRouter();
  const closingRef = useRef(false);

  useEffect(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setVisible(true));
    });
  }, []);

  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setVisible(false);
    setTimeout(() => router.push(backHref), 200);
  }, [router, backHref]);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [close]);

  return (
    <div
      className={cn(
        "fixed inset-0 top-[49px] z-40 bg-background transition-opacity duration-200",
        visible ? "opacity-100" : "opacity-0",
      )}
    >
      <div
        className="overflow-y-auto overscroll-contain"
        style={{ height: "calc(100vh - 49px)" }}
      >
        <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
          <div className="mb-8">
            <div className="flex items-center gap-2.5">
              {header}
              <Button variant="ghost" size="icon" onClick={close} title="Close">
                <X size={14} />
              </Button>
            </div>
            {subheader}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
