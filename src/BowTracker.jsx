import React, { useState, useEffect, useMemo, lazy, Suspense } from "react";
import { Anvil, Stone, TreePine, Wheat, Coins, Book } from "lucide-react";
import { fmt, compact, fmtHours, countryName } from "./format.js";
import "./BowTracker.css";

/* The map carries the world atlas with it — around half the built bundle — so
   it is a separate chunk fetched the first time that tab is opened rather than
   on every visit to the ledger. */
const WorldMap = lazy(() => import("./WorldMap.jsx"));

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
    tabMap: "Map",
    mapTitle: "Where the clan is",
    mapIntro: (c, n) => `${n} members across ${c} countries. Pick a country on the map or in the list to see who is there.`,
    mapHint: "Nothing selected yet.",
    memberCount: (n) => `${n} member${n === 1 ? "" : "s"}`,
    noCountry: (n) => (n === 1 ? "1 member has" : `${n} members have`) + " no country in their profile.",
    notOnMap: (list) => `Not drawable on this map: ${list}.`,
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
    tzCaveat: (n) =>
      "Timezones come from each member's game profile, which stores whatever their clock said when they filled it in, so it does not follow daylight saving. Each one is corrected against their country's real offset today" +
      (n > 0 ? `, which currently moves ${n} of them by an hour.` : "."),

    formerTitle: "No longer in the clan",
    formerCount: (n) => `${n} member${n === 1 ? "" : "s"}`,
    formerNote:
      "The game never records a departure, so these are dated to the last day there is any sign of them. They may have left, been removed, or the clan may simply not have been captured that day.",
    formerGhostNote: (n) =>
      `${n === 1 ? "One of them is" : `${n} of them are`} known only from the donation and chest ledgers — they were gone before any capture caught them on the roster, so there is no rank or join date, and a name only where a capture happened to include them.`,
    fLastListed: "Last listed",
    fLastGave: "Last contributed",
    unnamedMember: "Name never captured",

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
    multiples: "% poder",
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
    tabMap: "Mapa",
    mapTitle: "Dónde está el clan",
    mapIntro: (c, n) => `${n} miembros en ${c} países. Elige un país en el mapa o en la lista para ver quién está allí.`,
    mapHint: "Nada seleccionado todavía.",
    memberCount: (n) => `${n} miembro${n === 1 ? "" : "s"}`,
    noCountry: (n) => (n === 1 ? "1 miembro no tiene" : `${n} miembros no tienen`) + " país en su perfil.",
    notOnMap: (list) => `No se pueden dibujar en este mapa: ${list}.`,
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
    tzCaveat: (n) =>
      "Las zonas horarias vienen del perfil de cada miembro, que guarda lo que marcaba su reloj al rellenarlo, así que no siguen el horario de verano. Cada una se corrige con el desfase real de su país hoy" +
      (n > 0 ? `, lo que ahora mueve ${n} una hora.` : "."),

    formerTitle: "Ya no están en el clan",
    formerCount: (n) => `${n} miembro${n === 1 ? "" : "s"}`,
    formerNote:
      "El juego no registra las salidas, así que la fecha es el último día en que hay rastro de ellos. Puede que se fueran, que los expulsaran, o que ese día no se capturara el clan.",
    formerGhostNote: (n) =>
      `${n === 1 ? "De uno de ellos solo hay rastro" : `De ${n} de ellos solo hay rastro`} en los registros de donaciones y cofres: ya no estaban cuando se capturó la lista, así que no hay rango ni fecha de ingreso, y solo hay nombre si alguna captura llegó a incluirlos.`,
    fLastListed: "Visto por última vez",
    fLastGave: "Última aportación",
    unnamedMember: "Nombre nunca capturado",

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

/* ---- timezones -------------------------------------------------
   The offset in a member's game profile cannot be trusted for daylight
   saving. It reads like a value frozen when the profile was filled in: a
   German who registered in winter reads UTC+1 (CET) and a Brit who registered
   in summer also reads UTC+1 (BST), so the same number means different things.
   Measured against this roster, 22 members were on their winter offset, 16 on
   their current one, 10 could be either.

   Resolving through the country's IANA zone instead gives the offset that is
   right today, and stays right through every future DST change without a
   rebuild, since the lookup happens in the browser. Zones are listed
   most-populated first: that is the tie-break when a reported offset matches
   more than one zone in the same country (US −7 is both Los Angeles now and
   Denver in winter). */
