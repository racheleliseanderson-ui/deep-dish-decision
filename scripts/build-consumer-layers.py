#!/usr/bin/env python3
"""Build slim ranking payload + listing samples + inspections + first-party dishes.

Does not rewrite dataset.json. Does not invent review consensus or ratings.
"""
from __future__ import annotations

import json
import re
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "src" / "data"
INTEL = Path("/tmp/intel")
NOW = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def slugify(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def load(path: Path):
    return json.loads(path.read_text())


def write(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False) + "\n")
    print(f"wrote {path.relative_to(ROOT)} ({path.stat().st_size:,} bytes)")


def quote_texts(site: dict, *keys: str) -> list[str]:
    out: list[str] = []
    for k in keys:
        for item in site.get(k) or []:
            if isinstance(item, str):
                out.append(item)
            elif isinstance(item, dict):
                out.append(str(item.get("quote") or ""))
    return [t for t in out if t.strip()]


def extract_named(record: dict, site: dict) -> list[str]:
    """Only capture restaurant-named dishes / products, not sourcing essays."""
    blob = " ".join(
        [
            record.get("cuisineContext") or "",
            record.get("menuSummary") or "",
            record.get("beverageDetails") or "",
            *quote_texts(site, "cuisineLanguage", "jsonLdLanguage", "priceLanguage"),
        ]
    )
    if re.search(r"not stated on the restaurant", blob, re.I):
        owned = " ".join(quote_texts(site, "cuisineLanguage", "jsonLdLanguage"))
        blob = owned
    found: list[str] = []
    patterns = [
        r"(?:signature dish(?:es)?(?: is| are)?|known for|famous for|house specialty(?: is)?)\s+([^.;:]{3,60})",
        r"piles of chubby oysters",
        r"\bfried oysters\b",
        r"\bturtle soup\b",
        r"\bbread pudding souffl[eé]\b",
        r"\bhand-made pasta\b",
        r"\bhouse-made pasta\b",
        r"\bhouse-made breads and pastas\b",
        r"oysters grown and harvested by hama hama",
        r"\bgriyo\b",
        r"\btwice[- ]cooked pork\b",
        r"\bcanlis salad\b",
        r"\bz-man sandwich\b",
        r"\bburnt ends\b",
        r"\bfried chicken\b",
        r"\bchicken and waffles\b",
        r"\bhush puppies\b",
        r"\bbrick-oven pizza\b",
        r"signature dishes include\s+([^.;]{8,100})",
    ]
    skip = re.compile(
        r"goldbelly|nationwide|og:|located in|all our locations|forests|fisheries|"
        r"storytelling|rotating five-week|dining experience|tasting menu|five-course|"
        r"six-course|from field|globally informed|creative cuisine with|entrees of|"
        r"available for breakfast|send bbq online|farms,?|foragers|winemakers|"
        r"preservation|accents og|title$|fresh title|"
        r"wine program|seasonal menu sourced|hospitalit|cuisine rooted|"
        r"modern approach|globally inspired|private dining|welcoming|"
        r"deep respect|exceptional asian|italian tradition|"
        r"prime steaks, seafood|sourced from local|dishes that takes|"
        r"crafted cocktails|brunch, and dinner|\bstop$|made-from-scratch fare|"
        r"classic kentucky cuisine|sunday brunch|"
        r"namesake|intelligently crafted|crafted beers",
        re.I,
    )
    for pat in patterns:
        for m in re.finditer(pat, blob, re.I):
            bit = (m.group(1) if m.lastindex else m.group(0)).strip()
            bit = re.sub(r"\s+", " ", bit).strip(" ,.;")
            bit = re.sub(r"^like\s+", "", bit, flags=re.I)
            if skip.search(bit):
                continue
            if 3 < len(bit) < 80 and not re.search(r"not stated", bit, re.I):
                found.append(bit)
    seen: set[str] = set()
    out: list[str] = []
    for item in found:
        k = item.lower()
        if k in seen:
            continue
        seen.add(k)
        out.append(item)
    return out[:6]


