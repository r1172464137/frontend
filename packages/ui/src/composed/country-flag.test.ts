import { countries } from "@workspace/ui/utils/countries";
import { describe, expect, it } from "vitest";
import { countryCodeToFlag } from "./country-flag.js";

describe("countryCodeToFlag", () => {
  it("renders country-specific flags from local Unicode glyphs", () => {
    expect(countryCodeToFlag("us")).toBe("🇺🇸");
    expect(countryCodeToFlag(" SG ")).toBe("🇸🇬");
  });

  it.each([
    ["BQ-BO", "🇧🇶"],
    ["GB-UKM", "🇬🇧"],
    ["KN-SK", "🇰🇳"],
  ])("maps decorated country code %s to %s", (countryCode, flag) => {
    expect(countryCodeToFlag(countryCode)).toBe(flag);
  });

  it("renders a country flag for every selectable calling code", () => {
    const selectableCountries = countries.filter((country) => country.phone);

    expect(selectableCountries.length).toBeGreaterThan(0);
    for (const country of selectableCountries) {
      expect(countryCodeToFlag(country.alpha2), country.alpha2).not.toBe("🏳️");
    }
  });

  it("uses a deterministic local fallback for invalid codes", () => {
    expect(countryCodeToFlag("unknown")).toBe("🏳️");
    expect(countryCodeToFlag("")).toBe("🏳️");
  });
});
