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
  onMoveAgent?: (circleId: string, x: number, y: number) => Promise<void>;
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

function hash(value: string) {
  return [...value].reduce((total, char) => ((total * 31) + char.charCodeAt(0)) >>> 0, 7);
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
  moving = false
) {
  const seed = hash(agent.userId);
  const shirt = agent.npcColor ?? (agent.mine ? "#e86751" : peopleColors[seed % peopleColors.length]!);
  const skin = ["#f2c9a8", "#e5b58d", "#f5d2b5", "#c98f68", "#9f684d"][seed % 5]!;
  const hair = ["#30231f", "#5f4437", "#211d1c", "#8a5a35"][seed % 4]!;
  const walking = moving || agent.activity === "walking";
  const bob = Math.sin(time * (walking ? .009 : .003) + seed) * (walking ? 2.5 : 1);
  context.save();
  context.translate(x, y + bob);
  context.fillStyle = "rgba(24,50,67,.16)";
  context.beginPath();
  context.ellipse(0, 12, 15, 5, 0, 0, Math.PI * 2);
  context.fill();
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
  context.moveTo(-8, -18);
  context.lineTo(-13 - stride * .45, -7);
  context.moveTo(8, -18);
  context.lineTo(13 + stride * .45, -7);
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

export function PlazaWorld({
  data, view, camera, setCamera, onEnterCircle, onMoveAgent, detailOpen = true
}: PlazaWorldProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<{ id: number; x: number; y: number; originX: number; originY: number; moved: boolean } | null>(null);
  const frameRef = useRef(0);
  const hitRef = useRef<Array<{ id: string; x: number; y: number; radius: number }>>([]);
  const minePositionRef = useRef<{ x: number; y: number; targetX: number; targetY: number; moving: boolean } | null>(null);
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
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let stopped = false;
    const render = (time: number) => {
      if (stopped) return;
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
        data.agents
          .map((agent) => {
            const radius = Math.max(8, circle?.radius ?? 18);
            let worldX = agent.x;
            let worldY = agent.y;
            let moving = false;
            if (agent.mine && minePositionRef.current) {
              const position = minePositionRef.current;
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
            }
            const localX = Math.max(0, Math.min(1, .5 + (worldX - (circle?.x ?? 50)) / (radius * 2)));
            const localY = Math.max(0, Math.min(1, .5 + (worldY - (circle?.y ?? 50)) / (radius * 2)));
            const drawerSafeWidth = detailOpen
              ? (rect.width >= 760 ? rect.width * .62 : rect.width * .47)
              : rect.width * .84;
            return {
              agent,
              x: rect.width * .08 + localX * drawerSafeWidth,
              y: rect.height * .25 + localY * rect.height * .5,
              moving
            };
          })
          .sort((a, b) => a.y - b.y)
          .forEach(({ agent, x, y, moving }) => {
            if (agent.mine) drawMineGlow(context, x, y, time, reducedMotion);
            drawNpc(context, agent, x, y, reducedMotion ? 0 : time, moving);
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
      const currentMine = data.agents.find((agent) => agent.mine);
      if (!circle || !currentMine || !onMoveAgent) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const screenX = event.clientX - rect.left;
      const screenY = event.clientY - rect.top;
      const drawerSafeWidth = detailOpen
        ? (rect.width >= 760 ? rect.width * .62 : rect.width * .47)
        : rect.width * .84;
      const radius = Math.max(8, circle.radius);
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
    className={`living-town-canvas ${view === "circle" && mine && onMoveAgent ? "agent-controllable" : ""}`}
    aria-hidden="true"
    onPointerDown={onPointerDown}
    onPointerMove={onPointerMove}
    onPointerUp={onPointerUp}
    onPointerCancel={() => { dragRef.current = null; }}
    onWheel={onWheel}
  />;
}
