import React, { useState, useEffect, useMemo, useCallback, lazy, Suspense } from "react";
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
const MAX_MEMBERS = 70;
const DONATION_PCT = 0.05;
const CHEST_TARGET = 3;
/* Share of a week's clan chests from its single biggest producer, past which
   the total stops describing the clan and starts describing one member. The
   two complete weeks on record sit at 16% and 19%; the week of 16 Aug hit 65%
   on one member's bulk grants. Set at roughly double the normal range so it
   stays quiet in an ordinary week — worth retuning once there are more weeks
   of chest data than the three we have. */
const CONCENTRATED_AT = 0.4;
const EXCEED_MARGIN = 0.5; // 50% past both targets earns the darker green
// Days of unmoved might before a member is flagged. Mirrors STALL_DAYS in
// build_state.py, which is what computes mightFlatDays.
const STALL_DAYS = 3;
// Size of the "the people who actually carry the clan" cut in Good times.
const TOP_N = 15;

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
    monthTop: "Top three donors",
    monthNote: "share of might given, lumber, stone, iron and food",
    monthOpen: "in progress",
    monthPending: (month) =>
      `${month} is still running — the game day rolls at 17:00 UTC, so these figures can still move.`,
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
    vsLastWeek: "vs last week",
    deltaMembers: "members",
    formerAlso: "Also contributed this week, no longer in the clan:",
    leftClan: "no longer in clan",
    leftOn: (d) => `left ${d}`,
    departedPlus: (n) => `plus ${n} who ${n === 1 ? "was" : "were"} on the roster that week and ${n === 1 ? "has" : "have"} left since`,
    rosterStill: (n, of) => `${n} of these ${of} are still in the clan`,
    rosterChurn: (j, l) => `${j} joined and ${l} left during this week`,
    fDonated: "donated",
    fChests: "produced chests",
    fSpeedups: "gave speedups",
    thisWeek: "this week",

    everyone: "Everyone",
    stRed: "1 week missed",
    stYellow: "Below target",
    stGreen: "Target met",
    stGreenPlus: "Well above target",
    noneMatch: "Nobody matches that filter.",
    noDonation: "Below target",
    silverOnly: "Silver only",
    outsideFilter: "Far outside territory",
    twoWeeksMissed: "2 weeks missed",
    stalledFilter: "Possibly inactive",
    donationRule:
      "“Donations met” currently means at least 20% of might given across the four required resources — lumber, stone, iron and food — combined, even if some of them are below 5% or missing. Silver and scientific tractates are shown but never counted, so a week of nothing else counts as a week missed. The target is a share of the might each member had at the start of the week, so it does not climb as they grow. Meet it on Monday and it stays met.",

    statsLine: (might, place) => `${might} might · ${place}`,
    donationsOk: "donations met",
    short: "short",
    chestsADay: (n) => `${n} chests a day`,
    clanChestsADay: "clan chests a day",
    clanChestsOver: (n, d) => `${n} over ${d} ${d === 1 ? "day" : "days"}`,
    clanChestsPerMember: (n, of) => `${n} per member across ${of}`,
    clanChestsAtFull: (cap, n) => `${cap} members would make ≈${n} a day`,
    clanChestsConcentrated: (pct) => `${pct}% of it from one member`,
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
    fWasCalled: "Previously",
    untilDate: (d) => `last seen under that name ${d}`,
    fMight: "Might",
    mightFlat: (n) => `flat for ${n} day${n === 1 ? "" : "s"}`,
    mightRose: (n) => (n === 0 ? "rose today" : n === 1 ? "rose yesterday" : `rose ${n} days ago`),
    mightUntracked: "only one day tracked",
    inactiveWhy: (n) => `Might has not moved in ${n} days, and nothing has been donated, sped up or chested in that time either. Might alone is not enough — a member can play all day without shifting it — so the badge needs both.`,
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
    countAll: "Everyone",
    countActive: "Active only",
    countTop: `Top ${TOP_N}`,
    excludedNote: (n) =>
      `${n} member${n === 1 ? "" : "s"} left out as probably not around: might flat for ${STALL_DAYS}+ days, or nothing contributed in ${STALL_DAYS}+ days.`,
    topNote: `Counting only the clan's top ${TOP_N} by quality score, the same ranking the Ledger sorts on, so the two always agree about who they are.`,
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
      `${n === 1 ? "One of them is" : `${n} of them are`} known only from the donation and chest ledgers. They were gone before any capture caught them on the roster, so there is no rank or join date.`,
    fLastListed: "Last listed",
    fLastGave: "Last contributed",

    filterLabel: "Filter",
    qualityInfo: "How is quality scored?",
    ruleInfo: "What counts as donations met?",
    sortBy: "Sort",
    sortRank: "By rank",
    sortWorst: "Worst first",
    sortBest: "Best first",
    qualityTitle: "Quality score",
    qualityWhy: "Donations, chests and speedups against the clan's top few — donations as a multiple of the member's own target, each week counted separately; living in territory, days since they last moved their might or contributed, and where their might places them in the clan. Open the row for the breakdown.",
    qualityNotCounted: "nobody scored, not counted",
    qualityOverWeeks: (from, to) => `weeks of ${from} and ${to}`,
    qualityOverWeek: (from) => `week of ${from}`,
    qualityParts: {
      donations: "Donations vs target",
      chests: "Chests",
      speedups: "Speedups",
      territory: "In territory",
      activity: "Recently active",
      might: "Might in clan",
    },
    qualityNote:
      "Quality is one score out of 100 over the selected week and the one before it, so a week that has only just started is not judged on two days of data. Donations count as a multiple of each member's own target, scored against the clan's top few — the published 5% rule is met many times over by nearly everyone who gives at all, so it decides the “donations met” badge rather than this score — with the two weeks scored separately and averaged so a big week cannot cover a silent one; chests and speedups against the clan's top few over the same span, so one member's windfall week cannot set the scale for everyone; plus living in territory, how recently they last moved their might or contributed — whichever is fresher, since might can sit still through a day of ordinary play — and where their might places them in the clan. That last one is worth only 4, since might mostly reflects how long someone has played. Anything nobody scored on at all is left out rather than counted as zero for everyone. Open any row to see how its score was reached.",

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
    monthTop: "Los tres mejores donantes",
    monthNote: "poder donado, madera, piedra, hierro y comida",
    monthOpen: "en curso",
    monthPending: (month) =>
      `${month} sigue en curso — el día de juego cambia a las 17:00 UTC, así que estas cifras aún pueden moverse.`,
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
    vsLastWeek: "frente a la semana pasada",
    deltaMembers: "miembros",
    formerAlso: "También contribuyeron esta semana, ya no están en el clan:",
    leftClan: "ya no está en el clan",
    leftOn: (d) => `salió el ${d}`,
    departedPlus: (n) => `más ${n} que ${n === 1 ? "estaba" : "estaban"} en el clan esa semana y se ${n === 1 ? "ha" : "han"} ido desde entonces`,
    rosterStill: (n, of) => `${n} de estos ${of} ${n === 1 ? "sigue" : "siguen"} en el clan`,
    rosterChurn: (j, l) => `${j} ${j === 1 ? "entró" : "entraron"} y ${l} se ${l === 1 ? "fue" : "fueron"} durante esta semana`,
    fDonated: "donaron",
    fChests: "produjeron cofres",
    fSpeedups: "dieron aceleraciones",
    thisWeek: "esta semana",

    everyone: "Todos",
    stRed: "1 semana sin dar",
    stYellow: "Por debajo del objetivo",
    stGreen: "Objetivo cumplido",
    stGreenPlus: "Muy por encima del objetivo",
    noneMatch: "Nadie coincide con ese filtro.",
    noDonation: "Por debajo del objetivo",
    silverOnly: "Solo plata",
    outsideFilter: "Lejos del territorio",
    twoWeeksMissed: "2 semanas sin dar",
    stalledFilter: "Posiblemente inactivos",
    donationRule:
      "“Donaciones cumplidas” significa al menos el 20% del poder donado entre los cuatro recursos obligatorios — madera, piedra, hierro y comida — combinados, aunque alguno esté por debajo del 5% o falte. La plata y los tratados científicos se muestran pero nunca cuentan, así que una semana en la que solo se dio eso cuenta como una semana sin dar. El objetivo se calcula sobre el poder que cada miembro tenía al empezar la semana, así que no sube según crecen: si se cumple el lunes, sigue cumplido.",

    statsLine: (might, place) => `${might} de poder · ${place}`,
    donationsOk: "donaciones cumplidas",
    short: "por debajo",
    chestsADay: (n) => `${n} cofres al día`,
    clanChestsADay: "cofres del clan al día",
    clanChestsOver: (n, d) => `${n} en ${d} ${d === 1 ? "día" : "días"}`,
    clanChestsPerMember: (n, of) => `${n} por miembro entre ${of}`,
    clanChestsAtFull: (cap, n) => `${cap} miembros harían ≈${n} al día`,
    clanChestsConcentrated: (pct) => `el ${pct}% de un solo miembro`,
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
    fWasCalled: "Antes",
    untilDate: (d) => `visto con ese nombre por última vez el ${d}`,
    fMight: "Poder",
    mightFlat: (n) => `sin cambios desde hace ${n} día${n === 1 ? "" : "s"}`,
    mightRose: (n) => (n === 0 ? "subió hoy" : n === 1 ? "subió ayer" : `subió hace ${n} días`),
    mightUntracked: "solo un día registrado",
    inactiveWhy: (n) => `El poder no se mueve desde hace ${n} días, y en ese tiempo tampoco ha donado, acelerado ni hecho cofres. El poder por sí solo no basta — se puede jugar a diario sin moverlo — así que la etiqueta exige ambas cosas.`,
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
    countAll: "Todos",
    countActive: "Solo activos",
    countTop: `Top ${TOP_N}`,
    excludedNote: (n) =>
      `${n} miembro${n === 1 ? "" : "s"} fuera del recuento por parecer ausentes: poder sin cambios ${STALL_DAYS}+ días, o sin aportar nada en ${STALL_DAYS}+ días.`,
    topNote: `Contando solo a los ${TOP_N} mejores del clan por puntuación de calidad, la misma que ordena el Registro, así que ambos coinciden en quiénes son.`,
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
      `${n === 1 ? "De uno de ellos solo hay rastro" : `De ${n} de ellos solo hay rastro`} en los registros de donaciones y cofres: ya no estaban cuando se capturó la lista, así que no hay rango ni fecha de ingreso.`,
    fLastListed: "Visto por última vez",
    fLastGave: "Última aportación",

    filterLabel: "Filtro",
    qualityInfo: "¿Cómo se calcula la calidad?",
    ruleInfo: "¿Qué cuenta como donaciones cumplidas?",
    sortBy: "Orden",
    sortRank: "Por rango",
    sortWorst: "Peores primero",
    sortBest: "Mejores primero",
    qualityTitle: "Puntuación de calidad",
    qualityWhy: "Donaciones, cofres y aceleraciones frente a los mejores del clan — las donaciones como múltiplo del objetivo propio, contando cada semana por separado; vivir en el territorio y los días desde que movió su poder o aportó algo. Abre la fila para ver el desglose.",
    qualityNotCounted: "nadie ha puntuado, no se cuenta",
    qualityOverWeeks: (from, to) => `semanas del ${from} y del ${to}`,
    qualityOverWeek: (from) => `semana del ${from}`,
    qualityParts: {
      donations: "Donaciones vs objetivo",
      chests: "Cofres",
      speedups: "Aceleraciones",
      territory: "En el territorio",
      activity: "Activo recientemente",
      might: "Poder en el clan",
    },
    qualityNote:
      "La calidad es una puntuación sobre 100 de la semana elegida y la anterior, para que una semana recién empezada no se juzgue con dos días de datos. Las donaciones se miden como múltiplo del objetivo de cada miembro y se puntúan frente a los mejores del clan —la regla del 5% la supera con creces casi todo el que dona algo, así que decide la insignia de «donaciones cumplidas» y no esta puntuación—, con las dos semanas por separado y promediadas para que una semana grande no tape una vacía; los cofres y las aceleraciones frente a los mejores del clan en ese periodo, para que la semana excepcional de un solo miembro no marque la escala de todos; más vivir en el territorio, lo reciente que sea el cambio de su poder o su última aportación —lo que sea más fresco, porque el poder puede no moverse en un día de juego normal— y la posición de su poder dentro del clan, que solo vale 4 porque el poder refleja sobre todo el tiempo jugado. Lo que nadie ha puntuado se excluye en vez de contar como cero para todos. Abre cualquier fila para ver cómo se ha calculado.",

    ranks: { Leader: "Líder", Superior: "Superior", Officer: "Oficial", Veteran: "Veterano", Member: "Miembro", Soldier: "Soldado" },
    res: { lumber: "Madera", stone: "Piedra", iron: "Hierro", food: "Comida", silver: "Plata", tractates: "Tratados" },
  },
};

