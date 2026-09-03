/**
 * The pipeline half of src/lib/menu-link.ts, over the same host lists.
 *
 * `menuUrl` is a first-party claim: it says the restaurant published this. A
 * previous pass let 56 links in that are not on the restaurant's domain, 27 of
 * them press coverage — an LA Times review of Rossoblu, five Esquire round-ups,
 * a Washington Post guide. The structured-data layer refused them; the record
 * pages showed them to people under the word "Menu".
 *
 * The refusal now happens where the field is written, so the corpus cannot
 * acquire another one. Both sides read src/data/menu-hosts.json, so there is
 * one list, not two.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const hosts = JSON.parse(readFileSync(resolve(ROOT, "src/data/menu-hosts.json"), "utf8"));

export const FIRST_PARTY_MENU_HOSTS = new Set(hosts.firstPartyMenuHosts);
export const PUBLISHER_HOSTS = new Set(hosts.publisherHosts);

export function registrableDomain(url) {
  if (!url) return null;
  try {
    const parts = new URL(url).hostname
      .toLowerCase()
      .replace(/^www\./, "")
      .split(".");
    return parts.length >= 2 ? parts.slice(-2).join(".") : parts.join(".");
  } catch {
    return null;
  }
}

export function linkHost(url) {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function httpUrl(value) {
  const text = String(value ?? "").trim();
  if (!/^https?:\/\//i.test(text)) return null;
  try {
    return new URL(text).toString();
  } catch {
    return null;
  }
}

/** @returns {{url:string,kind:"own"|"platform"|"press"|"offsite",host:string,isMenu:boolean}|null} */
export function readMenuLink(menuUrl, website) {
  const url = httpUrl(menuUrl);
  if (!url) return null;
  const host = linkHost(url) ?? "";
  const menuDomain = registrableDomain(url);
  if (!menuDomain) return null;
  const siteDomain = registrableDomain(httpUrl(website));
  if (siteDomain && siteDomain === menuDomain) return { url, kind: "own", host, isMenu: true };
  if (FIRST_PARTY_MENU_HOSTS.has(menuDomain)) return { url, kind: "platform", host, isMenu: true };
  if (PUBLISHER_HOSTS.has(menuDomain)) return { url, kind: "press", host, isMenu: false };
  return { url, kind: "offsite", host, isMenu: false };
}

/**
 * May this URL be stored as the restaurant's menu?
 *
 * Deliberately stricter than what the pages will display. A page can name the
 * host of an off-site link and let the reader judge; a stored field cannot,
 * because everything downstream reads it as the restaurant's own word.
 */
export function isStorableMenuUrl(menuUrl, website) {
  const read = readMenuLink(menuUrl, website);
  return Boolean(read && read.isMenu);
}
