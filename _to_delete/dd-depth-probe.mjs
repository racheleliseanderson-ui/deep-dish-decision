import fs from "node:fs";
import { measureDepth } from "./scripts/pipeline/level-format.mjs";
const d = JSON.parse(fs.readFileSync("src/data/dataset.json", "utf8"));
const before = {};
for (const r of d.records) before[r.depthLabel] = (before[r.depthLabel] || 0) + 1;
let sum = 0;
const after = {};
for (const r of d.records) {
  const m = measureDepth(r);
  after[m.depthLabel] = (after[m.depthLabel] || 0) + 1;
  sum += m.depthFilled / Math.max(1, m.depthTotal);
}
const sort = (o) => Object.fromEntries(Object.entries(o).sort((a, b) => parseInt(a[0]) - parseInt(b[0])));
console.log("BEFORE:", JSON.stringify(sort(before)));
console.log("AFTER :", JSON.stringify(sort(after)));
console.log("new avgDepth:", Math.round((sum / d.records.length) * 100));
console.log("new fullCaseFiles:", d.records.filter((r) => measureDepth(r).isFullCaseFile).length);
