// Takes a flat array of rows from the collector and files each one
// under data/days/YYYY-MM-DD.json. Rewrites whole days rather than
// appending, so re-running is always safe.
const fs = require("fs");
const path = require("path");

const src = process.argv[2];
const rows = JSON.parse(fs.readFileSync(src, "utf8"));
if (!Array.isArray(rows)) throw new Error("expected an array of rows");

// The collector may still report a network/ISP name. We do not keep it: an
// employer name next to a city and a timestamp is the one field here that
// comes close to naming somebody, and it answers no question worth asking.
// Dropped on the way in, so it never reaches the repo.
const DROP = ["net"];

// The banding normally happens in the browser, so the exact width never
// leaves it. Rows already sitting in the collector predate that, and the
// sync re-reads the last few days on every run — so band here too, or an
// old exact width walks back into the repo. Values already at a band edge
// are left alone, which keeps re-running safe.
const BANDS = [480, 768, 1024, 1440, 1441];
function band(w) {
  if (typeof w !== "number" || !w) return w;
  if (BANDS.includes(w)) return w;
  if (w < 480) return 480;
  if (w < 768) return 768;
  if (w < 1024) return 1024;
  if (w < 1440) return 1440;
  return 1441;
}

const byDay = new Map();
for (const r of rows) {
  for (const f of DROP) delete r[f];
  if ("screen" in r) r.screen = band(r.screen);
  const day = String(r.ts || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
  if (!byDay.has(day)) byDay.set(day, []);
  byDay.get(day).push(r);
}

const dir = path.join("data", "days");
fs.mkdirSync(dir, { recursive: true });

for (const [day, dayRows] of byDay) {
  dayRows.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
  fs.writeFileSync(
    path.join(dir, day + ".json"),
    JSON.stringify(dayRows, null, 0) + "\n"
  );
  console.log(day + ": " + dayRows.length + " rows");
}
if (byDay.size === 0) console.log("nothing new");
