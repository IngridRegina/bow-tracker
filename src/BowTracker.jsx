import React, { useState, useEffect, useMemo } from "react";
import { Anvil, Stone, TreePine, Wheat, Coins, Book } from "lucide-react";
import "./BowTracker.css";

/* ===============================================================
   Brethren of War — clan contribution ledger
   Reads tracker-state.json (built by build_state.py).

   All styling lives in BowTracker.css. Variants are expressed as
   data-attributes (data-status, data-tone, data-accent, data-place)
   rather than inline styles.
=============================================================== */

/* ---- domain constants ---------------------------------------- */
const RANKS = ["Leader", "Superior", "Officer", "Veteran", "Member", "Soldier"];
const LEADERSHIP = ["Leader", "Superior"];
const RES = ["lumber", "stone", "iron", "food"];
const ALL_RES = ["lumber", "stone", "iron", "food", "silver", "tractates"];
const MAX_MEMBERS = 60;
const DONATION_PCT = 0.05;
const CHEST_TARGET = 3;
const EXCEED_MARGIN = 0.5; // 50% past both targets earns the darker green

/* ---- resource icons (lucide; colour comes from CSS) ----------- */
const RES_ICON = {
  lumber: TreePine,
  stone: Stone,
  iron: Anvil,
  food: Wheat,
  silver: Coins,
  tractates: Book,
};

function ResIcon({ res, size = 16 }) {
  const Icon = RES_ICON[res];
  if (!Icon) return null;
  return <Icon size={size} strokeWidth={2} className="bt-res-icon" data-res={res} aria-hidden="true" />;
}

