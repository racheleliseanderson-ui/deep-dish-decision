#!/usr/bin/env python3
"""Ingest restaurant-owned og:image files for a priority slug set.

Slug must match. Skip logos, skip identical hashes across slugs.
Never invent photography. Empty stays empty.
"""
from __future__ import annotations

import hashlib
import json
import re
import ssl
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "src" / "data"
OUT = ROOT / "public" / "visuals"
UA = "DeepDishCorpusBot/1.0 (restaurant-owned og:image ingest; +https://deepdish.saltnotes.blog/)"
NOW = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
CTX = ssl.create_default_context()

PRIORITY = [
    "canlis",
    "the-pink-door",
    "the-walrus-and-the-carpenter-seattle",
    "the-herbfarm-seattle",
    "kann",
    "le-pigeon",
    "archipelago-seattle",
    "uchi-austin",
    "mixtli-san-antonio",
    "le-bernardin",
    "gramercy-tavern",
    "balthazar",
    "commander-s-palace-new-orleans",
    "cochon-new-orleans",
    "dooky-chase-s-restaurant-new-orleans",
    "nue",
    "revel",
]


def load(path: Path):
    return json.loads(path.read_text())


def fetch(url: str, timeout: int = 20) -> tuple[bytes, str]:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=timeout, context=CTX) as res:
        return res.read(), res.headers.get_content_type() or ""


def abs_url(base: str, maybe: str) -> str:
    maybe = maybe.strip().strip('"').strip("'")
    if maybe.startswith("//"):
        return "https:" + maybe
    if maybe.startswith("http"):
        return maybe
    if maybe.startswith("/"):
        from urllib.parse import urljoin
        return urljoin(base, maybe)
    from urllib.parse import urljoin
    return urljoin(base, maybe)


def og_image(html: str, page: str) -> str | None:
    patterns = [
        r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']',
        r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']',
        r'<meta[^>]+name=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']',
        r'<meta[^>]+property=["\']og:image:url["\'][^>]+content=["\']([^"\']+)["\']',
        r'<link[^>]+rel=["\']image_src["\'][^>]+href=["\']([^"\']+)["\']',
    ]
    for pat in patterns:
        m = re.search(pat, html, re.I)
        if m:
            return abs_url(page, m.group(1))
    return None


def looks_like_logo(url: str, payload: bytes) -> bool:
    u = url.lower()
    if any(k in u for k in ("logo", "favicon", "icon", "sprite", "placeholder")):
        return True
    if len(payload) < 20_000:
        return True
    return False


def ext_for(url: str, ctype: str) -> str:
    if "png" in ctype or url.lower().endswith(".png"):
        return ".png"
    if "webp" in ctype or url.lower().endswith(".webp"):
        return ".webp"
    if "gif" in ctype:
        return ".gif"
    return ".jpg"


def kind_guess(url: str) -> str:
    u = url.lower()
    if any(k in u for k in ("dish", "plate", "food", "menu")):
        return "representative_food"
    if any(k in u for k in ("room", "interior", "dining")):
        return "dining_room"
    if any(k in u for k in ("bar", "lounge")):
        return "bar_lounge"
    if any(k in u for k in ("patio", "view", "terrace")):
        return "patio_view"
    if any(k in u for k in ("exterior", "storefront", "facade")):
        return "exterior"
    return "exterior"


def main() -> None:
    ds = load(DATA / "dataset.json")
    by = {r["slug"]: r for r in ds["records"]}
    OUT.mkdir(parents=True, exist_ok=True)
    visual_path = DATA / "visual-program.json"
    visual = load(visual_path)
    existing = {img["slug"]: img for img in visual.get("images") or []}
    hashes: dict[str, str] = {}
    kept = []
    report = []

    for slug in PRIORITY:
        rec = by.get(slug)
        if not rec:
            report.append({"slug": slug, "status": "missing-record"})
            continue
        site = (rec.get("website") or "").strip()
        if not site or site.lower().startswith("not stated"):
            report.append({"slug": slug, "status": "no-website"})
            continue
        if not site.startswith("http"):
            site = "https://" + site
        try:
            html_b, ctype = fetch(site)
        except Exception as e:
            report.append({"slug": slug, "status": f"page-fail:{type(e).__name__}"})
            continue
        html = html_b.decode("utf-8", "ignore")
        img_url = og_image(html, site)
        if not img_url:
            report.append({"slug": slug, "status": "no-og-image", "page": site})
            continue
        try:
            payload, img_type = fetch(img_url, timeout=25)
        except Exception as e:
            report.append({"slug": slug, "status": f"image-fail:{type(e).__name__}", "url": img_url})
            continue
        if not img_type.startswith("image/") and "octet-stream" not in img_type:
            report.append({"slug": slug, "status": f"not-image:{img_type}", "url": img_url})
            continue
        if looks_like_logo(img_url, payload):
            report.append({"slug": slug, "status": "skipped-logo-or-tiny", "url": img_url, "bytes": len(payload)})
            continue
        digest = hashlib.sha256(payload).hexdigest()
        if digest in hashes and hashes[digest] != slug:
            report.append({"slug": slug, "status": "cross-wired-hash", "other": hashes[digest]})
            continue
        hashes[digest] = slug
        ext = ext_for(img_url, img_type)
        dest = OUT / f"{slug}{ext}"
        dest.write_bytes(payload)
        entry = {
            "slug": slug,
            "kind": kind_guess(img_url),
            "src": f"/visuals/{slug}{ext}",
            "alt": f"Restaurant-owned photograph published on {site} — not a diner snapshot of {rec['title']}.",
            "provenance": {
                "kind": "restaurant_owned",
                "url": site,
                "retrievedAt": NOW,
            },
            "documentary": True,
        }
        existing[slug] = entry
        kept.append(slug)
        report.append({"slug": slug, "status": "ok", "bytes": len(payload), "src": entry["src"]})

    images = list(existing.values())
    # slug-must-match: drop anything not in dataset
    images = [img for img in images if img.get("slug") in by]
    visual = {
        "generatedAt": NOW,
        "note": "Documentary photography is stored only when the image is proven to belong to this exact slug. Identity marks are deterministic SVGs from first-party signals and are not photographs of the restaurant. Generated or editorial illustrations must set documentary to false and must never be labeled as a photo of a real room or dish.",
        "images": images,
    }
    visual_path.write_text(json.dumps(visual, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({"kept": kept, "count": len(images), "report": report}, indent=2))


if __name__ == "__main__":
    main()
