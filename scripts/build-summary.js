// Reads every day file and writes one small data/summary.json that the
// stats page can load in a single request.
const fs = require("fs");
const path = require("path");

const dir = path.join("data", "days");
const files = fs.existsSync(dir)
  ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort()
  : [];

const rows = [];
for (const f of files) {
  const parsed = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  if (Array.isArray(parsed)) rows.push(...parsed);
}

// "/" and "/index.html" are the same page; count them as one.
for (const r of rows) {
  if (r.path === "/index.html" || r.path === "/index.htm") r.path = "/";
}

const views = rows.filter((r) => r.kind === "view");
const clicks = rows.filter((r) => r.kind === "click");
const ends = rows.filter((r) => r.kind === "end");
const signups = rows.filter((r) => r.kind === "signup");

// ---- helpers ---------------------------------------------------------------

function tally(list, pick, limit) {
  const m = new Map();
  for (const r of list) {
    const k = pick(r);
    if (!k) continue;
    m.set(k, (m.get(k) || 0) + 1);
  }
  const out = [...m.entries()]
    .map(([key, n]) => ({ key, n }))
    .sort((a, b) => b.n - a.n);
  return limit ? out.slice(0, limit) : out;
}

// Distinct tab-sessions, our closest honest stand-in for "people"
function visitors(list) {
  return new Set(list.map((r) => r.visit).filter(Boolean)).size;
}

// Median, not mean — one tab left open overnight would wreck an average
function median(nums) {
  const a = nums.filter((n) => Number.isFinite(n)).sort((x, y) => x - y);
  if (!a.length) return null;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : Math.round((a[mid - 1] + a[mid]) / 2);
}

function groupBy(list, pick) {
  const m = new Map();
  for (const r of list) {
    const k = pick(r);
    if (!k) continue;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
}

// ---- the pulse -------------------------------------------------------------

const daily = [];
if (views.length) {
  const days = views.map((r) => r.ts.slice(0, 10)).sort();
  const first = new Date(days[0] + "T00:00:00Z");
  const last = new Date(days[days.length - 1] + "T00:00:00Z");
  const byDay = groupBy(views, (r) => r.ts.slice(0, 10));
  for (let t = first; t <= last; t = new Date(t.getTime() + 86400000)) {
    const d = t.toISOString().slice(0, 10);
    const list = byDay.get(d) || [];
    daily.push({ day: d, views: list.length, visitors: visitors(list) });
  }
}

// ---- pages, with how far people got and how long they stayed ---------------

const endsByPage = groupBy(ends, (r) => r.path);
const pages = [...groupBy(views, (r) => r.path || "/").entries()]
  .map(([key, list]) => {
    const e = endsByPage.get(key) || [];
    return {
      key,
      n: list.length,
      visitors: visitors(list),
      depth: median(e.map((r) => r.depth)),
      secs: median(e.map((r) => r.secs)),
      measured: e.length,
    };
  })
  .sort((a, b) => b.n - a.n);

// ---- journeys --------------------------------------------------------------

const byVisit = groupBy(views, (r) => r.visit);
const trails = [];
for (const [, list] of byVisit) {
  list.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
  const seq = [];
  for (const r of list) {
    if (seq[seq.length - 1] !== r.path) seq.push(r.path); // collapse reloads
  }
  if (seq.length) trails.push(seq);
}

const journeys = tally(
  trails.filter((t) => t.length > 1).map((t) => ({ s: t.join(" → ") })),
  (r) => r.s,
  15
);
const entries = tally(trails.map((t) => ({ p: t[0] })), (r) => r.p, 10);
const exits = tally(
  trails.map((t) => ({ p: t[t.length - 1] })),
  (r) => r.p,
  10
);
const trailLengths = trails.map((t) => t.length);

// ---- signups ---------------------------------------------------------------

// A signup's real source is the source of the visit it belongs to, not the
// referrer at the moment of clicking — so look it up by visit id.
const visitSource = new Map();
const visitEntry = new Map();
for (const [visit, list] of byVisit) {
  const firstView = list[0];
  if (!firstView) continue;
  visitSource.set(visit, firstView.campaign || firstView.source || "direct");
  visitEntry.set(visit, firstView.path);
}

const signupDetail = signups.map((r) => ({
  page: r.path,
  source: visitSource.get(r.visit) || "unknown",
  entry: visitEntry.get(r.visit) || r.path,
}));

// ---- clicks ----------------------------------------------------------------

const OURS = /^https?:\/\/(www\.)?schooledthemusical\.com/i;

function isNav(target) {
  const t = String(target || "");
  if (!t) return true;
  if (!OURS.test(t)) return false;
  const p = t.replace(OURS, "").split(/[?#]/)[0];
  if (p === "" || p === "/") return true;
  return /\.html?$/i.test(p) || !/\.[a-z0-9]{2,5}$/i.test(p);
}

const followed = clicks.filter((r) => r.target && !isNav(r.target));
const navigated = clicks.filter((r) => r.target && isNav(r.target));

// ---- assemble --------------------------------------------------------------

const summary = {
  generated: new Date().toISOString(),
  totals: {
    views: views.length,
    clicks: clicks.length,
    visitors: visitors(views),
    signups: signups.length,
    days: daily.length,
    medianPagesPerVisit: median(trailLengths),
    medianDepth: median(ends.map((r) => r.depth)),
    medianSecs: median(ends.map((r) => r.secs)),
  },
  daily,
  pages,
  journeys,
  entries,
  exits,
  sources: tally(views, (r) => r.source),
  referrers: tally(views, (r) => r.ref, 20),
  campaigns: tally(views, (r) => r.campaign, 20),
  countries: tally(views, (r) => r.country, 20),
  cities: tally(
    views,
    (r) => (r.city ? r.city + (r.region ? ", " + r.region : "") : null),
    20
  ),
  networks: tally(views, (r) => r.net, 20),
  devices: tally(views, (r) => r.device),
  browsers: tally(views, (r) => r.browser, 10),
  systems: tally(views, (r) => r.os, 10),
  signupsBySource: tally(signupDetail, (r) => r.source, 10),
  signupsByPage: tally(signupDetail, (r) => r.page, 10),
  links: tally(followed, (r) => r.target, 25),
  internalLinks: tally(navigated, (r) => r.target, 25),
};

fs.mkdirSync("data", { recursive: true });
fs.writeFileSync("data/summary.json", JSON.stringify(summary, null, 2) + "\n");
console.log(
  "summary: " + summary.totals.views + " views, " +
    summary.totals.clicks + " clicks, " +
    summary.totals.signups + " signups, " +
    summary.totals.days + " days"
);
