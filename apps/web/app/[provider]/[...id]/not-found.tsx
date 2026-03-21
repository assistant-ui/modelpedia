import { ButtonAnchor, ButtonLink } from "@/components/ui/button";

export default function ModelNotFound() {
  return (
    <div className="flex flex-col items-center py-24 text-center">
      <div className="font-medium font-mono text-6xl text-foreground">404</div>
      <div className="mt-3 text-balance text-muted-foreground">
        Model not found
      </div>
      <p className="mt-2 max-w-md text-pretty text-muted-foreground text-sm">
        This model may have been removed, renamed, or is not yet in our
        registry.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <ButtonLink href="/">Back to home</ButtonLink>
        <ButtonLink href="/models">Browse models</ButtonLink>
        <ButtonAnchor
          href="https://github.com/assistant-ui/modelpedia/issues/new?title=Missing+model:+&labels=missing-model"
          target="_blank"
          rel="noopener noreferrer"
        >
          Help us improve
        </ButtonAnchor>
      </div>
    </div>
  );
}
