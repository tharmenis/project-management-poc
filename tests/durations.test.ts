import { describe, expect, it } from "vitest";
import { hoursToIso8601 } from "@/lib/openproject/durations";

describe("hoursToIso8601", () => {
  it.each([
    [2, "PT2H"],
    [1.5, "PT1H30M"],
    [1.25, "PT1H15M"],
    [0.75, "PT45M"],
    [0.25, "PT15M"],
    [0.5, "PT30M"],
    [24, "PT24H"],
    [3.5, "PT3H30M"],
  ])("converts %d hours to %s", (hours, expected) => {
    expect(hoursToIso8601(hours)).toBe(expected);
  });
});
