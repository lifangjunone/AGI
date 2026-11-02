import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { SessionGate } from "./SessionGate";
import { useAppStore } from "./store";
import { SESSION_CHANGE_KEY } from "./session-sync";

afterEach(() => {
  vi.restoreAllMocks();
  useAppStore.getState().setLocale("zh-CN");
});

function mount() {
  useAppStore.getState().setLocale("en");
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <SessionGate login={<p>Login form</p>}><p>Private workspace</p></SessionGate>
  </QueryClientProvider>);
}

it("does not mount private content on a session failure and allows retry", async () => {
  vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ user: { id: "user-a", name: "Alice" } })));
  mount();
  expect(await screen.findByRole("alert")).toHaveTextContent("Unable to verify your session");
  expect(screen.queryByText("Private workspace")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Verify again" }));
  expect(await screen.findByText("Private workspace")).toBeTruthy();
});

it("shows login for an anonymous session without mounting private content", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ user: null })));
  mount();
  expect(await screen.findByText("Login form")).toBeTruthy();
  expect(screen.queryByText("Private workspace")).toBeNull();
});

it("rejects a malformed successful response instead of treating it as authenticated", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
  mount();
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.queryByText("Private workspace")).toBeNull();
});

it("rechecks cross-tab changes, clears private cache and unmounts old connections", async () => {
  let identity: { id: string; name: string } | null = { id: "alice", name: "Alice" };
  const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
    new Response(JSON.stringify({ user: identity })));
  const closed = vi.fn();
  function Workspace() {
    useEffect(() => () => closed(), []);
    return <p>Private workspace</p>;
  }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}>
    <SessionGate login={<p>Login form</p>}><Workspace /></SessionGate>
  </QueryClientProvider>);
  await screen.findByText("Private workspace");
  client.setQueryData(["private-messages"], "Alice content");
  identity = { id: "bob", name: "Bob" };
  fireEvent(window, new StorageEvent("storage", { key: SESSION_CHANGE_KEY, newValue: "notification-only" }));
  await waitFor(() => expect(client.getQueryData(["session"])).toEqual({ user: identity }));
  await waitFor(() => expect(client.getQueryData(["private-messages"])).toBeUndefined());
  await screen.findByText("Private workspace");
  expect(closed).toHaveBeenCalledOnce();
  expect(fetchMock).toHaveBeenCalledTimes(2);
  identity = null;
  fireEvent(window, new StorageEvent("storage", { key: SESSION_CHANGE_KEY, newValue: "logout-notification" }));
  await screen.findByText("Login form");
  expect(screen.queryByText("Private workspace")).toBeNull();
  expect(closed).toHaveBeenCalledTimes(2);
});
