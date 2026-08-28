const DEFAULT_SIZE = Object.freeze({ width: 1440, height: 900 });
const MINIMUM_SIZE = Object.freeze({ width: 980, height: 640 });
const MINIMUM_VISIBLE = Object.freeze({ width: 180, height: 90 });

function finiteNumber(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function normalizedArea(display) {
  const area = display?.workArea || display?.bounds;
  if (
    !area ||
    !Number.isFinite(area.x) ||
    !Number.isFinite(area.y) ||
    !Number.isFinite(area.width) ||
    !Number.isFinite(area.height) ||
    area.width <= 0 ||
    area.height <= 0
  ) {
    return null;
  }
  return {
    x: area.x,
    y: area.y,
    width: area.width,
    height: area.height
  };
}

function intersectionSize(bounds, area) {
  const width = Math.max(
    0,
    Math.min(bounds.x + bounds.width, area.x + area.width) -
      Math.max(bounds.x, area.x)
  );
  const height = Math.max(
    0,
    Math.min(bounds.y + bounds.height, area.y + area.height) -
      Math.max(bounds.y, area.y)
  );
  return { width, height, area: width * height };
}

function displayIdentity(display) {
  return display?.id == null ? null : String(display.id);
}

function viableDisplays(displays) {
  return (Array.isArray(displays) ? displays : [])
    .map((display) => ({
      display,
      id: displayIdentity(display),
      area: normalizedArea(display)
    }))
    .filter((candidate) => candidate.area);
}

function primaryCandidate(candidates, primaryDisplay) {
  const primaryId = displayIdentity(primaryDisplay);
  return (
    candidates.find((candidate) => candidate.id === primaryId) ||
    candidates[0] ||
    {
      display: null,
      id: null,
      area: {
        x: 0,
        y: 0,
        width: DEFAULT_SIZE.width,
        height: DEFAULT_SIZE.height
      }
    }
  );
}

function centeredBounds(area) {
  const minimumWidth = Math.min(MINIMUM_SIZE.width, area.width);
  const minimumHeight = Math.min(MINIMUM_SIZE.height, area.height);
  const width = clamp(DEFAULT_SIZE.width, minimumWidth, area.width);
  const height = clamp(DEFAULT_SIZE.height, minimumHeight, area.height);
  return {
    x: Math.round(area.x + (area.width - width) / 2),
    y: Math.round(area.y + (area.height - height) / 2),
    width,
    height
  };
}

function centeredBoundsWithSize(area, bounds) {
  const width = clamp(
    bounds.width,
    Math.min(MINIMUM_SIZE.width, area.width),
    area.width
  );
  const height = clamp(
    bounds.height,
    Math.min(MINIMUM_SIZE.height, area.height),
    area.height
  );
  return {
    x: Math.round(area.x + (area.width - width) / 2),
    y: Math.round(area.y + (area.height - height) / 2),
    width: Math.round(width),
    height: Math.round(height)
  };
}

function constrainBounds(bounds, area) {
  const minimumWidth = Math.min(MINIMUM_SIZE.width, area.width);
  const minimumHeight = Math.min(MINIMUM_SIZE.height, area.height);
  const width = clamp(
    finiteNumber(bounds?.width, DEFAULT_SIZE.width),
    minimumWidth,
    area.width
  );
  const height = clamp(
    finiteNumber(bounds?.height, DEFAULT_SIZE.height),
    minimumHeight,
    area.height
  );
  const x = clamp(
    finiteNumber(bounds?.x, area.x),
    area.x,
    area.x + area.width - width
  );
  const y = clamp(
    finiteNumber(bounds?.y, area.y),
    area.y,
    area.y + area.height - height
  );
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height)
  };
}

function selectDisplay(rawBounds, candidates, primaryDisplay, storedDisplayId) {
  const preferred = candidates.find(
    (candidate) => candidate.id === String(storedDisplayId)
  );
  const scored = candidates
    .map((candidate) => ({
      ...candidate,
      intersection: intersectionSize(rawBounds, candidate.area)
    }))
    .sort((left, right) => right.intersection.area - left.intersection.area);
  const visible = scored.find(
    (candidate) =>
      candidate.intersection.width >= MINIMUM_VISIBLE.width &&
      candidate.intersection.height >= MINIMUM_VISIBLE.height
  );
  if (
    preferred &&
    intersectionSize(rawBounds, preferred.area).width >=
      MINIMUM_VISIBLE.width &&
    intersectionSize(rawBounds, preferred.area).height >=
      MINIMUM_VISIBLE.height
  ) {
    return preferred;
  }
  return visible || primaryCandidate(candidates, primaryDisplay);
}

function restoreWindowState(rawState, displays, primaryDisplay) {
  const candidates = viableDisplays(displays);
  const fallback = primaryCandidate(candidates, primaryDisplay);
  const validStoredBounds =
    rawState &&
    typeof rawState === "object" &&
    rawState.bounds &&
    Number.isFinite(rawState.bounds.x) &&
    Number.isFinite(rawState.bounds.y) &&
    Number.isFinite(rawState.bounds.width) &&
    Number.isFinite(rawState.bounds.height) &&
    rawState.bounds.width > 0 &&
    rawState.bounds.height > 0;
  if (!validStoredBounds) {
    return {
      bounds: centeredBounds(fallback.area),
      displayId: fallback.id,
      isMaximized: false,
      isFullScreen: false,
      recoveredToVisibleDisplay: true
    };
  }

  const rawBounds = {
    x: finiteNumber(rawState.bounds.x, fallback.area.x),
    y: finiteNumber(rawState.bounds.y, fallback.area.y),
    width: finiteNumber(rawState.bounds.width, DEFAULT_SIZE.width),
    height: finiteNumber(rawState.bounds.height, DEFAULT_SIZE.height)
  };
  const selected = selectDisplay(
    rawBounds,
    candidates,
    primaryDisplay,
    rawState.displayId
  );
  const intersection = intersectionSize(rawBounds, selected.area);
  const recoveredToVisibleDisplay =
    intersection.width < MINIMUM_VISIBLE.width ||
    intersection.height < MINIMUM_VISIBLE.height;
  return {
    bounds: recoveredToVisibleDisplay
      ? centeredBoundsWithSize(selected.area, rawBounds)
      : constrainBounds(rawBounds, selected.area),
    displayId: selected.id,
    isMaximized: rawState.isMaximized === true,
    isFullScreen: rawState.isFullScreen === true,
    recoveredToVisibleDisplay
  };
}

function captureWindowState(bounds, options = {}) {
  return {
    schemaVersion: 1,
    bounds: {
      x: Math.round(finiteNumber(bounds?.x, 0)),
      y: Math.round(finiteNumber(bounds?.y, 0)),
      width: Math.round(
        finiteNumber(bounds?.width, DEFAULT_SIZE.width)
      ),
      height: Math.round(
        finiteNumber(bounds?.height, DEFAULT_SIZE.height)
      )
    },
    displayId:
      options.displayId == null ? null : String(options.displayId),
    isMaximized: options.isMaximized === true,
    isFullScreen: options.isFullScreen === true,
    savedAt: options.savedAt || new Date().toISOString()
  };
}

module.exports = {
  DEFAULT_SIZE,
  MINIMUM_SIZE,
  MINIMUM_VISIBLE,
  captureWindowState,
  centeredBounds,
  centeredBoundsWithSize,
  constrainBounds,
  intersectionSize,
  restoreWindowState
};
