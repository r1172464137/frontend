import { BUNDLED_ICON_NAMES } from "@workspace/ui/composed/icons";
import { describe, expect, it } from "vitest";
import {
  isAllowedProductIcon,
  PRODUCT_FEATURE_ICON_SCHEMA,
  PRODUCT_ICON_VALUES,
} from "./product-icon-options";

describe("product icon options", () => {
  it("offers only blank or locally bundled icon names", () => {
    expect(PRODUCT_ICON_VALUES).toEqual(["", ...BUNDLED_ICON_NAMES]);
    expect(PRODUCT_FEATURE_ICON_SCHEMA.enum).toBe(PRODUCT_ICON_VALUES);
    expect(PRODUCT_ICON_VALUES.every(isAllowedProductIcon)).toBe(true);
  });

  it("rejects arbitrary new icon names", () => {
    expect(isAllowedProductIcon("operator:unknown-product-icon")).toBe(false);
    expect(PRODUCT_FEATURE_ICON_SCHEMA.enum).not.toContain(
      "operator:unknown-product-icon"
    );
  });
});
