import { cn } from "@workspace/ui/lib/utils";

const REGIONAL_INDICATOR_OFFSET = 127_397;
const UNKNOWN_FLAG = "🏳️";
const DECORATED_COUNTRY_CODES: Readonly<Record<string, string>> = {
  "BQ-BO": "BQ",
  "GB-UKM": "GB",
  "KN-SK": "KN",
};

/** Returns a locally rendered Unicode flag without loading an icon service. */
export function countryCodeToFlag(countryCode: string) {
  const input = countryCode.trim().toUpperCase();
  const normalized = DECORATED_COUNTRY_CODES[input] ?? input;
  if (!/^[A-Z]{2}$/u.test(normalized)) {
    return UNKNOWN_FLAG;
  }

  return String.fromCodePoint(
    ...Array.from(
      normalized,
      (character) => character.charCodeAt(0) + REGIONAL_INDICATOR_OFFSET
    )
  );
}

export function CountryFlag({
  className,
  countryCode,
}: {
  className?: string;
  countryCode: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center leading-none",
        className
      )}
    >
      {countryCodeToFlag(countryCode)}
    </span>
  );
}
