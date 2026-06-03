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
          className="bg-muted text-muted-foreground ring-border hover:text-foreground rounded px-2 py-1 font-mono ring-1 transition-colors duration-200"
        >
          {s.id}
        </a>
      ))}
      {deprecated.length > 0 && !showDeprecated && (
        <button
          type="button"
          onClick={() => setShowDeprecated(true)}
          className="bg-muted text-muted-foreground/40 ring-border hover:text-muted-foreground rounded px-2 py-1 ring-1 transition-colors duration-200"
        >
          +{deprecated.length} deprecated
        </button>
      )}
      {showDeprecated &&
        deprecated.map((s) => (
          <a
            key={s.id}
            href={`/${provider}/${s.id}`}
            className="bg-muted text-muted-foreground/40 ring-border hover:text-muted-foreground rounded px-2 py-1 font-mono line-through ring-1 transition-colors duration-200 hover:no-underline"
          >
            {s.id}
          </a>
        ))}
    </>
  );
}
