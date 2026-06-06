import { describe, it, expect } from "vitest";
import { formatMXN, prizeBanner } from "./format";
import type { PrizeView } from "@/../convex/types";

const fixed = (text: string): PrizeView => ({
  mode: "fixed", text, entryFee: null, pool: null, contributors: 0,
});
const perPerson = (entryFee: number, contributors: number): PrizeView => ({
  mode: "per_person", text: "", entryFee, pool: entryFee * contributors, contributors,
});

describe("formatMXN", () => {
  it("formats with es-MX thousands separators", () => {
    expect(formatMXN(1400)).toBe("$1,400");
    expect(formatMXN(0)).toBe("$0");
  });
});

describe("prizeBanner", () => {
  it("fixed: title with the suffix, no subline", () => {
    expect(prizeBanner(fixed("$5,000"), "open", " al campeón"))
      .toEqual({ title: "$5,000 al campeón" });
  });
  it("fixed: empty text renders nothing", () => {
    expect(prizeBanner(fixed(""), "open", " al campeón")).toBeNull();
  });
  it("per_person open: live growing pot", () => {
    expect(prizeBanner(perPerson(200, 7), "open", " al campeón"))
      .toEqual({ title: "Bote: $1,400", subline: "$200 × 7 inscritos" });
  });
  it("per_person open singular", () => {
    expect(prizeBanner(perPerson(200, 1), "open", " al campeón").subline)
      .toBe("$200 × 1 inscrito");
  });
  it("per_person closed: total to the champion", () => {
    expect(prizeBanner(perPerson(200, 8), "locked", " al campeón"))
      .toEqual({ title: "$1,600 al campeón", subline: "8 × $200" });
  });
});
