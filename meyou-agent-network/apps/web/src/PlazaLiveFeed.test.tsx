import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PlazaSnapshot } from "@meyou/shared";
import { PlazaLiveFeed } from "./PlazaLiveFeed";

const data = {
  agents: [], discussions: [],
  events: [{ id: "real-event", ownerName: "林汐", agentName: "小林", kind: "chatting", content: "完整消息，不截断正文。",
    createdAt: "2026-10-28T00:00:00Z" }]
} as unknown as PlazaSnapshot;

HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };

describe("plaza live feed", () => {
  it("does not request history before opening and returns focus on Escape", () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    try {
      render(<PlazaLiveFeed data={{ ...data, scope: { circleId: "circle" } } as PlazaSnapshot}
        locale="zh-CN" busy={false} paused={false} joined={true}
        onPublish={vi.fn()} onSettings={vi.fn()} onMove={vi.fn()} moveMode={false} />);
      const trigger = screen.getByRole("button", { name: "展开群聊与行动记录" });
      expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
      expect(trigger).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
      fireEvent.click(trigger);
      fireEvent(screen.getByRole("dialog"), new Event("cancel"));
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(trigger).toHaveFocus();
      expect(trigger).toHaveAttribute("aria-expanded", "false");
    } finally { fetchMock.mockRestore(); }
  });
  it("shows full public messages and preserves input when publishing fails", async () => {
    const publish = vi.fn().mockResolvedValue(false);
    render(<PlazaLiveFeed data={data} locale="zh-CN" busy={false} paused={false} joined={true}
      onPublish={publish} onSettings={vi.fn()} onMove={vi.fn()} moveMode={false} />);
    expect(screen.queryByText("完整消息，不截断正文。")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /展开群聊/ }));
    expect(screen.getByText("完整消息，不截断正文。")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("发布群聊话题"), { target: { value: "讨论一个实际问题" } });
    fireEvent.click(screen.getByRole("button", { name: "发布话题" }));
    expect(publish).toHaveBeenCalledWith("讨论一个实际问题");
    expect(screen.getByLabelText("发布群聊话题")).toHaveValue("讨论一个实际问题");
  });
  it("blocks publishing while paused and explains why", () => {
    render(<PlazaLiveFeed data={data} locale="en" busy={false} paused={true} joined={false}
      onPublish={vi.fn()} onSettings={vi.fn()} onMove={vi.fn()} moveMode={false} />);
    fireEvent.click(screen.getByRole("button", { name: /Open conversation/ }));
    fireEvent.change(screen.getByLabelText("Post a discussion topic"), { target: { value: "topic" } });
    expect(screen.getByRole("button", { name: "Post topic" })).toBeDisabled();
    expect(screen.getByText("Agent paused. Restore community permission first.")).toBeTruthy();
  });
  it("keeps a draft when the reading sheet is collapsed and reopened", () => {
    render(<PlazaLiveFeed data={data} locale="zh-CN" busy={false} paused={false} joined={true}
      onPublish={vi.fn()} onSettings={vi.fn()} onMove={vi.fn()} moveMode={false} />);
    const open = screen.getByRole("button", { name: /展开群聊/ });
    expect(open).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(open);
    fireEvent.change(screen.getByLabelText("发布群聊话题"), { target: { value: "保留草稿" } });
    fireEvent.click(screen.getByRole("button", { name: "收起群聊" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(open);
    expect(screen.getByLabelText("发布群聊话题")).toHaveValue("保留草稿");
  });
  it("searches only loaded messages and closes the modal before moving", () => {
    const move = vi.fn();
    render(<PlazaLiveFeed data={data} locale="zh-CN" busy={false} paused={false} joined={true}
      onPublish={vi.fn()} onSettings={vi.fn()} onMove={move} moveMode={false} />);
    fireEvent.click(screen.getByRole("button", { name: /展开群聊/ }));
    fireEvent.change(screen.getByLabelText("搜索圈子历史消息"), { target: { value: "不存在" } });
    expect(screen.queryByText("完整消息，不截断正文。")).toBeNull();
    expect(screen.getByText("没有匹配消息。清空关键词或切换话题再试。")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("搜索圈子历史消息"), { target: { value: "林汐" } });
    expect(screen.getByText("完整消息，不截断正文。")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "移动我的 Agent" }));
    expect(move).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("keeps existing messages and offers retry after a history failure", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("unavailable", { status: 503 }));
    try {
      render(<PlazaLiveFeed data={{ ...data, scope: { circleId: "circle" } } as PlazaSnapshot}
        locale="zh-CN" busy={false} paused={false} joined={true}
        onPublish={vi.fn()} onSettings={vi.fn()} onMove={vi.fn()} moveMode={false} />);
      fireEvent.click(screen.getByRole("button", { name: /展开群聊/ }));
      await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("历史消息读取失败"));
      expect(screen.getByText("完整消息，不截断正文。")).toBeTruthy();
      const calls = fetchMock.mock.calls.length;
      fireEvent.click(screen.getByRole("button", { name: "重试" }));
      await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(calls));
    } finally { fetchMock.mockRestore(); }
  });
  it("shows an old topic title and its own ended status outside the live snapshot", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async input => {
      if (String(input).includes("/topics?")) return new Response(JSON.stringify({
        topics: [{
          rootEventId: "old-topic", circleId: "circle", title: "早期真实讨论",
          ownerName: "林汐", currentRound: 3, maxRounds: 5, status: "ended",
          endReason: "已经形成结论", createdAt: "2026-10-20T00:00:00Z", updatedAt: "2026-10-20T01:00:00Z"
        }], nextCursor: null
      }), { status: 200 });
      return new Response(JSON.stringify({ events: data.events, nextCursor: null }), { status: 200 });
    });
    try {
      render(<PlazaLiveFeed data={{ ...data, scope: { circleId: "circle" } } as PlazaSnapshot}
        locale="zh-CN" busy={false} paused={false} joined={false}
        onPublish={vi.fn()} onSettings={vi.fn()} onMove={vi.fn()} moveMode={false} />);
      fireEvent.click(screen.getByRole("button", { name: /展开群聊/ }));
      await screen.findByRole("option", { name: "早期真实讨论" });
      fireEvent.change(screen.getByLabelText("筛选群聊话题"), { target: { value: "old-topic" } });
      expect(screen.getByText("3 / 5 轮")).toBeTruthy();
      expect(screen.getByText("已经形成结论")).toBeTruthy();
      expect(screen.getAllByText("早期真实讨论")).toHaveLength(2);
    } finally { fetchMock.mockRestore(); }
  });
});
