import {
  BUNDLED_ICON_NAMES,
  isBundledIcon,
} from "@workspace/ui/composed/icons";

export const PRODUCT_ICON_VALUES = ["", ...BUNDLED_ICON_NAMES] as const;

export const PRODUCT_FEATURE_ICON_SCHEMA = {
  type: "string",
  description:
    "Choose a bundled local icon name. Leave blank for no icon; legacy unknown names render a fallback until replaced.",
  enum: PRODUCT_ICON_VALUES,
  examples: [
    "uil:shield-check",
    "uil:shield-exclamation",
    "uil:database",
    "uil:server",
  ],
} as const;

export function isAllowedProductIcon(name: string) {
  return name === "" || isBundledIcon(name);
}
