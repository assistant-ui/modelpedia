const linkClass =
  "underline decoration-muted-foreground/30 underline-offset-2 transition-colors hover:text-muted-foreground";

export function Disclaimer() {
  return (
    <p className="text-pretty text-center text-muted-foreground/60 text-xs leading-relaxed">
      Data is collected from public sources and may contain inaccuracies.{" "}
      <a
        href="https://github.com/assistant-ui/modelpedia/issues"
        target="_blank"
        rel="noopener noreferrer"
        className={linkClass}
      >
        Report an issue
      </a>{" "}
      or{" "}
      <a
        href="https://github.com/assistant-ui/modelpedia"
        target="_blank"
        rel="noopener noreferrer"
        className={linkClass}
      >
        contribute on GitHub
      </a>{" "}
      to help improve accuracy.
    </p>
  );
}
