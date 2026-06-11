import { describe, it, expect } from "vitest";
import { parsePersonalPanelPath } from "./personalLink";

describe("parsePersonalPanelPath", () => {
  it("extrae la ruta de un link personal completo", () => {
    expect(
      parsePersonalPanelPath("https://quiniela.app/q/Q1/me/tok123", "OTRA"),
    ).toBe("/q/Q1/me/tok123");
  });

  it("acepta solo la ruta (sin dominio)", () => {
    expect(parsePersonalPanelPath("/q/Q1/me/tok123", "OTRA")).toBe(
      "/q/Q1/me/tok123",
    );
  });

  it("ignora query string y hash del link pegado", () => {
    expect(
      parsePersonalPanelPath("https://x.app/q/Q1/me/tok123?foo=1#x", "OTRA"),
    ).toBe("/q/Q1/me/tok123");
  });

  it("acepta un token suelto usando la quiniela actual", () => {
    expect(parsePersonalPanelPath("tok123", "Q9")).toBe("/q/Q9/me/tok123");
  });

  it("recorta espacios alrededor", () => {
    expect(parsePersonalPanelPath("  tok123  ", "Q9")).toBe("/q/Q9/me/tok123");
  });

  it("prefiere el id del link sobre el id actual", () => {
    expect(parsePersonalPanelPath("/q/OTRO/me/zzz", "ACTUAL")).toBe(
      "/q/OTRO/me/zzz",
    );
  });

  it("devuelve null con entrada vacía", () => {
    expect(parsePersonalPanelPath("   ", "Q1")).toBeNull();
  });

  it("devuelve null si es un link de join (no es panel personal)", () => {
    expect(parsePersonalPanelPath("https://x.app/q/Q1/join/tok", "Q1")).toBeNull();
  });

  it("devuelve null para un token suelto sin quiniela de respaldo", () => {
    expect(parsePersonalPanelPath("tok123", "")).toBeNull();
  });
});
