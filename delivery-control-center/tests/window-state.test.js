const test = require("node:test");
const assert = require("node:assert/strict");

const {
  MINIMUM_SIZE,
  captureWindowState,
  intersectionSize,
  restoreWindowState
} = require("../src/window-state");

const displays = [
  {
    id: 1,
    workArea: { x: 0, y: 25, width: 1920, height: 1055 }
  },
  {
    id: 2,
    workArea: { x: -1200, y: 0, width: 1200, height: 1920 }
  }
];

test("首次启动在主显示器工作区居中并遵守产品尺寸", () => {
  const restored = restoreWindowState(null, displays, displays[0]);

  assert.deepEqual(restored.bounds, {
    x: 240,
    y: 103,
    width: 1440,
    height: 900
  });
  assert.equal(restored.displayId, "1");
  assert.equal(restored.recoveredToVisibleDisplay, true);
});

test("产品原生最小窗口覆盖 980×640 目标分辨率", () => {
  assert.deepEqual(MINIMUM_SIZE, { width: 980, height: 640 });

  const restored = restoreWindowState(
    {
      bounds: { x: 80, y: 60, width: 900, height: 580 },
      displayId: "1"
    },
    displays,
    displays[0]
  );

  assert.deepEqual(restored.bounds, {
    x: 80,
    y: 60,
    width: 980,
    height: 640
  });
});

test("合法负坐标副屏状态保持在原显示器", () => {
  const restored = restoreWindowState(
    {
      bounds: { x: -1180, y: 120, width: 1100, height: 800 },
      displayId: "2"
    },
    displays,
    displays[0]
  );

  assert.deepEqual(restored.bounds, {
    x: -1180,
    y: 120,
    width: 1100,
    height: 800
  });
  assert.equal(restored.displayId, "2");
  assert.equal(restored.recoveredToVisibleDisplay, false);
});

test("副屏拔除后按原尺寸回到主屏中央", () => {
  const restored = restoreWindowState(
    {
      bounds: { x: -1180, y: 120, width: 1100, height: 800 },
      displayId: "2"
    },
    [displays[0]],
    displays[0]
  );

  assert.deepEqual(restored.bounds, {
    x: 410,
    y: 153,
    width: 1100,
    height: 800
  });
  assert.equal(restored.displayId, "1");
  assert.equal(restored.recoveredToVisibleDisplay, true);
});

test("低于最小可见面积的窗口回屏而非保留危险边缘位置", () => {
  const restored = restoreWindowState(
    {
      bounds: { x: 1800, y: 1000, width: 1080, height: 700 },
      displayId: "1"
    },
    displays,
    displays[0]
  );

  assert.deepEqual(restored.bounds, {
    x: 420,
    y: 203,
    width: 1080,
    height: 700
  });
  assert.equal(restored.recoveredToVisibleDisplay, true);
});

test("旋转小屏会约束尺寸但不会把窗口放到工作区外", () => {
  const portrait = {
    id: 7,
    workArea: { x: 1920, y: -300, width: 900, height: 1400 }
  };
  const restored = restoreWindowState(
    {
      bounds: { x: 1960, y: -250, width: 1440, height: 900 },
      displayId: "7"
    },
    [displays[0], portrait],
    displays[0]
  );

  assert.deepEqual(restored.bounds, {
    x: 1920,
    y: -250,
    width: 900,
    height: 900
  });
  assert.equal(restored.displayId, "7");
});

test("损坏状态整体回退默认值且不继承最大化或全屏", () => {
  const restored = restoreWindowState(
    {
      bounds: { x: Number.POSITIVE_INFINITY, y: 10, width: -1, height: 0 },
      displayId: "2",
      isMaximized: true,
      isFullScreen: true
    },
    displays,
    displays[0]
  );

  assert.deepEqual(restored.bounds, {
    x: 240,
    y: 103,
    width: 1440,
    height: 900
  });
  assert.equal(restored.isMaximized, false);
  assert.equal(restored.isFullScreen, false);
});

test("最大化和全屏标记只接受严格布尔值", () => {
  const restored = restoreWindowState(
    {
      bounds: { x: 100, y: 100, width: 1200, height: 760 },
      displayId: 1,
      isMaximized: true,
      isFullScreen: "true"
    },
    displays,
    displays[0]
  );

  assert.equal(restored.isMaximized, true);
  assert.equal(restored.isFullScreen, false);
});

test("窗口状态捕获对坐标取整并规范化显示器标识", () => {
  const captured = captureWindowState(
    { x: -400.4, y: 22.8, width: 1200.2, height: 800.7 },
    {
      displayId: 99,
      isMaximized: true,
      isFullScreen: false,
      savedAt: "2026-08-18T10:00:00.000Z"
    }
  );

  assert.deepEqual(captured, {
    schemaVersion: 1,
    bounds: { x: -400, y: 23, width: 1200, height: 801 },
    displayId: "99",
    isMaximized: true,
    isFullScreen: false,
    savedAt: "2026-08-18T10:00:00.000Z"
  });
});

test("交集计算同时支持负坐标和无交集", () => {
  assert.deepEqual(
    intersectionSize(
      { x: -400, y: 100, width: 500, height: 500 },
      displays[1].workArea
    ),
    { width: 400, height: 500, area: 200000 }
  );
  assert.deepEqual(
    intersectionSize(
      { x: 3000, y: 3000, width: 500, height: 500 },
      displays[0].workArea
    ),
    { width: 0, height: 0, area: 0 }
  );
});
