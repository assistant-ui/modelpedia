"use client";

import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
} from "react-simple-maps";
import { Tooltip } from "@/components/ui/tooltip";
import type { ProviderGeo, Selection } from "@/lib/analytics";
import { cn } from "@/lib/cn";
import { regionFlag } from "@/lib/format";

const GEO_URL =
  "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

/** [longitude, latitude] per country */
const COUNTRY_COORDS: Record<string, [number, number]> = {
  US: [-98, 39],
  CN: [104, 35],
  CA: [-79, 44],
  FR: [2, 47],
  GB: [-1, 53],
};

const COUNTRY_NAMES: Record<string, string> = {
  US: "United States",
  CN: "China",
  CA: "Canada",
  FR: "France",
  GB: "United Kingdom",
};

interface CountryCluster {
  region: string;
  name: string;
  coords: [number, number];
  providers: ProviderGeo["providers"];
}

function clusterByCountry(data: ProviderGeo[]): CountryCluster[] {
  const map = new Map<string, CountryCluster>();

  for (const geo of data) {
    const existing = map.get(geo.region);
    if (existing) {
      existing.providers.push(...geo.providers);
    } else {
      map.set(geo.region, {
        region: geo.region,
        name: COUNTRY_NAMES[geo.region] ?? geo.region,
        coords: COUNTRY_COORDS[geo.region] ?? [0, 20],
        providers: [...geo.providers],
      });
    }
  }

  return [...map.values()].sort(
    (a, b) =>
      b.providers.reduce((s, p) => s + p.modelCount, 0) -
      a.providers.reduce((s, p) => s + p.modelCount, 0),
  );
}

export function ProviderMap({
  data,
  onSelect,
  selection,
}: {
  data: ProviderGeo[];
  onSelect: (s: Selection) => void;
  selection: Selection | null;
}) {
  const clusters = clusterByCountry(data);
  const activeRegion = selection?.type === "region" ? selection.region : null;

  return (
    <div className="overflow-hidden rounded-md ring-1 ring-border">
      <div className="bg-background">
        <ComposableMap
          projection="geoNaturalEarth1"
          projectionConfig={{ scale: 140, center: [20, 10] }}
          width={800}
          height={380}
          style={{ width: "100%", height: "auto" }}
        >
          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies.map((geo) => (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  className="fill-muted stroke-border"
                  style={{
                    default: { outline: "none" },
                    hover: { outline: "none" },
                    pressed: { outline: "none" },
                  }}
                />
              ))
            }
          </Geographies>

          {clusters.map((c) => {
            const count = c.providers.length;
            const models = c.providers.reduce((s, p) => s + p.modelCount, 0);
            const r = Math.max(6, Math.min(16, count * 2));
            const isActive = activeRegion === c.region;

            return (
              <Marker key={c.region} coordinates={c.coords}>
                <Tooltip
                  content={`${regionFlag(c.region)} ${c.name}: ${count} providers, ${models} models`}
                >
                  <circle
                    r={isActive ? r + 2 : r}
                    className={cn(
                      "cursor-pointer fill-blue-500 transition-all duration-150",
                      isActive
                        ? "opacity-100"
                        : activeRegion
                          ? "opacity-30"
                          : "opacity-70 hover:opacity-100",
                    )}
                    onClick={() =>
                      onSelect({ type: "region", region: c.region })
                    }
                  />
                </Tooltip>
                <text
                  textAnchor="middle"
                  y={1}
                  dominantBaseline="central"
                  className="pointer-events-none fill-white font-mono text-[7px]"
                >
                  {count}
                </text>
              </Marker>
            );
          })}
        </ComposableMap>
      </div>

      <div className="border-border border-t px-4 py-3">
        <div className="flex flex-wrap gap-x-5 gap-y-1.5">
          {clusters.map((c) => {
            const models = c.providers.reduce((s, p) => s + p.modelCount, 0);
            return (
              <div key={c.region} className="flex items-center gap-1.5 text-xs">
                <span>{regionFlag(c.region)}</span>
                <span className="text-muted-foreground">{c.name}</span>
                <span className="font-mono text-foreground">
                  {c.providers.length}
                </span>
                <span className="text-muted-foreground/50">· {models}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
