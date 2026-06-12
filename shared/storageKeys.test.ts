import { describe, it, expect } from "vitest";
import {
  storageKey,
  secureStoreKey,
  KNOWN_QUINIELAS_KEY,
  parseKnownQuinielas,
  addKnownQuiniela,
} from "./storageKeys";

describe("storageKey", () => {
  it("produce la clave canónica web con separadores ':'", () => {
    expect(storageKey("Q1", "me")).toBe("quiniela:Q1:me");
    expect(storageKey("Q1", "join")).toBe("quiniela:Q1:join");
  });

  it("incluye el id tal cual (puede contener cualquier carácter)", () => {
    expect(storageKey("ABC-123", "me")).toBe("quiniela:ABC-123:me");
  });
});

describe("secureStoreKey", () => {
  it("reemplaza ':' con '_' en la clave canónica", () => {
    expect(secureStoreKey("Q1", "me")).toBe("quiniela_Q1_me");
    expect(secureStoreKey("Q1", "join")).toBe("quiniela_Q1_join");
  });

  it("conserva los caracteres permitidos [A-Za-z0-9._-]", () => {
    expect(secureStoreKey("ABC-123.ok", "me")).toBe("quiniela_ABC-123.ok_me");
  });

  it("reemplaza cualquier carácter no permitido con '_' (id hostil)", () => {
    // id con espacios, @, /, etc.
    expect(secureStoreKey("a b@c/d", "me")).toBe("quiniela_a_b_c_d_me");
  });

  it("la clave resultante solo contiene [A-Za-z0-9._-]", () => {
    const key = secureStoreKey("Q9:extra!chars?", "join");
    expect(key).toMatch(/^[A-Za-z0-9._-]+$/);
  });
});

describe("KNOWN_QUINIELAS_KEY", () => {
  it("solo contiene caracteres permitidos por SecureStore", () => {
    expect(KNOWN_QUINIELAS_KEY).toMatch(/^[A-Za-z0-9._-]+$/);
  });
});

describe("parseKnownQuinielas", () => {
  it("devuelve [] con null", () => {
    expect(parseKnownQuinielas(null)).toEqual([]);
  });

  it("devuelve [] con JSON inválido", () => {
    expect(parseKnownQuinielas("esto no es json{{{")).toEqual([]);
  });

  it("devuelve [] con JSON válido pero no-array (objeto)", () => {
    expect(parseKnownQuinielas('{"a":1}')).toEqual([]);
  });

  it("devuelve [] con JSON válido pero no-array (número)", () => {
    expect(parseKnownQuinielas("42")).toEqual([]);
  });

  it("devuelve el array cuando el JSON es un array de strings", () => {
    expect(parseKnownQuinielas('["Q1","Q2"]')).toEqual(["Q1", "Q2"]);
  });

  it("filtra entradas no-string del array", () => {
    expect(parseKnownQuinielas('["Q1",42,null,"Q2"]')).toEqual(["Q1", "Q2"]);
  });

  it("devuelve [] con array vacío", () => {
    expect(parseKnownQuinielas("[]")).toEqual([]);
  });
});

describe("addKnownQuiniela", () => {
  it("agrega un id nuevo al final", () => {
    expect(addKnownQuiniela([], "Q1")).toEqual(["Q1"]);
    expect(addKnownQuiniela(["Q1"], "Q2")).toEqual(["Q1", "Q2"]);
  });

  it("no duplica un id ya existente", () => {
    expect(addKnownQuiniela(["Q1", "Q2"], "Q1")).toEqual(["Q1", "Q2"]);
  });

  it("conserva el orden original y no mueve el duplicado", () => {
    expect(addKnownQuiniela(["Q1", "Q2", "Q3"], "Q2")).toEqual(["Q1", "Q2", "Q3"]);
  });

  it("no muta el array original", () => {
    const original = ["Q1"];
    const result = addKnownQuiniela(original, "Q2");
    expect(original).toEqual(["Q1"]);
    expect(result).toEqual(["Q1", "Q2"]);
  });
});