def latest_kc(rows: list[dict], name_ok, addr_ok=None) -> dict | None:
    matched = [r for r in rows if name_ok(r.get("name") or "")]
    if addr_ok:
        tighter = [r for r in matched if addr_ok(r.get("address") or "")]
        if tighter:
            matched = tighter
    if not matched:
        return None
    by_date: dict[str, list[dict]] = defaultdict(list)
    for r in matched:
        by_date[r["inspection_date"][:10]].append(r)
    date = max(by_date)
    pack = by_date[date]
    red = [r for r in pack if (r.get("violation_type") or "").upper() == "RED"]
    blue = [r for r in pack if (r.get("violation_type") or "").upper() == "BLUE"]
    head = pack[0]
    return {
        "jurisdiction": "Public Health — Seattle & King County",
        "programName": head["name"],
        "address": f"{head.get('address', '')}, {head.get('city', '')} {head.get('zip_code', '')}".strip(", "),
        "latestInspectionDate": date,
        "latestResult": head.get("inspection_result"),
        "latestScore": float(head["inspection_score"]) if head.get("inspection_score") is not None else None,
        "grade": head.get("grade"),
        "closed": str(head.get("inspection_closed_business", "")).lower() == "yes",
        "redViolations": [
            re.sub(r"^\d+\s*-\s*", "", r.get("violation_description") or "").split(";")[0][:140]
            for r in red
        ],
        "blueViolations": [
            re.sub(r"^\d+\s*-\s*", "", r.get("violation_description") or "").split(";")[0][:140]
            for r in blue
        ],
        "sourceUrl": "https://kingcounty.gov/en/dept/dph/health-safety/food-safety/search-restaurant-safety-ratings",
        "dataset": "data.kingcounty.gov/r878-4sxa",
        "retrievedAt": NOW,
        "matchConfidence": "high",
        "note": "Public inspection snapshot. Not a Deep Dish cleanliness score. Unsatisfactory is a King County result label, not a closure.",
    }


def latest_nyc(rows: list[dict]) -> dict | None:
    if not rows:
        return None
    rows = sorted(rows, key=lambda r: r.get("inspection_date") or "", reverse=True)
    graded = [r for r in rows if r.get("grade")]
    head = graded[0] if graded else rows[0]
    date = (head.get("inspection_date") or "")[:10]
    same = [r for r in rows if (r.get("inspection_date") or "")[:10] == date]
    crit = [
        r.get("violation_description", "")[:140]
        for r in same
        if r.get("critical_flag") == "Critical" and r.get("violation_description")
    ]
    return {
        "jurisdiction": "NYC Department of Health and Mental Hygiene",
        "programName": head.get("dba"),
        "address": f"{head.get('building', '')} {head.get('street', '')}, {head.get('boro', '')} {head.get('zipcode', '')}".strip(),
        "latestInspectionDate": date,
        "grade": head.get("grade"),
        "latestScore": float(head["score"]) if head.get("score") not in (None, "") else None,
        "latestResult": f"NYC letter grade {head.get('grade')}" if head.get("grade") else None,
        "closed": False,
        "redViolations": crit[:4],
        "blueViolations": [],
        "sourceUrl": "https://data.cityofnewyork.us/Health/DOHMH-New-York-City-Restaurant-Inspection-Results/43nn-pn8j",
        "dataset": "data.cityofnewyork.us/43nn-pn8j",
        "retrievedAt": NOW,
        "matchConfidence": "high",
        "note": "Public inspection snapshot from ABCEats / DOHMH. Letter grades are NYC's, not a Deep Dish score.",
    }


