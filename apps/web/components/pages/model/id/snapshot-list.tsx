"use client";

import { useState } from "react";

interface Snapshot {
  id: string;
  deprecated: boolean;
}

export function SnapshotList({
  snapshots,
  provider,
}: {
  snapshots: Snapshot[];
  provider: string;
}) {
  const active = snapshots.filter((s) => !s.deprecated);
  const deprecated = snapshots.filter((s) => s.deprecated);
  const [showDeprecated, setShowDeprecated] = useState(false);

  return (
    <>
      <span className="text-muted-foreground/60">Snapshots</span>
      {active.map((s) => (
        <a
          key={s.id}
          href={`/${provider}/${s.id}`}
          className="rounded bg-muted px-2 py-1 font-mono text-muted-foreground ring-1 ring-border transition-colors duration-200 hover:text-foreground"
        >
          {s.id}
        </a>
      ))}
      {deprecated.length > 0 && !showDeprecated && (
        <button
          type="button"
          onClick={() => setShowDeprecated(true)}
          className="rounded bg-muted px-2 py-1 text-muted-foreground/40 ring-1 ring-border transition-colors duration-200 hover:text-muted-foreground"
        >
          +{deprecated.length} deprecated
        </button>
      )}
      {showDeprecated &&
        deprecated.map((s) => (
          <a
            key={s.id}
            href={`/${provider}/${s.id}`}
            className="rounded bg-muted px-2 py-1 font-mono text-muted-foreground/40 line-through ring-1 ring-border transition-colors duration-200 hover:text-muted-foreground hover:no-underline"
          >
            {s.id}
          </a>
        ))}
    </>
  );
}