const COUNTRY_ZONES = {
  AR: ["America/Argentina/Buenos_Aires"], AT: ["Europe/Vienna"],
  AU: ["Australia/Sydney", "Australia/Melbourne", "Australia/Brisbane", "Australia/Perth", "Australia/Adelaide", "Australia/Darwin"],
  BE: ["Europe/Brussels"], BG: ["Europe/Sofia"],
  BR: ["America/Sao_Paulo", "America/Manaus", "America/Rio_Branco", "America/Noronha"],
  CA: ["America/Toronto", "America/Vancouver", "America/Edmonton", "America/Winnipeg", "America/Halifax", "America/St_Johns"],
  CH: ["Europe/Zurich"], CL: ["America/Santiago"], CN: ["Asia/Shanghai"], CO: ["America/Bogota"],
  CZ: ["Europe/Prague"], DE: ["Europe/Berlin"], DK: ["Europe/Copenhagen"], DZ: ["Africa/Algiers"],
  EE: ["Europe/Tallinn"], EG: ["Africa/Cairo"], ES: ["Europe/Madrid", "Atlantic/Canary"],
  FI: ["Europe/Helsinki"], FR: ["Europe/Paris"], GB: ["Europe/London"], GR: ["Europe/Athens"],
  HR: ["Europe/Zagreb"], HU: ["Europe/Budapest"], ID: ["Asia/Jakarta"], IE: ["Europe/Dublin"],
  IL: ["Asia/Jerusalem"], IN: ["Asia/Kolkata"], IQ: ["Asia/Baghdad"], IR: ["Asia/Tehran"],
  IT: ["Europe/Rome"], JP: ["Asia/Tokyo"], KR: ["Asia/Seoul"], KZ: ["Asia/Almaty"],
  LT: ["Europe/Vilnius"], LV: ["Europe/Riga"], MA: ["Africa/Casablanca"], MX: ["America/Mexico_City", "America/Tijuana"],
  MY: ["Asia/Kuala_Lumpur"], NG: ["Africa/Lagos"], NL: ["Europe/Amsterdam"], NO: ["Europe/Oslo"],
  NZ: ["Pacific/Auckland"], PE: ["America/Lima"], PH: ["Asia/Manila"], PK: ["Asia/Karachi"],
  PL: ["Europe/Warsaw"], PT: ["Europe/Lisbon", "Atlantic/Azores"], RO: ["Europe/Bucharest"],
  RS: ["Europe/Belgrade"], RU: ["Europe/Moscow", "Asia/Yekaterinburg", "Asia/Novosibirsk", "Asia/Vladivostok"],
  SA: ["Asia/Riyadh"], SE: ["Europe/Stockholm"], SG: ["Asia/Singapore"], SI: ["Europe/Ljubljana"],
  SK: ["Europe/Bratislava"], TH: ["Asia/Bangkok"], TN: ["Africa/Tunis"], TR: ["Europe/Istanbul"],
  UA: ["Europe/Kyiv"], UG: ["Africa/Kampala"],
  US: ["America/New_York", "America/Chicago", "America/Los_Angeles", "America/Denver", "America/Phoenix", "America/Anchorage", "Pacific/Honolulu"],
  UY: ["America/Montevideo"], VE: ["America/Caracas"], VN: ["Asia/Ho_Chi_Minh"],
  YE: ["Asia/Aden"], ZA: ["Africa/Johannesburg"],
};

/* minutes east of UTC for a zone at an instant */
function offsetAt(zone, date) {
  try {
    const name = new Intl.DateTimeFormat("en-GB", { timeZone: zone, timeZoneName: "longOffset" })
      .formatToParts(date)
      .find((p) => p.type === "timeZoneName").value;
    const m = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
    return m ? (m[1] === "-" ? -1 : 1) * (+m[2] * 60 + +m[3]) : 0; // bare "GMT" is zero
  } catch {
    return null;
  }
}

const zoneCache = new Map();
function zoneInfo(zone) {
  if (!zoneCache.has(zone)) {
    const now = new Date();
    const y = now.getUTCFullYear();
    const cur = offsetAt(zone, now);
    const jan = offsetAt(zone, new Date(Date.UTC(y, 0, 15)));
    const jul = offsetAt(zone, new Date(Date.UTC(y, 6, 15)));
    zoneCache.set(zone, cur == null ? null : { cur, std: Math.min(jan, jul), dst: cur - Math.min(jan, jul) });
  }
  return zoneCache.get(zone);
}

/* The offset to actually use for a member: their country's real offset right
   now, falling back to the raw profile value when the country is unknown.
   `matched` is false when the profile value lines up with no zone in that
   country — the two pieces of self-reported data disagree, and we go with the
   country. */
function resolveOffset(country, reported) {
  const zones = COUNTRY_ZONES[(country || "").toUpperCase()];
  if (!zones) return { mins: reported, zone: null, matched: reported != null };
  for (const z of zones) {
    const i = zoneInfo(z);
    if (i && (i.cur === reported || (i.std === reported && i.dst !== 0))) {
      return { mins: i.cur, zone: z, matched: true };
    }
  }
  const first = zoneInfo(zones[0]);
  return first ? { mins: first.cur, zone: zones[0], matched: false } : { mins: reported, zone: null, matched: false };
}

