import { useEffect, useRef, type Dispatch, type PointerEvent, type SetStateAction, type WheelEvent } from "react";
import type { PlazaActivity, PlazaSnapshot } from "@meyou/shared";

export interface PlazaCamera {
  x: number;
  y: number;
  scale: number;
}

interface PlazaWorldProps {
  data: PlazaSnapshot;
  view: "global" | "circle";
  camera: PlazaCamera;
  setCamera: Dispatch<SetStateAction<PlazaCamera>>;
  onEnterCircle: (circleId: string) => void;
  onSelectAgent?: (userId: string) => void;
  onMoveAgent?: (circleId: string, x: number, y: number) => Promise<void>;
  moveMode?: boolean;
  detailOpen?: boolean;
}

const colors: Record<string, { roof: string; wall: string; accent: string }> = {
  navy: { roof: "#31586b", wall: "#d8e0dc", accent: "#183243" },
  violet: { roof: "#887b9b", wall: "#e5dfe7", accent: "#695c7c" },
  gold: { roof: "#d1a95d", wall: "#f0dfbd", accent: "#9a7131" },
  coral: { roof: "#df765f", wall: "#f1c7b8", accent: "#b45443" },
  sage: { roof: "#739681", wall: "#d5e2d8", accent: "#315c4a" }
};

const peopleColors = ["#315c4a", "#df765f", "#6b7894", "#b8893d", "#795f7e", "#3f7182"];
const DISCUSSION_LINGER_MS = 8_000;

export interface DiscussionScene {
  rootEventId: string;
  participantIds: string[];
  speakerId: string;
  active: boolean;
}

interface SocialPose {
  role: "speaker" | "listener" | "none";
  facing: -1 | 1;
  reactionIndex?: number;
}

function hash(value: string) {
  return [...value].reduce((total, char) => ((total * 31) + char.charCodeAt(0)) >>> 0, 7);
}

export function getDiscussionScene(
  data: PlazaSnapshot,
  circleId: string,
  now = Date.now()
): DiscussionScene | null {
  const discussion = data.discussions
    .filter((item) => item.circleId === circleId)
    .filter((item) => item.status === "active" || now - Date.parse(item.updatedAt) < DISCUSSION_LINGER_MS)
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0];
  if (!discussion) return null;
  const threadEvents = data.events
    .filter((event) => event.circleId === circleId)
    .filter((event) => event.id === discussion.rootEventId || event.metadata?.threadRootId === discussion.rootEventId)
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
  const participantIds = [...new Set(threadEvents.map((event) => event.userId))];
  const speakerId = threadEvents.at(-1)?.userId;
  if (participantIds.length < 2 || !speakerId) return null;
  return {
    rootEventId: discussion.rootEventId,
    participantIds,
    speakerId,
    active: discussion.status === "active"
  };
}

export function getDiscussionSlot(index: number, count: number, centerX: number, centerY: number) {
  if (count === 2) {
    return { x: centerX + (index === 0 ? -34 : 34), y: centerY + (index === 0 ? 3 : -3) };
  }
  const ring = Math.floor(index / 6);
  const ringIndex = index % 6;
  const ringCount = Math.min(6, count - ring * 6);
  const radiusX = 48 + ring * 42;
  const radiusY = 25 + ring * 22;
  const angle = -Math.PI / 2 + (ringIndex / ringCount) * Math.PI * 2;
  return {
    x: centerX + Math.cos(angle) * radiusX,
    y: centerY + Math.sin(angle) * radiusY
  };
}

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

function drawIsoBuilding(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  palette: { roof: string; wall: string; accent: string },
  heat: number
) {
  const width = size;
  const depth = size * .48;
  const height = size * (.45 + heat * .18);
  context.save();
  context.shadowColor = "rgba(24,50,67,.16)";
  context.shadowBlur = 18;
  context.shadowOffsetY = 10;
  context.fillStyle = palette.wall;
  context.beginPath();
  context.moveTo(x - width / 2, y);
  context.lineTo(x, y + depth / 2);
  context.lineTo(x, y + depth / 2 + height);
  context.lineTo(x - width / 2, y + height);
  context.closePath();
  context.fill();
  context.fillStyle = palette.accent;
  context.globalAlpha = .72;
  context.beginPath();
  context.moveTo(x + width / 2, y);
  context.lineTo(x, y + depth / 2);
  context.lineTo(x, y + depth / 2 + height);
  context.lineTo(x + width / 2, y + height);
  context.closePath();
  context.fill();
  context.globalAlpha = 1;
  context.fillStyle = palette.roof;
  context.beginPath();
  context.moveTo(x, y - depth / 2);
  context.lineTo(x + width / 2, y);
  context.lineTo(x, y + depth / 2);
  context.lineTo(x - width / 2, y);
  context.closePath();
  context.fill();
  context.shadowColor = "transparent";
  context.fillStyle = "rgba(255,253,249,.8)";
  for (let index = 0; index < 3; index += 1) {
    context.fillRect(x - width * .36 + index * width * .16, y + height * .28, width * .09, height * .18);
  }
  context.fillStyle = "#fffaf1";
  context.fillRect(x + width * .15, y + height * .52, width * .13, height * .48);
  context.restore();
}

