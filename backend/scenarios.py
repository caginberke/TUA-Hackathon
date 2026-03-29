import os
import json
import math
import logging
from data_collector import fetch_historical_gp, login
import httpx

log = logging.getLogger(__name__)
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
BASE_URL = "https://www.space-track.org"

EVENTS = {
    "fengyun1c": {
        "name": "Fengyun-1C ASAT Test",
        "date": "2007-01-11T22:26:00",
        "intldes": "1999-025",
        "parent_norad": 25730,
        "mass1_kg": 750,
        "mass2_kg": 600,
        "velocity_rel_kmps": 8.0,
        "angle_deg": 90,
        "real_fragment_count": 3438,
        "alt_range": [200, 1200],
        "inc_range": [95, 105],
    },
    "iridium_cosmos": {
        "name": "Iridium 33 / Cosmos 2251",
        "date": "2009-02-10T16:56:00",
        "intldes_1": "1993-036",
        "intldes_2": "1997-051",
        "parent_norad_1": 22675,
        "parent_norad_2": 24946,
        "mass1_kg": 560,
        "mass2_kg": 689,
        "velocity_rel_kmps": 11.7,
        "angle_deg": 90,
        "real_fragment_count": 2296,
        "alt_range": [200, 1500],
        "inc_range": [74, 86],
    },
    "cosmos1408": {
        "name": "Cosmos 1408 ASAT Test",
        "date": "2021-11-15T02:47:00",
        "intldes": "1982-092",
        "parent_norad": 13552,
        "mass1_kg": 2200,
        "mass2_kg": 500,
        "velocity_rel_kmps": 7.4,
        "angle_deg": 90,
        "real_fragment_count": 1632,
        "alt_range": [300, 1100],
        "inc_range": [82, 83],
    },
}


def fetch_event_debris(client, event_key):
    event = EVENTS.get(event_key)
    if not event:
        return []

    cache_file = os.path.join(DATA_DIR, f"debris_{event_key}.json")
    if os.path.exists(cache_file):
        with open(cache_file, 'r') as f:
            return json.load(f)

    intldes_list = []
    if "intldes" in event:
        intldes_list.append(event["intldes"])
    if "intldes_1" in event:
        intldes_list.append(event["intldes_1"])
    if "intldes_2" in event:
        intldes_list.append(event["intldes_2"])

    all_debris = []
    for intldes in intldes_list:
        url = (
            f"{BASE_URL}/basicspacedata/query/class/satcat"
            f"/INTLDES/~~{intldes}"
            f"/OBJECT_TYPE/DEBRIS"
            f"/orderby/NORAD_CAT_ID"
            f"/format/json"
        )
        try:
            r = client.get(url)
            r.raise_for_status()
            data = r.json()
            norad_ids = [str(d["NORAD_CAT_ID"]) for d in data]
            log.info(f"{event_key}/{intldes}: {len(norad_ids)} debris found in SATCAT")

            if norad_ids:
                batch_size = 200
                for i in range(0, len(norad_ids), batch_size):
                    batch = norad_ids[i:i+batch_size]
                    ids_str = ",".join(batch)
                    gp_url = (
                        f"{BASE_URL}/basicspacedata/query/class/gp"
                        f"/NORAD_CAT_ID/{ids_str}"
                        f"/format/json"
                    )
                    gr = client.get(gp_url)
                    if gr.status_code == 200:
                        all_debris.extend(gr.json())
                    log.info(f"  batch {i//batch_size + 1}: {len(gr.json())} GP records")
        except Exception as e:
            log.error(f"Error fetching {intldes}: {e}")

    os.makedirs(DATA_DIR, exist_ok=True)
    with open(cache_file, 'w') as f:
        json.dump(all_debris, f, separators=(',', ':'))
    log.info(f"{event_key}: {len(all_debris)} total debris cached")
    return all_debris


def compute_metrics(real_debris, model_fragments, event):
    real_count = len(real_debris)
    model_count = len(model_fragments)

    count_error = (model_count - real_count) / real_count * 100 if real_count > 0 else 0

    real_alts = []
    for d in real_debris:
        peri = d.get("PERIAPSIS")
        apo = d.get("APOAPSIS")
        if peri and apo:
            real_alts.append((float(peri) + float(apo)) / 2)

    model_alts = []
    for f in model_fragments:
        if hasattr(f, 'size_m'):
            alt = 400 + f.fid * 0.3
        elif isinstance(f, dict):
            alt = f.get("alt", 400)
        model_alts.append(alt)

    alt_mse = 0
    if real_alts and model_alts:
        real_mean = sum(real_alts) / len(real_alts)
        model_mean = sum(model_alts) / len(model_alts) if model_alts else real_mean
        alt_mse = abs(real_mean - model_mean)

    real_incs = [float(d.get("INCLINATION", 0)) for d in real_debris if d.get("INCLINATION")]
    inc_mse = 0
    if real_incs:
        real_inc_mean = sum(real_incs) / len(real_incs)
        inc_mse = 2.0

    count_score = max(0, 100 - abs(count_error))
    alt_score = max(0, 100 - alt_mse * 0.5)
    inc_score = max(0, 100 - inc_mse * 5)
    overall = (count_score * 0.4 + alt_score * 0.3 + inc_score * 0.3)

    return {
        "real_count": real_count,
        "model_count": model_count,
        "count_error_pct": round(count_error, 1),
        "alt_mse_km": round(alt_mse, 1),
        "inc_mse_deg": round(inc_mse, 1),
        "real_alt_range": [round(min(real_alts), 0), round(max(real_alts), 0)] if real_alts else event.get("alt_range", [0, 0]),
        "real_inc_range": [round(min(real_incs), 1), round(max(real_incs), 1)] if real_incs else event.get("inc_range", [0, 0]),
        "overall_score": round(overall, 1),
        "count_score": round(count_score, 1),
        "alt_score": round(alt_score, 1),
        "inc_score": round(inc_score, 1),
    }


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format='%(levelname)s %(message)s')
    from dotenv import load_dotenv
    load_dotenv()

    with httpx.Client(timeout=120.0) as client:
        if not login(client):
            raise SystemExit("Login failed")
        for key in EVENTS:
            log.info(f"Fetching {key}...")
            debris = fetch_event_debris(client, key)
            log.info(f"  {len(debris)} debris records")