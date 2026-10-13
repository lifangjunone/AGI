# 坐坐游戏厅

一个可持续加入小游戏的网页游戏底座。大厅负责选游戏、筛选和保存成绩，每个游戏是独立组件。

## 首发游戏

- 节奏反应
- 闪记方格
- 盯住圆点
- 心算快跑
- 十秒直觉

## 启动

```bash
npm install
npm run dev
```

## 首发回归

```bash
npm test
npm run test:e2e
npm run build
```

## 新增一个游戏

1. 在 `src/games/` 新建游戏组件，接收可选的 `onScore(score)` 回调。
2. 在 `src/games/registry.jsx` 注册游戏信息和组件。
3. 设置 `available: true`，游戏会自动坐进大厅对应的位置。

游戏组件示例：

```jsx
export function NewGame({ onScore }) {
  return <button onClick={() => onScore(100)}>完成游戏</button>;
}
```

注册表示例：

```jsx
{
  id: "new-game",
  name: "新游戏",
  category: "反应",
  duration: "1 分钟",
  players: "单人",
  color: "#ef4f32",
  accent: "#ffcb3d",
  icon: Gamepad2,
  component: NewGame,
  available: true,
}
```
