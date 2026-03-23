export function sortProviders<T extends { name: string; models: unknown[] }>(
  list: T[],
): T[] {
  return [...list].sort((a, b) => {
    const aEmpty = a.models.length === 0;
    const bEmpty = b.models.length === 0;
    if (aEmpty !== bEmpty) return aEmpty ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
}

const VER_RE = /(\d+(?:\.\d+)*)/g;

function extractVersion(s?: string): number {
  if (!s) return -1;
  let best = -1;
  for (const m of s.matchAll(VER_RE)) {
    const v = Number.parseFloat(m[1]);
    if (v > best) best = v;
  }
  return best;
}

const TYPE_PRIORITY: Record<string, number> = {
  chat: 0,
  reasoning: 0,
  code: 1,
  embed: 2,
  rerank: 2,
  image: 3,
  video: 3,
  audio: 4,
  tts: 4,
  transcription: 4,
  moderation: 5,
  translation: 5,
  other: 6,
};

export function sortModels<
  T extends {
    id: string;
    name: string;
    status?: string;
    family?: string;
    model_type?: string;
  },
>(models: T[]): T[] {
  const DATE_RE = /\d{4}-\d{2}-\d{2}/;

  return [...models].sort((a, b) => {
    const aD = a.status === "deprecated" ? 1 : 0;
    const bD = b.status === "deprecated" ? 1 : 0;
    if (aD !== bD) return aD - bD;

    const aT = TYPE_PRIORITY[a.model_type ?? ""] ?? 6;
    const bT = TYPE_PRIORITY[b.model_type ?? ""] ?? 6;
    if (aT !== bT) return aT - bT;

    const afv = extractVersion(a.family);
    const bfv = extractVersion(b.family);
    if (afv !== bfv) return bfv - afv;

    const amv = extractVersion(a.name);
    const bmv = extractVersion(b.name);
    if (amv !== bmv) return bmv - amv;

    const aS = DATE_RE.test(a.id) ? 1 : 0;
    const bS = DATE_RE.test(b.id) ? 1 : 0;
    if (aS !== bS) return aS - bS;

    return a.name.localeCompare(b.name);
  });
}
