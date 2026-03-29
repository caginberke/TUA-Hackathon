import math
import logging
from datetime import datetime, timedelta
from orbit_engine import EARTH_RADIUS, MU, orbital_period

log = logging.getLogger(__name__)

THREAT_RADIUS_KM = 50


def fragment_orbit(fragment):
    if isinstance(fragment, dict):
        pos = fragment["position"]
        vel = fragment["velocity"]
        fid = fragment.get("fid", 0)
        mass_kg = fragment.get("mass_kg", 0.0)
        size_m = fragment.get("size_m", 0.0)
    else:
        pos = fragment.position
        vel = fragment.velocity
        fid = fragment.fid
        mass_kg = fragment.mass_kg
        size_m = fragment.size_m

    r = math.sqrt(sum(p**2 for p in pos))
    v = math.sqrt(sum(vi**2 for vi in vel))
    alt = r - EARTH_RADIUS

    if v > 0 and r > 0:
        energy = v**2 / 2 - MU / r
        a = -MU / (2 * energy) if energy != 0 else r
        h = [
            pos[1]*vel[2] - pos[2]*vel[1],
            pos[2]*vel[0] - pos[0]*vel[2],
            pos[0]*vel[1] - pos[1]*vel[0],
        ]
        h_mag = math.sqrt(sum(hi**2 for hi in h))
        ecc = max(0, math.sqrt(1 + 2 * energy * h_mag**2 / MU**2)) if MU > 0 else 0
        inc = math.degrees(math.acos(h[2] / h_mag)) if h_mag > 0 else 0

        apoapsis = a * (1 + ecc) - EARTH_RADIUS if a > 0 else alt
        periapsis = a * (1 - ecc) - EARTH_RADIUS if a > 0 else alt
    else:
        a, ecc, inc = r, 0, 0
        apoapsis = periapsis = alt

    will_decay = periapsis < 200  # below 200km = atmospheric reentry

    return {
        "fid": fid,
        "mass_kg": mass_kg,
        "size_m": size_m,
        "alt_km": round(alt, 2),
        "semi_major_axis_km": round(a, 2),
        "eccentricity": round(ecc, 6),
        "inclination_deg": round(inc, 2),
        "apoapsis_km": round(apoapsis, 2),
        "periapsis_km": round(periapsis, 2),
        "will_decay": will_decay,
        "position": [round(p, 2) for p in pos],
        "velocity": [round(vi, 4) for vi in vel],
    }


def compute_fragment_orbits(fragments):
    orbits = []
    for f in fragments:
        orb = fragment_orbit(f)
        orbits.append(orb)
    decaying = sum(1 for o in orbits if o["will_decay"])
    log.info(f"{len(orbits)} fragment orbits computed, {decaying} will decay")
    return orbits


def find_threats(fragment_orbits, satellite_positions, radius_km=THREAT_RADIUS_KM):
    threats = []
    for sat in satellite_positions:
        # sat.get("alt") is the mean altitude of the satellite.
        sat_alt = sat.get("alt", 0)
        sat_id  = sat.get("id") or sat.get("norad_id")
        sat_inc = sat.get("inclination", None)
        threatening = []

        for frag in fragment_orbits:
            if frag["will_decay"]:
                continue
            peri, apo = frag["periapsis_km"], frag["apoapsis_km"]
            if peri - radius_km <= sat_alt <= apo + radius_km:
                threatening.append({
                    "fid": frag["fid"],
                    "closest_approach_km": round(abs(sat_alt - (peri + apo) / 2), 2),
                    "frag_size_m": frag["size_m"],
                    "frag_mass_kg": frag["mass_kg"],
                })

        if threatening:
            threatening.sort(key=lambda x: x["closest_approach_km"])
            threats.append({
                "satellite": {
                    "norad_id": sat_id,
                    "name": sat.get("name", ""),
                    "alt_km": sat_alt,
                },
                "num_threats": len(threatening),
                "fragments": threatening[:20],
            })

    threats.sort(key=lambda x: x["num_threats"], reverse=True)
    log.info(f"{len(threats)} satellites threatened")
    return threats


def cascade_analysis(initial_result, satellite_positions, depth=3):
    cascade = []
    current_fragments = initial_result

    for level in range(depth):
        threats = find_threats(current_fragments, satellite_positions)
        if not threats:
            break
        cascade.append({
            "level": level + 1,
            "threatened_satellites": len(threats),
            "total_fragments": len(current_fragments),
            "top_threats": threats[:5],
        })

    return {
        "depth_reached": len(cascade),
        "levels": cascade,
        "kessler_risk": "HIGH" if len(cascade) >= 2 else "LOW",
    }


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format='%(levelname)s %(message)s')
    print("threat_analyzer ready")