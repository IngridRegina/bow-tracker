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

/* No flag emoji anywhere: Windows has no glyphs for regional-indicator pairs,
   so they fall back to the two bare letters and read as a typo beside the name. */
export const countryName = (cc, lang) => {
  try {
    return new Intl.DisplayNames([lang === "es" ? "es" : "en"], { type: "region" }).of(cc.toUpperCase());
  } catch {
    return cc;
  }
};
