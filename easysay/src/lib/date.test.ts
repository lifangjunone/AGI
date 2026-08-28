import { describe, expect, it } from "vitest";
import {
  addLocalDays,
  localDateKey,
  localWeekKey,
  shiftLocalDateKey
} from "./date";

describe("local date helpers", () => {
  it("uses the user's calendar date instead of a UTC date", () => {
    const lateEvening = new Date(2026, 7, 14, 23, 30);

    expect(localDateKey(lateEvening)).toBe("2026-08-14");
  });

  it("moves date keys safely across month boundaries", () => {
    expect(shiftLocalDateKey("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("uses Monday as the weekly statistics boundary", () => {
    expect(localWeekKey(new Date(2026, 7, 16, 12))).toBe("2026-08-10");
    expect(localWeekKey(new Date(2026, 7, 17, 12))).toBe("2026-08-17");
  });

  it("adds review intervals without mutating the input date", () => {
    const start = new Date("2026-08-14T10:00:00.000Z");

    expect(addLocalDays(start, 3)).toBe("2026-08-17T10:00:00.000Z");
    expect(start.toISOString()).toBe("2026-08-14T10:00:00.000Z");
  });
});
