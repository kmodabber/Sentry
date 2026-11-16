import { describe, expect, it } from "vitest";
import { showsNoCheckIsPerfect } from "./App";

describe("showsNoCheckIsPerfect", () => {
  it("shows the note for a likely-safe verdict", () => {
    expect(showsNoCheckIsPerfect("likely_safe")).toBe(true);
  });

  it("hides the note for a suspicious verdict", () => {
    expect(showsNoCheckIsPerfect("suspicious")).toBe(false);
  });

  it("hides the note for a dangerous verdict", () => {
    expect(showsNoCheckIsPerfect("dangerous")).toBe(false);
  });
});
