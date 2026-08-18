// Takes a flat array of rows from the collector and files each one
// under data/days/YYYY-MM-DD.json. Rewrites whole days rather than
// appending, so re-running is always safe.
const fs = require("fs");
const path = require("path");

const src = process.argv[2];
const rows = JSON.parse(fs.readFileSync(src, "utf8"));
if (!Array.isArray(rows)) throw new Error("expected an array of rows");

const byDay = new Map();
for (const r of rows) {
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
