import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";
import { Footer } from "@/components/shared/footer";
import { FormatToggle } from "@/components/shared/format-toggle";
import { Header } from "@/components/shared/header";
import { cn } from "@/lib/cn";
import { allModels, getProvider, providers } from "@/lib/data";
import { geistMono, geistSans } from "@/styles/font";
import "@/styles/globals.css";
import { Provider } from "./provider";

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0b" },
  ],
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: {
    template: "%s — modelpedia",
    default: "modelpedia — Open catalog of AI models",
  },
  description:
    "Browse, compare, and search 4000+ AI models across 30+ providers. Specs, pricing, capabilities, and a free API.",
  keywords: [
    "AI models",
    "LLM",
    "model comparison",
    "OpenAI",
    "Anthropic",
    "Google",
    "GPT",
    "Claude",
    "Gemini",
    "pricing",
  ],
  icons: { icon: "/icon.svg" },
  metadataBase: new URL("https://modelpedia.dev"),
  openGraph: {
    type: "website",
    siteName: "modelpedia",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    site: "@modelpedia",
  },
  alternates: {
    canonical: "/",
    types: {
      "application/rss+xml": "/changes/feed.xml",
    },
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const commandPaletteData = {
    providers: providers.map((p) => ({
      type: "provider" as const,
      id: `prov-${p.id}`,
      name: p.name,
      href: `/${p.id}`,
      sub: `${p.models.length} models`,
      icon: p.icon,
    })),
    models: allModels
      .filter((m) => m.status !== "deprecated")
      .map((m) => {
        const p = getProvider(m.provider);
        return {
          type: "model" as const,
          id: `${m.provider}/${m.id}`,
          name: m.name,
          href: `/${m.provider}/${m.id}`,
          sub: p?.name ?? m.provider,
          icon: p?.icon,
        };
      }),
  };

  return (
    <html
      lang="en"
      className={cn(geistSans.className, geistMono.variable)}
      suppressHydrationWarning
      data-scroll-behavior="smooth"
    >
      <body className="min-h-screen bg-background text-foreground text-sm">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebSite",
              name: "modelpedia",
              url: "https://modelpedia.dev",
              description:
                "Open catalog of AI model data — specs, pricing, and capabilities across 30+ providers and 4000+ models.",
              potentialAction: {
                "@type": "SearchAction",
                target: {
                  "@type": "EntryPoint",
                  urlTemplate:
                    "https://modelpedia.dev/models?q={search_term_string}",
                },
                "query-input": "required name=search_term_string",
              },
            }),
          }}
        />
        <Provider>
          <Header commandPaletteData={commandPaletteData} />
          <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />
          <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-3xl flex-col px-4 sm:px-6">
            <div className="flex-1 py-10">{children}</div>
            <Footer />
          </div>
          <FormatToggle />
        </Provider>
        <Analytics />
      </body>
    </html>
  );
}
