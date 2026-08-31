#!/usr/bin/env python3
"""Merge researched batch-2 review patterns. Never overwrites an existing slug."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "src" / "data" / "reputation-patterns.json"
NOW = datetime.now(timezone.utc).strftime("%Y-%m-%d")

NEW = {
    "nue": {
        "sampleSize": 2193,
        "sourceMix": [
            "Google listing (third-party directory)",
            "Yelp",
            "OpenTable",
            "The Infatuation Seattle",
        ],
        "recency": "2018–2026",
        "researchedAt": NOW,
        "recurringPraise": [
            "Global street-food small plates that actually land — reviewers keep naming Sichuan wing towers, tocino, and brunch shareables",
            "Capitol Hill group night: variety without a tasting lock-in",
        ],
        "recurringComplaints": [
            "A huge map of cuisines means some tables hit a dud dish next to a great one",
            "The room reads as a busy neighborhood spot, not a quiet date",
        ],
        "consistencySignal": "Identity (global street food, shareable) is stable. Execution is plate-by-plate, not a single house dish.",
        "dishesRecommended": ["Sichuan chicken wing tower", "Filipino tocino brunch plates", "shareable brunch"],
        "dishesCriticized": [],
        "waitPattern": "Walk-in friendly relative to tasting rooms; still busy at brunch.",
        "patternSummary": "Public-review pattern: a Capitol Hill graze where the range is the point. Some plates miss. Directory stars do not rank this record.",
    },
    "revel": {
        "sampleSize": 1086,
        "sourceMix": [
            "Google listing (third-party directory)",
            "Yelp",
            "Tripadvisor",
            "The Infatuation Seattle",
        ],
        "recency": "2022–2026",
        "researchedAt": NOW,
        "recurringPraise": [
            "Short-rib dumplings are the dish people name, often as the reason to return",
            "Korean-fusion plates at a Fremont counter/open kitchen, not a tasting lock",
        ],
        "recurringComplaints": [
            "Louder and more harried when the room fills — dumplings can lag",
            "A service surcharge shows up in recent notes; confirm the live check math",
        ],
        "consistencySignal": "Dumplings are the stable praise. Noise and pace are the stable tradeoff.",
        "servicePattern": "Fine when the room is moderate; reviews call it harried at peak.",
        "dishesRecommended": ["short-rib dumplings", "Korean-fusion noodles / rice plates"],
        "dishesCriticized": [],
        "patternSummary": "Public-review pattern: dumplings first, volume second. A listing rating is not a ranking.",
    },
    "joule-seattle": {
        "sampleSize": 1577,
        "sourceMix": [
            "OpenTable listing (third-party directory)",
            "Yelp",
            "Tripadvisor",
            "Eater Seattle",
        ],
        "recency": "2024–2026",
        "researchedAt": NOW,
        "recurringPraise": [
            "Korean steakhouse plates — short rib / kalbi and mackerel — are the dishes people name",
            "Service is often called the equal of the cooking on a special-occasion night",
        ],
        "recurringComplaints": [
            "Portions read small once you are paying steakhouse money; sharing entrees is a common warning",
            "A surprise surcharge (reviewers have flagged 4%) shows up on the check",
        ],
        "consistencySignal": "Cooking identity is stable. Value and surcharge are the recurring friction.",
        "portionValuePattern": "Small-plate steakhouse: order more than you think, and read the check for added fees.",
        "dishesRecommended": ["short rib / kalbi steak", "mackerel", "Korean rice cakes / scallion noodles"],
        "dishesCriticized": [],
        "patternSummary": "Public-review pattern: a Korean steakhouse people return to, with small portions and check fees as the complaint. OpenTable stars are context only.",
    },
    "lark-seattle": {
        "sampleSize": 1557,
        "sourceMix": [
            "OpenTable",
            "Yelp",
            "Tripadvisor",
            "Food & Wine",
        ],
        "recency": "2024–2026",
        "researchedAt": NOW,
        "recurringPraise": [
            "Seasonal Northwest cooking (salmon, foraged mushrooms, generous tasting) and unhurried service",
            "The four-course path is described as substantial, not precious tweezer food",
        ],
        "recurringComplaints": [
            "A recurring minority call the cooking underwhelming at the ticket — beautiful, not memorable",
            "Corkage and the overall spend are called out as planning facts, not surprises only at the end",
        ],
        "consistencySignal": "Room and service are the safer praise. Cooking-to-price is mixed.",
        "dishesRecommended": ["four-course tasting", "wild King salmon when listed", "foraged mushroom plates"],
        "dishesCriticized": [],
        "patternSummary": "Public-review pattern: a Capitol Hill Northwest house with strong service and a split on whether the cooking matches the price. Not a star ranking.",
    },
    "the-whale-wins-seattle": {
        "sampleSize": None,
        "sourceMix": ["Yelp", "Tripadvisor", "Eater (historical)", "restaurant-owned about page"],
        "recency": "2021–2026",
        "researchedAt": NOW,
        "recurringPraise": [
            "Wood-oven vegetables and a slower, reservation-friendly sister to the Walrus oyster bar",
            "A table that wants produce and fire more than a raw bar",
        ],
        "recurringComplaints": [
            "Recent notes that some vegetable plates read less interesting than the house's reputation",
            "Not a last-minute walk-in the way the oyster bar can be — a slower night, by design",
        ],
        "consistencySignal": "Wood oven + vegetables is the identity. Recent execution notes are thinner and mixed.",
        "dishesRecommended": ["wood-oven vegetables", "wood-fired fish / meat when listed"],
        "dishesCriticized": ["pickled vegetable plates called dull in at least one recent Yelp note"],
        "patternSummary": "Public-review pattern: Renee Erickson's wood-oven vegetable room, slower than the oyster bar. Recent vegetable plates are not uniformly praised. No ranking from stars.",
    },
    "musang-seattle": {
        "sampleSize": 673,
        "sourceMix": [
            "Yelp",
            "Tripadvisor",
            "The Infatuation Seattle (9.4)",
            "Food & Wine",
            "Reddit r/Seattle",
        ],
        "recency": "2024–2026",
        "researchedAt": NOW,
        "recurringPraise": [
            "Beacon Hill Filipino cooking people name specifically — sinigang, adobo, pancit — in a converted Craftsman",
            "Infatuation's 9.4 is a critic score, not a Deep Dish rank; diners still call it a destination",
        ],
        "recurringComplaints": [
            "Loud room; small portions at a high ticket on Tripadvisor",
            "A local minority calls the 'elevated' framing overrated — do not treat critic scores as consensus",
        ],
        "consistencySignal": "Filipino identity is stable. Volume and value are the live complaints.",
        "dishesRecommended": ["sinigang / sour broths", "adobo and pancit plates"],
        "dishesCriticized": [],
        "patternSummary": "Public-review pattern: a Beacon Hill Filipino room with loud praise and a loud room. Critic scores are not a ranking here.",
    },
    "cafe-juanita-seattle": {
        "sampleSize": 350,
        "sourceMix": ["Yelp", "Tripadvisor", "OpenTable", "Reddit r/finedining", "restaurant-owned pages"],
        "recency": "2024–2026",
        "researchedAt": NOW,
        "recurringPraise": [
            "Northern Italian tasting (risotto, scallops, pasta, a vegetarian/vegan path) with recovery-level service",
            "Kirkland destination for a milestone night, not a Seattle walk-in",
        ],
        "recurringComplaints": [
            "The live total (tasting + wine + service fee) is the shock: diners report $600–$1000 for two",
            "Small tasting portions at that ticket are noted even by people who loved the risotto",
        ],
        "consistencySignal": "Cooking and service are the praise. The all-in number is the planning fact.",
        "portionValuePattern": "Prix-fixe tasting: confirm the live ticket, wine, and service fee before you treat $205 as the night.",
        "dishesRecommended": ["risotto", "pescatarian tasting", "house pasta"],
        "dishesCriticized": [],
        "patternSummary": "Public-review pattern: a Kirkland Italian tasting people dress up for, with a bill that routinely doubles the printed prix fixe. Stars do not rank it.",
    },
    "staple-fancy-seattle": {
        "sampleSize": None,
        "sourceMix": ["Yelp", "Tripadvisor", "OpenTable", "Food & Wine", "Ethan Stowell owned pages"],
        "recency": "2022–2026",
        "researchedAt": NOW,
        "recurringPraise": [
            "Ballard family-style four-course pasta tasting — gnocchi/ragu when it lands, fried oysters as a bar path",
            "Friendly service in an open room; the chef's menu is the default, not a secret",
        ],
        "recurringComplaints": [
            "Pasta seasoning is the split: salty, lemon-heavy, or flavorless depending on the night",
            "Pacing of the family-style barrage can feel like too much, too fast",
        ],
        "consistencySignal": "Format (family-style tasting, pasta) is stable. Execution of the pasta course is mixed.",
        "dishesRecommended": ["chef's four-course tasting", "pasta / gnocchi when listed", "fried oysters"],
        "dishesCriticized": ["pasta called under-seasoned or over-lemoned on recent Yelp/Tripadvisor notes"],
        "patternSummary": "Public-review pattern: Ballard pasta tasting that people still book, with a live split on whether the pasta is actually seasoned. Not a ranking.",
    },
    "tilikum-place-cafe-seattle": {
        "sampleSize": None,
        "sourceMix": ["Yelp", "OpenTable", "Reddit", "restaurant-owned hours page"],
        "recency": "2024–2026",
        "researchedAt": NOW,
        "recurringPraise": [
            "Dutch babies and European brunch are the dishes people wait for",
            "Dinner is repeatedly described as the quieter path",
        ],
        "recurringComplaints": [
            "Brunch reservations book out; walk-in waits of an hour-plus are normal",
            "Peak brunch service can drop a drink or a candle request — the food is the reason people still wait",
        ],
        "consistencySignal": "Dutch baby / brunch identity is stable. The wait is the planning fact.",
        "waitPattern": "Treat brunch as a reserved or long-wait service. Dinner is the easier walk.",
        "dishesRecommended": ["Dutch baby", "brunch plates", "baked oysters when listed"],
        "dishesCriticized": [],
        "patternSummary": "Public-review pattern: a Belltown brunch people plan weeks ahead. The wait is not a rumor. Stars do not rank it.",
    },
    "hama-hama-oyster-saloon": {
        "sampleSize": 1391,
        "sourceMix": [
            "Google listing (third-party directory)",
            "Yelp",
            "Tripadvisor",
            "Eater Seattle",
            "restaurant-owned saloon page (wait and weather language)",
        ],
        "recency": "2025–2026",
        "researchedAt": NOW,
        "recurringPraise": [
            "Tide-to-table oysters on Hood Canal — raw and grilled — are the reason for the drive",
            "The A-frame outdoor room and the farm view are part of the night, not a backdrop",
        ],
        "recurringComplaints": [
            "It is outdoors with heaters, not an indoor dining room — dress for rain and wind",
            "Summer waits over an hour are published on the restaurant's own page; the drive from Seattle is real",
        ],
        "consistencySignal": "Oysters and the outdoor farm are the stable praise. Weather and wait are first-party planning facts.",
        "waitPattern": "Restaurant-owned: summer waits can run over an hour. Stump Bar / food truck is the overflow path they publish.",
        "dishesRecommended": ["raw oysters grown on the farm", "grilled oysters"],
        "dishesCriticized": [],
        "patternSummary": "Public-review pattern plus owned-page planning: a Hood Canal oyster farm you dress for. Google stars do not rank it.",
    },
    "tusk": {
        "sampleSize": 1213,
        "sourceMix": [
            "Google listing (third-party directory)",
            "Yelp",
            "Tripadvisor",
            "New York Times (historical)",
        ],
        "recency": "2017–2026",
        "researchedAt": NOW,
        "recurringPraise": [
            "Middle Eastern / Mediterranean plates through Pacific Northwest produce; patio is the calmer path",
            "A polished East Burnside group room, not a tasting lock",
        ],
        "recurringComplaints": [
            "Inside gets loud; this is not a whispered-date default",
            "A small room that books — treat walk-in as a maybe, not a plan",
        ],
        "consistencySignal": "Produce-forward Middle Eastern identity is stable. Volume is the tradeoff.",
        "dishesRecommended": ["seasonal vegetable-forward mezze", "patio when weather allows"],
        "dishesCriticized": [],
        "patternSummary": "Public-review pattern: a bright East Burnside mezze room. Patio for conversation; inside for energy. Stars do not rank it.",
    },
    "ox": {
        "sampleSize": 1942,
        "sourceMix": [
            "Google listing (third-party directory)",
            "Yelp",
            "Tripadvisor",
            "OpenTable",
        ],
        "recency": "2024–2026",
        "researchedAt": NOW,
        "recurringPraise": [
            "Wood-fired steak and chimichurri — skirt steak and pork chops are the dishes people name",
            "Attentive service in a classy-but-not-stiff NE Portland room",
        ],
        "recurringComplaints": [
            "Tripadvisor's recurring pushback: loud, and overhyped once the steakhouse ticket is on the table",
            "A fire-and-meat night, not a quiet conversation default",
        ],
        "consistencySignal": "Steak identity is stable. Noise and value are the split.",
        "dishesRecommended": ["skirt steak with chimichurri", "pork chop", "wood-fired meat"],
        "dishesCriticized": [],
        "patternSummary": "Public-review pattern: Portland's wood-fired steakhouse, loud on purpose. Directory stars are context only.",
    },
    "langbaan": {
        "sampleSize": 466,
        "sourceMix": [
            "Google listing (third-party directory)",
            "Yelp",
            "Tripadvisor",
            "OpenTable",
            "Oregonian / local coverage of the hidden-room format",
        ],
        "recency": "2019–2026",
        "researchedAt": NOW,
        "recurringPraise": [
            "Thai tasting at a hidden counter — rotating monthly themes, live-fire, pairings people remember",
            "Service at the chef's counter is the usual praise",
        ],
        "recurringComplaints": [
            "Courses read as bite-sized flavor tasters to some diners who wanted a fuller plate",
            "A small room that books; weekend reservations are a planning load, not a same-day hope",
        ],
        "consistencySignal": "Format (hidden Thai tasting, rotating theme) is stable. Portion vs. ticket is mixed.",
        "waitPattern": "Hard reservation. Do not plan this as a walk-in.",
        "dishesRecommended": ["monthly themed tasting", "wine / pairing path"],
        "dishesCriticized": [],
        "patternSummary": "Public-review pattern: a hidden Thai tasting people still chase. Small bites and a hard book are the live facts. Stars do not rank it.",
    },
    "kachka": {
        "sampleSize": 2826,
        "sourceMix": [
            "Google listing (third-party directory)",
            "Yelp",
            "OpenTable",
        ],
        "recency": "2023–2026",
        "researchedAt": NOW,
        "recurringPraise": [
            "Zakuski, pelmeni, and a Soviet-inspired room that works for counter lunch, happy hour, and a full dinner",
            "Dumplings are the dish people reorder",
        ],
        "recurringComplaints": [
            "Music and AC in the back room show up as comfort complaints",
            "Isolated undercooked-chicken reports — a watch, not a file-wide warning",
        ],
        "consistencySignal": "Pelmeni / zakuski identity is stable. Room comfort is mixed.",
        "dishesRecommended": ["pelmeni", "vareniki", "zakuski spread", "happy-hour dumplings"],
        "dishesCriticized": ["chicken called undercooked in at least one OpenTable note"],
        "patternSummary": "Public-review pattern: Portland's Soviet dumpling house. Order pelmeni; confirm the room if you need quiet. Stars do not rank it.",
    },
    "screen-door-portland": {
        "sampleSize": None,
        "sourceMix": ["Yelp", "Tripadvisor", "OpenTable", "Reddit r/Portland", "restaurant-owned pages"],
        "recency": "2024–2026",
        "researchedAt": NOW,
        "recurringPraise": [
            "Fried chicken and chicken-and-waffles are the dishes the restaurant itself names, and diners still wait for them",
            "Southern brunch that works as a tourist and local default",
        ],
        "recurringComplaints": [
            "Waits of an hour or two at peak; the house is primarily walk-in with limited reservations",
            "A minority call the breading soggy or the wait not worth it — not a consensus, but not empty",
        ],
        "consistencySignal": "Fried chicken identity is first-party and public. The wait is the planning fact.",
        "waitPattern": "Restaurant-owned: primarily walk-in, limited reservations. Plan for a waitlist.",
        "dishesRecommended": ["fried chicken", "chicken and waffles", "hush puppies"],
        "dishesCriticized": ["breading called soggy on at least one Reddit round-up"],
        "patternSummary": "Public-review pattern: Portland fried chicken people queue for. The wait is on the restaurant's own page. Stars do not rank it.",
    },
    "hat-yai-portland": {
        "sampleSize": None,
        "sourceMix": ["Yelp", "Tripadvisor", "Eater Portland"],
        "recency": "2022–2026",
        "researchedAt": NOW,
        "recurringPraise": [
            "Southern Thai fried chicken with rice-flour crust, curry, and roti — the combo locals tell visitors to get",
            "Casual, not a tasting lock",
        ],
        "recurringComplaints": [
            "Waits and order-timing friction at a casual fried-chicken counter",
            "Spice and richness can outrun a table that wanted a light lunch",
        ],
        "consistencySignal": "Fried chicken + roti/curry combo is the stable praise. Pace is casual-busy.",
        "dishesRecommended": ["Thai fried chicken combo with curry and roti", "ground pork when listed"],
        "dishesCriticized": [],
        "patternSummary": "Public-review pattern: Portland's Southern Thai fried-chicken counter. Casual, busy, not a white-tablecloth night. Stars do not rank it.",
    },
    "eem-portland": {
        "sampleSize": None,
        "sourceMix": ["Yelp", "Tripadvisor", "OpenTable", "restaurant press page"],
        "recency": "2022–2026",
        "researchedAt": NOW,
        "recurringPraise": [
            "Thai-BBQ mashup — smoked meats, jungle-plant room, a live-fire energy reviewers still name",
            "Walk-ins welcome is part of the house pitch",
        ],
        "recurringComplaints": [
            "Loud on purpose; conversation is not the product",
            "Menu-language misses (BBQ fried rice flagged as not actually gluten-free) — confirm dietary live, do not infer from the mashup",
        ],
        "consistencySignal": "Smoke + Thai is the identity. Volume and dietary precision are the watches.",
        "dishesRecommended": ["smoked Thai-BBQ plates", "fried rice (confirm gluten live)"],
        "dishesCriticized": [],
        "patternSummary": "Public-review pattern: a loud Thai-BBQ room. Walk-in is the path; allergy safety is not. Stars do not rank it.",
    },
}


def main() -> None:
    data = json.loads(PATH.read_text())
    records = data.setdefault("records", {})
    added = []
    skipped = []
    for slug, row in NEW.items():
        if slug in records and (records[slug].get("recurringPraise") or records[slug].get("recurringComplaints")):
            skipped.append(slug)
            continue
        records[slug] = row
        added.append(slug)
    data["generatedAt"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    PATH.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({"added": added, "skippedExisting": skipped, "total": len(records)}, indent=2))


if __name__ == "__main__":
    main()
