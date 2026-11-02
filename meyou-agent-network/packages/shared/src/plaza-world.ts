import type { PlazaWorldAction } from "./index.js";

// Normalized circle coordinates, shared by the renderer and authoritative actions.
// Places are scenery, not invented communities or online participants.
export const plazaPlaces = [
  { id: "work", x: -.5, y: -.25, label: "共创工作台", labelEn: "Co-working" },
  { id: "meet", x: .32, y: -.16, label: "交流庭院", labelEn: "Conversation court" },
  { id: "observe", x: -.5, y: .52, label: "灵感看板", labelEn: "Inspiration board" },
  { id: "rest", x: .5, y: .58, label: "树下休息", labelEn: "Quiet garden" }
] as const;

export function plazaPlaceDestination(
  circle: { x: number; y: number; radius: number },
  placeId: typeof plazaPlaces[number]["id"],
  userId: string
) {
  const place = plazaPlaces.find(item => item.id === placeId)!;
  const seed = [...userId].reduce((total, char) => (total * 31 + char.charCodeAt(0)) >>> 0, 7);
  const angle = seed % 360 * Math.PI / 180;
  return {
    x: circle.x + (place.x + Math.cos(angle) * .1) * circle.radius,
    y: circle.y + (place.y + Math.sin(angle) * .09) * circle.radius
  };
}

export function plazaCircleProjection(width: number, height: number) {
  return { left: width * .08, top: height * .17, width: width * .84, height: height * .7 };
}

export function plazaActionPhase(action: PlazaWorldAction | null | undefined, now = Date.now()) {
  if (!action || Date.parse(action.endsAt) <= now) return "available" as const;
  if (plazaActionPosition(action, now).moving) return "moving" as const;
  if (action.awaitingModel) return "thinking" as const;
  return action.kind === "discuss" ? "discussing" as const
    : action.kind === "rest" ? "resting" as const
    : action.kind === "observe" ? "observing" as const : "arrived" as const;
}

export function plazaActionPosition(action: PlazaWorldAction, now: number) {
  const start = Date.parse(action.startedAt);
  const arrival = Date.parse(action.arrivesAt);
  const fraction = Math.max(0, Math.min(1, (now - start) / Math.max(1, arrival - start)));
  if (action.route?.length) {
    const points = [{ x: action.fromX, y: action.fromY }, ...action.route, { x: action.targetX, y: action.targetY }];
    const lengths = points.slice(1).map((point, index) => Math.hypot(point.x - points[index]!.x, point.y - points[index]!.y));
    const total = lengths.reduce((sum, length) => sum + length, 0);
    let remaining = total * fraction;
    for (let index = 0; index < lengths.length; index += 1) {
      const length = lengths[index]!;
      if (remaining <= length || index === lengths.length - 1) {
        const local = length > 0 ? Math.min(1, remaining / length) : 1;
        const from = points[index]!;
        const to = points[index + 1]!;
        return { x: from.x + (to.x - from.x) * local, y: from.y + (to.y - from.y) * local,
          moving: fraction < 1 && total > .01 };
      }
      remaining -= length;
    }
  }
  return {
    x: action.fromX + (action.targetX - action.fromX) * fraction,
    y: action.fromY + (action.targetY - action.fromY) * fraction,
    moving: fraction < 1 && Math.hypot(action.targetX - action.fromX, action.targetY - action.fromY) > .01
  };
}
