import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { useAppStore } from "./store";

describe("MeYou web experience", () => {
  it("renders the original product promise on the landing page", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={["/"]}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(screen.getByText(/替你遇见/)).toBeTruthy();
    expect(screen.getByText("Agent 帮你找对象")).toBeTruthy();
  });

  it("exposes the agent plaza as a first-class web destination", () => {
    useAppStore.getState().setLocale("zh-CN");
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={["/app"]}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(screen.getByRole("link", { name: "广场" })).toHaveAttribute("href", "/app/plaza");
  });

  it("renders a dedicated running state after dating setup", async () => {
    global.fetch = async (input) => {
      const path = String(input);
      if (path.includes("/api/v1/me")) {
        return new Response(JSON.stringify({
          user: { id: "user-1", handle: "lincheng", displayName: "林澄" },
          agent: { id: "agent-1", name: "小遇" }
        }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      if (path.includes("/api/v1/matches")) {
        return new Response(JSON.stringify({ matches: [] }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    };
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={["/app/dating/results"]}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(await screen.findByText(/资料已保存/)).toBeTruthy();
    expect(await screen.findByText(/还没有通过双方核对的候选/)).toBeTruthy();
  });

  it("opens a real community creation flow instead of leaving a dead button", async () => {
    global.fetch = async (input) => {
      const path = String(input);
      if (path.includes("/api/v1/me")) {
        return new Response(JSON.stringify({
          user: { id: "user-1", handle: "lincheng", displayName: "林澄" },
          agent: { id: "agent-1", name: "小遇" }
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (path.includes("/api/v1/communities")) {
        return new Response(JSON.stringify({ communities: [] }), {
          status: 200, headers: { "content-type": "application/json" }
        });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    };
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={["/app/communities"]}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>
    );
    fireEvent.click(await screen.findByRole("button", { name: "创建社群" }));
    expect(screen.getByRole("dialog", { name: "创建一个真实社群" })).toBeTruthy();
    expect(screen.getByLabelText("社群名称")).toBeTruthy();
    const submit = screen.getByRole("button", { name: /创建并进入/ });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    expect(await screen.findByText("请至少填写 2 个字符的社群名称")).toBeTruthy();
    expect(screen.getByText("请输入 3–32 位英文、数字、横线或下划线")).toBeTruthy();
  });

  it("allows any non-empty continuous-search description", async () => {
    let submitted: Record<string, unknown> | undefined;
    global.fetch = async (input, init) => {
      const path = String(input);
      if (path.includes("/api/v1/me")) {
        return new Response(JSON.stringify({
          user: { id: "user-1", handle: "lincheng", displayName: "林澄" },
          agent: { id: "agent-1", name: "小遇" }
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (path.includes("/api/v1/discover/missions") && init?.method === "POST") {
        submitted = JSON.parse(String(init.body));
        return new Response(JSON.stringify({ mission: { id: "mission-1" } }), {
          status: 201, headers: { "content-type": "application/json" }
        });
      }
      if (path.includes("/api/v1/discover/missions")) {
        return new Response(JSON.stringify({ missions: [] }), {
          status: 200, headers: { "content-type": "application/json" }
        });
      }
      if (path.includes("/api/v1/directory")) {
        return new Response(JSON.stringify({ people: [] }), {
          status: 200, headers: { "content-type": "application/json" }
        });
      }
      if (path.includes("/api/v1/matches")) {
        return new Response(JSON.stringify({ matches: [] }), {
          status: 200, headers: { "content-type": "application/json" }
        });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    };
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={["/app/discover"]}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>
    );
    const submit = await screen.findByRole("button", { name: "开始留意" });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    expect(await screen.findByText("请输入你想遇见怎样的人")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText(/在上海做 AI Developer Tools/), { target: { value: "哈哈哈" } });
    expect(screen.getByText(/可以创建；描述越具体/)).toBeTruthy();
    fireEvent.click(submit);
    expect(submitted?.prompt).toBe("哈哈哈");
  });

  it("explains a full mission quota and lets the user pause the running mission", async () => {
    let paused = false;
    global.fetch = async (input, init) => {
      const path = String(input);
      if (path.includes("/api/v1/me")) {
        return new Response(JSON.stringify({
          user: { id: "user-1", handle: "lincheng", displayName: "林澄" },
          agent: { id: "agent-1", name: "小遇" }
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (path.includes("/api/v1/dashboard")) {
        return new Response(JSON.stringify({
          usage: { activeMissions: paused ? 0 : 1, activeMissionsLimit: 1 }
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (path.includes("/api/v1/discover/missions/mission-1") && init?.method === "PATCH") {
        paused = JSON.parse(String(init.body)).active === false;
        return new Response(JSON.stringify({ mission: { id: "mission-1", active: false } }), {
          status: 200, headers: { "content-type": "application/json" }
        });
      }
      if (path.includes("/api/v1/discover/missions")) {
        return new Response(JSON.stringify({ missions: [{
          id: "mission-1", kind: "business", prompt: "寻找产品伙伴", active: !paused
        }] }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (path.includes("/api/v1/directory")) {
        return new Response(JSON.stringify({ people: [] }), {
          status: 200, headers: { "content-type": "application/json" }
        });
      }
      if (path.includes("/api/v1/matches")) {
        return new Response(JSON.stringify({ matches: [] }), {
          status: 200, headers: { "content-type": "application/json" }
        });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    };
    const view = render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={["/app/discover"]}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(await view.findByText("1/1 正在运行")).toBeTruthy();
    fireEvent.change(view.getByPlaceholderText(/在上海做 AI Developer Tools/), { target: { value: "再找一个人" } });
    fireEvent.click(view.getByRole("button", { name: "开始留意" }));
    expect(await view.findByText(/名额已用完/)).toBeTruthy();
    fireEvent.click(view.getByRole("button", { name: "暂停任务" }));
    expect(await view.findByRole("button", { name: "恢复任务" })).toBeTruthy();
    expect(paused).toBe(true);
  });
  it("uses real dashboard counts and makes every pending item actionable", async () => {
    useAppStore.getState().setLocale("zh-CN");
    const dashboard = {
      viewer: { id: "user-1", name: "林澄", plan: "free" },
      agent: { id: "agent-1", name: "小遇", status: "confirm", completion: 60 },
      attention: [
        { id: "a", type: "handoff", title: "访客留言", detail: "请查看", time: "2026-10-26T09:00:00Z", href: "/app/customers?inquiry=a" },
        { id: "b", type: "approval", title: "回复草稿", detail: "待确认", time: "2026-10-26T09:01:00Z", href: "/app/messages?conversation=b" }
      ],
      matches: [], missions: [{ id: "paused", prompt: "已暂停的寻找", active: false }],
      usage: { agentReplies: 100, agentRepliesLimit: 80 }, customers: [], organizations: []
    };
    global.fetch = async input => new Response(JSON.stringify(String(input).includes("/dashboard") ? dashboard : {
      user: { displayName: "林澄" }, agent: { modes: { personal: "confirm" } }
    }), { status: 200 });
    const view = render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={["/app"]}><App /></MemoryRouter>
    </QueryClientProvider>);
    expect(await view.findByText("2 件事，等你来决定。")).toBeTruthy();
    expect(view.getByRole("link", { name: /访客留言/ })).toHaveAttribute("href", "/app/customers?inquiry=a");
    expect(view.getByRole("link", { name: /回复草稿/ })).toHaveAttribute("href", "/app/messages?conversation=b");
    expect(view.queryByText(/12 次沟通/)).toBeNull();
    expect(view.queryByText("已暂停的寻找")).toBeNull();
    expect(view.container.querySelector(".progress i")).toHaveStyle({ width: "100%" });
  });

  it("lets users retry failed data requests without reloading the page", async () => {
    useAppStore.getState().setLocale("zh-CN");
    let recovered = false;
    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/communities")) {
        return new Response(JSON.stringify(recovered ? { communities: [] } : { error: "service_unavailable" }), { status: recovered ? 200 : 503 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    global.fetch = fetchSpy;
    const view = render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={["/app/communities"]}><App /></MemoryRouter>
    </QueryClientProvider>);
    const retry = await view.findByRole("button", { name: "重新加载" });
    const before = fetchSpy.mock.calls.length;
    recovered = true;
    fireEvent.click(retry);
    expect(await view.findByText("还没有加入社群")).toBeTruthy();
    expect(fetchSpy.mock.calls.length).toBeGreaterThan(before);
  });
});
