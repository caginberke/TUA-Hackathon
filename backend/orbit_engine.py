import os
import json
import math
import logging
from datetime import datetime, timedelta
from sgp4.api import Satrec, WGS72, jday

log = logging.getLogger(__name__)

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
EARTH_RADIUS = 6378.137
MU = 398600.4418
WGS84_E2 = 0.006694385093379304

def teme_to_geodetic(x, y, z, jd):
    t = (jd - 2451545.0) / 36525.0
    gmst = 280.46061837 + 360.98564736629 * (jd - 2451545.0) + \
           0.000387933 * t**2 - (t**3) / 38710000.0
    gmst = math.radians(gmst % 360.0)
    lon = math.atan2(y, x) - gmst
    lon = math.degrees((lon + math.pi) % (2 * math.pi) - math.pi)
    
    p = math.sqrt(x**2 + y**2)
    lat = math.atan2(z, p * (1 - WGS84_E2))
    
    n = EARTH_RADIUS
    for _ in range(5):
        n = EARTH_RADIUS / math.sqrt(1 - WGS84_E2 * math.sin(lat)**2)
        lat = math.atan2(z + n * WGS84_E2 * math.sin(lat), p)
        
    alt = p / math.cos(lat) - n
    lat = math.degrees(lat)
    return lat, lon, alt

def _to_jd(dt):
    return jday(dt.year, dt.month, dt.day, dt.hour, dt.minute,
                dt.second + dt.microsecond / 1e6)

def _make_sat(tle1, tle2):
    try:
        return Satrec.twoline2rv(tle1, tle2, WGS72)
    except Exception:
        return None

def propagate(sat, dt):
    jd, fr = _to_jd(dt)
    e, r, v = sat.sgp4(jd, fr)
    if e != 0:
        return None
    lat, lon, alt = teme_to_geodetic(r[0], r[1], r[2], jd + fr)
    return {
        "lat": round(lat, 4), "lon": round(lon, 4), "alt": round(alt, 2),
        "x": round(r[0], 2), "y": round(r[1], 2), "z": round(r[2], 2),
        "vx": round(v[0], 4), "vy": round(v[1], 4), "vz": round(v[2], 4),
    }

def position(sat_data, dt=None):
    tle1, tle2 = sat_data.get("TLE_LINE1"), sat_data.get("TLE_LINE2")
    if not tle1 or not tle2:
        return None
    sat = _make_sat(tle1, tle2)
    if not sat:
        return None
    result = propagate(sat, dt or datetime.utcnow())
    if not result:
        return None
    result.update({
        "norad_id": sat_data.get("NORAD_CAT_ID"),
        "name": sat_data.get("OBJECT_NAME", ""),
        "object_type": sat_data.get("OBJECT_TYPE", ""),
        "country": sat_data.get("COUNTRY_CODE", ""),
        "rcs_size": sat_data.get("RCS_SIZE", ""),
    })
    return result

def trajectory(sat_data, hours=72, step_minutes=5, start_dt=None):
    tle1, tle2 = sat_data.get("TLE_LINE1"), sat_data.get("TLE_LINE2")
    if not tle1 or not tle2:
        return[]
    sat = _make_sat(tle1, tle2)
    if not sat:
        return[]
    start = start_dt or datetime.utcnow()
    points =[]
    for m in range(0, hours * 60 + 1, step_minutes):
        dt = start + timedelta(minutes=m)
        p = propagate(sat, dt)
        if p:
            p["time"] = dt.strftime("%Y-%m-%d %H:%M:%S")
            points.append(p)
    return points

def bulk_positions(json_file, dt=None, min_epoch="2024-01-01"):
    filepath = os.path.join(DATA_DIR, json_file)
    if not os.path.exists(filepath):
        return[]
    with open(filepath, 'r') as f:
        data = json.load(f)
    results =[]
    for sat_data in data:
        epoch = sat_data.get("EPOCH", "")
        if epoch and epoch < min_epoch:
            continue
        p = position(sat_data, dt)
        if p:
            results.append(p)
    log.info(f"{json_file}: {len(results)}/{len(data)} positions")
    return results

def orbital_speed(alt_km):
    return math.sqrt(MU / (EARTH_RADIUS + alt_km))

def orbital_period(alt_km):
    r = EARTH_RADIUS + alt_km
    return 2 * math.pi * math.sqrt(r**3 / MU)

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format='%(levelname)s %(message)s')
    positions = bulk_positions("turkish_sats.json", min_epoch="2020-01-01")
    for p in positions:
        print(f"{p['name']:20s} alt={p['alt']:10.2f}km lat={p['lat']:7.2f} lon={p['lon']:7.2f}")