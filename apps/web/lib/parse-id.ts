/** Parse URL segments into a model ID and whether the "changes" overlay is active. */
export function parseIdSegments(segments: string[]): {
  modelId: string;
  isChanges: boolean;
} {
  const last = segments[segments.length - 1];
  if (last === "changes" && segments.length > 1) {
    return {
      modelId: decodeURIComponent(segments.slice(0, -1).join("/")),
      isChanges: true,
    };
  }
  return { modelId: decodeURIComponent(segments.join("/")), isChanges: false };
}
