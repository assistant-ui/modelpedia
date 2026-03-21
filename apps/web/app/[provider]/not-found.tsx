import Link from "next/link";

export default function ProviderNotFound() {
  return (
    <div className="flex flex-col items-center py-24 text-center">
      <div className="font-medium font-mono text-6xl text-foreground">404</div>
      <div className="mt-3 text-muted-foreground">
        This provider is not supported yet
      </div>
      <p className="mt-2 max-w-md text-muted-foreground text-sm">
        We&apos;re always adding new providers. If you&apos;d like to see this
        one added, please open an issue on GitHub.
      </p>
      <div className="mt-6 flex gap-3">
        <Link
          href="/"
          className="rounded-md bg-muted px-4 py-2 text-foreground text-sm ring-1 ring-border transition-colors duration-200 hover:bg-accent"
        >
          Back to home
        </Link>
        <a
          href="https://github.com/assistant-ui/ai-model/issues/new?title=Add+provider:+&labels=new-provider"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md bg-muted px-4 py-2 text-foreground text-sm ring-1 ring-border transition-colors duration-200 hover:bg-accent"
        >
          Request provider
        </a>
        <a
          href="https://github.com/assistant-ui/ai-model/issues/new"
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