/* ---- dates: day + week roll at 20:00 Estonian == 17:00 UTC ----
   That rollover is midnight on the game server's own clock, UTC+7, so a
   game-day is named for its date there: the date it *ends* on in UTC, not the
   one it starts on. Must match game_day() in build_state.py — the two
   conventions disagreeing is what let a finished month keep taking donations. */
const BOUNDARY_UTC_HOUR = 17;
const SERVER_UTC_OFFSET = 24 - BOUNDARY_UTC_HOUR;
const iso = (d) => d.toISOString().slice(0, 10);

function todayISO(when = new Date()) {
  return iso(new Date(when.getTime() + SERVER_UTC_OFFSET * 3600000));
}
function weekStartOf(dateStr) {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return iso(d);
}
/* Which day of the week we are on, 1..7. For labels — "day 3 of 7", "over 3
   days" — where a fraction would read as an error. */
function dayOfWeek(weekStart, when = new Date()) {
  const start = new Date(weekStart + "T12:00:00Z");
  const today = new Date(todayISO(when) + "T12:00:00Z");
  return Math.min(Math.max(Math.round((today - start) / 86400000) + 1, 1), 7);
}

/* How much of the week has actually run, as a fraction of days — the divisor
   for anything "per day".

   The day in progress counts only as far as it has gone, because counting it
   whole made every rate collapse at the 20:00 rollover: the clan chest figure
   fell from 272 a day to 233 the instant the divisor gained a seventh day that
   was seconds old and held no chests. Nothing had changed but the clock. The
   numerator already includes that day's partial output, so scaling the divisor
   the same way keeps the two in step and the figure continuous across the
   boundary.

   Floored at 1 so the first day of a week cannot extrapolate: ten minutes in,
   five chests would otherwise read as 720 a day. That leaves day one reading
   low, which is the old behaviour and the safer direction. From day two on
   there is always a completed day underneath, so no floor is needed and the
   rate is continuous from there. */
