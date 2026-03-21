import { ButtonAnchor, ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center py-24 text-center">
      <div className="font-medium font-mono text-6xl text-foreground">404</div>
      <div className="mt-3 text-balance text-muted-foreground">
        Page not found
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <ButtonLink href="/">Back to home</ButtonLink>
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
