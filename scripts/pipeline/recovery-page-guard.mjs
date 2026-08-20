import { isChallengePage } from "./own-fetch.mjs";

/**
 * Fail closed on browser-rendered denial/challenge pages. A WAF page can have
 * plenty of text, so text length alone is not evidence of a restaurant page.
 */
export function blockedRenderedPage(html, text) {
  if (isChallengePage(html)) return true;
  const blob = `${String(html || "")}\n${String(text || "")}`;
  return /\b(?:access denied|request blocked|forbidden|error\s*403|you don['’]t have permission|verify you are human|verification required|security service|this request has been blocked|captcha)\b/i.test(
    blob,
  );
}
