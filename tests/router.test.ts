import { describe, expect, it } from "vitest";
import { matchCommand, parseSelection } from "@/lib/bot/router";

describe("matchCommand", () => {
  it.each([["help"], ["HELP"], [" Help "], ["help!"], ["?"]])("matches %j as help", (text) => {
    expect(matchCommand(text)).toEqual({ kind: "help" });
  });

  it.each([["my day"], ["My Day"], ["myday"], ["my day."]])(
    "matches %j as my day",
    (text) => {
      expect(matchCommand(text)).toEqual({ kind: "my-day" });
    },
  );

  it.each([["yes"], ["Y"], ["ok"], ["✅"]])("matches %j as yes", (text) => {
    expect(matchCommand(text)).toEqual({ kind: "yes" });
  });

  it.each([["no"], ["N"], ["cancel"], ["❌"]])("matches %j as no", (text) => {
    expect(matchCommand(text)).toEqual({ kind: "no" });
  });

  it("matches undo", () => {
    expect(matchCommand("undo")).toEqual({ kind: "undo" });
  });

  it.each([["log 2h on #82"], ["help me log 2 hours"], ["yes please"], [""], ["2"]])(
    "does not treat %j as a command",
    (text) => {
      expect(matchCommand(text)).toBeUndefined();
    },
  );
});

describe("parseSelection", () => {
  it("accepts positive whole numbers", () => {
    expect(parseSelection("2")).toBe(2);
    expect(parseSelection(" 3 ")).toBe(3);
  });

  it.each([["0"], ["2.5"], ["-1"], ["yes"], [""]])("rejects %j", (text) => {
    expect(parseSelection(text)).toBeUndefined();
  });
});
