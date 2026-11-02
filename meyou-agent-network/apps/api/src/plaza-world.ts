import { plazaActionPosition, plazaPlaces, type PlazaWorldAction } from "@meyou/shared";

function stableHash(value: string) {
  return [...value].reduce((total, char) => (total * 31 + char.charCodeAt(0)) >>> 0, 7);
}

export function discussionDestination(
  circle: { x: number; y: number; radius: number },
  discussionId: string,
  index: number,
  count: number
) {
  const angle = stableHash(discussionId) % 360 * Math.PI / 180;
  const meeting = plazaPlaces.find(place => place.id === "meet")!;
  const centerX = circle.x + (meeting.x + Math.cos(angle) * .2) * circle.radius;
  const centerY = circle.y + (meeting.y + Math.sin(angle) * .18) * circle.radius;
  const slot = index / Math.max(2, count) * Math.PI * 2;
  return { x: centerX + Math.cos(slot) * circle.radius * .14, y: centerY + Math.sin(slot) * circle.radius * .1 };
}

export function createWorldAction(input: {
  kind: PlazaWorldAction["kind"]; goal: string; sourceEventId?: string;
  discussionId?: string; from: { x: number; y: number };
  target?: { x: number; y: number }; previous?: PlazaWorldAction | null;
  now?: Date; durationMs?: number; awaitingModel?: boolean;
  circle?: { x: number; y: number; radius: number };
}): PlazaWorldAction {
  const now = input.now ?? new Date();
  const from = input.previous ? plazaActionPosition(input.previous, now.getTime()) : input.from;
  const target = input.target ?? from;
  const route = input.circle && Math.abs(target.x - from.x) > input.circle.radius * .3
    ? [{ x: from.x, y: input.circle.y + input.circle.radius * .12 },
       { x: target.x, y: input.circle.y + input.circle.radius * .12 }] : undefined;
  const points = [from, ...(route ?? []), target];
  const distance = points.slice(1).reduce((total, point, index) =>
    total + Math.hypot(point.x - points[index]!.x, point.y - points[index]!.y), 0);
  const travelMs = Math.max(0, Math.round(distance * 500));
  return {
    kind: input.kind, goal: input.goal.slice(0, 160), sourceEventId: input.sourceEventId ?? null,
    discussionId: input.discussionId ?? null,
    fromX: from.x, fromY: from.y, targetX: target.x, targetY: target.y,
    startedAt: now.toISOString(), arrivesAt: new Date(now.getTime() + travelMs).toISOString(),
    endsAt: new Date(now.getTime() + travelMs + (input.durationMs ?? 60_000)).toISOString(),
    ...(route ? { route } : {}),
    ...(input.awaitingModel ? { awaitingModel: true } : {})
  };
}

export function rankDiscussionParticipant(
  userId: string, interests: string[], topic: string, participants: string[], round: number
) {
  const shared = interests.filter(interest => topic.toLowerCase().includes(interest.toLowerCase())).length;
  return shared * 100 + (participants.includes(userId) ? 50 : 0)
    + stableHash(`${topic}:${round}:${userId}`) % 40;
}
