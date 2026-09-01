const SUPPORT_URL =
  "https://www.buymeacoffee.com/northernlanternhouse?utm_source=nlh_apps&utm_medium=footer&utm_campaign=keep_the_curtain_up";

/**
 * First-party support link for Northern Lantern House applications.
 * No Buy Me a Coffee JavaScript is loaded and nothing floats over app controls.
 */
export function SupportFooter() {
  return (
    <aside
      aria-label="Support Northern Lantern House"
      className="no-print"
      data-print="hide"
      data-bmc-campaign="keep-the-curtain-up"
      style={{
        borderTop: "1px solid rgba(128, 128, 128, 0.22)",
        padding: "0.8rem 1rem max(0.9rem, env(safe-area-inset-bottom))",
        textAlign: "center",
      }}
    >
      <a
        href={SUPPORT_URL}
        target="_blank"
        rel="noopener noreferrer sponsored"
        aria-label="Support Northern Lantern House on Buy Me a Coffee; opens in a new tab"
        title="Keep the curtain up — coffee keeps the next one coming."
        style={{
          color: "inherit",
          display: "inline-block",
          fontSize: "0.75rem",
          lineHeight: 1.5,
          opacity: 0.72,
          textDecoration: "none",
        }}
      >
        Support Northern Lantern House <span aria-hidden="true">↗</span>
      </a>
    </aside>
  );
}
