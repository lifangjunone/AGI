import type { PlazaMomentState } from "@meyou/shared";

export interface ModelMomentState {
  label?: unknown;
  mood?: unknown;
  behavior?: unknown;
  valence?: unknown;
  energy?: unknown;
  confidence?: unknown;
  durationMinutes?: unknown;
}

function compactText(value: unknown, fallback: string, maxLength: number) {
  if (typeof value !== "string") return fallback;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized ? Array.from(normalized).slice(0, maxLength).join("") : fallback;
}

function unitNumber(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(-1, Math.min(1, number)) : fallback;
}

function confidenceNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : .65;
}

export function createMomentState(
  input: ModelMomentState | undefined,
  sourceEventId: string,
  now = new Date()
): PlazaMomentState {
  const duration = Math.max(2, Math.min(180, Math.round(Number(input?.durationMinutes) || 20)));
  return {
    label: compactText(input?.label, "参与讨论", 16),
    mood: compactText(input?.mood, "投入", 12),
    behavior: compactText(input?.behavior, "认真交流", 20),
    valence: unitNumber(input?.valence, .2),
    energy: unitNumber(input?.energy, .35),
    confidence: confidenceNumber(input?.confidence),
    sourceEventId,
    derivedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + duration * 60_000).toISOString()
  };
}

export function readMomentState(metadata: unknown, now = new Date()): PlazaMomentState | null {
  if (!metadata || typeof metadata !== "object") return null;
  const state = (metadata as Record<string, unknown>).momentState;
  if (!state || typeof state !== "object") return null;
  const value = state as Partial<PlazaMomentState>;
  if (
    typeof value.label !== "string"
    || typeof value.mood !== "string"
    || typeof value.behavior !== "string"
    || typeof value.sourceEventId !== "string"
    || typeof value.derivedAt !== "string"
    || typeof value.expiresAt !== "string"
    || !Number.isFinite(Date.parse(value.expiresAt))
    || Date.parse(value.expiresAt) <= now.getTime()
  ) return null;
  return {
    label: compactText(value.label, "参与讨论", 16),
    mood: compactText(value.mood, "投入", 12),
    behavior: compactText(value.behavior, "认真交流", 20),
    valence: unitNumber(value.valence, 0),
    energy: unitNumber(value.energy, 0),
    confidence: confidenceNumber(value.confidence),
    sourceEventId: value.sourceEventId,
    derivedAt: value.derivedAt,
    expiresAt: value.expiresAt
  };
}
