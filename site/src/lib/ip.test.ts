import { describe, expect, it } from "vitest";
import { allowFor, inRange } from "./ip";

describe("inRange", () => {
  it("matches IPv4 addresses and ranges", () => {
    expect(inRange("83.45.120.7", "83.45.120.7/32")).toBe(true);
    expect(inRange("83.45.120.7", "83.45.120.0/24")).toBe(true);
    expect(inRange("83.45.121.7", "83.45.120.0/24")).toBe(false);
    expect(inRange("83.45.200.1", "83.45.0.0/16")).toBe(true);
    expect(inRange("83.45.120.7", "83.45.120.7")).toBe(true);
  });
  it("matches IPv6 prefixes and never mixes families", () => {
    expect(inRange("2a01:4f8::1", "2a01:4f8::1")).toBe(true);
    expect(inRange("2a0c:5a80:520d:b800:5dc9:794b:4aec:f008", "2a0c:5a80:520d:b800::/64")).toBe(
      true,
    );
    expect(inRange("2a0c:5a80:520d:b801::1", "2a0c:5a80:520d:b800::/64")).toBe(false);
    expect(inRange("2a0c:5a80:520d:b801::1", "2a0c:5a80:520d::/48")).toBe(true);
    expect(inRange("2a01:4f8::1", "83.45.120.0/24")).toBe(false);
    expect(inRange("83.45.120.7", "2a01:4f8::/48")).toBe(false);
  });
  it("allows a home IPv6 by its /64", () => {
    expect(allowFor("83.45.120.7")).toBe("83.45.120.7");
    expect(allowFor("2a0c:5a80:520d:b800:5dc9:794b:4aec:f008")).toBe(
      "2a0c:5a80:520d:b800:5dc9:794b:4aec:f008/64",
    );
  });
});
