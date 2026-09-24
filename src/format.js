/* Formatting helpers shared between the ledger and the map. They live here so
   the map can be a lazily-loaded chunk without importing back into
   BowTracker.jsx and forming a cycle. */

export const fmt = (n) => (n || 0).toLocaleString("en-US");

export const compact = (n) => {
  const v = n || 0;
  if (v >= 1e9) return (v / 1e9).toFixed(1).replace(/\.0$/, "") + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (v >= 1e4) return Math.round(v / 1e3) + "k";
  return fmt(v);
};

export const fmtHours = (h) => {
  const v = Math.round(h || 0);
  if (v < 24) return v + "h";
  const d = Math.floor(v / 24);
  return v % 24 ? `${d}d ${v % 24}h` : `${d}d`;
};

export const MAX_MEMBERS = 70;

/* Share of a span's clan chests from its single biggest producer, past which
   the total stops describing the clan and starts describing one member. The
   two complete weeks on record sit at 16% and 19%; the week of 16 Aug hit 65%
   on one member's bulk grants. Set at roughly double the normal range so it
   stays quiet in an ordinary week — worth retuning once there is more chest
   data on file. */
export const CONCENTRATED_AT = 0.4;

export const locale = (lang) => ({ es: "es-ES", pl: "pl-PL" }[lang] || "en-GB");

export const shortDate = (dateStr, lang) =>
  new Date(dateStr + "T12:00:00Z").toLocaleDateString(locale(lang), { day: "numeric", month: "short" });

/* No flag emoji anywhere: Windows has no glyphs for regional-indicator pairs,
   so they fall back to the two bare letters and read as a typo beside the name. */
export const countryName = (cc, lang) => {
  try {
    return new Intl.DisplayNames([["en", "es", "pl"].includes(lang) ? lang : "en"], { type: "region" }).of(cc.toUpperCase());
  } catch {
    return cc;
  }
};