/* ---- timing ---------------------------------------------------
   Which UTC hours fall inside most members' waking day. The window runs from
   09:00 local to midnight local, so — working in minutes past local midnight —
   a member is awake whenever their local time is at or past 09:00, since the
   value is already reduced modulo a day. */
const AWAKE_FROM = 9 * 60;

/* How good an hour is, as a share of the clan. Four bands rather than one
   highlight, so the shoulders either side of the peak are readable as "still
   most people" instead of collapsing into the same grey as the dead hours. */
const tierOf = (pct) => (pct >= 90 ? "best" : pct >= 70 ? "good" : pct >= 45 ? "ok" : "low");

const hhmm = (mins) => {
  const m = ((mins % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
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

  // resolve each member to the offset that is correct today, not the one
  // frozen in their profile
  const known = useMemo(
    () =>
      members
        .map((m) => ({ ...m, resolved: resolveOffset(m.country, m.utcOffset) }))
        .filter((m) => m.resolved.mins != null),
    [members]
  );
  const unknown = members.length - known.length;
  const shifted = known.filter((m) => m.utcOffset != null && m.resolved.mins !== m.utcOffset).length;

  // one entry per distinct offset, so a row can explain its own number
  const groups = useMemo(() => {
    const g = new Map();
    known.forEach((m) => {
      const off = m.resolved.mins;
      if (!g.has(off)) g.set(off, []);
      g.get(off).push(m.name);
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
            <div
              className="bt-slot"
              key={r.hour}
              data-tier={tierOf(r.pct)}
              data-best={r.n === best ? "" : undefined}
              data-reset={r.hour === BOUNDARY_UTC_HOUR ? "" : undefined}
            >
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
        {t.tzCaveat(shifted)}
      </p>
    </section>
  );
}

/* ---- ledger -------------------------------------------------- */
function Ledger({ t, lang, members, week, prevWeek, former }) {
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
                              {resolveOffset(m.country, m.utcOffset).mins == null ? (
                                <span className="bt-fact-none">{t.unknownField}</span>
                              ) : (
                                <>
                                  {offsetLabel(resolveOffset(m.country, m.utcOffset).mins)}
                                  <span className="bt-fact-aside">
                                    {t.localTimeNow(hhmm(nowUTCMinutes() + resolveOffset(m.country, m.utcOffset).mins))}
                                  </span>
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

      <FormerMembers t={t} lang={lang} former={former} />
    </div>
  );
}

/* ---- former members --------------------------------------------
   Collapsed by default: it is history, not something to scan every visit. */
function FormerMembers({ t, lang, former }) {
  const [open, setOpen] = useState(false);
  if (!former || former.length === 0) return null;
  const ghosts = former.filter((m) => m.via === "contributions").length;

  return (
    <section className="bt-former">
      <button className="bt-former-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="bt-former-title">{t.formerTitle}</span>
        <span className="bt-former-count">{t.formerCount(former.length)}</span>
        <span className="bt-former-toggle">{open ? "−" : "+"}</span>
      </button>

      {open && (
        <>
          <ul className="bt-former-list">
            {former.map((m) => {
              const ghost = m.via === "contributions";
              return (
                <li key={m.id} data-ghost={ghost ? "" : undefined}>
                  <span className="bt-former-name" data-unnamed={m.name ? undefined : ""}>
                    {m.name || t.unnamedMember}
                  </span>
                  {!ghost && <span className="bt-former-rank">{t.ranks[m.rank] || m.rank}</span>}
                  {!ghost && <span className="bt-former-might">{compact(m.might)}</span>}
                  <span className="bt-former-dates">
                    {ghost ? (
                      <>
                        {t.fLastGave} {shortDate(m.lastSeen, lang)}
                      </>
                    ) : (
                      <>
                        {t.fJoined} {shortDate(m.joined, lang)} · {t.fLastListed} {shortDate(m.lastSeen, lang)}
                      </>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="bt-rule-note">
            {t.formerNote} {ghosts > 0 && t.formerGhostNote(ghosts)}
          </p>
        </>
      )}
    </section>
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
                ["map", t.tabMap],
              ].map(([k, label]) => (
                <button key={k} className="bt-viewtab" onClick={() => setView(k)} aria-current={view === k ? "page" : undefined}>
                  {label}
                </button>
              ))}
            </nav>
            {view === "ledger" && (
              <Ledger t={t} lang={lang} members={state.members} week={week} prevWeek={prevWeek} former={state.formerMembers} />
            )}
            {view === "timing" && <Timing t={t} members={state.members} />}
            {view === "map" && (
              <Suspense fallback={<p className="bt-empty">{t.loading}</p>}>
                <WorldMap t={t} lang={lang} members={state.members} />
              </Suspense>
            )}
          </>
        )}
      </main>
    </div>
  );
}
