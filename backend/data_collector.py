import os
import json
import logging
import httpx
from dotenv import load_dotenv

load_dotenv()
log = logging.getLogger(__name__)

BASE_URL = "https://www.space-track.org"
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")

TURKISH_NORAD_IDS = [39030, 39522, 40984, 47306, 60233, 41875, 33056, 39152, 50212]

OBJECT_TYPES = ["PAYLOAD", "ROCKET BODY", "DEBRIS", "UNKNOWN", "TBA"]


def _save(data, filename):
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(os.path.join(DATA_DIR, filename), 'w') as f:
        json.dump(data, f, separators=(',', ':'))
    log.info(f"{filename}: {len(data)} records")


def _get(client, url):
    r = client.get(url)
    r.raise_for_status()
    return r.json()


def login(client):
    r = client.post(f"{BASE_URL}/ajaxauth/login", data={
        "identity": os.getenv("SPACETRACK_USER"),
        "password": os.getenv("SPACETRACK_PASS"),
    })
    r.raise_for_status()
    return "error" not in r.text.lower()


def fetch_gp_by_type(client, obj_type):
    url = (
        f"{BASE_URL}/basicspacedata/query/class/gp"
        f"/OBJECT_TYPE/{obj_type}"
        f"/EPOCH/>now-30"
        f"/orderby/NORAD_CAT_ID"
        f"/format/json"
    )
    return _get(client, url)


def fetch_all_gp(client):
    all_data = []
    for otype in OBJECT_TYPES:
        log.info(f"Fetching GP: {otype}")
        data = fetch_gp_by_type(client, otype)
        log.info(f"  {otype}: {len(data)} records")
        all_data.extend(data)
    _save(all_data, "all_objects.json")
    return all_data


def fetch_turkish_sats(client):
    ids = ",".join(str(i) for i in TURKISH_NORAD_IDS)
    url = f"{BASE_URL}/basicspacedata/query/class/gp/NORAD_CAT_ID/{ids}/format/json"
    data = _get(client, url)
    _save(data, "turkish_sats.json")
    return data


def fetch_historical_gp(client, norad_ids, date_start, date_end):
    ids = ",".join(str(i) for i in norad_ids)
    url = (
        f"{BASE_URL}/basicspacedata/query/class/gp_history"
        f"/NORAD_CAT_ID/{ids}"
        f"/EPOCH/{date_start}--{date_end}"
        f"/orderby/EPOCH"
        f"/format/json"
    )
    data = _get(client, url)
    filename = f"historical_{date_start}_{date_end}.json"
    _save(data, filename)
    return data


def fetch_all(client):
    fetch_turkish_sats(client)
    fetch_all_gp(client)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format='%(levelname)s %(message)s')
    with httpx.Client(timeout=120.0) as client:
        if not login(client):
            log.error("Login failed")
            raise SystemExit(1)
        log.info("Login OK")
        fetch_all(client)
        log.info("Done")