function daysElapsed(weekStart, when = new Date()) {
  const start = new Date(weekStart + "T12:00:00Z");
  const today = new Date(todayISO(when) + "T12:00:00Z");
  const completed = Math.round((today - start) / 86400000);
  // hours since the last rollover, so 0 at 17:00 UTC and 23.99 just before it
  const intoDay = ((when.getTime() / 3600000 - BOUNDARY_UTC_HOUR) % 24 + 24) % 24;
  return Math.min(Math.max(completed + intoDay / 24, 1), 7);
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
/* The last game-day a week covers. */
function weekEndOf(week) {
  return iso(new Date(new Date(week.start + "T12:00:00Z").getTime() + 6 * 86400000));
}
/* Was this person in the clan during that week at all? Anyone who joined after
   it ended has no business in its roster: they cannot have donated, so every
   week-shaped verdict about them — "Nothing given", "2 weeks missed" — is a
   statement about a week they were not there for. The same cut at the other
   end lets someone who has since left stay in the weeks they were actually
   here for, instead of vanishing out of their own history the day they go.
   A member with no firstSeen predates the history and is assumed present. */
function wasInClanFor(member, week) {
  if (member.firstSeen && member.firstSeen > weekEndOf(week)) return false;
  if (member.departed && member.departed < week.start) return false;
  return true;
}


/* ---- scoring ------------------------------------------------- */
function evaluate(member, week) {
  const elapsed = daysElapsed(week.start);
  /* Three mights, each with one job.

     `targetMight` is the start-of-week figure, frozen by build_state.py, so a
     week's goal cannot move while it is being played. Only the target and the
     status read it.

     `weekMight` is the last figure recorded inside that week — the denominator
     for a share of might, which has to belong to the week it describes. The
     start-of-week one understates what could be given by Sunday; the current
     one drags every past week down as the member grows, so an old week shrinks
     each time it is looked at.

     `might` is what they have now, and is only ever displayed. */
  const might = member.might ?? (week.mights && week.mights[member.id]);
  const targetMight = (week.mights && week.mights[member.id]) ?? member.might;
  const weekMight =
    (week.endMights && week.endMights[member.id]) ?? (week.mights && week.mights[member.id]) ?? member.might;
  const need = Math.round(targetMight * DONATION_PCT);
  const don = (week.donations && week.donations[member.id]) || {};
  const chestDays = (week.chests && week.chests[member.id]) || {};
  const chestTotal = Object.values(chestDays).reduce((a, b) => a + b, 0);
  const chestAvg = chestTotal / elapsed;
  const speedupHours = (week.speedups && week.speedups[member.id]) || 0;

  const donationMet = RES.every((r) => (don[r] || 0) >= need);
  const chestMet = chestAvg >= CHEST_TARGET;
  /* Silver and scientific tractates do not count towards the target, so they
     do not count as having given either: someone whose whole week is
     tractates has given nothing that the target measures, and reads as
     "Nothing given" rather than "Below target". The breakdown table still
     shows both, since what they gave is worth seeing — it just is not scored. */
  const anyDonation = RES.some((r) => (don[r] || 0) > 0);

  const mandatoryTotal = RES.reduce((a, r) => a + (don[r] || 0), 0);
  const donationOk = donationMet || mandatoryTotal >= targetMight * DONATION_PCT * 4;

  const exceedsDonation = mandatoryTotal >= targetMight * DONATION_PCT * 4 * (1 + EXCEED_MARGIN);
  const exceedsChests = chestAvg >= CHEST_TARGET * (1 + EXCEED_MARGIN);

  // NOTE: goal status is currently based on donations only.
  // The chest expectation is commented out — we'll re-enable it later.
  let status;
  if (!anyDonation /* && chestTotal === 0 */) status = "red";
  else if (donationOk /* && chestMet */) status = exceedsDonation /* && exceedsChests */ ? "greenPlus" : "green";
  else status = "yellow";

  return { might, targetMight, weekMight, need, don, chestTotal, chestAvg, speedupHours, donationMet, chestMet, status, missing: RES.filter((r) => (don[r] || 0) < need) };
}

/* ---- quality score --------------------------------------------
   One number for "is this member pulling their weight", so the roster can be
   ordered by it. Five parts, each scored 0..1 and then weighted; the weights
   are the priority order given for the feature and are shown in the UI so a
   ranking can always be traced back to its parts.

   Donations are scored against the member's own target rather than as a raw
   amount. Ranking on raw resources would just sort by might — a 2.4M member
   giving 100k would outrank a 30k member who gave everything asked of them.
   Meeting the target exactly scores half, doubling it scores full, so both
   falling short and going well beyond still separate people.

   Chests and speedups have no per-member target, so those are scored against
   the clan rather than against the member. That does favour big accounts, but
   chest and speedup capacity genuinely scales with size and there is no
   published expectation to measure against instead.

   The yardstick is the clan's 90th percentile, not its single best, because
   one member's windfall must not set the scale for everyone. On 19 Aug a
   member collected 694 chests in a week against a previous clan best of 211;
   scored against the max, the clan's second-largest producer fell from 22.0
   points to 5.4 while her own output rose, and an 8:1 lead over a mid-table
   member came out worth less than that member's 4:1 lead on speedups. A
   percentile keeps the measure clan-relative but stops a single outlier from
   flattening everyone below it. See QUALITY_TOP_PCT. */
/* Weights sum to 100, so the parts on the breakdown add up to the score shown
   beside them. Might is deliberately at the bottom at 4: it says something
   about a member's worth to the clan, but it is largely a product of how long
   they have played, so letting it weigh heavily would rank veterans above
   people actually doing the work.

   Speedups are capped at 5. They are the thinnest measure on the board — only
   25 of 49 members sent any at all over the span, and sending them is driven
   by whether a clan build happens to be running rather than by effort — so a
   13-point weight let an event calendar move the ranking more than chests
   did.

   Donations and chests carry the board between them at 38 and 35, because
   they are the two things the clan actually asks for and the two it can
   measure honestly. */
/* Activity used to outweigh might 3:1 to stop a large dormant account being
   refunded most of what its stall cost — flat 9 days took -14 and got +9.4
   straight back for its size, a net -4.6, and at 18/6 that net became -12.4.
   At 8/4 the net is -4, so the effect holds: a big account can sit still for a
   week and lose less than a small one loses for missing a donation. That is
   the accepted trade for weighting contribution more heavily — activity is a
   proxy read off a once-a-day might reading, while donations and chests are
   things the member demonstrably did. Judge the pair by that net figure rather
   than by the weights side by side, and keep the gap of 4 if either moves. */
/* Territory keeps its 10 even though 78% of the roster sits at full marks on
   it, because a component is not measured by how much it spreads people out.
   Living outside the radius is the clan's first reason to remove someone, so
   those 10 points are a penalty the 13 members outside pay, not a bonus the 46
   inside collect — the same arithmetic read from the end that matters. Judge
   it by what it costs the people it applies to.

   Territory is binary on purpose: the clan cares whether you live inside the
   radius, not how far inside, and grading the distance would invent a
   distinction nobody acts on.

   Activity is the one that really was near-universal without being a rule
   anybody is held to — 68% at full marks, and a proxy read off a once-a-day
   might reading at that. It gives up 2 points, might gives up 2 with it to
   keep the gap of 4 the note above is about, and donations and chests take
   the 4 between them. */
const QUALITY_WEIGHTS = { donations: 38, chests: 35, speedups: 5, territory: 10, activity: 8, might: 4 };
// Flat-might days at which the activity component reaches zero.
const QUALITY_STALE_AT = 7;
/* Where the top of the chest and speedup scales sits, as a percentile of the
   clan. At 0.9 roughly the top five members reach full marks and cannot be
   separated on that component — deliberate: worst-first is the working sort,
   so resolution at the bottom is worth more than resolution among the best. */
const QUALITY_TOP_PCT = 0.9;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/* Linear-interpolated percentile over the whole roster, zeros included: a
   member who produced nothing is evidence about the clan's spread, not a gap
   in the data. */
function percentile(values, p) {
  if (!values.length) return 0;
  const v = [...values].sort((a, b) => a - b);
  const i = (v.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.min(lo + 1, v.length - 1);
  return v[lo] + (v[hi] - v[lo]) * (i - lo);
}

/* The denominator for a clan-relative component. Falls back to the maximum
   when the percentile is zero — with more than nine members in ten producing
   nothing the percentile says only that, and dividing by it would score the
   handful who did produce as infinite rather than as leaders. */
function clanScale(values) {
  const top = Math.max(0, ...values);
  if (top <= 0) return 0;
  return percentile(values, QUALITY_TOP_PCT) || top;
}
/* Cut down by roughly the bonus the reweighting removed — most of the roster
   collected the 2 points that left activity, so the old 60/35/15 on the new
   scale would have demoted 5 people who had done nothing differently. At
   58/33/13 the bands hold the populations they had and only genuine movement
   changes anyone's colour. */
const qualityBand = (score) => (score >= 58 ? "high" : score >= 33 ? "mid" : score >= 13 ? "low" : "none");

function qualityOf(m, span, scales, asOf) {
  const quiet = quietDays(m, asOf);
  const parts = {
    /* Each week scored on its own and the two averaged, rather than one total
       over the span. Summed, a single large week covered a silent one
       outright: Sador gave 26x his target in the week of 9 Aug and nothing at
       all in the week of 16 Aug, and still scored full marks. Averaged,
       contributing in one week of two scores half whichever week it was — the
       same for Sador, who gave early, as for Keanef, who gave late. The cost
       is a half-weight zero on the Monday of a new week, before anyone has
       donated.

       The week is scored as a multiple of the member's own target against the
       clan's 90th percentile of the same multiple — not against the target
       itself. The clan rule (5% of might per resource) turns out to be
       trivial next to what people actually give: the median donating
       member-week is 38x the target and the largest is 329x, so 37 of the 46
       donating member-weeks cleared the old 2x cap, putting the scale near
       90x. That made the largest
       weight on the board a near-binary "did you donate at all", unable to
       separate 3x from 300x.

       The target still decides the "donations met" badge and the row status,
       which is what a published rule is for. This is the other question: how
       does this member compare with the rest of the clan. */
    donations: scales.donations > 0
      ? span.weeks.reduce(
          (a, w) => a + (w.need > 0 ? clamp01(w.given / w.need / scales.donations) : w.given > 0 ? 1 : 0),
          0,
        ) / (span.weeks.length || 1)
      : 0,
    chests: scales.chests > 0 ? clamp01(span.chests / scales.chests) : 0,
    speedups: scales.speedups > 0 ? clamp01(span.speedups / scales.speedups) : 0,
    territory: m.inTerritory ? 1 : 0,
    /* Days quiet, not days of flat might — see quietDays. Reading might alone
       cost Indira 2.6 points for a single flat reading on a day she donated
       and made chests, which was the whole of her 88-to-89 gap behind Rili.
       No reading yet is not evidence of absence, so an untracked member is not
       penalised for it. */
    activity: quiet == null ? 1 : clamp01(1 - quiet / QUALITY_STALE_AT),
    /* Position in the clan by might, not a share of the biggest account.
       Might spans 28k to 2.9M here, so scoring it as a fraction of the largest
       would leave everyone outside the top three on almost nothing and turn a
       graded measure into a bonus for two people. */
    might: scales.mightRank(m.might ?? 0),
  };

  /* A measure nobody scored on is dropped rather than counted as zero for
     everyone. Early in a week — or on a week with no clan build running — the
     whole clan has sent no speedups, and scoring that as 15 lost points each
     would just push every score down and put the bands out of step with the
     highest reachable total. The remaining weights are scaled back up to 100,
     so a score always means "out of what was achievable". */
  const counts = {
    donations: scales.donations > 0,
    chests: scales.chests > 0,
    speedups: scales.speedups > 0,
    territory: true,
    activity: true,
    // if every member had the same might, position says nothing about anyone
    might: scales.mightSpread,
  };
  const available = Object.entries(QUALITY_WEIGHTS).reduce((a, [k, w]) => a + (counts[k] ? w : 0), 0);
  const earned = Object.entries(QUALITY_WEIGHTS).reduce((a, [k, w]) => a + (counts[k] ? parts[k] * w : 0), 0);

  return { score: available > 0 ? Math.round((earned / available) * 100) : 0, parts, counts, available };
}

/* Scores the whole roster for a week and the one before it. Shared by the
   ledger's quality sort and the Good times "top N" filter so the two can never
   disagree about who the best members are. */
function scoreRoster(members, week, prevWeek) {
  const span = [week, prevWeek].filter(Boolean);
  const totals = members.map((m) => {
    const acc = { chests: 0, speedups: 0, weeks: [] };
    span.forEach((w) => {
      const ew = evaluate(m, w);
      /* Donations are kept per week rather than summed, because they are
         scored one week at a time and averaged — see qualityOf. Chests and
         speedups stay summed: those are measured against the rest of the clan
         over the same span, so a total is the comparable figure. */
      acc.weeks.push({
        given: RES.reduce((a, r) => a + (ew.don[r] || 0), 0),
        need: ew.need * RES.length,
      });
      acc.chests += ew.chestTotal;
      acc.speedups += ew.speedupHours;
    });
    return { m, e: evaluate(m, week), span: acc };
  });

  /* Might is scored by position in the clan rather than as a share of the
     largest account: the spread is a couple of orders of magnitude, so a share
     would collapse to zero for almost everyone. Members with equal might land
     on the same position. */
  const allMight = members.map((m) => m.might ?? 0);
  const scales = {
    /* Donations are measured in multiples of the member's own target, so the
       scale is a multiple too — pooled over every member-week in the span,
       zeros included, which is what "a strong donation week in this clan"
       currently looks like. */
    donations: clanScale(totals.flatMap((x) => x.span.weeks.map((w) => (w.need > 0 ? w.given / w.need : 0)))),
    chests: clanScale(totals.map((x) => x.span.chests)),
    speedups: clanScale(totals.map((x) => x.span.speedups)),
    mightSpread: Math.max(...allMight) > Math.min(...allMight),
    mightRank: (v) => (allMight.length < 2 ? 1 : allMight.filter((x) => x < v).length / (allMight.length - 1)),
  };
  const asOf = asOfDay(members);
  return totals.map((x) => ({ ...x, q: qualityOf(x.m, x.span, scales, asOf) }));
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

/* `delta` is in members, not a percentage: the value above it is already a
   share, and a second percentage stacked under it reads as a change in that
   share when it is nothing of the kind. */
function Meter({ label, n, denom, tone, plain, delta, deltaUnit, deltaLabel }) {
  const pct = Math.round((n / Math.max(denom, 1)) * 100);
  return (
    <div className="bt-meter" data-tone={tone === "neutral" ? "neutral" : pct >= 50 ? "high" : "low"}>
      <div className="bt-meter-head">
        <span className="bt-meter-value">{n}</span>
        {denom != null && <span className="bt-meter-denom">/ {denom}</span>}
        {!plain && <span className="bt-meter-pct">{pct}%</span>}
      </div>
      <div className="bt-meter-label">{label}</div>
      {delta != null && (
        <div className="bt-meter-delta" data-dir={delta > 0 ? "up" : delta < 0 ? "down" : "flat"}>
          {delta > 0 ? "+" : delta < 0 ? "−" : "±"}
          {Math.abs(delta)} {deltaUnit} {deltaLabel}
        </div>
      )}
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
  // label only — the podium shows totals, not rates
  const elapsed = dayOfWeek(week.start);

  const { boards, leaders } = useMemo(() => {
    const rows = members.map((m) => {
      const e = evaluate(m, week);
      return {
        name: m.name,
        rank: m.rank,
        might: e.might,
        // the might they ended that week on — see evaluate
        weekMight: e.weekMight,
        overall: RES.reduce((a, r) => a + (e.don[r] || 0), 0),
        chests: e.chestTotal,
        silver: e.don.silver || 0,
      };
    });
    const pool = withLeaders ? rows : rows.filter((r) => !LEADERSHIP.includes(r.rank));
    /* "% of might" divides by the last might recorded inside that week.

       It used to divide by need * 4, the 20% combined target, and call the
       result a percentage of might. That overstated it fivefold: Morana's
       36,439,536 in the week of 16 Aug read as 37716%.

       Neither of the other two mights works here. The frozen start-of-week
       figure the target uses understates what a member could give by Sunday.
       The current figure drags every past week downward as they grow — Rili
       had 466k in the week of 2 Aug and 864k now, so that week would shrink a
       little further every time anyone looked at it. The closing figure is
       settled once the week ends, and during the week in progress it is simply
       the newest reading, which is what the member sees in game.

       This applies to the board only. Anything that decides whether a target
       was *met* — need, donationOk, the row status, the quality score — stays
       on the frozen start-of-week might, so those goalposts cannot move. */
    const top = (key, scale) =>
      pool
        .map((r) => ({ ...r, score: relative && scale ? r[key] / Math.max(r.weekMight, 1) : r[key] }))
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
                {/* that week's closing might, matching the board above */}
                <span className="bt-leader-pct">{((r.overall / Math.max(r.weekMight, 1)) * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---- month board ----------------------------------------------
   Top three donors of a calendar month, by share of might, with a month picker
   alongside the week picker in the header.

   Months are not sums of weeks — a week straddles the boundary (26 Jul runs
   into August, 30 Aug into September) — so build_state.py aggregates them
   from the event ledger's own timestamps and hands them over whole.

   The picker opens on the newest *closed* month rather than simply the newest,
   because that is the one safe to announce. "Closed" is decided from the data
   by build_state.py: the ledger has to have moved past the month's final
   game-day. Reaching that day is not enough — a game-day rolls at 17:00 UTC,
   so August's last day is still taking donations through most of 1 September,
   and a board read at the top of it gets reordered underneath anyone who has
   already posted it. The open month is still selectable, tagged in the list
   and carrying the warning above the board, so the figures can be watched
   without being mistaken for final. A state file built before `closed` existed
   leaves every month open, which is the honest reading of it. */

function MonthBoard({ t, lang, members, months }) {
  const [withLeaders, setWithLeaders] = useState(false);
  // null until the reader picks one, so the default keeps following the data
  // as months close underneath them rather than sticking to a stale choice.
  const [picked, setPicked] = useState(null);

  // Newest first, the way the week picker reads.
  const keys = useMemo(() => Object.keys(months || {}).sort().reverse(), [months]);
  const fallback = keys.find((k) => months[k].closed) ?? keys[0] ?? null;
  const key = picked && months[picked] ? picked : fallback;

  const list = useMemo(() => {
    const mo = key && months[key];
    if (!mo) return [];
    return members
      .filter((m) => withLeaders || !LEADERSHIP.includes(m.rank))
      .map((m) => {
        const don = mo.donations[m.id] || {};
        const given = RES.reduce((a, r) => a + (don[r] || 0), 0);
        // the might they ended that month on — same reasoning as the week board
        const monthMight = mo.endMights[m.id] ?? mo.mights[m.id] ?? m.might;
        return { name: m.name, given, share: given / Math.max(monthMight, 1) };
      })
      .filter((r) => r.given > 0)
      .sort((a, b) => b.share - a.share)
      .slice(0, 3);
  }, [months, key, members, withLeaders]);

  const label = (mkey) =>
    new Date(mkey + "-01T12:00:00Z").toLocaleDateString(locale(lang), { month: "long", year: "numeric" });

  if (!key) return null;
  const open = !months[key].closed;

  return (
    <section className="bt-monthboard">
      <div className="bt-podium-head">
        <h2 className="bt-h2">{t.monthTop}</h2>
        <div className="bt-podium-toggle">
          <select
            className="bt-week-select bt-month-select"
            aria-label={t.monthTop}
            value={key}
            onChange={(e) => setPicked(e.target.value)}
          >
            {keys.map((k) => (
              <option key={k} value={k}>
                {label(k)}
                {months[k].closed ? "" : ` · ${t.monthOpen}`}
              </option>
            ))}
          </select>
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
      <Card accent="gold">
        {open && <div className="bt-board-warn">{t.monthPending(label(key))}</div>}
        <div className="bt-board-note">{t.monthNote}</div>
        {list.length === 0 && <div className="bt-board-blank">{t.nothingYet}</div>}
        {list.map((r, i) => (
          <div key={r.name + i} className="bt-board-row">
            <span className="bt-board-place" data-place={i + 1}>
              {i + 1}
            </span>
            <span className="bt-board-name">{r.name}</span>
            <span className="bt-board-value">{`${(r.share * 100).toFixed(0)}%`}</span>
          </div>
        ))}
      </Card>
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

/* The freshest day anyone in the clan contributed, used as "now" instead of
   the wall clock: a state file left sitting for a day should not start
   reporting the whole roster as gone quiet. */
const asOfDay = (members) =>
  members.reduce((a, m) => (m.lastActive && m.lastActive > a ? m.lastActive : a), "");

/* Days since the member last showed any sign of being around, and the one
   place that question is answered — the possibly-inactive badge and the
   activity part of the quality score both read it, so they can never disagree
   about who has gone quiet.

   Might standing still is only a proxy: it can sit through a day of ordinary
   play, and on a large account it moves in rarer, larger steps. A donation,
   speedup or chest is direct evidence of presence, so whichever of the two is
   fresher wins. null means the member's might is not tracked yet, which is not
   evidence of absence and must not be scored as one.

   Measured against the freshest contribution in the clan rather than the wall
   clock, so a state file left sitting overnight does not age the whole roster. */
function quietDays(m, asOf) {
  if (m.mightFlatDays == null) return null;
  if (!m.lastActive || !asOf) return m.mightFlatDays;
  return Math.min(m.mightFlatDays, Math.max(0, daysBetween(m.lastActive, asOf)));
}

/* The badge: quiet long enough to be worth chasing. Same rule as the score's
   activity part, thresholded instead of graded. */
function looksInactive(m, asOf) {
  const quiet = quietDays(m, asOf);
  return quiet != null && quiet >= STALL_DAYS;
}

const nowUTCMinutes = () => {
  const d = new Date();
  return d.getUTCHours() * 60 + d.getUTCMinutes();
};

const offsetLabel = (mins) => {
  const a = Math.abs(mins);
  const rest = a % 60;
  return `UTC${mins < 0 ? "−" : "+"}${Math.floor(a / 60)}${rest ? ":" + String(rest).padStart(2, "0") : ""}`;
};

function Timing({ t, members, week, prevWeek }) {
  const [order, setOrder] = useState("best");
  const [who, setWho] = useState("all");
  const [open, setOpen] = useState(null);

  /* The clan's best members by the same quality score the ledger sorts on, so
     "top 15" means one thing across the whole site rather than two similar but
     differing rankings. */
  const topIds = useMemo(
    () =>
      new Set(
        scoreRoster(members, week, prevWeek)
          .sort((a, b) => b.q.score - a.q.score || b.e.might - a.e.might)
          .slice(0, TOP_N)
          .map((x) => x.m.id)
      ),
    [members, week, prevWeek]
  );

  /* "Quiet" means nothing has moved for a few days: might flat, or no
     donation, speedup or chest. Measured against the freshest contribution in
     the data rather than the wall clock, so the count does not creep upward
     just because the page has been left open or the state file is a day old. */
  const asOf = useMemo(
    () => members.reduce((a, m) => (m.lastActive && m.lastActive > a ? m.lastActive : a), ""),
    [members]
  );
  const isQuiet = useCallback(
    (m) => {
      if (m.mightFlatDays >= STALL_DAYS) return true;
      if (!m.lastActive) return true;
      return asOf ? daysBetween(m.lastActive, asOf) >= STALL_DAYS : false;
    },
    [asOf]
  );

  const inScope = useCallback(
    (m) => (who === "active" ? !isQuiet(m) : who === "top" ? topIds.has(m.id) : true),
    [who, isQuiet, topIds]
  );

  // resolve each member to the offset that is correct today, not the one
  // frozen in their profile
  const known = useMemo(
    () =>
      members
        .filter(inScope)
        .map((m) => ({ ...m, resolved: resolveOffset(m.country, m.utcOffset) }))
        .filter((m) => m.resolved.mins != null),
    [members, inScope]
  );
  const counted = members.filter(inScope).length;
  const unknown = counted - known.length;
  const excluded = who === "active" ? members.length - counted : 0;
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
        <div className="bt-timing-controls">
          <Segmented
            options={[
              { value: "all", label: t.countAll },
              { value: "active", label: t.countActive },
              { value: "top", label: t.countTop },
            ]}
            value={who}
            onChange={setWho}
          />
          <Segmented
            options={[
              { value: "best", label: t.rankBest },
              { value: "clock", label: t.rankClock },
            ]}
            value={order}
            onChange={setOrder}
          />
        </div>
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
        {who === "top" && `${t.topNote} `}
        {excluded > 0 && `${t.excludedNote(excluded)} `}
        {unknown > 0 && `${t.noTimezone(unknown)} `}
        {t.tzCaveat(shifted)}
      </p>
    </section>
  );
}

/* One row of the member list. Extracted so the rank-grouped and
   quality-sorted views render exactly the same thing. */
function MemberRow({ t, lang, m, e, week, isOpen, onToggle, quality, spanLabel, asOf }) {
  // "Gone quiet" is a warning to act on, and someone who has left is not
  // quiet — they are gone. The badge below says so instead.
  const quiet = !m.departed && looksInactive(m, asOf);
  return (
    <div className="bt-member" data-status={e.status} data-departed={m.departed ? "" : undefined}>
      <div className="bt-member-summary" onClick={onToggle}>
        <div className="bt-member-main">
          <div className="bt-member-nameline">
            {quality && (
              <span className="bt-quality" data-band={qualityBand(quality.score)} title={t.qualityWhy}>
                {quality.score}
              </span>
            )}
            <span className="bt-member-name">{m.name}</span>
            {isNewThisWeek(m, week) && !m.departed && (
              <span className="bt-badge" data-tone="green">
                {t.newThisWeek.toUpperCase()}
              </span>
            )}
            {m.departed && (
              <span className="bt-badge" data-tone="grey" title={t.leftOn(shortDate(m.departed, lang))}>
                {t.leftClan.toUpperCase()}
              </span>
            )}
            {quiet && (
              <span className="bt-badge" data-tone="amber" title={t.inactiveWhy(m.mightFlatDays)}>
                {t.inactive.toUpperCase()}
              </span>
            )}
          </div>
          <div className="bt-member-stats">
            {m.departed
              ? `${fmt(e.might)} · ${t.leftOn(shortDate(m.departed, lang))}`
              : t.statsLine(fmt(e.might), m.inTerritory ? t.inTerritory : t.outsideTerritory)}
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
            {/* Only rendered for someone who has actually renamed. Names are
                not unique in this clan — two live members were both Enaning
                through August — so "who was this before" is the only way to
                tell a rename from a different account with the same name. */}
            {m.previousNames?.length > 0 && (
              <div className="bt-fact">
                <dt>{t.fWasCalled}</dt>
                {/* siblings rather than nested, because .bt-fact dd is a flex
                    row and its gap only reaches direct children */}
                <dd>
                  {m.previousNames.map((p) => (
                    <React.Fragment key={p.name + p.until}>
                      <span>{p.name}</span>
                      <span className="bt-fact-aside">{t.untilDate(shortDate(p.until, lang))}</span>
                    </React.Fragment>
                  ))}
                </dd>
              </div>
            )}
            <div className="bt-fact">
              <dt>{t.fMight}</dt>
              <dd>
                {fmt(e.might)}
                {/* the wording stays a plain fact about the might line either
                    way; only the warning tone is held back when the member has
                    contributed since, because that is the inactivity claim */}
                <span className="bt-fact-aside" data-warn={quiet ? "" : undefined}>
                  {m.daysTracked < 2
                    ? t.mightUntracked
                    : m.mightFlatDays >= STALL_DAYS
                      ? t.mightFlat(m.mightFlatDays)
                      : t.mightRose(m.mightFlatDays)}
                </span>
              </dd>
            </div>
          </dl>

          {/* what the score is made of, so a ranking can be argued with */}
          {quality && (
            <div className="bt-qbreak">
              <div className="bt-qbreak-head">
                <span className="bt-qbreak-title">{t.qualityTitle}</span>
                {/* one unit: wrapped apart, a bare "/ 100" on its own line
                    reads as belonging to nothing */}
                <span className="bt-qbreak-score">
                  <span className="bt-quality" data-band={qualityBand(quality.score)}>
                    {quality.score}
                  </span>
                  <span className="bt-qbreak-of">/ 100</span>
                </span>
                {/* which weeks the contribution parts were totalled over —
                    without this a speedup score looks wrong on a week where
                    nobody sent any */}
                {spanLabel && <span className="bt-qbreak-span">{spanLabel}</span>}
              </div>
              <ul className="bt-qbreak-list">
                {Object.entries(QUALITY_WEIGHTS).map(([key, weight]) => (
                  <li key={key} data-off={quality.counts[key] ? undefined : ""}>
                    <span className="bt-qbreak-label">{t.qualityParts[key]}</span>
                    {quality.counts[key] ? (
                      <>
                        <span className="bt-qbreak-track">
                          <span className="bt-qbreak-fill" style={{ "--bt-pct": `${quality.parts[key] * 100}%` }} />
                        </span>
                        {/* One decimal, because a whole number disagrees with
                            the bar beside it: might is worth 6, so a member on
                            96% of it reads "6/6" against a bar that is visibly
                            short. Trailing ".0" is dropped so a full part still
                            reads "22/22". */}
                        <span className="bt-qbreak-num">
                          {(+(quality.parts[key] * weight).toFixed(1)).toString()}
                          <span className="bt-qbreak-max">/{weight}</span>
                        </span>
                      </>
                    ) : (
                      <span className="bt-qbreak-skip">{t.qualityNotCounted}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---- ledger -------------------------------------------------- */
function Ledger({ t, lang, members, week, prevWeek, former, months }) {
  const [open, setOpen] = useState(null);
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("rank");
  const [showRule, setShowRule] = useState(false);
  const [showQuality, setShowQuality] = useState(false);

  /* Everything below judges people against the selected week, so the roster it
     judges has to be that week's, not today's — on both ends.

     Someone who joined this week was not in the clan during August, and
     listing them there produced rows reading "Nothing given" — and, worse,
     "2 weeks missed" — for weeks that ended before they arrived.

     Someone who has since left was here, and a week they played is part of
     what happened that week: dropping them rewrote finished weeks every time
     somebody quit, and left the list disagreeing with the participation meter
     beside it. They come back as ordinary rows, greyed and badged, carrying
     the same status their week earned. Only the ones we have a roster record
     for — the "contributions" ghosts were never captured on a roster, so they
     have no rank to sort under and no might to be judged against; the former
     members panel at the foot of the page is still where they are named.

     The month board is deliberately left on the full current roster: it
     answers a question about months, not about this week. */
  const rosterFor = useCallback(
    (wk) => {
      if (!wk) return [];
      const here = members.filter((m) => wasInClanFor(m, wk));
      const gone = (former || [])
        .filter((f) => f.via === "roster" && f.rank)
        .map((f) => ({ ...f, firstSeen: f.joined, departed: f.lastSeen }))
        .filter((f) => wasInClanFor(f, wk));
      return [...here, ...gone];
    },
    [members, former]
  );

  const roster = useMemo(() => rosterFor(week), [rosterFor, week]);

  /* Quality is measured over the selected week and the one before it. A single
     week is too thin: on the Monday of a new week nobody has produced much of
     anything yet, and a ranking built on two days of data is mostly noise. */
  const scored = useMemo(() => scoreRoster(roster, week, prevWeek), [roster, week, prevWeek]);
  const asOf = useMemo(() => asOfDay(members), [members]);

  // spelled out on the breakdown, since the row above it shows one week only
  const qualitySpan = prevWeek
    ? t.qualityOverWeeks(shortDate(prevWeek.start, lang), shortDate(week.start, lang))
    : t.qualityOverWeek(shortDate(week.start, lang));

  const rows = useMemo(() => {
    const byRank = {};
    scored.forEach((x) => (byRank[x.m.rank] = byRank[x.m.rank] || []).push(x));
    Object.values(byRank).forEach((l) => l.sort((a, b) => b.e.might - a.e.might));
    return byRank;
  }, [scored]);

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
    return roster
      .filter((m) => !m.departed && !joinedRecently(m) && !gaveMandatoryIn(week, m.id) && !gaveMandatoryIn(prevWeek, m.id))
      .map((m) => m.id);
  }, [roster, week, prevWeek]);
  const missedTwoSet = useMemo(() => new Set(missedTwo), [missedTwo]);

  /* "1 week missed" is the red status, and three kinds of person carry it
     without belonging on the list it opens.

     Someone who joined partway through the week has not had a week in which to
     give. Someone who has left cannot be chased. And someone who also gave
     nothing last week has missed two, not one — they belong under "2 weeks
     missed" and nowhere else, or the same name sits on two chips and the
     shorter miss hides the longer one.

     One predicate, so the chip and the list it opens can never disagree about
     who is in it. Their own rows are untouched: each still carries the red
     status, beside the badge or the other chip that explains it. The status
     describes the week's facts; this cut answers the different question of who
     is worth chasing this week. */
  const chaseableRed = useCallback(
    (m, e) =>
      e.status === "red" && !isNewThisWeek(m, week) && !m.departed && !missedTwoSet.has(m.id),
    [week, missedTwoSet]
  );

  const counts = useMemo(() => {
    const c = { red: 0, yellow: 0, green: 0, greenPlus: 0 };
    roster.forEach((m) => {
      const e = evaluate(m, week);
      if (e.status === "red" && !chaseableRed(m, e)) return;
      c[e.status]++;
    });
    return c;
  }, [roster, week, chaseableRed]);

  const extraCounts = useMemo(() => {
    let noDon = 0, silver = 0, outside = 0, stalled = 0;
    roster.forEach((m) => {
      const don = evaluate(m, week).don;
      const gaveMandatory = RES.some((r) => (don[r] || 0) > 0);
      // Everything here is a list of people to do something about, and there
      // is nothing to be done about someone who has left.
      if (m.departed) return;
      if (!m.inTerritory) outside++;
      if (looksInactive(m, asOf)) stalled++;
      if (!isNewThisWeek(m, week) && !gaveMandatory) {
        noDon++;
        if ((don.silver || 0) > 0) silver++;
      }
    });
    return { noDon, silver, outside, stalled };
  }, [roster, week, asOf]);

  /* Participation for one week, counted over the roster as it stood in that
     week: everyone who had joined by the end of it and had not yet left when
     it began. Both bounds matter. Counting people who were not in the clan yet
     drags last week's percentages down and turns the week-on-week comparison
     into a measure of recruitment rather than effort; counting only who is
     left today rewrites a finished week every time somebody quits, so the
     record of a good week decays as its members drift away.

     Territory comes from the week itself — each member's last known position
     by that week's end — falling back to today's answer for weeks recorded
     before positions were kept. */
  const partFor = useCallback(
    (wk) => {
      if (!wk) return null;
      const pool = rosterFor(wk);
      let donors = 0, chesters = 0, speeders = 0, outside = 0;
      pool.forEach((m) => {
        const e = evaluate(m, wk);
        // the four required resources only — matching the row status, so a
        // tractates-only week cannot read "Nothing given" and still be counted
        // here as having donated
        if (RES.some((r) => (e.don[r] || 0) > 0)) {
          donors++;
          if (!m.inTerritory) outside++;
        }
        if (e.chestTotal > 0) chesters++;
        if (e.speedupHours > 0) speeders++;
      });
      /* Summed from the week itself rather than from the member loop above:
         the four proportions are about the current roster by definition, but
         what the clan produced that week includes whoever has left since. On
         the week of 9 Aug that is 1252 chests against the roster's 1248.

         Per calendar day, the same denominator the per-member "chests a day"
         uses. A week whose captures start late therefore reads low: the week
         of 2 Aug has no chest data before the 4th but is still divided by 7. */
      const chests = Object.values(wk.chests || {}).reduce(
        (a, byDay) => a + Object.values(byDay).reduce((x, y) => x + y, 0),
        0
      );
      // the footnote names whole days; the rates divide by how much of the
      // week has actually run, so the day in progress counts only as far as it
      // has gone (see daysElapsed)
      const days = dayOfWeek(wk.start);
      const ran = daysElapsed(wk.start);
      /* The largest single producer's share of the week, so a total carried by
         one member cannot be read as the clan working evenly. Bulk chest
         grants land as one in-game award of many: in the week of 16 Aug one
         member produced 713 of 1096, and on 19 Aug alone 447 of 487. The two
         complete weeks before it sat at 16% and 19%, which is why the note
         only appears past CONCENTRATED_AT rather than always. */
      const perMemberTotals = Object.values(wk.chests || {}).map((byDay) =>
        Object.values(byDay).reduce((x, y) => x + y, 0)
      );
      const topShare = chests > 0 ? Math.max(0, ...perMemberTotals) / chests : 0;
      return {
        donors,
        chesters,
        speeders,
        outside,
        chests,
        days,
        perDay: chests / ran,
        /* Mean, not median, because this is the figure you multiply back out:
           an average member times the roster is the clan's daily output, which
           is the whole point of showing it. The median cannot do that — this
           week the median producer is 2.0 a day against a real 274, since most
           of the roster makes nothing. The mean is also what a lopsided week
           distorts, so it is shown next to the concentration note. */
        perMemberPerDay: pool.length > 0 ? chests / ran / pool.length : 0,
        topShare,
        total: pool.length,
        /* Territory alone is counted over current members. The three figures
           above record what a week contained, and someone who has since left
           still contributed it; where a member lives is instead a standing
           fact the clan acts on, and there is nothing to act on for someone
           already gone. build_state.py cuts it the same way — this is only the
           fallback for weeks recorded before it kept the figure. */
        inside: wk.inTerritory ? wk.inTerritory.length : pool.filter((m) => !m.departed && m.inTerritory).length,
        insideOf: wk.territoryOf ?? pool.filter((m) => !m.departed).length,
      };
    },
    [rosterFor]
  );

  const part = useMemo(() => partFor(week), [partFor, week]);
  const before = useMemo(() => partFor(prevWeek), [partFor, prevWeek]);

  /* How much the number of people changed, relative to last week: 19 donors
     becoming 22 is +16%. Deliberately not the change in the percentage shown
     above it — that would be a change in the clan's *share*, which moves in
     the opposite direction when the clan grows faster than participation, and
     reads as a fall on a week where more people actually took part.
     Undefined rather than +100% when last week was zero. */
  const shift = (now, was) => (!before || !was ? null : Math.round(((now - was) / was) * 100));

  /* The meters report that change as a count of members, not as a percentage,
     because a percentage there is a second percentage stacked under the share
     the meter already shows — and the two move independently. In the week of
     16 Aug, 31 of 53 members lived in territory against 28 of 45 the week
     before: three more people, but four points worse as a share. Rendered as
     "+11% vs last week" under a bar that had visibly shrunk, which is the
     count change of the numerator and reads as though the 58% had gone up.
     "+3 members" is the same fact with nothing to mistake it for. */
  const countShift = (now, was) => (!before || was == null ? null : now - was);

  /* Rates, not totals: a finished week has seven days behind it and a week two
     days old has two, so comparing the raw counts would call every Monday a
     collapse. */
  const chestRateShift = shift(part.perDay, before && before.perDay);

  const passesFilter = (m, e) => {
    if (filter === "all") return true;
    if (filter === "outside") return !m.inTerritory;
    if (filter === "nodonation") return !m.departed && !isNewThisWeek(m, week) && !RES.some((r) => (e.don[r] || 0) > 0);
    if (filter === "silveronly") return !m.departed && !isNewThisWeek(m, week) && !RES.some((r) => (e.don[r] || 0) > 0) && (e.don.silver || 0) > 0;
    if (filter === "missed2") return missedTwoSet.has(m.id);
    if (filter === "stalled") return !m.departed && looksInactive(m, asOf);
    if (filter === "red") return chaseableRed(m, e);
    return e.status === filter;
  };

  // Two kinds of chip. The four status ones carry a solid bar in exactly the
  // colour-key colour, so the key doubles as their legend. The rest are just
  // other cuts of the roster with no colour meaning — they used to borrow
  // status colours, which put the same red on three chips. They get a hollow
  // ring instead: told apart by shape, not by nine near-identical hues.
  // "1 week missed" and "Below target" are the red and yellow statuses, so the
  // two are exclusive: gave nothing at all vs gave something but missed the
  // target. "1 week missed" and "2 weeks missed" are exclusive too, by the cut
  // in chaseableRed — a name appears on exactly one of them, so the counts can
  // be read as a run length rather than as two overlapping tallies.
  // The "nodonation" filter (gave no mandatory resource, but possibly silver)
  // is still implemented below — it just has no chip at the moment.
  /* One row. Only the four statuses take a swatch, because only they have a
     colour to key: it is the same square that borders the member's row, which
     is what makes a separate colour key unnecessary. The cuts after them are
     not points on that scale, so a swatch there would invent a meaning. */
  /* How much of the roster above is people who have left. "Everyone 62" invites
     being read as the clan's size, which it is not once some of the 62 have
     gone — so the chip shows the split and the line under the row breaks it
     down. Zero of them is the common case, and then nothing extra is drawn.

     Beside it, the week's own churn — who arrived and who went while it ran.
     That is the figure worth reading, and it is not the size of the departed
     group: 21 people are gone from the week of 16 Aug, but only 9 left during
     it, the rest having stayed on and gone over the following fortnight. One
     number counts a week; the other grows on its own the further back you
     look, which is what made it read as a mass exodus. */
  const split = useMemo(() => {
    const end = weekEndOf(week);
    return {
      departed: roster.filter((m) => m.departed).length,
      joined: roster.filter((m) => isNewThisWeek(m, week)).length,
      left: roster.filter((m) => m.departed && m.departed >= week.start && m.departed <= end).length,
    };
  }, [roster, week]);
  const departed = split.departed;

  const statusChip = (k) => [k, t[STATUS[k].key], counts[k], STATUS[k].tone];
  const filters = [
    ["all", t.everyone, roster.length, null, departed],
    statusChip("red"),
    statusChip("yellow"),
    statusChip("green"),
    statusChip("greenPlus"),
    ...(prevWeek ? [["missed2", t.twoWeeksMissed, missedTwo.length]] : []),
    ["stalled", t.stalledFilter, extraCounts.stalled],
    ["silveronly", t.silverOnly, extraCounts.silver],
    ["outside", t.outsideFilter, extraCounts.outside],
  ];

  return (
    <div>
      <Podium t={t} members={roster} week={week} />
      <MonthBoard t={t} lang={lang} members={members} months={months} />

      {/* participation */}
      <div className="bt-participation">
        <Meter
          label={`${t.donated} ${t.thisWeek}`}
          n={part.donors}
          denom={part.total}
          delta={countShift(part.donors, before && before.donors)}
          deltaUnit={t.deltaMembers}
          deltaLabel={t.vsLastWeek}
        />
        <Meter
          label={`${t.producedChests} ${t.thisWeek}`}
          n={part.chesters}
          denom={part.total}
          delta={countShift(part.chesters, before && before.chesters)}
          deltaUnit={t.deltaMembers}
          deltaLabel={t.vsLastWeek}
        />
        <Meter
          label={`${t.gaveSpeedups} ${t.thisWeek}`}
          n={part.speeders}
          denom={part.total}
          delta={countShift(part.speeders, before && before.speeders)}
          deltaUnit={t.deltaMembers}
          deltaLabel={t.vsLastWeek}
        />
        <Meter
          label={t.membersInside}
          n={part.inside}
          denom={part.insideOf}
          delta={countShift(part.inside, before && before.inside)}
          deltaUnit={t.deltaMembers}
          deltaLabel={t.vsLastWeek}
        />

        {/* What the clan produces, rather than how many members took part, so
            it spans the row under the four proportions instead of becoming a
            fifth column that would leave one meter alone on a second line. */}
        <div className="bt-part-total">
          <span className="bt-part-total-value">{part.perDay.toFixed(1)}</span>
          <span className="bt-part-total-label">{t.clanChestsADay}</span>
          {chestRateShift != null && (
            <span
              className="bt-meter-delta"
              data-dir={chestRateShift > 0 ? "up" : chestRateShift < 0 ? "down" : "flat"}
            >
              {chestRateShift > 0 ? "+" : chestRateShift < 0 ? "−" : "±"}
              {Math.abs(chestRateShift)}% {t.vsLastWeek}
            </span>
          )}
          {/* Ahead of the per-member figures, not after them: it qualifies both
              the rate and the average drawn from it, so it has to arrive before
              the reader has taken those at face value. It cannot go last either
              — the note below carries margin-left:auto, and anything after it
              lands hard against the right edge, away from what it is about. */}
          {part.topShare >= CONCENTRATED_AT && (
            <span className="bt-part-total-warn">
              {t.clanChestsConcentrated(Math.round(part.topShare * 100))}
            </span>
          )}
          {/* What one member is worth, and what the full clan would make at
              that rate. Sits with the figure rather than in the footnote
              because it is the same claim scaled, not provenance. Hidden on a
              week that predates chests entirely, or the July weeks would read
              "0.0 per member, ≈0 a day at 70". */}
          {part.chests > 0 && (
            <span className="bt-part-total-per">
              {t.clanChestsPerMember(part.perMemberPerDay.toFixed(1), part.total)}
              <span className="bt-part-total-proj">
                {t.clanChestsAtFull(MAX_MEMBERS, Math.round(part.perMemberPerDay * MAX_MEMBERS))}
              </span>
            </span>
          )}
          <span className="bt-part-total-note">{t.clanChestsOver(fmt(part.chests), part.days)}</span>
        </div>
      </div>

      {/* One block for everything that changes what the list shows. The three
          parts are siblings rather than nested in a header row so the grid can
          put the sort control after the chips on a narrow screen — nested, it
          could only ever wrap to a line directly under the FILTER label, where
          that label appears to name it. */}
      <section className="bt-controls" aria-label={t.filterLabel}>
        {/* The tooltip is anchored here rather than out in the chip row for two
            reasons: the chips are filters and this is not one, and a fixed spot
            at the block's left edge means the bubble always opens rightwards
            into space that exists. Anchored to a chip it would move with every
            reflow and could open off the left edge of a phone. */}
        <span className="bt-controls-label bt-tip">
          {t.filterLabel}
          <button
            className="bt-info"
            onClick={() => setShowRule(!showRule)}
            aria-expanded={showRule}
            aria-describedby="bt-rule-tip"
            aria-label={t.ruleInfo}
          >
            i
          </button>
          {/* click state as well as CSS hover, so it opens on touch too */}
          <span className="bt-tip-body" id="bt-rule-tip" role="tooltip" data-open={showRule || undefined}>
            {t.donationRule}
          </span>
        </span>

        <div className="bt-controls-sort">
          {/* Shown for every sort, not just the quality ones: what "worst" and
              "best" measure is what you want to know *before* picking them.
              These are direct children of the sort group rather than wrapped in
              a .bt-tip of their own, because the group is what the bubble hangs
              off — see .bt-tip-body--end. */}
          <span className="bt-sort-head">
            <span className="bt-toggle-label">{t.sortBy}</span>
            <button
              className="bt-info"
              onClick={() => setShowQuality(!showQuality)}
              aria-expanded={showQuality}
              aria-describedby="bt-quality-tip"
              aria-label={t.qualityInfo}
            >
              i
            </button>
            <span
              className="bt-tip-body bt-tip-body--end"
              id="bt-quality-tip"
              role="tooltip"
              data-open={showQuality || undefined}
            >
              {t.qualityNote}
            </span>
          </span>
          <Segmented
            options={[
              { value: "rank", label: t.sortRank },
              { value: "worst", label: t.sortWorst },
              { value: "best", label: t.sortBest },
            ]}
            value={sort}
            onChange={setSort}
          />
        </div>

        <div className="bt-chips">
          {filters.map(([k, label, n, tone, gone]) => (
            <button key={k} className="bt-chip" onClick={() => setFilter(k)} aria-pressed={filter === k}>
              {tone && <span className="bt-swatch" data-tone={tone} />}
              {label}
              <span className="bt-chip-count">
                {gone ? n - gone : n}
                {gone > 0 && (
                  <span className="bt-chip-extra" title={t.departedPlus(gone)}>{` +${gone}`}</span>
                )}
              </span>
            </button>
          ))}
        </div>
        {(departed > 0 || split.joined > 0) && (
          <p className="bt-chips-note">
            {[
              departed > 0 && t.rosterStill(roster.length - departed, roster.length),
              (split.joined > 0 || split.left > 0) && t.rosterChurn(split.joined, split.left),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
      </section>

      {/* Quality view drops the rank grouping: the point is one ranking across
          the whole roster, which rank sections would cut into pieces. Ties break
          on might descending either way — among equally poor scores the largest
          account is the one worth looking at first. */}
      {sort !== "rank" && (
        <>
          <div className="bt-list">
            {scored
              .filter((x) => passesFilter(x.m, x.e))
              .slice()
              .sort((a, b) =>
                sort === "worst" ? a.q.score - b.q.score || b.e.might - a.e.might : b.q.score - a.q.score || b.e.might - a.e.might
              )
              .map(({ m, e, q }) => (
                <MemberRow
                  key={m.id}
                  t={t}
                  lang={lang}
                  m={m}
                  e={e}
                  week={week}
                  quality={q}
                  spanLabel={qualitySpan}
                  asOf={asOf}
                  isOpen={open === m.id}
                  onToggle={() => setOpen(open === m.id ? null : m.id)}
                />
              ))}
          </div>
          {scored.filter((x) => passesFilter(x.m, x.e)).length === 0 && (
            <div className="bt-rank-blank">{t.noneMatch}</div>
          )}
        </>
      )}

      {/* rank groups */}
      {sort === "rank" && RANKS.filter((r) => rows[r] && rows[r].length).map((rank) => {
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
              {list.map(({ m, e, q }) => (
                <MemberRow
                  key={m.id}
                  t={t}
                  lang={lang}
                  m={m}
                  e={e}
                  week={week}
                  quality={q}
                  spanLabel={qualitySpan}
                  asOf={asOf}
                  isOpen={open === m.id}
                  onToggle={() => setOpen(open === m.id ? null : m.id)}
                />
              ))}
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
                  <span className="bt-former-name">{m.name}</span>
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

  const membersText = `${state.members.length}/${MAX_MEMBERS} ${t.members} · ${t.dayN(dayOfWeek(week.start))} · ${t.nextDay} ${roll.h}h ${roll.m}m`;

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
              <Ledger t={t} lang={lang} members={state.members} week={week} prevWeek={prevWeek} former={state.formerMembers} months={state.months} />
            )}
            {view === "timing" && <Timing t={t} members={state.members} week={week} prevWeek={prevWeek} />}
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
