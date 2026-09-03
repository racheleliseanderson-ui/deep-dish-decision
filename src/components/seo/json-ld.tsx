/**
 * One way to put structured data on a page.
 *
 * JSON-LD is injected as a script element rather than through the router head
 * descriptors because these blocks are composed from loader data that only the
 * component has, and because a malformed block is worse than no block: the
 * escaping below is the whole reason this is a component and not an inline
 * `dangerouslySetInnerHTML` copied around the codebase.
 */
export function JsonLd({ data }: { data: unknown }) {
  if (!data) return null;
  const json = JSON.stringify(data);
  if (!json || json === "null") return null;
  return (
    <script
      type="application/ld+json"
      // A literal </script> inside a string value would close the tag early;
      // U+2028 and U+2029 are legal JSON but illegal in a script body.
      dangerouslySetInnerHTML={{
        __html: json
          .replace(/</g, "\\u003c")
          .replace(/\u2028/g, "\\u2028")
          .replace(/\u2029/g, "\\u2029"),
      }}
    />
  );
}
