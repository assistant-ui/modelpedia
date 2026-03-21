import { Menu } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CommandPalette } from "@/components/command-palette";
import { FormatToggle } from "@/components/format-toggle";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button, ButtonAnchor } from "@/components/ui/button";
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownTrigger,
} from "@/components/ui/dropdown";
import { UserMenu } from "@/components/user-menu";
import { getUser } from "@/lib/auth";
import { allModels, getProvider, providers } from "@/lib/data";
import { Provider } from "./provider";
import "@/styles/globals.css";
import { geistMono, geistSans } from "@/styles/font";

export const metadata: Metadata = {
  title: {
    template: "%s — AI Model Registry",
    default: "AI Model Registry",
  },
  description:
    "Open catalog of AI models across providers. Compare specs, pricing, and capabilities.",
  icons: { icon: "/favicon.svg" },
  metadataBase: new URL("https://ai-model.dev"),
  openGraph: {
    type: "website",
    siteName: "AI Model Registry",
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();

  return (
    <html
      lang="en"
      className={`${geistSans.className} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-background text-foreground text-sm">
        <Provider>
          <nav className="mx-auto flex h-12 max-w-3xl items-center px-4 text-sm sm:px-6">
            <Link
              href="/"
              className="flex items-center gap-2 font-semibold text-foreground tracking-tight"
            >
              <svg
                viewBox="0 0 32 32"
                fill="none"
                className="h-5 w-5"
                xmlns="http://www.w3.org/2000/svg"
              >
                <rect
                  width="32"
                  height="32"
                  rx="6"
                  fill="currentColor"
                  fillOpacity="0.9"
                />
                <g
                  stroke="var(--background)"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="7" y1="25" x2="19" y2="7" strokeWidth="2.6" />
                  <line x1="19" y1="7" x2="19" y2="25" strokeWidth="2.6" />
                  <line x1="12" y1="18" x2="19" y2="18" strokeWidth="2.2" />
                  <line x1="16" y1="7" x2="25" y2="7" strokeWidth="2.2" />
                  <line x1="16" y1="25" x2="25" y2="25" strokeWidth="2.2" />
                </g>
              </svg>
              AI Model
            </Link>
            <div className="mx-auto hidden items-center gap-5 md:flex">
              <Link
                href="/models"
                className="text-muted-foreground transition-colors duration-200 hover:text-foreground"
              >
                Models
              </Link>
              <Link
                href="/providers"
                className="text-muted-foreground transition-colors duration-200 hover:text-foreground"
              >
                Providers
              </Link>
              <Link
                href="/compare"
                className="text-muted-foreground transition-colors duration-200 hover:text-foreground"
              >
                Compare
              </Link>
              <Link
                href="/docs/api"
                className="text-muted-foreground transition-colors duration-200 hover:text-foreground"
              >
                API
              </Link>
            </div>
            <Dropdown>
              <DropdownTrigger>
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-auto md:hidden"
                >
                  <Menu size={18} />
                </Button>
              </DropdownTrigger>
              <DropdownContent align="end">
                <DropdownItem href="/models">Models</DropdownItem>
                <DropdownItem href="/providers">Providers</DropdownItem>
                <DropdownItem href="/compare">Compare</DropdownItem>
                <DropdownItem href="/docs/api">API</DropdownItem>
              </DropdownContent>
            </Dropdown>
            <div className="flex items-center gap-2">
              <CommandPalette
                pages={[
                  {
                    type: "page",
                    id: "p-models",
                    name: "Models",
                    href: "/models",
                  },
                  {
                    type: "page",
                    id: "p-providers",
                    name: "Providers",
                    href: "/providers",
                  },
                  {
                    type: "page",
                    id: "p-compare",
                    name: "Compare",
                    href: "/compare",
                  },
                  {
                    type: "page",
                    id: "p-api",
                    name: "API Reference",
                    href: "/docs/api",
                  },
                ]}
                providers={providers.map((p) => ({
                  type: "provider" as const,
                  id: `prov-${p.id}`,
                  name: p.name,
                  href: `/${p.id}`,
                  sub: `${p.models.length} models`,
                  icon: p.icon,
                }))}
                models={allModels
                  .filter((m) => m.status !== "deprecated")
                  .map((m) => ({
                    type: "model" as const,
                    id: `${m.provider}/${m.id}`,
                    name: m.name,
                    href: `/${m.provider}/${m.id}`,
                    sub: getProvider(m.provider)?.name ?? m.provider,
                    icon: getProvider(m.provider)?.icon,
                  }))}
              />
              {user ? (
                <UserMenu user={user} />
              ) : (
                <ButtonAnchor href="/login" variant="primary" size="sm">
                  Login
                </ButtonAnchor>
              )}
            </div>
          </nav>
          <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />
          <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-3xl flex-col px-4 sm:px-6">
            <div className="flex-1 py-10">{children}</div>
            <footer className="pt-12 pb-8">
              <div className="mb-4 h-px bg-linear-to-r from-transparent via-foreground/10 to-transparent" />
              <div className="flex items-center justify-between">
                <a
                  href="https://agentbase.dev"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground/50 text-xs transition-colors duration-200 hover:text-muted-foreground"
                >
                  &copy; {new Date().getFullYear()} AgentbaseAI Inc.
                </a>
                <div className="flex items-center gap-5">
                  <a
                    href="https://www.assistant-ui.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground/50 text-xs transition-colors duration-200 hover:text-muted-foreground"
                  >
                    assistant-ui.com
                  </a>
                  <a
                    href="https://github.com/okisdev/ai-model"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground/50 text-xs transition-colors duration-200 hover:text-muted-foreground"
                  >
                    GitHub
                  </a>
                  <ThemeToggle />
                </div>
              </div>
            </footer>
          </div>
          <FormatToggle />
        </Provider>
      </body>
    </html>
  );
}
