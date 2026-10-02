import { type CurrencyCode, getCurrencyFromCountry } from "@delulu/payments";

const GEO_COUNTRY_REGEX = /x-geo-country=([^;]+)/;

export function useCurrency(): CurrencyCode {
  const country =
    typeof document === "undefined"
      ? null
      : document.cookie.match(GEO_COUNTRY_REGEX)?.[1];
  return getCurrencyFromCountry(country || "US");
}