/* ---- language ------------------------------------------------ */
const T = {
  en: {
    members: "members",
    weekOf: "week of",
    dayN: (n) => `day ${n} of 7`,
    nextDay: "next day in",
    updatedAgo: (s) => `updated ${s} ago`,
    updatedJustNow: "updated just now",
    loading: "Opening the ledger…",
    badFile: "tracker-state.json is missing or unreadable.",
    empty: "No data found. Run build_state.py and redeploy.",

    topThree: "Top three this week",
    raw: "Raw",
    multiples: "% of might",
    leadershipIn: "Leadership included",
    leadershipOut: "Leadership excluded",
    include: "Include",
    exclude: "Exclude",
    overall: "Overall",
    overallNote: "lumber, stone, iron and food",
    chests: "Chests",
    chestsNote: (n) => `${n} ${n === 1 ? "day" : "days"} so far`,
    silver: "Silver",
    silverNote: "to the university",
    speedups: "Speedups",
    speedupsNote: "hours put into clan builds",
    leadership: "Leadership",
    notRanked: "listed, not ranked",
    nothingYet: "Nothing logged yet.",

    donated: "donated at all",
    producedChests: "produced chests",
    gaveSpeedups: "gave clan speedups",
    membersInside: "members live in or close to territory",
    formerAlso: "Also contributed this week, no longer in the clan:",
    fDonated: "donated",
    fChests: "produced chests",
    fSpeedups: "gave speedups",
    thisWeek: "this week",

    everyone: "Everyone",
    stRed: "Nothing given",
    stYellow: "Below target",
    stGreen: "Met",
    stGreenPlus: "Well above",
    noneMatch: "Nobody matches that filter.",
    noDonation: "Below target",
    silverOnly: "Silver only",
    outsideFilter: "Far outside territory",
    twoWeeksMissed: "2 weeks missed",
    donationRule: "“Donations met” currently means at least 20% of might given across all resources combined, even if some resources are below 5% or missing.",

    statsLine: (might, place) => `${might} might · ${place}`,
    donationsOk: "donations met",
    short: "short",
    chestsADay: (n) => `${n} chests a day`,
    speedupsGiven: (s) => `${s} speedups`,
    voluntary: "voluntary",
    ofWord: "of",
    speedupsWeek: "Clan speedups this week",
    none: "none",
    inTerritory: "in or close to territory",
    outsideTerritory: "far outside territory",
    newThisWeek: "new this week",
    recoveredTitle: "Started donating again this week",
    recoveredNote: "gave nothing last week but donated this week:",
    inactive: "possibly inactive",

    tabLedger: "Ledger",
    tabTiming: "Good times",
    fCountry: "Country",
    fTimezone: "Timezone",
    fLastActive: "Last contribution",
    fJoined: "Joined",
    unknownField: "not set",
    daysAgo: (n) => (n === 0 ? "today" : n === 1 ? "yesterday" : `${n} days ago`),
    localTimeNow: (s) => `${s} their time`,
    timingTitle: "When is the clan awake?",
    timingIntro: "How many members have a local clock between 09:00 and midnight at each hour. Times are on your own clock, with UTC alongside.",
    timingBest: (n, total, times) => `Best coverage is ${n} of ${total}, at ${times}.`,
    atReset: "daily reset",
    beforeReset: (h) => `${h}h before reset`,
    afterReset: (h) => `${h}h after reset`,
    membersAwake: "awake",
    rankBest: "Best first",
    rankClock: "By clock",
    localNow: "local",
    noTimezone: (n) => (n === 1 ? "1 member has" : `${n} members have`) + " no timezone set in their profile, and are left out of the counts.",
    tzCaveat: "Timezones come from each member's game profile. They are not adjusted for daylight saving, so a summer clock may read an hour early.",

    legend: "Colour key",
    cRed: "nothing given",
    cYellow: "below target",
    cGreen: "target met",
    cGreenPlus: "well above target",

    ranks: { Leader: "Leader", Superior: "Superior", Officer: "Officer", Veteran: "Veteran", Member: "Member", Soldier: "Soldier" },
    res: { lumber: "Lumber", stone: "Stone", iron: "Iron", food: "Food", silver: "Silver", tractates: "Sci. tractates" },
  },

  es: {
    members: "miembros",
    weekOf: "semana del",
    dayN: (n) => `día ${n} de 7`,
    nextDay: "próximo día en",
    updatedAgo: (s) => `actualizado hace ${s}`,
    updatedJustNow: "actualizado ahora mismo",
    loading: "Abriendo el registro…",
    badFile: "Falta tracker-state.json o no se puede leer.",
    empty: "No hay datos. Ejecuta build_state.py y vuelve a publicar.",

    topThree: "Los tres mejores esta semana",
    raw: "Bruto",
    multiples: "% del poder",
    leadershipIn: "Liderazgo incluido",
    leadershipOut: "Liderazgo excluido",
    include: "Incluir",
    exclude: "Excluir",
    overall: "General",
    overallNote: "madera, piedra, hierro y comida",
    chests: "Cofres",
    chestsNote: (n) => `${n} ${n === 1 ? "día" : "días"} hasta ahora`,
    silver: "Plata",
    silverNote: "a la universidad",
    speedups: "Aceleraciones",
    speedupsNote: "horas aportadas a las construcciones",
    leadership: "Liderazgo",
    notRanked: "listado, sin clasificar",
    nothingYet: "Nada registrado todavía.",

    donated: "han donado algo",
    producedChests: "han producido cofres",
    gaveSpeedups: "han dado aceleraciones",
    membersInside: "miembros viven en o cerca del territorio",
    formerAlso: "También contribuyeron esta semana, ya no están en el clan:",
    fDonated: "donaron",
    fChests: "produjeron cofres",
    fSpeedups: "dieron aceleraciones",
    thisWeek: "esta semana",

    everyone: "Todos",
    stRed: "No han dado nada",
    stYellow: "Por debajo del objetivo",
    stGreen: "Cumplido",
    stGreenPlus: "Muy por encima",
    noneMatch: "Nadie coincide con ese filtro.",
    noDonation: "Por debajo del objetivo",
    silverOnly: "Solo plata",
    outsideFilter: "Lejos del territorio",
    twoWeeksMissed: "2 semanas sin dar",
    donationRule: "“Donaciones cumplidas” significa al menos el 20% del poder donado entre todos los recursos combinados, aunque algunos estén por debajo del 5% o falten.",

    statsLine: (might, place) => `${might} de poder · ${place}`,
    donationsOk: "donaciones cumplidas",
    short: "por debajo",
    chestsADay: (n) => `${n} cofres al día`,
    speedupsGiven: (s) => `${s} de aceleraciones`,
    voluntary: "voluntario",
    ofWord: "de",
    speedupsWeek: "Aceleraciones esta semana",
    none: "ninguna",
    inTerritory: "en o cerca del territorio",
    outsideTerritory: "lejos del territorio",
    newThisWeek: "nuevo esta semana",
    recoveredTitle: "Volvieron a donar esta semana",
    recoveredNote: "no dieron nada la semana pasada pero donaron esta:",
    inactive: "posiblemente inactivo",

    tabLedger: "Registro",
    tabTiming: "Buenas horas",
    fCountry: "País",
    fTimezone: "Zona horaria",
    fLastActive: "Última aportación",
    fJoined: "Se unió",
    unknownField: "sin definir",
    daysAgo: (n) => (n === 0 ? "hoy" : n === 1 ? "ayer" : `hace ${n} días`),
    localTimeNow: (s) => `${s} su hora`,
    timingTitle: "¿Cuándo está despierto el clan?",
    timingIntro: "Cuántos miembros tienen su hora local entre las 09:00 y medianoche en cada hora. Las horas son las de tu reloj, con UTC al lado.",
    timingBest: (n, total, times) => `La mejor cobertura es ${n} de ${total}, a las ${times}.`,
    atReset: "reinicio diario",
    beforeReset: (h) => `${h}h antes del reinicio`,
    afterReset: (h) => `${h}h después del reinicio`,
    membersAwake: "despiertos",
    rankBest: "Mejores primero",
    rankClock: "Por hora",
    localNow: "local",
    noTimezone: (n) => `${n} miembro${n === 1 ? "" : "s"} sin zona horaria en su perfil, no se cuentan.`,
    tzCaveat: "Las zonas horarias vienen del perfil de cada miembro. No se ajustan al horario de verano, así que un reloj de verano puede ir una hora adelantado.",

    legend: "Clave de colores",
    cRed: "no han dado nada",
    cYellow: "por debajo del objetivo",
    cGreen: "objetivo cumplido",
    cGreenPlus: "muy por encima del objetivo",

    ranks: { Leader: "Líder", Superior: "Superior", Officer: "Oficial", Veteran: "Veterano", Member: "Miembro", Soldier: "Soldado" },
    res: { lumber: "Madera", stone: "Piedra", iron: "Hierro", food: "Comida", silver: "Plata", tractates: "Tratados" },
  },
};

/* ---- dates: day + week roll at 20:00 Estonian == 17:00 UTC ---- */
const BOUNDARY_UTC_HOUR = 17;
const iso = (d) => d.toISOString().slice(0, 10);

