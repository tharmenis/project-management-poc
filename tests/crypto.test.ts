import { describe, expect, it } from "vitest";
import { decryptToken, encryptToken } from "@/lib/crypto";

const KEY = "wsUlihOYYailCv+Ndhszqn9QTSEnsHDvmy+MXz6MFEo=";

describe("token encryption", () => {
  it("round-trips a token", () => {
    const token = "00548b1a9c0f4d3e8b2a7c6f1d";
    const encrypted = encryptToken(token, KEY);

    expect(encrypted.ciphertext).not.toContain(token);
    expect(decryptToken(encrypted, KEY)).toBe(token);
  });

  it("uses a fresh IV for every encryption", () => {
    const a = encryptToken("same-token", KEY);
    const b = encryptToken("same-token", KEY);

    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("rejects a ciphertext that was tampered with", () => {
    const encrypted = encryptToken("token", KEY);
    const tampered = Buffer.from(encrypted.ciphertext, "base64");
    tampered[0] ^= 0xff;

    expect(() =>
      decryptToken({ ...encrypted, ciphertext: tampered.toString("base64") }, KEY),
    ).toThrow();
  });

  it("rejects a key that is not 32 bytes", () => {
    expect(() => encryptToken("token", Buffer.from("short").toString("base64"))).toThrow();
  });
});