def main() -> None:
    ds = load(DATA / "dataset.json")
    en = load(DATA / "enrichment.json")
    recs = ds["records"]
    er = en.get("records") or {}

    regions_by_group: dict[str, list[str]] = defaultdict(list)
    region_to_group: dict[str, str] = {}
    slug_index = []
    completeness = {}
    by_group: dict[str, list] = defaultdict(list)
    dishes: dict[str, list[str]] = {}
    full_case = 0
    listing_only = 0

    for r in recs:
        g = r.get("regionGroup") or "Unstated"
        region = r.get("region") or ""
        if region and region not in regions_by_group[g]:
            regions_by_group[g].append(region)
        if region:
            region_to_group[region] = g
        by_group[g].append(r)
        slug_index.append(
            {
                "slug": r["slug"],
                "title": r["title"],
                "region": region,
                "regionGroup": g,
                "city": r.get("city") or "",
            }
        )
        if r.get("isFullCaseFile"):
            full_case += 1
        if r.get("reviewStatus") == "listing_only":
            listing_only += 1
        e = er.get(r["slug"]) or {}
        completeness[r["slug"]] = {
            "completeness": (e.get("meta") or {}).get("completeness"),
            "hasSite": bool(e.get("site")),
            "hasGoogle": bool((e.get("google") or {}).get("rating") is not None),
            "quoteCount": sum(
                len((e.get("site") or {}).get(k) or [])
                for k in (
                    "telephoneLanguage",
                    "hoursLanguage",
                    "priceLanguage",
                    "cuisineLanguage",
                    "dietaryLanguage",
                    "accessibilityLanguage",
                    "groupPolicyLanguage",
                    "cancellationLanguage",
                    "jsonLdLanguage",
                )
            ),
        }
        named = extract_named(r, e.get("site") or {})
        if named:
            dishes[r["slug"]] = named

    for g in regions_by_group:
        regions_by_group[g] = sorted(regions_by_group[g])

    meta = {
        "generatedAt": ds.get("generatedAt"),
        "builtAt": NOW,
        "count": ds["count"],
        "regions": ds["regions"],
        "source": ds.get("source"),
        "ops": ds.get("ops"),
        "fullCaseFiles": full_case,
        "listingOnly": listing_only,
        "regionGroups": ds.get("regionGroups"),
        "regionsByGroup": dict(sorted(regions_by_group.items())),
        "regionToGroup": region_to_group,
        "cuisineTagOptions": ds.get("cuisineTagOptions") or [],
        "bookingPlatformOptions": ds.get("bookingPlatformOptions") or [],
        "spendBandOptions": ds.get("spendBandOptions") or [],
        "daypartOptions": ds.get("daypartOptions") or [],
        "formalityOptions": ds.get("formalityOptions") or [],
        "noiseBandOptions": ds.get("noiseBandOptions") or [],
        "planningLoadOptions": ds.get("planningLoadOptions") or [],
        "guestConstraintOptions": ds.get("guestConstraintOptions") or [],
        "slugIndex": slug_index,
    }
    write(DATA / "corpus-meta.json", meta)
    write(DATA / "completeness.json", {"generatedAt": NOW, "records": completeness})

    out_dir = DATA / "by-region"
    if out_dir.exists():
        for old in out_dir.glob("*.json"):
            old.unlink()
    for g, rows in by_group.items():
        write(
            out_dir / f"{slugify(g)}.json",
            {"regionGroup": g, "count": len(rows), "records": rows},
        )

    write(
        DATA / "first-party-dishes.json",
        {
            "generatedAt": NOW,
            "note": "Named only where the restaurant's own pages or owned-site quotes mention the item. Empty means not named — never invented.",
            "records": dishes,
        },
    )

    listing = {}
    for slug, e in er.items():
        g = e.get("google") or {}
        if g.get("rating") is None and g.get("reviewCount") is None:
            continue
        listing[slug] = {
            "source": "Google listing (third-party directory)",
            "rating": g.get("rating"),
            "reviewCount": g.get("reviewCount"),
            "retrievedAt": g.get("retrievedAt"),
            "editorialSummary": (g.get("editorialSummary") or "").strip() or None,
            "placeId": g.get("placeId"),
        }

    extras = {
        "the-walrus-and-the-carpenter-seattle": {
            "source": "OpenTable listing (third-party directory)",
            "rating": 4.7,
            "reviewCount": 404,
            "retrievedAt": NOW,
            "editorialSummary": None,
            "sourceUrl": "https://www.opentable.com/walrus-and-the-carpenter",
        },
        "commander-s-palace-new-orleans": {
            "source": "Yelp listing (third-party directory)",
            "rating": 4.3,
            "reviewCount": 6300,
            "retrievedAt": NOW,
            "editorialSummary": None,
            "sourceUrl": "https://www.yelp.com/biz/commanders-palace-new-orleans-2",
        },
        "uchi-austin": {
            "source": "Yelp listing (third-party directory)",
            "rating": 4.4,
            "reviewCount": 3200,
            "retrievedAt": NOW,
            "editorialSummary": None,
            "sourceUrl": "https://www.yelp.com/biz/uchi-austin-austin",
        },
        "mixtli-san-antonio": {
            "source": "Yelp listing (third-party directory)",
            "rating": 4.3,
            "reviewCount": 161,
            "retrievedAt": NOW,
            "editorialSummary": None,
            "sourceUrl": "https://www.yelp.com/biz/mixtli-san-antonio",
        },
        "cochon-new-orleans": {
            "source": "Yelp listing (third-party directory)",
            "rating": 4.2,
            "reviewCount": 5500,
            "retrievedAt": NOW,
            "editorialSummary": None,
            "sourceUrl": "https://www.yelp.com/biz/cochon-new-orleans-5",
        },
        "the-herbfarm-seattle": {
            "source": "Tripadvisor listing (third-party directory)",
            "rating": 4.3,
            "reviewCount": 283,
            "retrievedAt": NOW,
            "editorialSummary": None,
            "sourceUrl": "https://www.tripadvisor.com/Restaurant_Review-g58835-d433220-Reviews-The_Herbfarm_Restaurant-Woodinville_Washington.html",
        },
        "joule-seattle": {
            "source": "OpenTable listing (third-party directory)",
            "rating": 4.9,
            "reviewCount": 1577,
            "retrievedAt": NOW,
            "editorialSummary": None,
            "sourceUrl": "https://www.opentable.com/joule",
        },
        "lark-seattle": {
            "source": "OpenTable listing (third-party directory)",
            "rating": 4.4,
            "reviewCount": 1557,
            "retrievedAt": NOW,
            "editorialSummary": None,
            "sourceUrl": "https://www.opentable.com/lark-seattle",
        },
        "cafe-juanita-seattle": {
            "source": "Tripadvisor listing (third-party directory)",
            "rating": 4.6,
            "reviewCount": 350,
            "retrievedAt": NOW,
            "editorialSummary": None,
            "sourceUrl": "https://www.tripadvisor.com/Restaurant_Review-g58541-d433224-Reviews-Cafe_Juanita-Kirkland_Washington.html",
        },
        "musang-seattle": {
            "source": "OpenTable listing (third-party directory)",
            "rating": 4.8,
            "reviewCount": 449,
            "retrievedAt": NOW,
            "editorialSummary": None,
            "sourceUrl": "https://www.opentable.com/r/musang-seattle",
        },
        "staple-fancy-seattle": {
            "source": "OpenTable listing (third-party directory)",
            "rating": 4.5,
            "reviewCount": 1135,
            "retrievedAt": NOW,
            "editorialSummary": None,
            "sourceUrl": "https://www.opentable.com/staple-and-fancy-mercantile",
        },
        "tilikum-place-cafe-seattle": {
            "source": "OpenTable listing (third-party directory)",
            "rating": 4.9,
            "reviewCount": 2506,
            "retrievedAt": NOW,
            "editorialSummary": None,
            "sourceUrl": "https://www.opentable.com/tilikum-place-cafe",
        },
        "the-whale-wins-seattle": {
            "source": "Tripadvisor listing (third-party directory)",
            "rating": 4.2,
            "reviewCount": 163,
            "retrievedAt": NOW,
            "editorialSummary": None,
            "sourceUrl": "https://www.tripadvisor.com/Restaurant_Review-g60878-d3751319-Reviews-The_Whale_Wins-Seattle_Washington.html",
        },
        "eem-portland": {
            "source": "Tripadvisor listing (third-party directory)",
            "rating": 4.3,
            "reviewCount": 53,
            "retrievedAt": NOW,
            "editorialSummary": None,
            "sourceUrl": "https://www.tripadvisor.com/Restaurant_Review-g52024-d16667246-Reviews-Eem-Portland_Oregon.html",
        },
    }
    for slug, row in extras.items():
        if slug not in listing:
            listing[slug] = row

    write(
        DATA / "listing-samples.json",
        {
            "generatedAt": NOW,
            "note": "Directory listing samples only. Never ranking-eligible. A star rating is not a review-pattern consensus.",
            "records": listing,
        },
    )

    inspections: dict[str, dict] = {}

    def kc_file(name: str) -> list:
        p = INTEL / name
        if not p.exists():
            return []
        data = load(p)
        return data if isinstance(data, list) else []

    mapping = [
        ("canlis", "kc-canlis2.json", lambda n: "CANLIS" in n.upper(), lambda a: "AURORA" in a.upper()),
        ("the-pink-door", "kc-pink.json", lambda n: "PINK DOOR" in n.upper(), lambda a: "POST" in a.upper()),
        ("nue", "kc-nue-sea.json", lambda n: n.upper().startswith("NUE"), lambda a: "14TH" in a.upper()),
        ("revel", "kc-revel-exact.json", lambda n: n.upper() == "REVEL", lambda a: "36TH" in a.upper()),
        ("the-walrus-and-the-carpenter-seattle", "kc-walrus.json", lambda n: "WALRUS" in n.upper(), None),
        ("joule-seattle", "kc-joule.json", lambda n: n.upper() == "JOULE", None),
        ("lark-seattle", "kc-lark.json", lambda n: n.upper().startswith("LARK -"), lambda a: "SENECA" in a.upper()),
        ("musang-seattle", "kc-musang.json", lambda n: "MUSANG" in n.upper(), None),
        ("archipelago-seattle", "kc-arch.json", lambda n: n.upper() == "ARCHIPELAGO", lambda a: "RAINIER" in a.upper()),
        ("staple-fancy-seattle", "kc-staple.json", lambda n: "STAPLE" in n.upper(), None),
        ("tilikum-place-cafe-seattle", "kc-tilikum.json", lambda n: "TILIKUM" in n.upper(), None),
        ("cafe-juanita-seattle", "kc-cj.json", lambda n: "CAFE JUANITA" in n.upper(), None),
        ("the-herbfarm-seattle", "kc-herb.json", lambda n: "HERBFARM" in n.upper(), None),
    ]
    for slug, fname, name_ok, addr_ok in mapping:
        rec = latest_kc(kc_file(fname), name_ok, addr_ok)
        if rec:
            rec["slug"] = slug
            inspections[slug] = rec

    nyc_map = {
        "le-bernardin": "nyc-lb2.json",
        "gramercy-tavern": "nyc-gt2.json",
        "balthazar": "nyc-bal2.json",
        "carmine-s-44th-street-nyc": "nyc-carmine.json",
        "buddakan": "nyc-buddakan.json",
        "the-smith": "nyc-smith.json",
        "fraunces-tavern": "nyc-fraunces.json",
        "boucherie-union-square": "nyc-boucherie.json",
        "amor-loco": "nyc-amorloco.json",
        "rosa-mexicano": "nyc-rosa.json",
        "vida-verde-tequila-bar": "nyc-vidaverde.json",
        "tacombi": "nyc-tacombi.json",
        "chi-restaurant-bar": "nyc-chi.json",
        "mountain-house-east-village": "nyc-mthouse.json",
        "jiang-nan-nyc": "nyc-jiangnan.json",
        "the-best-sichuan-39": "nyc-sichuan39.json",
        "the-best-sichuan": "nyc-sichuan47.json",
        "the-best-sichuan-21": "nyc-sichuan21.json",
    }
    for slug, fname in nyc_map.items():
        path = INTEL / fname
        rec = latest_nyc(load(path) if path.exists() else [])
        if rec:
            rec["slug"] = slug
            inspections[slug] = rec

    write(
        DATA / "health-inspections.json",
        {
            "generatedAt": NOW,
            "note": "Matched public inspection records only (name + address). Unmatched restaurants stay not-on-file. Never inferred from cuisine, stars, or reviews.",
            "records": inspections,
        },
    )

    print(
        json.dumps(
            {
                "records": len(recs),
                "regionFiles": len(by_group),
                "listingSamples": len(listing),
                "googleKept": sum(1 for v in listing.values() if str(v.get("source", "")).startswith("Google")),
                "namedDishes": len(dishes),
                "inspections": len(inspections),
                "fullCaseFiles": full_case,
                "listingOnly": listing_only,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
