export function RenderMarkdown({ text }: { text: string }) {
  const html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" class="text-foreground hover:text-foreground underline underline-offset-2 decoration-border transition-colors duration-200">$1</a>',
    );
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}
