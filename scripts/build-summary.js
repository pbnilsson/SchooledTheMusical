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

// Count helper: tally a field, drop blanks, return sorted [{key, n}]
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

// Distinct tab-sessions, which is our closest honest stand-in for "people"
function visitors(list) {
  return new Set(list.map((r) => r.visit).filter(Boolean)).size;
}

// Daily series, with no gaps — a missing day should read as zero, not vanish
const daily = [];
if (views.length) {
  const days = views.map((r) => r.ts.slice(0, 10)).sort();
  const first = new Date(days[0] + "T00:00:00Z");
  const last = new Date(days[days.length - 1] + "T00:00:00Z");
  const byDay = new Map();
  for (const r of views) {
    const d = r.ts.slice(0, 10);
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d).push(r);
  }
  for (let t = first; t <= last; t = new Date(t.getTime() + 86400000)) {
    const d = t.toISOString().slice(0, 10);
    const list = byDay.get(d) || [];
    daily.push({ day: d, views: list.length, visitors: visitors(list) });
  }
}

// Per page: views, plus how many distinct sessions saw it
const pageMap = new Map();
for (const r of views) {
  const p = r.path || "/";
  if (!pageMap.has(p)) pageMap.set(p, []);
  pageMap.get(p).push(r);
}
const pages = [...pageMap.entries()]
  .map(([key, list]) => ({ key, n: list.length, visitors: visitors(list) }))
  .sort((a, b) => b.n - a.n);

// A click is worth listing if it took someone somewhere — off the site,
// or to a file like the casting breakdown PDF. Plain page-to-page nav is
// already visible in the pages list, so it goes in its own bucket.
const OURS = /^https?:\/\/(www\.)?schooledthemusical\.com/i;

function isNav(target) {
  const t = String(target || "");
  if (!t) return true;
  if (!OURS.test(t)) return false;               // off-site
  const p = t.replace(OURS, "").split(/[?#]/)[0];
  if (p === "" || p === "/") return true;
  return /\.html?$/i.test(p) || !/\.[a-z0-9]{2,5}$/i.test(p);
}

const followed = clicks.filter((r) => r.target && !isNav(r.target));
const navigated = clicks.filter((r) => r.target && isNav(r.target));

const summary = {
  generated: new Date().toISOString(),
  totals: {
    views: views.length,
    clicks: clicks.length,
    visitors: visitors(views),
    days: daily.length,
  },
  daily,
  pages,
  sources: tally(views, (r) => r.source),
  referrers: tally(views, (r) => r.ref, 20),
  campaigns: tally(views, (r) => r.campaign, 20),
  countries: tally(views, (r) => r.country, 20),
  links: tally(followed, (r) => r.target, 25),
  internalLinks: tally(navigated, (r) => r.target, 25),
};

fs.mkdirSync("data", { recursive: true });
fs.writeFileSync("data/summary.json", JSON.stringify(summary, null, 2) + "\n");
console.log(
  "summary: " +
    summary.totals.views +
    " views, " +
    summary.totals.clicks +
    " clicks, " +
    summary.totals.days +
    " days"
);
