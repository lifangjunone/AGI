import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { useChatReading } from "./useChatReading";

function Harness({ ids }: { ids: string[] }) {
  const reading = useChatReading(ids);
  return <><div ref={reading.historyRef} data-testid="history" onScroll={reading.onScroll}>
    {ids.map(id => <article key={id} data-message-id={id}>{id}</article>)}
  </div><span data-testid="pending">{reading.pendingCount}</span>
    <button onClick={reading.beforeEarlier}>Earlier</button>
    <button onClick={reading.showLatest}>Latest</button></>;
}

it("follows new messages near the bottom but preserves history with a contextual pending count", () => {
  const view = render(<Harness ids={["a", "b"]} />);
  const history = screen.getByTestId("history");
  Object.defineProperties(history, { scrollHeight: { configurable: true, value: 1000 },
    clientHeight: { configurable: true, value: 200 } });
  view.rerender(<Harness ids={["a", "b", "c"]} />);
  expect(history.scrollTop).toBe(1000);
  history.scrollTop = 100;
  fireEvent.scroll(history);
  view.rerender(<Harness ids={["a", "b", "c", "d"]} />);
  expect(history.scrollTop).toBe(100);
  expect(screen.getByTestId("pending")).toHaveTextContent("1");
  view.rerender(<Harness ids={["a", "b", "c", "d"]} />);
  expect(screen.getByTestId("pending")).toHaveTextContent("1");
  fireEvent.click(screen.getByText("Latest"));
  expect(history.scrollTop).toBe(1000);
  expect(screen.getByTestId("pending")).toHaveTextContent("0");
});

it("does not count earlier pagination as new messages and restores the visible anchor offset", () => {
  const view = render(<Harness ids={["a", "b"]} />);
  const history = screen.getByTestId("history");
  Object.defineProperties(history, { scrollHeight: { configurable: true, value: 1000 },
    clientHeight: { configurable: true, value: 200 } });
  const a = screen.getByText("a");
  let offset = 20;
  a.getBoundingClientRect = () => ({ top: offset, bottom: offset + 50 } as DOMRect);
  history.scrollTop = 100;
  fireEvent.scroll(history);
  fireEvent.click(screen.getByText("Earlier"));
  offset = 320;
  view.rerender(<Harness ids={["older", "a", "b"]} />);
  expect(history.scrollTop).toBe(400);
  expect(screen.getByTestId("pending")).toHaveTextContent("0");
});
