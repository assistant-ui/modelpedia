"use client";

import { useEffect, useRef, useState } from "react";
import { CapabilityHeatmap } from "@/components/pages/analytics/capability-heatmap";
import { ContextDistributionChart } from "@/components/pages/analytics/context-distribution";
import { ContextTimeline } from "@/components/pages/analytics/context-timeline";
import { DetailPanel } from "@/components/pages/analytics/detail-panel";
import { LicenseChart } from "@/components/pages/analytics/license-chart";
import { ModalityChart } from "@/components/pages/analytics/modality-chart";
import { ModelTypeChart } from "@/components/pages/analytics/model-type-chart";
import { OpenWeightTrend } from "@/components/pages/analytics/open-weight-trend";
import { ParamsTrend as ParamsTrendChart } from "@/components/pages/analytics/params-trend";
import { PriceDistribution } from "@/components/pages/analytics/price-distribution";
import { PriceVsIntelligence } from "@/components/pages/analytics/price-vs-intelligence";
import { PricingTrend as PricingTrendChart } from "@/components/pages/analytics/pricing-trend";
import { ProviderMap } from "@/components/pages/analytics/provider-map";
import { ProviderRankingChart } from "@/components/pages/analytics/provider-ranking";
import { ReleaseTimeline } from "@/components/pages/analytics/release-timeline";
import { TopFamiliesChart } from "@/components/pages/analytics/top-families";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { Section } from "@/components/ui/section";
import type { AnalyticsData, Selection } from "@/lib/analytics";
import { cn } from "@/lib/cn";

export function AnalyticsDashboard({ data }: { data: AnalyticsData }) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [visible, setVisible] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selection) {
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [selection]);

  function handleClose() {
    setVisible(false);
    setTimeout(() => setSelection(null), 200);
  }

  return (
    <div>
      <Section title="Provider Distribution">
        <ProviderMap
          data={data.providerGeo}
          onSelect={setSelection}
          selection={selection}
        />
      </Section>

      <Section title="Price vs Intelligence">
        <PriceVsIntelligence
          data={data.priceVsIntelligence}
          onSelect={setSelection}
          selection={selection}
        />
      </Section>

      <Section title="Model Releases">
        <ReleaseTimeline
          data={data.releaseTimeline}
          onSelect={setSelection}
          selection={selection}
          summary={data.releaseSummary}
        />
      </Section>

      <Section title="Context Window Evolution">
        <ContextTimeline
          data={data.contextTimeline}
          onSelect={setSelection}
          selection={selection}
          summary={data.contextSummary}
        />
      </Section>

      <Section title="Capability Coverage by Provider">
        <CapabilityHeatmap
          data={data.capabilityHeatmap}
          onSelect={setSelection}
          selection={selection}
        />
      </Section>

      <Section title="Pricing Distribution">
        <PriceDistribution
          data={data.priceDistribution}
          onSelect={setSelection}
          selection={selection}
          summary={data.priceSummary}
        />
      </Section>

      <Section title="Open Weight vs Proprietary">
        <OpenWeightTrend
          data={data.openWeightTrend}
          onSelect={setSelection}
          selection={selection}
          summary={data.openWeightSummary}
        />
      </Section>

      <Section title="Model Type Distribution">
        <ModelTypeChart
          data={data.modelTypeDistribution}
          onSelect={setSelection}
          selection={selection}
        />
      </Section>

      <Section title="Parameters Over Time">
        <ParamsTrendChart
          data={data.paramsTrend}
          onSelect={setSelection}
          selection={selection}
        />
      </Section>

      <Section title="Pricing Trend">
        <PricingTrendChart
          data={data.pricingTrend}
          onSelect={setSelection}
          selection={selection}
        />
      </Section>

      <Section title="License Distribution">
        <LicenseChart
          data={data.licenseDistribution}
          onSelect={setSelection}
          selection={selection}
        />
      </Section>

      <Section title="Top Model Families">
        <TopFamiliesChart
          data={data.topFamilies}
          onSelect={setSelection}
          selection={selection}
        />
      </Section>

      <Section title="Provider Model Count">
        <ProviderRankingChart
          data={data.providerRanking}
          onSelect={setSelection}
          selection={selection}
        />
      </Section>

      <Section title="Context Window Distribution">
        <ContextDistributionChart
          data={data.contextDistribution}
          onSelect={setSelection}
          selection={selection}
        />
      </Section>

      <Section title="Modality Coverage">
        <ModalityChart
          data={data.modalityCoverage}
          onSelect={setSelection}
          selection={selection}
        />
      </Section>

      {/* Desktop: fixed panel to the right */}
      {selection && (
        <div
          ref={panelRef}
          className={cn(
            "fixed top-48 z-30 hidden w-72 transition-all duration-200 xl:block",
            visible ? "translate-x-0 opacity-100" : "translate-x-2 opacity-0",
          )}
          style={{ left: "calc(50% + 25rem)" }}
        >
          <div className="sticky top-24">
            <DetailPanel
              selection={selection}
              models={data.models}
              onClose={handleClose}
            />
          </div>
        </div>
      )}

      {/* Mobile: bottom drawer */}
      <Drawer
        open={selection !== null}
        onOpenChange={(open) => {
          if (!open) setSelection(null);
        }}
      >
        <DrawerContent className="xl:hidden">
          {selection && (
            <DetailPanel
              selection={selection}
              models={data.models}
              onClose={() => setSelection(null)}
            />
          )}
        </DrawerContent>
      </Drawer>
    </div>
  );
}