function todayISO(when = new Date()) {
  return iso(new Date(when.getTime() - BOUNDARY_UTC_HOUR * 3600000));
}
function weekStartOf(dateStr) {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return iso(d);
}
function daysElapsed(weekStart) {
  const start = new Date(weekStart + "T12:00:00Z");
  const now = new Date(todayISO() + "T12:00:00Z");
  return Math.min(Math.max(Math.floor((now - start) / 86400000) + 1, 1), 7);
}
function untilRollover(when = new Date()) {
  const mins = (BOUNDARY_UTC_HOUR * 60 - (when.getUTCHours() * 60 + when.getUTCMinutes()) + 1440) % 1440;
  return { h: Math.floor(mins / 60), m: mins % 60 };
}
const locale = (lang) => (lang === "es" ? "es-ES" : "en-GB");
function shortDate(dateStr, lang) {
  return new Date(dateStr + "T12:00:00Z").toLocaleDateString(locale(lang), { day: "numeric", month: "short" });
}

/* How long ago the state file was built. Coarse on purpose — the header
   re-renders once a minute, so anything finer would just flicker. */
function sinceLabel(then, now, t) {
  const mins = Math.max(0, Math.floor((now - then) / 60000));
  if (mins < 1) return t.updatedJustNow;
  if (mins < 60) return t.updatedAgo(`${mins}m`);
  if (mins < 1440) {
    const h = Math.floor(mins / 60);
    return t.updatedAgo(mins % 60 ? `${h}h ${mins % 60}m` : `${h}h`);
  }
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  return t.updatedAgo(h ? `${d}d ${h}h` : `${d}d`);
}
function isNewThisWeek(member, week) {
  return member.firstSeen && weekStartOf(member.firstSeen) === week.start;
}

const fmt = (n) => (n || 0).toLocaleString("en-US");
const compact = (n) => {
  const v = n || 0;
  if (v >= 1e9) return (v / 1e9).toFixed(1).replace(/\.0$/, "") + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (v >= 1e4) return Math.round(v / 1e3) + "k";
  return fmt(v);
};
const fmtHours = (h) => {
  const v = Math.round(h || 0);
  if (v < 24) return v + "h";
  const d = Math.floor(v / 24);
  return v % 24 ? `${d}d ${v % 24}h` : `${d}d`;
};

/* ---- scoring ------------------------------------------------- */
function evaluate(member, week) {
  const elapsed = daysElapsed(week.start);
  const might = (week.mights && week.mights[member.id]) ?? member.might;
  const need = Math.round(might * DONATION_PCT);
  const don = (week.donations && week.donations[member.id]) || {};
  const chestDays = (week.chests && week.chests[member.id]) || {};
  const chestTotal = Object.values(chestDays).reduce((a, b) => a + b, 0);
  const chestAvg = chestTotal / elapsed;
  const speedupHours = (week.speedups && week.speedups[member.id]) || 0;

  const donationMet = RES.every((r) => (don[r] || 0) >= need);
  const chestMet = chestAvg >= CHEST_TARGET;
  const anyDonation = ALL_RES.some((r) => (don[r] || 0) > 0);

  const mandatoryTotal = RES.reduce((a, r) => a + (don[r] || 0), 0);
  const donationOk = donationMet || mandatoryTotal >= might * DONATION_PCT * 4;

  const exceedsDonation = mandatoryTotal >= might * DONATION_PCT * 4 * (1 + EXCEED_MARGIN);
  const exceedsChests = chestAvg >= CHEST_TARGET * (1 + EXCEED_MARGIN);

  // NOTE: goal status is currently based on donations only.
  // The chest expectation is commented out — we'll re-enable it later.
  let status;
  if (!anyDonation /* && chestTotal === 0 */) status = "red";
  else if (donationOk /* && chestMet */) status = exceedsDonation /* && exceedsChests */ ? "greenPlus" : "green";
  else status = "yellow";

  return { might, need, don, chestTotal, chestAvg, speedupHours, donationMet, chestMet, status, missing: RES.filter((r) => (don[r] || 0) < need) };
}

/* Maps a status onto its swatch tone and its label in T. The colours
   themselves live in BowTracker.css. */
const STATUS = {
  red: { tone: "red", key: "stRed" },
  yellow: { tone: "amber", key: "stYellow" },
  green: { tone: "green", key: "stGreen" },
  greenPlus: { tone: "greenPlus", key: "stGreenPlus" },
};

/* ---- small pieces -------------------------------------------- */
function Btn({ children, onClick, active, ghost, ...rest }) {
  return (
    <button className="bt-btn" onClick={onClick} aria-pressed={active} data-ghost={ghost ? "" : undefined} {...rest}>
      {children}
    </button>
  );
}

/* A two-state segmented control — the active option is highlighted, so
   clicking an option selects that view rather than toggling to its opposite. */
