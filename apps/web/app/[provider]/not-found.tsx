import { ButtonAnchor, ButtonLink } from "@/components/ui/button";

export default function ProviderNotFound() {
  return (
    <div className="flex flex-col items-center py-24 text-center">
      <div className="text-foreground font-mono text-6xl font-medium">404</div>
      <div className="text-muted-foreground mt-3 text-balance">
        This provider is not supported yet
      </div>
      <p className="text-muted-foreground mt-2 max-w-md text-sm text-pretty">
        We&apos;re always adding new providers. If you&apos;d like to see this
        one added, please open an issue on GitHub.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <ButtonLink href="/">Back to home</ButtonLink>
        <ButtonAnchor
          href="https://github.com/assistant-ui/modelpedia/issues/new?title=Add+provider:+&labels=new-provider"
          target="_blank"
          rel="noopener noreferrer"
        >
          Request provider
        </ButtonAnchor>
        <ButtonAnchor
          href="https://github.com/assistant-ui/modelpedia/issues/new"
          target="_blank"
          rel="noopener noreferrer"
        >
          Help us improve
        </ButtonAnchor>
      </div>
    </div>
  );
}
