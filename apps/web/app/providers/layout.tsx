import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Providers",
  description:
    "Browse AI model providers and platforms. Compare API gateways, cloud platforms, and direct model providers.",
};

export default function ProvidersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