function Segmented({ options, value, onChange, inline }) {
  return (
    <div className={inline ? "bt-seg bt-seg--inline" : "bt-seg"}>
      {options.map((o) => (
        <button key={String(o.value)} className="bt-seg-btn" onClick={() => onChange(o.value)} aria-pressed={o.value === value}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Meter({ label, n, denom, tone, plain }) {
  const pct = Math.round((n / Math.max(denom, 1)) * 100);
  return (
    <div className="bt-meter" data-tone={tone === "neutral" ? "neutral" : pct >= 50 ? "high" : "low"}>
      <div className="bt-meter-head">
        <span className="bt-meter-value">{n}</span>
        {denom != null && <span className="bt-meter-denom">/ {denom}</span>}
        {!plain && <span className="bt-meter-pct">{pct}%</span>}
      </div>
      <div className="bt-meter-label">{label}</div>
      {!plain && (
        <div className="bt-meter-track">
          <div className="bt-meter-fill" style={{ "--bt-pct": `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

function Card({ children, accent }) {
  return (
    <div className="bt-card" data-accent={accent}>
      {children}
    </div>
  );
}

/* ---- podium -------------------------------------------------- */
function Podium({ t, members, week }) {
  const [relative, setRelative] = useState(false);
  const [withLeaders, setWithLeaders] = useState(false);
  const elapsed = daysElapsed(week.start);

  const { boards, leaders } = useMemo(() => {
    const rows = members.map((m) => {
      const e = evaluate(m, week);
      return {
        name: m.name,
        rank: m.rank,
        might: e.might,
        need: e.need,
        overall: RES.reduce((a, r) => a + (e.don[r] || 0), 0),
        chests: e.chestTotal,
        silver: e.don.silver || 0,
      };
    });
    const pool = withLeaders ? rows : rows.filter((r) => !LEADERSHIP.includes(r.rank));
    const top = (key, scale) =>
      pool
        .map((r) => ({ ...r, score: relative && scale ? r[key] / Math.max(r.need * 4, 1) : r[key] }))
        .filter((r) => r[key] > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);

    return {
      boards: [
        { title: t.overall, note: t.overallNote, list: top("overall", true), key: "overall", scaled: true, accent: "gold" },
        { title: t.chests, note: t.chestsNote(elapsed), list: top("chests", false), key: "chests", accent: "amber" },
        { title: t.silver, note: t.silverNote, list: top("silver", false), key: "silver", accent: "line" },
      ],
      leaders: rows
        .filter((r) => LEADERSHIP.includes(r.rank))
        .sort((a, b) => LEADERSHIP.indexOf(a.rank) - LEADERSHIP.indexOf(b.rank) || b.overall - a.overall),
    };
  }, [members, week, relative, withLeaders, t, elapsed]);

  return (
    <section className="bt-podium">
      <div className="bt-podium-head">
        <h2 className="bt-h2">{t.topThree}</h2>
        <div className="bt-podium-toggle">
          <span className="bt-toggle-label">{t.leadership}</span>
          <Segmented
            options={[
              { value: false, label: t.exclude },
              { value: true, label: t.include },
            ]}
            value={withLeaders}
            onChange={setWithLeaders}
          />
        </div>
      </div>

      <div className="bt-podium-grid">
        {boards.map((b) => (
          <div key={b.title} className="bt-podium-cell">
            <Card accent={b.accent}>
              <div className="bt-board-head">
                <div className="bt-board-title">{b.title}</div>
                {b.scaled && (
                  <div className="bt-board-seg">
                    <Segmented
                      inline
                      options={[
                        { value: false, label: t.raw },
                        { value: true, label: t.multiples },
                      ]}
                      value={relative}
                      onChange={setRelative}
                    />
                  </div>
                )}
              </div>
              <div className="bt-board-note">{b.note}</div>
              {b.list.length === 0 && <div className="bt-board-blank">{t.nothingYet}</div>}
              {b.list.map((r, i) => (
                <div key={r.name + i} className="bt-board-row">
                  <span className="bt-board-place" data-place={i + 1}>
                    {i + 1}
                  </span>
                  <span className="bt-board-name">{r.name}</span>
                  <span className="bt-board-value">
                    {relative && b.scaled ? `${(r.score * 100).toFixed(0)}%` : b.hours ? fmtHours(r[b.key]) : compact(r[b.key])}
                  </span>
                </div>
              ))}
            </Card>
          </div>
        ))}

        {/* leadership — shares the row with the podium boxes */}
        <div className="bt-podium-cell">
          <div className="bt-leaders">
            <div className="bt-leaders-title">{t.leadership}</div>
            <div className="bt-leaders-note">{t.notRanked}</div>
            {leaders.length === 0 && <div className="bt-leaders-blank">{t.nothingYet}</div>}
            {leaders.map((r) => (
              <div key={r.name} className="bt-leader-row">
                <span className="bt-leader-name">{r.name}</span>
                <span className="bt-leader-total">{compact(r.overall)}</span>
                <span className="bt-leader-pct">{((r.overall / Math.max(r.might, 1)) * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---- timing ---------------------------------------------------
   Which UTC hours fall inside most members' waking day. The window runs from
   09:00 local to midnight local, so — working in minutes past local midnight —
   a member is awake whenever their local time is at or past 09:00, since the
   value is already reduced modulo a day. */
const AWAKE_FROM = 9 * 60;

const hhmm = (mins) => {
  const m = ((mins % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/* No flag emoji here: Windows has no glyphs for regional-indicator pairs, so
   they fall back to the two bare letters and read as a typo next to the name. */
const countryName = (cc, lang) => {
  try {
    return new Intl.DisplayNames([lang === "es" ? "es" : "en"], { type: "region" }).of(cc.toUpperCase());
  } catch {
    return cc;
  }
};

const daysBetween = (from, to) => Math.round((new Date(to + "T12:00:00Z") - new Date(from + "T12:00:00Z")) / 86400000);

const nowUTCMinutes = () => {
  const d = new Date();
  return d.getUTCHours() * 60 + d.getUTCMinutes();
};

const offsetLabel = (mins) => {
  const a = Math.abs(mins);
  const rest = a % 60;
  return `UTC${mins < 0 ? "−" : "+"}${Math.floor(a / 60)}${rest ? ":" + String(rest).padStart(2, "0") : ""}`;
};

function Timing({ t, members }) {
  const [order, setOrder] = useState("best");
  const [open, setOpen] = useState(null);

  const known = useMemo(() => members.filter((m) => m.utcOffset != null), [members]);
  const unknown = members.length - known.length;

  // one entry per distinct offset, so a row can explain its own number
  const groups = useMemo(() => {
    const g = new Map();
    known.forEach((m) => {
      if (!g.has(m.utcOffset)) g.set(m.utcOffset, []);
      g.get(m.utcOffset).push(m.name);
    });
    return [...g.entries()]
      .map(([off, names]) => ({ off, names: names.sort((a, b) => a.localeCompare(b)) }))
      .sort((a, b) => a.off - b.off);
  }, [known]);

  const rows = useMemo(
    () =>
      Array.from({ length: 24 }, (_, hour) => {
        const per = groups.map((g) => {
          const local = (((hour * 60 + g.off) % 1440) + 1440) % 1440;
          return { ...g, local, awake: local >= AWAKE_FROM };
        });
        const n = per.reduce((a, g) => a + (g.awake ? g.names.length : 0), 0);
        return { hour, per, n, pct: Math.round((n / Math.max(known.length, 1)) * 100) };
      }),
    [groups, known.length]
  );

  // Times are shown on the reader's own clock, with UTC alongside. The rows
  // are still keyed by UTC hour; only the label and the clock ordering shift.
  const viewerOffset = -new Date().getTimezoneOffset();
  const localOf = (hour) => (((hour * 60 + viewerOffset) % 1440) + 1440) % 1440;

  const best = rows.reduce((a, r) => Math.max(a, r.n), 0);
  const bestHours = rows.filter((r) => r.n === best).map((r) => hhmm(localOf(r.hour)));
  const shown =
    order === "best"
      ? [...rows].sort((a, b) => b.n - a.n || localOf(a.hour) - localOf(b.hour))
      : [...rows].sort((a, b) => localOf(a.hour) - localOf(b.hour));

  // reset sits at BOUNDARY_UTC_HOUR; express every other hour relative to it
  const resetLabel = (hour) => {
    let d = hour - BOUNDARY_UTC_HOUR;
    if (d > 12) d -= 24;
    if (d <= -12) d += 24;
    if (d === 0) return t.atReset;
    return d > 0 ? t.afterReset(d) : t.beforeReset(-d);
  };

  return (
    <section>
      <div className="bt-podium-head">
        <h2 className="bt-h2">{t.timingTitle}</h2>
        <Segmented
          options={[
            { value: "best", label: t.rankBest },
            { value: "clock", label: t.rankClock },
          ]}
          value={order}
          onChange={setOrder}
        />
      </div>

      <p className="bt-timing-intro">
        {t.timingIntro} {t.timingBest(best, known.length, bestHours.join(", "))}
      </p>

      <div className="bt-slots">
        {shown.map((r) => {
          const isOpen = open === r.hour;
          return (
            <div className="bt-slot" key={r.hour} data-best={r.n === best ? "" : undefined} data-reset={r.hour === BOUNDARY_UTC_HOUR ? "" : undefined}>
              <button className="bt-slot-head" onClick={() => setOpen(isOpen ? null : r.hour)} aria-expanded={isOpen}>
                <span className="bt-slot-time">
                  {hhmm(localOf(r.hour))}
                  <span className="bt-slot-utc">({hhmm(r.hour * 60)} UTC)</span>
                </span>
                <span className="bt-slot-reset">{resetLabel(r.hour)}</span>
                <span className="bt-slot-track">
                  <span className="bt-slot-fill" style={{ "--bt-pct": `${r.pct}%` }} />
                </span>
                <span className="bt-slot-count">
                  {r.n}
                  <span className="bt-slot-total">/{known.length}</span> {t.membersAwake}
                </span>
                <span className="bt-slot-toggle">{isOpen ? "−" : "+"}</span>
              </button>

              {isOpen && (
                <div className="bt-slot-detail">
                  {r.per.map((g) => (
                    <div className="bt-tzrow" key={g.off} data-awake={g.awake ? "" : undefined}>
                      <span className="bt-tz-off">{offsetLabel(g.off)}</span>
                      <span className="bt-tz-local">
                        {hhmm(g.local)} {t.localNow}
                      </span>
                      <span className="bt-tz-names">{g.names.join(", ")}</span>
                      <span className="bt-tz-flag">{g.awake ? "✓" : "✗"}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="bt-rule-note">
        {unknown > 0 && `${t.noTimezone(unknown)} `}
        {t.tzCaveat}
      </p>
    </section>
  );
}

/* ---- ledger -------------------------------------------------- */
function Ledger({ t, lang, members, week, prevWeek }) {
  const [open, setOpen] = useState(null);
  const [filter, setFilter] = useState("all");

  const rows = useMemo(() => {
    const byRank = {};
    members.forEach((m) => (byRank[m.rank] = byRank[m.rank] || []).push({ m, e: evaluate(m, week) }));
    Object.values(byRank).forEach((l) => l.sort((a, b) => b.e.might - a.e.might));
    return byRank;
  }, [members, week]);

  const counts = useMemo(() => {
    const c = { red: 0, yellow: 0, green: 0, greenPlus: 0 };
    members.forEach((m) => c[evaluate(m, week).status]++);
    return c;
  }, [members, week]);

  const extraCounts = useMemo(() => {
    let noDon = 0, silver = 0, outside = 0;
    members.forEach((m) => {
      const don = evaluate(m, week).don;
      const gaveMandatory = RES.some((r) => (don[r] || 0) > 0);
      if (!m.inTerritory) outside++;
      if (!isNewThisWeek(m, week) && !gaveMandatory) {
        noDon++;
        if ((don.silver || 0) > 0) silver++;
      }
    });
    return { noDon, silver, outside };
  }, [members, week]);

  const part = useMemo(() => {
    let donors = 0, chesters = 0, speeders = 0, outside = 0;
    members.forEach((m) => {
      const e = evaluate(m, week);
      if (ALL_RES.some((r) => (e.don[r] || 0) > 0)) {
        donors++;
        if (!m.inTerritory) outside++;
      }
      if (e.chestTotal > 0) chesters++;
      if (e.speedupHours > 0) speeders++;
    });
    return { donors, chesters, speeders, outside, total: members.length };
  }, [members, week]);

  // Gave any mandatory resource in a given week?
  const gaveMandatoryIn = (wk, id) => !!wk && RES.some((r) => (((wk.donations && wk.donations[id]) || {})[r] || 0) > 0);

  // Joined during the current or the previous week? (too new to count as missing two weeks)
  const joinedRecently = (m) => {
    if (!m.firstSeen) return false;
    const fw = weekStartOf(m.firstSeen);
    return fw === week.start || (prevWeek && fw === prevWeek.start);
  };

  // Members who donated nothing mandatory this week AND last week,
  // excluding anyone who joined during either of those two weeks.
  const missedTwo = useMemo(() => {
    if (!prevWeek) return [];
    return members
      .filter((m) => !joinedRecently(m) && !gaveMandatoryIn(week, m.id) && !gaveMandatoryIn(prevWeek, m.id))
      .map((m) => m.id);
  }, [members, week, prevWeek]);
  const missedTwoSet = useMemo(() => new Set(missedTwo), [missedTwo]);

  const passesFilter = (m, e) => {
    if (filter === "all") return true;
    if (filter === "outside") return !m.inTerritory;
    if (filter === "nodonation") return !isNewThisWeek(m, week) && !RES.some((r) => (e.don[r] || 0) > 0);
    if (filter === "silveronly") return !isNewThisWeek(m, week) && !RES.some((r) => (e.don[r] || 0) > 0) && (e.don.silver || 0) > 0;
    if (filter === "missed2") return missedTwoSet.has(m.id);
    return e.status === filter;
  };

  // Two kinds of chip. The four status ones carry a solid bar in exactly the
  // colour-key colour, so the key doubles as their legend. The rest are just
  // other cuts of the roster with no colour meaning — they used to borrow
  // status colours, which put the same red on three chips. They get a hollow
  // ring instead: told apart by shape, not by nine near-identical hues.
  // "Nothing given" and "Below target" are the red and yellow statuses, so the
  // two are exclusive: gave nothing at all vs gave something but missed the
  // target. The "nodonation" filter (gave no mandatory resource, but possibly
  // silver) is still implemented below — it just has no chip at the moment.
  const statusChip = (k) => [k, t[STATUS[k].key], counts[k], STATUS[k].tone];
  const chips = [
    ["all", t.everyone, members.length, "line"],
    statusChip("red"),
    ...(prevWeek ? [["missed2", t.twoWeeksMissed, missedTwo.length, "redInk"]] : []),
    statusChip("yellow"),
    ["silveronly", t.silverOnly, extraCounts.silver, "silver"],
    statusChip("green"),
    statusChip("greenPlus"),
    ["outside", t.outsideFilter, extraCounts.outside, "band"],
  ];

  return (
    <div>
      <Podium t={t} members={members} week={week} />

      {/* participation */}
      <div className="bt-participation">
        <Meter label={`${t.donated} ${t.thisWeek}`} n={part.donors} denom={part.total} />
        <Meter label={`${t.producedChests} ${t.thisWeek}`} n={part.chesters} denom={part.total} />
        <Meter label={`${t.gaveSpeedups} ${t.thisWeek}`} n={part.speeders} denom={part.total} />
        <Meter label={t.membersInside} n={part.total - extraCounts.outside} denom={part.total} />
      </div>

      {/* colour legend — inline, above the list */}
      <div className="bt-legend">
        <span className="bt-legend-title">{t.legend}</span>
        {[
          ["red", t.cRed],
          ["amber", t.cYellow],
          ["green", t.cGreen],
          ["greenPlus", t.cGreenPlus],
        ].map(([tone, label]) => (
          <span key={label} className="bt-legend-item">
            <span className="bt-swatch bt-swatch--dot" data-tone={tone} />
            {label}
          </span>
        ))}
      </div>

      {/* donation rule note */}
      <div className="bt-rule-note">{t.donationRule}</div>

      {/* filter chips */}
      <div className="bt-chips">
        {chips.map(([k, label, n, tone]) => (
          <button key={k} className="bt-chip" onClick={() => setFilter(k)} aria-pressed={filter === k}>
            <span className="bt-swatch bt-swatch--bar" data-tone={tone} />
            {label}
            <span className="bt-chip-count">{n}</span>
          </button>
        ))}
      </div>

      {/* rank groups */}
      {RANKS.filter((r) => rows[r] && rows[r].length).map((rank) => {
        const list = rows[rank].filter((x) => passesFilter(x.m, x.e));
        if (filter !== "all" && list.length === 0) return null;
        return (
          <section key={rank} className="bt-rank-group">
            <div className="bt-rank-head">
              <h3 className="bt-rank-title">{t.ranks[rank]}</h3>
              <span className="bt-rank-count">{rows[rank].length}</span>
              <span className="bt-rank-rule" />
            </div>

            {list.length === 0 && <div className="bt-rank-blank">{t.noneMatch}</div>}

            <div className="bt-list">
              {list.map(({ m, e }) => {
                const isOpen = open === m.id;
                return (
                  <div key={m.id} className="bt-member" data-status={e.status}>
                    <div className="bt-member-summary" onClick={() => setOpen(isOpen ? null : m.id)}>
                      <div className="bt-member-main">
                        <div className="bt-member-nameline">
                          <span className="bt-member-name">{m.name}</span>
                          {isNewThisWeek(m, week) && (
                            <span className="bt-badge" data-tone="green">
                              {t.newThisWeek.toUpperCase()}
                            </span>
                          )}
                          {m.inactive && (
                            <span className="bt-badge" data-tone="amber">
                              {t.inactive.toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div className="bt-member-stats">
                          {t.statsLine(fmt(e.might), m.inTerritory ? t.inTerritory : t.outsideTerritory)}
                        </div>
                      </div>
                      <div className="bt-member-right">
                        <div className="bt-member-donation" data-met={e.donationMet ? "" : undefined}>
                          {e.donationMet ? t.donationsOk : `${e.missing.length} ${t.short}`}
                        </div>
                        <div className="bt-member-sub">
                          {t.chestsADay(e.chestAvg.toFixed(1))}
                          {e.speedupHours > 0 ? ` · ${t.speedupsGiven(fmtHours(e.speedupHours))}` : ""}
                        </div>
                      </div>
                      <span className="bt-member-toggle">{isOpen ? "−" : "+"}</span>
                    </div>

                    {isOpen && (
                      <div className="bt-member-detail">
                        <table className="bt-res-table">
                          <tbody>
                            {ALL_RES.map((r) => {
                              const given = e.don[r] || 0;
                              const required = RES.includes(r) ? e.need : null;
                              const ok = required === null ? given > 0 : given >= required;
                              return (
                                <tr key={r}>
                                  <td className="bt-res-name">
                                    <span className="bt-res-label">
                                      <ResIcon res={r} />
                                      <span className="bt-res-word">{t.res[r]}</span>
                                    </span>
                                  </td>
                                  <td className="bt-res-given">{fmt(given)}</td>
                                  <td className="bt-res-need">{required === null ? t.voluntary : `${t.ofWord} ${fmt(required)}`}</td>
                                  <td className="bt-res-ok" data-ok={ok ? "" : undefined}>
                                    {ok ? "✓" : "✗"}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>

                        <dl className="bt-facts">
                          <div className="bt-fact">
                            <dt>{t.fCountry}</dt>
                            <dd>
                              {m.country ? (
                                <>
                                  {countryName(m.country, lang)}
                                  <span className="bt-fact-aside">{m.country.toUpperCase()}</span>
                                </>
                              ) : (
                                <span className="bt-fact-none">{t.unknownField}</span>
                              )}
                            </dd>
                          </div>
                          <div className="bt-fact">
                            <dt>{t.fTimezone}</dt>
                            <dd>
                              {m.utcOffset == null ? (
                                <span className="bt-fact-none">{t.unknownField}</span>
                              ) : (
                                <>
                                  {offsetLabel(m.utcOffset)}
                                  <span className="bt-fact-aside">{t.localTimeNow(hhmm(nowUTCMinutes() + m.utcOffset))}</span>
                                </>
                              )}
                            </dd>
                          </div>
                          <div className="bt-fact">
                            <dt>{t.fLastActive}</dt>
                            <dd>
                              {m.lastActive ? (
                                <>
                                  {shortDate(m.lastActive, lang)}
                                  <span className="bt-fact-aside">{t.daysAgo(Math.max(0, daysBetween(m.lastActive, todayISO())))}</span>
                                </>
                              ) : (
                                <span className="bt-fact-none">{t.nothingYet}</span>
                              )}
                            </dd>
                          </div>
                          <div className="bt-fact">
                            <dt>{t.fJoined}</dt>
                            <dd>{shortDate(m.firstSeen, lang)}</dd>
                          </div>
                        </dl>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/* ---- app ----------------------------------------------------- */
function emptyState() {
  const k = weekStartOf(todayISO());
  return { members: [], currentWeek: k, weeks: { [k]: { start: k, mights: {}, donations: {}, chests: {}, speedups: {} } } };
}

export default function App() {
  const [state, setState] = useState(null);
  const [lang, setLang] = useState(() => {
    try {
      return localStorage.getItem("bow-lang") === "es" ? "es" : "en";
    } catch {
      return "en";
    }
  });
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("ledger");
  const [updatedAt, setUpdatedAt] = useState(null);
  const [tick, setTick] = useState(() => new Date());
  const [isMobile, setIsMobile] = useState(() => {
    try {
      return window.matchMedia("(max-width: 640px)").matches;
    } catch {
      return false;
    }
  });

  const t = T[lang];

  useEffect(() => {
    let mq;
    try {
      mq = window.matchMedia("(max-width: 640px)");
      const handler = (e) => setIsMobile(e.matches);
      setIsMobile(mq.matches);
      mq.addEventListener ? mq.addEventListener("change", handler) : mq.addListener(handler);
      return () => (mq.removeEventListener ? mq.removeEventListener("change", handler) : mq.removeListener(handler));
    } catch {}
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("tracker-state.json", { cache: "no-store" });
        // build_state.py stamps generatedAt; fall back to the file's own
        // mtime for state files written before that existed.
        const stamp = new Date(r.headers.get("last-modified") || NaN);
        const parsed = await r.json();
        if (!parsed.members || !parsed.weeks) throw new Error("bad shape");
        setState(parsed);
        const built = parsed.generatedAt ? new Date(parsed.generatedAt) : stamp;
        setUpdatedAt(isNaN(built) ? null : built);
      } catch {
        setState(emptyState());
      }
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("bow-lang", lang);
    } catch {}
  }, [lang]);

  useEffect(() => {
    const id = setInterval(() => setTick(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  // Page title + themed favicon (a gold bow & arrow on the heraldic band colour).
  useEffect(() => {
    document.title = "Brethren of War - Contribution Tracker";
    const svg = [
      "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'>",
      "<rect x='2' y='2' width='60' height='60' rx='14' fill='#3A2416'/>",
      "<path d='M26 10 Q10 32 26 54' fill='none' stroke='#C69A3E' stroke-width='5' stroke-linecap='round'/>",
      "<line x1='26' y1='10' x2='26' y2='54' stroke='#C69A3E' stroke-width='3'/>",
      "<line x1='22' y1='32' x2='50' y2='32' stroke='#E4C87E' stroke-width='4' stroke-linecap='round'/>",
      "<path d='M45 26 L54 32 L45 38' fill='none' stroke='#E4C87E' stroke-width='4' stroke-linecap='round' stroke-linejoin='round'/>",
      "</svg>",
    ].join("");
    const href = "data:image/svg+xml," + encodeURIComponent(svg);
    let link = document.querySelector("link[rel='icon']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.type = "image/svg+xml";
    link.href = href;
  }, []);

  if (loading || !state) return <div className="bt-loading">{t.loading}</div>;

  const weekKeys = Object.keys(state.weeks).sort().reverse();
  const week = state.weeks[state.currentWeek] || state.weeks[weekKeys[0]];
  const prevWeek = state.weeks[weekKeys[weekKeys.indexOf(state.currentWeek) + 1]];
  const roll = untilRollover(tick);

  const weekSelect =
    weekKeys.length > 0 ? (
      <select className="bt-week-select" value={state.currentWeek} onChange={(e) => setState({ ...state, currentWeek: e.target.value })}>
        {weekKeys.map((k) => (
          <option key={k} value={k}>
            {t.weekOf} {shortDate(k, lang)}
          </option>
        ))}
      </select>
    ) : null;

  const langBtn = (
    <button className="bt-lang" onClick={() => setLang(lang === "en" ? "es" : "en")} title="English / Español">
      {lang === "en" ? "ES" : "EN"}
    </button>
  );

  const membersText = `${state.members.length}/${MAX_MEMBERS} ${t.members} · ${t.dayN(daysElapsed(week.start))} · ${t.nextDay} ${roll.h}h ${roll.m}m`;

  // Relative by default, with the exact local time on hover.
  const updated = updatedAt && (
    <time className="bt-updated" dateTime={updatedAt.toISOString()} title={updatedAt.toLocaleString(locale(lang))}>
      {sinceLabel(updatedAt, tick, t)}
    </time>
  );

  const title = <h1 className="bt-h1">Brethren of War</h1>;

  return (
    <div className="bt-root">
      <div className="bt-backdrop" aria-hidden="true" />
      <header className="bt-header">
        <div className="bt-header-inner">
          {isMobile ? (
            <div className="bt-header-stack">
              <div className="bt-header-top">
                {title}
                {langBtn}
              </div>
              {weekSelect && <div className="bt-header-select">{weekSelect}</div>}
              <div className="bt-members">{membersText}</div>
              {updated && <div className="bt-updated-line">{updated}</div>}
            </div>
          ) : (
            <div className="bt-header-bar">
              <div className="bt-header-main">
                {title}
                {weekSelect}
                <span className="bt-members">{membersText}</span>
                {updated}
              </div>
              <div className="bt-header-end">{langBtn}</div>
            </div>
          )}
        </div>
      </header>

      <main className="bt-main">
        {state.members.length === 0 ? (
          <p className="bt-empty">{t.empty}</p>
        ) : (
          <>
            {/* deliberately not a Segmented: this switches the whole page, so
                it should not look like the in-page filters and view toggles */}
            <nav className="bt-viewtabs">
              {[
                ["ledger", t.tabLedger],
                ["timing", t.tabTiming],
              ].map(([k, label]) => (
                <button key={k} className="bt-viewtab" onClick={() => setView(k)} aria-current={view === k ? "page" : undefined}>
                  {label}
                </button>
              ))}
            </nav>
            {view === "ledger" ? (
              <Ledger t={t} lang={lang} members={state.members} week={week} prevWeek={prevWeek} />
            ) : (
              <Timing t={t} members={state.members} />
            )}
          </>
        )}
      </main>
    </div>
  );
}