function drawTree(context: CanvasRenderingContext2D, x: number, y: number, size: number, tint = "#6f947d") {
  context.save();
  context.fillStyle = "rgba(31,54,49,.12)";
  context.beginPath();
  context.ellipse(x + 4, y + size * .42, size * .42, size * .16, 0, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#9b7048";
  context.fillRect(x - size * .05, y, size * .1, size * .45);
  context.fillStyle = tint;
  context.beginPath();
  context.arc(x, y - size * .14, size * .35, 0, Math.PI * 2);
  context.arc(x - size * .25, y + size * .02, size * .25, 0, Math.PI * 2);
  context.arc(x + size * .23, y + size * .03, size * .27, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawNpc(
  context: CanvasRenderingContext2D,
  agent: PlazaSnapshot["agents"][number],
  x: number,
  y: number,
  time: number,
  moving = false,
  socialPose: SocialPose = { role: "none", facing: 1 }
) {
  const seed = hash(agent.userId);
  const shirt = agent.npcColor ?? (agent.mine ? "#e86751" : peopleColors[seed % peopleColors.length]!);
  const skin = ["#f2c9a8", "#e5b58d", "#f5d2b5", "#c98f68", "#9f684d"][seed % 5]!;
  const hair = ["#30231f", "#5f4437", "#211d1c", "#8a5a35"][seed % 4]!;
  const social = socialPose.role !== "none";
  const walking = !social && (moving || agent.activity === "walking");
  const moment = agent.momentState;
  const momentEnergy = moment?.energy ?? 0;
  const momentValence = moment?.valence ?? 0;
  const speakingBeat = socialPose.role === "speaker" ? Math.sin(time * .012 + seed) : 0;
  const listeningBeat = socialPose.role === "listener" ? Math.max(0, Math.sin(time * .004 + seed)) : 0;
  const bob = social
    ? (socialPose.role === "speaker" ? speakingBeat * 1.1 : listeningBeat * 1.4)
    : Math.sin(time * (walking ? .009 : .0025 + Math.max(0, momentEnergy) * .002) + seed)
      * (walking ? 2.5 : 1 + Math.max(0, momentEnergy) * .9);
  context.save();
  context.translate(x, y + bob);
  context.fillStyle = "rgba(24,50,67,.16)";
  context.beginPath();
  context.ellipse(0, 12, 15, 5, 0, 0, Math.PI * 2);
  context.fill();
  context.scale(socialPose.facing, 1);
  if (socialPose.role === "speaker") context.rotate(speakingBeat * .018 - .025);
  context.strokeStyle = shirt;
  context.lineWidth = 5;
  context.lineCap = "round";
  const stride = walking ? Math.sin(time * .012 + seed) * 5 : 0;
  context.beginPath();
  context.moveTo(-3, -2);
  context.lineTo(-5 + stride, 10);
  context.moveTo(3, -2);
  context.lineTo(5 - stride, 10);
  context.stroke();
  context.fillStyle = shirt;
  roundedRect(context, -10, -23, 20, 23, 7);
  context.fill();
  context.strokeStyle = skin;
  context.lineWidth = 4;
  context.beginPath();
  if (socialPose.role === "speaker") {
    const gesture = speakingBeat * 3;
    context.moveTo(-8, -18);
    context.lineTo(-14, -8);
    context.moveTo(8, -18);
    context.lineTo(14 + gesture, -24 - Math.abs(gesture));
    context.lineTo(19 + gesture, -19);
  } else if (socialPose.role === "listener") {
    context.moveTo(-8, -18);
    context.lineTo(-12, -7);
    context.moveTo(8, -18);
    context.lineTo(13, -24);
    context.lineTo(9, -30);
  } else {
    context.moveTo(-8, -18);
    context.lineTo(-13 - stride * .45, -7);
    context.moveTo(8, -18);
    context.lineTo(13 + stride * .45, -7);
  }
  context.stroke();
  context.fillStyle = skin;
  context.beginPath();
  context.arc(0, -32, 10, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = hair;
  context.beginPath();
  context.arc(0, -35, 10, Math.PI, Math.PI * 2);
  context.lineTo(9, -31);
  context.lineTo(-9, -31);
  context.closePath();
  context.fill();
  context.strokeStyle = "#513c34";
  context.fillStyle = "#513c34";
  context.lineWidth = 1.2;
  context.beginPath();
  context.arc(-3.2, -32, .8, 0, Math.PI * 2);
  context.arc(3.2, -32, .8, 0, Math.PI * 2);
  context.fill();
  context.beginPath();
  if (socialPose.role === "speaker") {
    context.ellipse(3.5, -27.4, 2.1, 1.2 + Math.abs(speakingBeat) * .8, 0, 0, Math.PI * 2);
  } else if (momentValence < -.25) {
    context.arc(2.5, -25.8, 3, Math.PI * 1.18, Math.PI * 1.82);
  } else {
    context.arc(2.5, -28.5, 3, .12, Math.PI * .82);
  }
  context.stroke();
  context.restore();
}

function drawDiscussionLinks(
  context: CanvasRenderingContext2D,
  participants: Array<{ x: number; y: number }>,
  centerX: number,
  centerY: number,
  time: number,
  reducedMotion: boolean
) {
  context.save();
  context.strokeStyle = "rgba(232,103,81,.18)";
  context.lineWidth = 1.5;
  context.setLineDash([3, 7]);
  for (const participant of participants) {
    context.beginPath();
    context.moveTo(participant.x, participant.y - 12);
    context.quadraticCurveTo(centerX, centerY - 34, centerX, centerY - 10);
    context.stroke();
  }
  context.setLineDash([]);
  context.fillStyle = "rgba(232,103,81,.58)";
  const pulseRadius = reducedMotion ? 3 : 2.5 + (Math.sin(time * .005) + 1) * 1.2;
  context.beginPath();
  context.arc(centerX, centerY - 10, pulseRadius, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawListeningCue(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  time: number,
  reducedMotion: boolean,
  reactionIndex: number
) {
  const reactions = ["···", "嗯", "✓"];
  const label = reactions[reactionIndex % reactions.length]!;
  const lift = reducedMotion ? 0 : Math.sin(time * .0035 + reactionIndex * 1.7) * 1.2;
  context.save();
  roundedRect(context, x + 12, y - 83 + lift, 25, 20, 9);
  context.fillStyle = "rgba(255,253,249,.92)";
  context.strokeStyle = "rgba(49,92,74,.18)";
  context.lineWidth = 1;
  context.fill();
  context.stroke();
  context.fillStyle = "#315c4a";
  context.font = '800 10px "Noto Sans SC", sans-serif';
  context.textAlign = "center";
  context.fillText(label, x + 24.5, y - 69 + lift);
  context.restore();
}

function drawMineGlow(context: CanvasRenderingContext2D, x: number, y: number, time: number, reducedMotion: boolean) {
  const pulse = reducedMotion ? .5 : (Math.sin(time * .003) + 1) / 2;
  const radius = 29 + pulse * 5;
  const glow = context.createRadialGradient(x, y - 12, 4, x, y - 12, radius);
  glow.addColorStop(0, "rgba(255,247,202,.5)");
  glow.addColorStop(.48, "rgba(255,219,112,.2)");
  glow.addColorStop(1, "rgba(255,219,112,0)");
  context.save();
  context.fillStyle = glow;
  context.beginPath();
  context.arc(x, y - 12, radius, 0, Math.PI * 2);
  context.fill();
  const sparkles = [
    { x: -19, y: -37, delay: 0 },
    { x: 20, y: -27, delay: 1.8 },
    { x: -24, y: -5, delay: 3.2 }
  ];
  for (const sparkle of sparkles) {
    const alpha = reducedMotion ? .8 : .35 + Math.max(0, Math.sin(time * .004 + sparkle.delay)) * .65;
    const size = 3 + alpha * 2;
    context.globalAlpha = alpha;
    context.fillStyle = "#fff5ad";
    context.beginPath();
    context.moveTo(x + sparkle.x, y + sparkle.y - size);
    context.lineTo(x + sparkle.x + size * .35, y + sparkle.y - size * .35);
    context.lineTo(x + sparkle.x + size, y + sparkle.y);
    context.lineTo(x + sparkle.x + size * .35, y + sparkle.y + size * .35);
    context.lineTo(x + sparkle.x, y + sparkle.y + size);
    context.lineTo(x + sparkle.x - size * .35, y + sparkle.y + size * .35);
    context.lineTo(x + sparkle.x - size, y + sparkle.y);
    context.lineTo(x + sparkle.x - size * .35, y + sparkle.y - size * .35);
    context.closePath();
    context.fill();
  }
  context.restore();
}

function activityBubble(agent: PlazaSnapshot["agents"][number]) {
  if (agent.momentState?.label) return agent.momentState.label;
  if (agent.activity === "idle") return "?";
  if (agent.activity === "looking") return "找人";
  if (agent.activity === "business") return "业务";
  if (agent.activity === "dating") return "关系";
  if (agent.activity === "chatting") return "正在聊";
  return "走";
}

export function buildBubbleLines(content: string, maxChars = 14, maxLines = 2) {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const characters = Array.from(normalized);
  const visibleLimit = maxChars * maxLines;
  const clipped = characters.length > visibleLimit;
  const visible = characters.slice(0, visibleLimit);
  const lines = Array.from({ length: Math.ceil(visible.length / maxChars) }, (_, index) =>
    visible.slice(index * maxChars, (index + 1) * maxChars).join("")
  );
  if (clipped && lines.length) {
    const lastIndex = lines.length - 1;
    lines[lastIndex] = `${Array.from(lines[lastIndex]!).slice(0, Math.max(1, maxChars - 1)).join("")}…`;
  }
  return lines;
}

function drawRuntimeBadge(
  context: CanvasRenderingContext2D,
  agent: PlazaSnapshot["agents"][number],
  x: number,
  y: number
) {
  const continuous = agent.runtimeMode === "continuous";
  const label = continuous ? "持续自治" : "受控自治";
  context.save();
  context.font = '800 9px "Noto Sans SC", sans-serif';
  const width = context.measureText(label).width + 16;
  const bx = x - width / 2;
  const by = y - 57;
  roundedRect(context, bx, by, width, 19, 9);
  context.fillStyle = continuous ? "rgba(255,239,233,.97)" : "rgba(238,243,240,.97)";
  context.strokeStyle = continuous ? "rgba(232,103,81,.32)" : "rgba(49,92,74,.24)";
  context.lineWidth = 1;
  context.fill();
  context.stroke();
  context.beginPath();
  context.arc(bx + 8, by + 9.5, 2.5, 0, Math.PI * 2);
  context.fillStyle = continuous ? "#e86751" : "#315c4a";
  context.fill();
  context.fillStyle = continuous ? "#a84939" : "#315c4a";
  context.textAlign = "center";
  context.fillText(label, bx + width / 2 + 3, by + 13);
  context.restore();
}

function drawStatusBubble(
  context: CanvasRenderingContext2D,
  agent: PlazaSnapshot["agents"][number],
  x: number,
  y: number,
  time: number,
  reducedMotion: boolean,
  content?: string
) {
  const isSpeech = Boolean(content?.trim());
  const label = isSpeech ? content!.trim() : activityBubble(agent);
  const lines = isSpeech ? buildBubbleLines(label) : [label];
  const pulse = reducedMotion ? 0 : Math.sin(time * .004 + hash(agent.userId)) * 1.5;
  context.save();
  context.font = `700 ${isSpeech ? 11 : 12}px "Noto Sans SC", sans-serif`;
  const measuredWidth = Math.max(...lines.map((line) => context.measureText(line).width), 0);
  const width = Math.min(176, Math.max(isSpeech ? 108 : 34, measuredWidth + (isSpeech ? 26 : 18)));
  const height = isSpeech ? 46 : 24;
  const bx = isSpeech ? x - width / 2 : x + 14;
  const by = y - (isSpeech ? 119 : 91) + pulse;
  context.fillStyle = isSpeech ? "rgba(255,253,249,.97)" : "rgba(255,250,241,.9)";
  context.strokeStyle = isSpeech ? "rgba(232,103,81,.35)" : "rgba(24,50,67,.12)";
  context.lineWidth = 1;
  roundedRect(context, bx, by, width, height, 12);
  context.fill();
  context.stroke();
  context.beginPath();
  const tailX = isSpeech ? x : bx + 11;
  context.moveTo(tailX - 7, by + height - 1);
  context.lineTo(tailX, by + height + 8);
  context.lineTo(tailX + 8, by + height - 1);
  context.closePath();
  context.fill();
  context.fillStyle = isSpeech ? "#a84939" : "#526672";
  context.textAlign = "center";
  if (isSpeech) {
    lines.forEach((line, index) => {
      context.fillText(line, bx + width / 2, by + 17 + index * 16);
    });
  } else {
    context.fillText(label, bx + width / 2, by + 16);
  }
  context.restore();
}

export function PlazaWorld({
  data, view, camera, setCamera, onEnterCircle, onSelectAgent, onMoveAgent, moveMode = false, detailOpen = true
}: PlazaWorldProps) {
  type AmbientWalk = {
    x: number;
    y: number;
    targetX: number;
    targetY: number;
    moving: boolean;
    nextMoveAt: number;
    step: number;
  };
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<{ id: number; x: number; y: number; originX: number; originY: number; moved: boolean } | null>(null);
  const frameRef = useRef(0);
  const hitRef = useRef<Array<{ id: string; x: number; y: number; radius: number }>>([]);
  const circleHitRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const minePositionRef = useRef<{ x: number; y: number; targetX: number; targetY: number; moving: boolean } | null>(null);
  const ambientWalkRef = useRef<Map<string, AmbientWalk>>(new Map());
  const discussionRootRef = useRef<string | null>(null);
  const lastFrameTimeRef = useRef(0);
  const movingRef = useRef(false);
  const mine = data.agents.find((agent) => agent.mine);

  useEffect(() => {
    if (!mine) {
      minePositionRef.current = null;
      return;
    }
    if (!minePositionRef.current || !movingRef.current) {
      minePositionRef.current = { x: mine.x, y: mine.y, targetX: mine.x, targetY: mine.y, moving: false };
    }
  }, [mine?.userId, mine?.x, mine?.y]);

  useEffect(() => {
    if (view !== "circle") {
      ambientWalkRef.current.clear();
      return;
    }
    const now = performance.now();
    const visibleIds = new Set(data.agents.filter((agent) => !agent.mine).map((agent) => agent.userId));
    for (const userId of ambientWalkRef.current.keys()) {
      if (!visibleIds.has(userId)) ambientWalkRef.current.delete(userId);
    }
    for (const agent of data.agents) {
      if (agent.mine || ambientWalkRef.current.has(agent.userId)) continue;
      ambientWalkRef.current.set(agent.userId, {
        x: agent.x,
        y: agent.y,
        targetX: agent.x,
        targetY: agent.y,
        moving: false,
        nextMoveAt: now + 900 + (hash(agent.userId) % 4_800),
        step: 0
      });
    }
  }, [data.agents, view]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let stopped = false;
    const render = (time: number) => {
      if (stopped) return;
      const frameDelta = lastFrameTimeRef.current
        ? Math.min(50, Math.max(0, time - lastFrameTimeRef.current))
        : 16;
      lastFrameTimeRef.current = time;
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const pixelWidth = Math.max(1, Math.round(rect.width * ratio));
      const pixelHeight = Math.max(1, Math.round(rect.height * ratio));
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, rect.width, rect.height);
      const gradient = context.createLinearGradient(0, 0, rect.width, rect.height);
      gradient.addColorStop(0, "#dfe9df");
      gradient.addColorStop(.52, "#f2e6d4");
      gradient.addColorStop(1, "#d9e6df");
      context.fillStyle = gradient;
      context.fillRect(0, 0, rect.width, rect.height);
      context.fillStyle = "rgba(255,250,241,.28)";
      for (let x = 0; x < rect.width; x += 28) {
        for (let y = 0; y < rect.height; y += 28) {
          context.beginPath();
          context.arc(x, y, .7, 0, Math.PI * 2);
          context.fill();
        }
      }
      hitRef.current = [];
      if (view === "global") {
        const safeX = Math.max(72, rect.width * .1);
        const safeTop = Math.max(125, rect.height * .17);
        const safeBottom = Math.max(82, rect.height * .1);
        const point = (circle: PlazaSnapshot["circles"][number]) => ({
          x: ((safeX + (circle.x / 100) * (rect.width - safeX * 2)) - rect.width / 2) * camera.scale
            + rect.width / 2 + camera.x,
          y: ((safeTop + (circle.y / 100) * (rect.height - safeTop - safeBottom)) - rect.height / 2) * camera.scale
            + rect.height / 2 + camera.y
        });
        context.lineCap = "round";
        context.lineJoin = "round";
        const visible = data.circles.map((circle) => ({ circle, ...point(circle) }));
        context.strokeStyle = "rgba(255,250,241,.9)";
        context.lineWidth = 34 * camera.scale;
        visible.forEach((from, index) => {
          const nearest = visible
            .filter((_, targetIndex) => targetIndex !== index)
            .sort((a, b) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y))[0];
          if (!nearest || from.circle.id > nearest.circle.id) return;
          context.beginPath();
          context.moveTo(from.x, from.y + 24 * camera.scale);
          context.bezierCurveTo(from.x, nearest.y, nearest.x, from.y, nearest.x, nearest.y + 24 * camera.scale);
          context.stroke();
        });
        context.strokeStyle = "rgba(49,92,74,.18)";
        context.lineWidth = 2;
        visible.forEach((from, index) => {
          const nearest = visible[(index + 1) % visible.length];
          if (!nearest) return;
          context.setLineDash([8, 12]);
          context.beginPath();
          context.moveTo(from.x, from.y);
          context.lineTo(nearest.x, nearest.y);
          context.stroke();
        });
        context.setLineDash([]);
        const squareX = rect.width * .5 + camera.x;
        const squareY = rect.height * .51 + camera.y;
        context.save();
        context.globalAlpha = Math.min(1, camera.scale);
        context.fillStyle = "rgba(255,250,241,.74)";
        context.beginPath();
        context.ellipse(squareX, squareY, 90 * camera.scale, 45 * camera.scale, 0, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = "rgba(49,92,74,.18)";
        context.lineWidth = 2;
        context.stroke();
        context.fillStyle = "#7aa08a";
        context.beginPath();
        context.ellipse(squareX, squareY - 4, 25 * camera.scale, 12 * camera.scale, 0, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = "rgba(255,255,255,.78)";
        context.beginPath();
        context.arc(squareX, squareY - 10, 7 * camera.scale, 0, Math.PI * 2);
        context.fill();
        context.font = `700 ${Math.max(10, 12 * camera.scale)}px "Noto Sans SC", sans-serif`;
        context.fillStyle = "#315c4a";
        context.textAlign = "center";
        context.fillText("中央会客厅", squareX, squareY + 34 * camera.scale);
        context.restore();
        visible.sort((a, b) => a.y - b.y).forEach(({ circle, x, y }, index) => {
          const palette = colors[circle.color] ?? colors.sage!;
          const size = (74 + Math.min(30, circle.heat * .3)) * camera.scale;
          for (let treeIndex = 0; treeIndex < 3; treeIndex += 1) {
            const angle = (treeIndex / 3) * Math.PI * 2 + index;
            drawTree(context, x + Math.cos(angle) * size * .72, y + Math.sin(angle) * size * .34 + size * .35, 20 * camera.scale);
          }
          drawIsoBuilding(context, x, y, size, palette, circle.heat / 100);
          hitRef.current.push({ id: circle.id, x, y: y + size * .28, radius: Math.max(42, size * .72) });
          if (camera.scale >= .72) {
            context.font = `700 ${Math.max(12, 15 * camera.scale)}px "Noto Sans SC", sans-serif`;
            const titleWidth = context.measureText(circle.name).width;
            roundedRect(context, x - titleWidth / 2 - 10, y + size * .73, titleWidth + 20, 27, 9);
            context.fillStyle = "rgba(255,253,249,.92)";
            context.fill();
            context.fillStyle = "#183243";
            context.textAlign = "center";
            context.fillText(circle.name, x, y + size * .73 + 18);
            context.font = `500 ${Math.max(10, 11 * camera.scale)}px "Noto Sans SC", sans-serif`;
            context.fillStyle = "#526672";
            context.fillText(`${circle.topic} · ${circle.population} 位在场`, x, y + size * .73 + 42);
          }
        });
      } else {
        const circle = data.circles[0];
        const centerX = rect.width * .5;
        const centerY = rect.height * .5;
        context.fillStyle = "rgba(255,250,241,.82)";
        context.beginPath();
        context.ellipse(centerX, centerY + 38, rect.width * .4, rect.height * .34, 0, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = "rgba(49,92,74,.16)";
        context.lineWidth = 2;
        context.setLineDash([7, 12]);
        context.beginPath();
        context.ellipse(centerX, centerY + 38, rect.width * .31, rect.height * .25, 0, 0, Math.PI * 2);
        context.stroke();
        context.setLineDash([]);
        if (circle) {
          const palette = colors[circle.color] ?? colors.sage!;
          drawIsoBuilding(context, centerX, centerY - rect.height * .2, 92, palette, circle.heat / 100);
        }
        const treeCount = Math.max(6, Math.min(16, Math.round(rect.width / 90)));
        for (let index = 0; index < treeCount; index += 1) {
          const angle = (index / treeCount) * Math.PI * 2;
          drawTree(context, centerX + Math.cos(angle) * rect.width * .37, centerY + 40 + Math.sin(angle) * rect.height * .29, 25);
        }
        const discussion = circle ? getDiscussionScene(data, circle.id) : null;
        const participantIndex = new Map(discussion?.participantIds.map((userId, index) => [userId, index]) ?? []);
        const latestThreadEvent = discussion
          ? data.events
            .filter((event) => event.circleId === circle?.id)
            .filter((event) => event.id === discussion.rootEventId || event.metadata?.threadRootId === discussion.rootEventId)
            .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0]
          : undefined;
        const drawerSafeWidth = detailOpen
          ? (rect.width >= 760 ? rect.width * .62 : rect.width * .47)
          : rect.width * .84;
        if (!discussion && discussionRootRef.current && minePositionRef.current && mine) {
          minePositionRef.current.targetX = mine.x;
          minePositionRef.current.targetY = mine.y;
          minePositionRef.current.moving = !reducedMotion;
          movingRef.current = !reducedMotion;
        }
        discussionRootRef.current = discussion?.rootEventId ?? null;
        const renderedAgents = data.agents
          .map((agent) => {
            const radius = Math.max(8, circle?.radius ?? 18);
            let worldX = agent.x;
            let worldY = agent.y;
            let moving = false;
            const socialIndex = participantIndex.get(agent.userId);
            const discussionCenterAngle = discussion ? (hash(discussion.rootEventId) % 360) * Math.PI / 180 : 0;
            const discussionCenter = circle && discussion ? {
              x: circle.x + Math.cos(discussionCenterAngle) * circle.radius * .12,
              y: circle.y + Math.sin(discussionCenterAngle) * circle.radius * .08
            } : null;
            const screenSlot = socialIndex !== undefined && discussionCenter
              ? getDiscussionSlot(
                socialIndex,
                discussion!.participantIds.length,
                0,
                0
              )
              : null;
            const discussionTarget = screenSlot && discussionCenter && circle ? {
              x: discussionCenter.x + screenSlot.x * (radius * 2 / drawerSafeWidth),
              y: discussionCenter.y + screenSlot.y * (radius * 2 / (rect.height * .5))
            } : null;
            if (agent.mine && minePositionRef.current) {
              const position = minePositionRef.current;
              if (discussionTarget && !moveMode) {
                position.targetX = discussionTarget.x;
                position.targetY = discussionTarget.y;
                if (Math.hypot(position.targetX - position.x, position.targetY - position.y) > .035) {
                  position.moving = !reducedMotion;
                  movingRef.current = !reducedMotion;
                }
              }
              const dx = position.targetX - position.x;
              const dy = position.targetY - position.y;
              if (!reducedMotion && Math.hypot(dx, dy) > .035) {
                position.x += dx * .075;
                position.y += dy * .075;
                position.moving = true;
              } else {
                position.x = position.targetX;
                position.y = position.targetY;
                position.moving = false;
                movingRef.current = false;
              }
              worldX = position.x;
              worldY = position.y;
              moving = position.moving;
            } else if (!agent.mine && circle) {
              const state = ambientWalkRef.current.get(agent.userId);
              if (state) {
                if (discussionTarget) {
                  state.targetX = discussionTarget.x;
                  state.targetY = discussionTarget.y;
                  if (reducedMotion) {
                    state.x = state.targetX;
                    state.y = state.targetY;
                    state.moving = false;
                  } else {
                    state.moving = Math.hypot(state.targetX - state.x, state.targetY - state.y) > .035;
                  }
                } else if (!reducedMotion && !state.moving && time >= state.nextMoveAt) {
                  state.step += 1;
                  const seed = hash(`${agent.userId}:${state.step}`);
                  const angle = ((seed % 360) / 180) * Math.PI;
                  const distance = circle.radius * (.18 + ((seed >>> 8) % 54) / 100);
                  state.targetX = circle.x + Math.cos(angle) * distance;
                  state.targetY = circle.y + Math.sin(angle) * distance * .82;
                  state.moving = true;
                }
                if (!reducedMotion && state.moving) {
                  const dx = state.targetX - state.x;
                  const dy = state.targetY - state.y;
                  const remaining = Math.hypot(dx, dy);
                  const speed = (.00055 + (hash(agent.userId) % 5) * .00008) * frameDelta;
                  if (remaining <= Math.max(.04, speed)) {
                    state.x = state.targetX;
                    state.y = state.targetY;
                    state.moving = false;
                    state.nextMoveAt = time + 2_400 + (hash(`${agent.userId}:wait:${state.step}`) % 7_600);
                  } else {
                    state.x += (dx / remaining) * speed;
                    state.y += (dy / remaining) * speed;
                  }
                }
                worldX = state.x;
                worldY = state.y;
                moving = state.moving;
              }
            }
            const localX = Math.max(0, Math.min(1, .5 + (worldX - (circle?.x ?? 50)) / (radius * 2)));
            const localY = Math.max(0, Math.min(1, .5 + (worldY - (circle?.y ?? 50)) / (radius * 2)));
            return {
              agent,
              x: rect.width * .08 + localX * drawerSafeWidth,
              y: rect.height * .25 + localY * rect.height * .5,
              moving,
              socialIndex
            };
          });
        circleHitRef.current = new Map(renderedAgents.map(({ agent, x, y }) => [agent.userId, { x, y }]));
        const socialAgents = renderedAgents.filter((item) => item.socialIndex !== undefined);
        if (discussion && socialAgents.length >= 2) {
          const centerX = socialAgents.reduce((sum, item) => sum + item.x, 0) / socialAgents.length;
          const centerY = socialAgents.reduce((sum, item) => sum + item.y, 0) / socialAgents.length;
          drawDiscussionLinks(context, socialAgents, centerX, centerY, reducedMotion ? 0 : time, reducedMotion);
        }
        renderedAgents
          .sort((a, b) => a.y - b.y)
          .forEach(({ agent, x, y, moving, socialIndex }) => {
            const social = socialIndex !== undefined && discussion;
            const socialCenterX = socialAgents.length
              ? socialAgents.reduce((sum, item) => sum + item.x, 0) / socialAgents.length
              : x;
            const socialPose: SocialPose = social ? {
              role: agent.userId === discussion.speakerId ? "speaker" : "listener",
              facing: socialCenterX >= x ? 1 : -1,
              reactionIndex: socialIndex
            } : { role: "none", facing: 1 };
            if (agent.mine) drawMineGlow(context, x, y, time, reducedMotion);
            drawNpc(context, agent, x, y, reducedMotion ? 0 : time, moving, socialPose);
            drawRuntimeBadge(context, agent, x, y);
            if (socialPose.role === "speaker") {
              drawStatusBubble(
                context,
                agent,
                x,
                y,
                reducedMotion ? 0 : time,
                reducedMotion,
                latestThreadEvent?.content
              );
            } else if (socialPose.role === "listener") {
              drawListeningCue(context, x, y, reducedMotion ? 0 : time, reducedMotion, socialPose.reactionIndex ?? 0);
            } else {
              drawStatusBubble(context, agent, x, y, reducedMotion ? 0 : time, reducedMotion);
            }
            context.font = '700 11px "Noto Sans SC", sans-serif';
            const label = `${agent.agentName}${agent.mine ? " · 我的" : ""}`;
            const width = context.measureText(label).width + 14;
            roundedRect(context, x - width / 2, y + 20, width, 21, 7);
            context.fillStyle = agent.mine ? "rgba(255,242,237,.96)" : "rgba(255,253,249,.9)";
            context.fill();
            context.fillStyle = agent.mine ? "#b45443" : "#183243";
            context.textAlign = "center";
            context.fillText(label, x, y + 35);
          });
      }
      if (!reducedMotion || view === "global") frameRef.current = window.requestAnimationFrame(render);
    };
    frameRef.current = window.requestAnimationFrame(render);
    const observer = new ResizeObserver(() => {
      if (reducedMotion) render(0);
    });
    observer.observe(canvas);
    return () => {
      stopped = true;
      lastFrameTimeRef.current = 0;
      observer.disconnect();
      window.cancelAnimationFrame(frameRef.current);
    };
  }, [camera, data, detailOpen, view]);

  function onPointerDown(event: PointerEvent<HTMLCanvasElement>) {
    if (view !== "global") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, originX: camera.x, originY: camera.y, moved: false };
  }

  function onPointerMove(event: PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 5) drag.moved = true;
    setCamera((current) => ({ ...current, x: drag.originX + dx, y: drag.originY + dy }));
  }

  function onPointerUp(event: PointerEvent<HTMLCanvasElement>) {
    if (view === "circle") {
      const circle = data.circles[0];
      const rect = event.currentTarget.getBoundingClientRect();
      const screenX = event.clientX - rect.left;
      const screenY = event.clientY - rect.top;
      const drawerSafeWidth = detailOpen
        ? (rect.width >= 760 ? rect.width * .62 : rect.width * .47)
        : rect.width * .84;
      const radius = Math.max(8, circle?.radius ?? 18);
      if (!moveMode && circle && onSelectAgent) {
        const hit = data.agents
          .map((agent) => {
            const rendered = circleHitRef.current.get(agent.userId);
            const x = rendered?.x ?? rect.width * .5;
            const y = rendered?.y ?? rect.height * .5;
            return { userId: agent.userId, distance: Math.hypot(screenX - x, screenY - y) };
          })
          .sort((left, right) => left.distance - right.distance)[0];
        if (hit && hit.distance <= 32) {
          onSelectAgent(hit.userId);
          return;
        }
      }
      if (!moveMode) return;
      const currentMine = data.agents.find((agent) => agent.mine);
      if (!circle || !currentMine || !onMoveAgent) return;
      const localX = Math.max(.03, Math.min(.97, (screenX - rect.width * .08) / drawerSafeWidth));
      const localY = Math.max(.03, Math.min(.97, (screenY - rect.height * .25) / (rect.height * .5)));
      const rawX = circle.x + (localX - .5) * radius * 2;
      const rawY = circle.y + (localY - .5) * radius * 2;
      const dx = rawX - circle.x;
      const dy = rawY - circle.y;
      const normalizedDistance = Math.hypot(dx / radius, dy / radius);
      const scale = normalizedDistance > .94 ? .94 / normalizedDistance : 1;
      const targetX = circle.x + dx * scale;
      const targetY = circle.y + dy * scale;
      if (!minePositionRef.current) {
        minePositionRef.current = {
          x: currentMine.x, y: currentMine.y, targetX: currentMine.x, targetY: currentMine.y, moving: false
        };
      }
      minePositionRef.current.targetX = targetX;
      minePositionRef.current.targetY = targetY;
      minePositionRef.current.moving = true;
      movingRef.current = true;
      void onMoveAgent(circle.id, targetX, targetY).catch(() => {
        if (!minePositionRef.current) return;
        minePositionRef.current.targetX = currentMine.x;
        minePositionRef.current.targetY = currentMine.y;
        minePositionRef.current.moving = true;
        movingRef.current = true;
      });
      return;
    }
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    if (!drag.moved) {
      const rect = event.currentTarget.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const target = [...hitRef.current].reverse().find((item) => Math.hypot(x - item.x, y - item.y) <= item.radius);
      if (target) onEnterCircle(target.id);
    }
    dragRef.current = null;
  }

  function onWheel(event: WheelEvent<HTMLCanvasElement>) {
    if (view !== "global") return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    setCamera((current) => {
      const nextScale = Math.min(2.15, Math.max(.55, current.scale * (event.deltaY > 0 ? .9 : 1.1)));
      const ratio = nextScale / current.scale;
      return {
        scale: nextScale,
        x: pointerX - (pointerX - current.x) * ratio,
        y: pointerY - (pointerY - current.y) * ratio
      };
    });
  }

  return <canvas
    ref={canvasRef}
    className={`living-town-canvas ${view === "circle" && mine && onMoveAgent && moveMode ? "agent-controllable" : ""}`}
    aria-hidden="true"
    onPointerDown={onPointerDown}
    onPointerMove={onPointerMove}
    onPointerUp={onPointerUp}
    onPointerCancel={() => { dragRef.current = null; }}
    onWheel={onWheel}
  />;
}
