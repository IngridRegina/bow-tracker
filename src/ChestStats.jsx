import React, { useMemo, useState } from "react";
import { fmt, compact, shortDate, CONCENTRATED_AT, MAX_MEMBERS } from "./format.js";

/* ---- chest stats ------------------------------------------------
   Aggregates weeks[week].chests — already keyed by member and by day —
   across every week on file, rather than the one week the Ledger shows.
   Nothing here is read from the raw ledgers: it is all already in
   tracker-state.json. */

/* A "nice" axis step — 1/2/5 x a power of ten — so gridlines land on
   round numbers instead of whatever max/4 happens to be. */
function niceStep(rough) {
  if (rough <= 0) return 1;
  const exp = Math.floor(Math.log10(rough));
  const base = 10 ** exp;
  const n = rough / base;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return nice * base;
}
function ticksFor(max) {
  const step = niceStep(Math.max(max, 1) / 4);
  const top = Math.max(Math.ceil(max / step) * step, step);
  const ticks = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  return { ticks, top };
}

/* At day-count extremes a fixed cap looks wrong both ways: 15px is lost in a
   7-bar chart stretched across a wide card, and would be too heavy if it
   applied at 90+ bars. Tapering with 1/sqrt(n) keeps a week's bars chunky
   without letting a full quarter's bars turn into solid blocks. */
function barMaxFor(n) {
  return Math.round(Math.min(64, Math.max(20, 220 / Math.sqrt(Math.max(n, 1)))));
}

/* One series, one colour — a single bar chart is its own legend, so no
   swatch box. Bars are divs, not SVG, to match the rest of the page's
   meters and cards. */
