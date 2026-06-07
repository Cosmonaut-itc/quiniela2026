// @vitest-environment edge-runtime
import { describe, it, expect } from "vitest";
import { deadEndpoints } from "./push";

describe("deadEndpoints", () => {
  it("marca para borrar solo 404/410", () => {
    expect(deadEndpoints([
      { endpoint: "a", statusCode: 201 },
      { endpoint: "b", statusCode: 410 },
      { endpoint: "c", statusCode: 404 },
      { endpoint: "d", statusCode: 500 },
    ])).toEqual(["b", "c"]);
  });
});
