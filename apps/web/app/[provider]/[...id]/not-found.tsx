import Link from "next/link";

export default function ModelNotFound() {
  return (
    <div className="flex flex-col items-center py-24 text-center">
      <div className="font-medium font-mono text-6xl text-foreground">404</div>
      <div className="mt-3 text-muted-foreground">Model not found</div>
      <p className="mt-2 max-w-md text-muted-foreground text-sm">
        This model may have been removed, renamed, or is not yet in our
        registry.
      </p>
      <div className="mt-6 flex gap-3">
        <Link
          href="/"
          className="rounded-md bg-muted px-4 py-2 text-foreground text-sm ring-1 ring-border transition-colors duration-200 hover:bg-accent"
        >
          Back to home
        </Link>
        <Link
          href="/models"
          className="rounded-md bg-muted px-4 py-2 text-foreground text-sm ring-1 ring-border transition-colors duration-200 hover:bg-accent"
        >
          Browse models
        </Link>
        <a
          href="https://github.com/assistant-ui/ai-model/issues/new?title=Missing+model:+&labels=missing-model"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md bg-muted px-4 py-2 text-foreground text-sm ring-1 ring-border transition-colors duration-200 hover:bg-accent"
        >
          Help us improve
        </a>
      </div>
    </div>
  );
}
