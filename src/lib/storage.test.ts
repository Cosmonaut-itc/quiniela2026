// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { readStoredToken, persistToken } from "./storage";

describe("storage helpers", () => {
  beforeEach(() => localStorage.clear());

  it("persiste y lee un token", () => {
    persistToken("Q1", "me", "tok123");
    expect(readStoredToken("Q1", "me")).toBe("tok123");
  });

  it("devuelve null cuando no hay nada guardado", () => {
    expect(readStoredToken("Q1", "me")).toBeNull();
  });

  it("separa por id y por kind", () => {
    persistToken("Q1", "me", "a");
    persistToken("Q1", "join", "b");
    persistToken("Q2", "me", "c");
    expect(readStoredToken("Q1", "me")).toBe("a");
    expect(readStoredToken("Q1", "join")).toBe("b");
    expect(readStoredToken("Q2", "me")).toBe("c");
  });

  it("devuelve null si localStorage lanza (modo privado) y no propaga el error", () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() { throw new Error("Storage unavailable"); },
    });
    try {
      expect(() => readStoredToken("Q1", "me")).not.toThrow();
      expect(readStoredToken("Q1", "me")).toBeNull();
      expect(() => persistToken("Q1", "me", "x")).not.toThrow();
    } finally {
      if (original) Object.defineProperty(globalThis, "localStorage", original);
    }
  });
});