function BarChart({ dates, values, lang, color, ariaLabel }) {
  const max = Math.max(0, ...values);
  const { ticks, top } = ticksFor(max);
  const barMax = barMaxFor(dates.length);

  return (
    <div className="bt-chart" role="img" aria-label={ariaLabel}>
      <div className="bt-chart-axis">
        {ticks
          .slice()
          .reverse()
          .map((v) => (
            <span key={v}>{compact(v)}</span>
          ))}
      </div>
      <div className="bt-chart-scroll">
        <div className="bt-chart-plot" style={{ "--bt-chart-cols": dates.length, "--bt-chart-bar-max": `${barMax}px` }}>
          {ticks.map((v) => (
            <div key={v} className="bt-chart-grid" style={{ bottom: `${(v / top) * 100}%` }} />
          ))}
          {dates.map((d, i) => (
            <div
              key={d}
              className="bt-chart-col"
              tabIndex={0}
              style={{ "--bt-chart-h": `${top > 0 ? ((values[i] || 0) / top) * 100 : 0}%`, "--bt-chart-color": color }}
            >
              <div className="bt-chart-bar" />
              <div className="bt-chart-tip">
                <strong>{fmt(values[i] || 0)}</strong>
                <span>{shortDate(d, lang)}</span>
              </div>
              <div className="bt-chart-tick">{shortDate(d, lang)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* Trailing windows rather than calendar weeks: the chart is day-level, so
   "last N days" is simpler than aligning to the Ledger's Monday-start weeks,
   and stays right regardless of how that week boundary is defined. */
const RANGES = [
  ["week", 7],
  ["month", 28],
  ["quarter", 84],
  ["all", Infinity],
];
const DEFAULT_RANGE = "month";

export default function ChestStats({ t, lang, members, weeks }) {
  const merged = useMemo(() => {
    const byDate = new Map();
    const byMember = new Map();
    Object.values(weeks || {}).forEach((wk) => {
      Object.entries(wk.chests || {}).forEach(([id, byDay]) => {
        let m = byMember.get(id);
        if (!m) byMember.set(id, (m = new Map()));
        Object.entries(byDay).forEach(([date, count]) => {
          m.set(date, (m.get(date) || 0) + count);
          byDate.set(date, (byDate.get(date) || 0) + count);
        });
      });
    });
    return { byDate, byMember };
  }, [weeks]);

  /* Every calendar day from the first chest on file to the last, including
     the ones nobody produced anything on — otherwise a clan-wide blank day
     just vanishes from the x-axis instead of reading as a zero. */
  const allDates = useMemo(() => {
    const keys = [...merged.byDate.keys()].sort();
    if (keys.length === 0) return [];
    const out = [];
    const last = new Date(keys[keys.length - 1] + "T12:00:00Z");
    for (let d = new Date(keys[0] + "T12:00:00Z"); d <= last; d = new Date(d.getTime() + 86400000)) {
      out.push(d.toISOString().slice(0, 10));
    }
    return out;
  }, [merged]);

  const [range, setRange] = useState(DEFAULT_RANGE);
  const rangeDays = RANGES.find(([k]) => k === range)?.[1] ?? Infinity;
  const dates = useMemo(() => (Number.isFinite(rangeDays) ? allDates.slice(-rangeDays) : allDates), [allDates, rangeDays]);
  const spanDays = dates.length;

  const clanTotal = useMemo(() => dates.reduce((a, d) => a + (merged.byDate.get(d) || 0), 0), [dates, merged]);
  const clanDaily = spanDays > 0 ? clanTotal / spanDays : 0;

  const rows = useMemo(() => {
    const list = (members || []).map((m) => {
      const byDay = merged.byMember.get(m.id);
      const total = byDay ? dates.reduce((a, d) => a + (byDay.get(d) || 0), 0) : 0;
      return { id: m.id, name: m.name, total, daily: spanDays > 0 ? total / spanDays : 0 };
    });
    list.sort((a, b) => b.total - a.total);
    return list;
  }, [members, merged, dates, spanDays]);

  const rosterTotal = rows.reduce((a, r) => a + r.total, 0);
  const fromFormer = clanTotal - rosterTotal;

  /* The largest single producer's share of the selected span, so a total
     carried by one member cannot be read as the clan working evenly — see
     CONCENTRATED_AT. Ported from the Ledger's old per-week figure, which this
     tab's own trend made redundant there. */
  const topShare = clanTotal > 0 && rows.length > 0 ? rows[0].total / clanTotal : 0;
  // Mean, not median: this is the figure you multiply back out to project a
  // full roster, and the median can't do that when most of the roster makes
  // nothing on a given day.
  const perMemberPerDay = spanDays > 0 && members.length > 0 ? clanDaily / members.length : 0;

  const [selectedId, setSelectedId] = useState(null);
  const activeId = selectedId && rows.some((r) => r.id === selectedId) ? selectedId : rows[0]?.id;
  const active = rows.find((r) => r.id === activeId);

  if (allDates.length === 0) {
    return (
      <section className="bt-chests">
        <p className="bt-empty">{t.chestsEmpty}</p>
      </section>
    );
  }

  const clanValues = dates.map((d) => merged.byDate.get(d) || 0);
  const activeDay = active ? merged.byMember.get(active.id) : null;
  const activeValues = dates.map((d) => (activeDay ? activeDay.get(d) || 0 : 0));

  return (
    <section className="bt-chests">
      <h2 className="bt-h2">{t.chestsTitle}</h2>
      <p className="bt-timing-intro">{t.chestsIntro}</p>

      <div className="bt-seg bt-seg--wrap">
        {RANGES.map(([k]) => (
          <button key={k} className="bt-seg-btn" aria-pressed={range === k} onClick={() => setRange(k)}>
            {t.chestsRange[k]}
          </button>
        ))}
      </div>

      <div className="bt-stat-row">
        <div className="bt-stat-tile">
          <span className="bt-stat-value">{fmt(clanTotal)}</span>
          <span className="bt-stat-label">{t.chestsClanTotal}</span>
          <span className="bt-stat-note">{t.chestsSpan(spanDays)}</span>
        </div>
        <div className="bt-stat-tile">
          <span className="bt-stat-value">{clanDaily.toFixed(1)}</span>
          <span className="bt-stat-label">{t.chestsClanDaily}</span>
        </div>
        <div className="bt-stat-tile">
          <span className="bt-stat-value">{(clanDaily * 7).toFixed(1)}</span>
          <span className="bt-stat-label">{t.chestsClanWeekly}</span>
        </div>
      </div>

      <Card>
        <h3 className="bt-chart-title">{t.chestsClanTotalChart}</h3>
        <BarChart dates={dates} values={clanValues} lang={lang} color="var(--bt-gold)" ariaLabel={t.chestsClanTotalChart} />
        {clanTotal > 0 && (
          <div className="bt-chest-clan-note">
            {topShare >= CONCENTRATED_AT && (
              <span className="bt-chest-warn">{t.clanChestsConcentrated(Math.round(topShare * 100))}</span>
            )}
            <span className="bt-chest-per">
              {t.clanChestsPerMember(perMemberPerDay.toFixed(1), members.length)}
              <span className="bt-chest-proj">{t.clanChestsAtFull(MAX_MEMBERS, Math.round(perMemberPerDay * MAX_MEMBERS))}</span>
            </span>
          </div>
        )}
      </Card>

      {rows.length === 0 ? (
        <p className="bt-empty">{t.chestsNoPlayers}</p>
      ) : (
        <Card>
          <div className="bt-chart-head">
            <h3 className="bt-chart-title">{active ? t.chestsPlayerChart(active.name) : t.chestsPickPlayer}</h3>
            <select className="bt-week-select bt-select-light" value={activeId || ""} onChange={(e) => setSelectedId(e.target.value)}>
              {rows.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <BarChart
            dates={dates}
            values={activeValues}
            lang={lang}
            color="var(--bt-green)"
            ariaLabel={active ? t.chestsPlayerChart(active.name) : t.chestsPickPlayer}
          />

          <table className="bt-res-table bt-chest-table">
            <thead>
              <tr>
                <th className="bt-res-name">{t.chestsTableName}</th>
                <th className="bt-res-given">{t.chestsTableTotal}</th>
                <th className="bt-res-given">{t.chestsTableDaily}</th>
                <th className="bt-res-given">{t.chestsTableWeekly}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="bt-chest-row"
                  aria-current={r.id === activeId ? "true" : undefined}
                  tabIndex={0}
                  onClick={() => setSelectedId(r.id)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setSelectedId(r.id)}
                >
                  <td className="bt-res-name">{r.name}</td>
                  <td className="bt-res-given">{fmt(r.total)}</td>
                  <td className="bt-res-given">{r.daily.toFixed(1)}</td>
                  <td className="bt-res-given">{(r.daily * 7).toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {fromFormer > 0 && <p className="bt-rule-note">{t.chestsFormerNote(fmt(fromFormer))}</p>}
        </Card>
      )}
    </section>
  );
}

function Card({ children }) {
  return <div className="bt-card bt-chests-card">{children}</div>;
}
