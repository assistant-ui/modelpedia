import { Menu } from "lucide-react";
import Link from "next/link";
import { CommandPalette } from "@/components/shared/command-palette";
import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownTrigger,
} from "@/components/ui/dropdown";

const NAV_LINKS = [
  { href: "/models", label: "Models" },
  { href: "/providers", label: "Providers" },
  { href: "/compare", label: "Compare" },
  { href: "/analytics", label: "Analytics" },
  { href: "/docs/api", label: "API" },
] as const;

interface HeaderProps {
  commandPaletteData: {
    providers: {
      type: "provider";
      id: string;
      name: string;
      href: string;
      sub: string;
      icon?: string;
    }[];
    models: {
      type: "model";
      id: string;
      name: string;
      href: string;
      sub: string;
      icon?: string;
    }[];
  };
}

export function Header({ commandPaletteData }: HeaderProps) {
  return (
    <nav className="mx-auto flex h-12 max-w-3xl items-center px-4 text-sm sm:px-6">
      <div className="flex flex-1 items-center">
        <Link
          href="/"
          className="flex items-center gap-2 font-semibold text-foreground tracking-tight"
        >
          <Logo className="h-5 w-5" />
          modelpedia
        </Link>
      </div>

      <div className="hidden items-center gap-5 md:flex">
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="text-muted-foreground transition-colors duration-200 hover:text-foreground"
          >
            {link.label}
          </Link>
        ))}
      </div>

      <div className="flex flex-1 items-center justify-end gap-2">
        <Dropdown>
          <DropdownTrigger>
            <Button variant="ghost" size="icon" className="md:hidden">
              <Menu size={18} />
            </Button>
          </DropdownTrigger>
          <DropdownContent align="end">
            {NAV_LINKS.map((link) => (
              <DropdownItem key={link.href} href={link.href}>
                {link.label}
              </DropdownItem>
            ))}
          </DropdownContent>
        </Dropdown>

        <CommandPalette
          pages={NAV_LINKS.map((link) => ({
            type: "page" as const,
            id: `p-${link.label.toLowerCase()}`,
            name: link.label === "API" ? "API Reference" : link.label,
            href: link.href,
          }))}
          providers={commandPaletteData.providers}
          models={commandPaletteData.models}
        />
      </div>
    </nav>
  );
}
