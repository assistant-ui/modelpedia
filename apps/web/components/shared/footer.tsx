import { ThemeToggle } from "@/components/shared/theme-toggle";

const LINK_CLASS =
  "text-muted-foreground/50 text-xs transition-colors duration-200 hover:text-muted-foreground";

export function Footer() {
  return (
    <footer className="pt-12 pb-8">
      <div className="mb-4 h-px bg-linear-to-r from-transparent via-foreground/10 to-transparent" />
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
        <a
          href="https://agentbase.dev"
          target="_blank"
          rel="noopener noreferrer"
          className={LINK_CLASS}
        >
          &copy; {new Date().getFullYear()} AgentbaseAI Inc.
        </a>
        <div className="flex items-center gap-5">
          <a
            href="https://www.assistant-ui.com"
            target="_blank"
            rel="noopener noreferrer"
            className={LINK_CLASS}
          >
            assistant-ui.com
          </a>
          <a
            href="https://github.com/assistant-ui/modelpedia"
            target="_blank"
            rel="noopener noreferrer"
            className={LINK_CLASS}
          >
            GitHub
          </a>
          <ThemeToggle />
        </div>
      </div>
    </footer>
  );
}
