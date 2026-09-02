/** Print the corpus record count and nothing else, so a shell can capture it. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.stdout.write(String(JSON.parse(readFileSync(join(root, "src/data/dataset.json"), "utf8")).records.length));
