import { ButtonAnchor, ButtonLink } from "@/components/ui/button";

export default function ProviderNotFound() {
  return (
    <div className="flex flex-col items-center py-24 text-center">
      <div className="font-medium font-mono text-6xl text-foreground">404</div>
      <div className="mt-3 text-balance text-muted-foreground">
        This provider is not supported yet
      </div>
      <p className="mt-2 max-w-md text-pretty text-muted-foreground text-sm">
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
