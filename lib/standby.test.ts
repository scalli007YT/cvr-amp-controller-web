import { describe, it, expect } from "vitest";
import { parseStandbyFlag, shouldToggleStandby, STANDBY_TOGGLE_BODY } from "./standby";

describe("parseStandbyFlag", () => {
  it("reads body[0] === 1 as standby", () => {
    expect(parseStandbyFlag(Uint8Array.from([1]))).toBe(true);
  });
  it("reads body[0] === 0 as not standby (Run)", () => {
    expect(parseStandbyFlag(Uint8Array.from([0]))).toBe(false);
  });
  it("treats an empty body as not standby", () => {
    expect(parseStandbyFlag(new Uint8Array(0))).toBe(false);
  });
});

describe("shouldToggleStandby", () => {
  // FC=15 body 0x01 is a TOGGLE, so we only send it when current != desired.
  it("toggles Run -> Standby", () => {
    expect(shouldToggleStandby(false, true)).toBe(true);
  });
  it("toggles Standby -> Run", () => {
    expect(shouldToggleStandby(true, false)).toBe(true);
  });
  it("does nothing when already in Standby", () => {
    expect(shouldToggleStandby(true, true)).toBe(false);
  });
  it("does nothing when already Running", () => {
    expect(shouldToggleStandby(false, false)).toBe(false);
  });
});

describe("STANDBY_TOGGLE_BODY", () => {
  it("is the single byte 0x01", () => {
    expect(Array.from(STANDBY_TOGGLE_BODY)).toEqual([0x01]);
  });
});
