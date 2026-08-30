/**
 * DISABLED — Google Places discovery is removed.
 * Use seed-listings.mjs for offline geographic expansion, then own-site enrich.mjs.
 *
 *   node scripts/pipeline/seed-listings.mjs
 *   node scripts/pipeline/enrich.mjs --hygiene
 */
console.error("discover.mjs is disabled: Google Places (GPI) has been removed from this project.");
console.error("Use: node scripts/pipeline/seed-listings.mjs  then  node scripts/pipeline/enrich.mjs --hygiene");
process.exit(1);
