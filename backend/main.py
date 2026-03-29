import os
import json
import logging
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List

from orbit_engine import position, trajectory, bulk_positions, EARTH_RADIUS
from collision_engine import simulate, simulate_nasa, compare_models, SCENARIOS

log = logging.getLogger(__name__)
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")

app = FastAPI(title="OrbitalSentinel TR", version="3.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

_cache = {}

def _load(filename):
    if filename not in _cache:
        path = os.path.join(DATA_DIR, filename)
        if not os.path.exists(path):
            return []
        with open(path, 'r') as f:
            _cache[filename] = json.load(f)
    return _cache[filename]

class CollisionRequest(BaseModel):
    mass1_kg: float = 400
    mass2_kg: float = 0.5
    velocity_rel_kmps: float = 7.5
    angle_deg: float = 90
    alt_km: float = 800
    inclination_deg: float = 0.0


@app.get("/api/tle/all")
async def get_all_tle():
    data = _load("all_objects.json")
    result = []
    for sat in data:
        tle1, tle2 = sat.get("TLE_LINE1"), sat.get("TLE_LINE2")
        if not tle1 or not tle2:
            continue
        result.append({
            "id": sat.get("NORAD_CAT_ID"), "name": sat.get("OBJECT_NAME", ""),
            "type": sat.get("OBJECT_TYPE", ""), "country": sat.get("COUNTRY_CODE", ""),
            "rcs": sat.get("RCS_SIZE", ""), "tle1": tle1, "tle2": tle2,
        })
    return {"count": len(result), "satellites": result}


@app.get("/api/satellites/turkish")
async def get_turkish_positions():
    positions = bulk_positions("turkish_sats.json", min_epoch="2020-01-01")
    return {"count": len(positions), "satellites": positions}


@app.post("/api/collision/simulate")
async def collision_simulate(req: CollisionRequest):
    result = simulate(req.mass1_kg, req.mass2_kg, req.velocity_rel_kmps, req.alt_km, req.inclination_deg)
    frags = [{"fid": f.fid, "mass_kg": f.mass_kg, "size_m": f.size_m,
              "delta_v": f.delta_v, "velocity": f.velocity, "position": f.position} for f in result.fragments[:500]]
    return {
        "is_catastrophic": result.is_catastrophic,
        "energy_joules": result.energy_joules,
        "specific_energy_jg": result.specific_energy_jg,
        "num_fragments": result.num_fragments,
        "fragments": frags,
    }


@app.get("/api/scenarios")
async def get_scenarios():
    return {
        key: {
            "name": s["name"],
            "desc": s.get("desc", ""),
            "mass1_kg": s["mass1"],
            "mass2_kg": s["mass2"],
            "velocity_rel_kmps": s["vel"],
            "alt_km": s["alt"],
            "inclination_deg": s.get("inc", 0.0),
        }
        for key, s in SCENARIOS.items()
    }


@app.post("/api/scenarios/{key}/compare")
async def compare_scenario(key: str, req: Optional[CollisionRequest] = None):
    if req:
        m1, m2, v, alt, inc = req.mass1_kg, req.mass2_kg, req.velocity_rel_kmps, req.alt_km, getattr(req, "inclination_deg", 0.0)
    elif key in SCENARIOS:
        s = SCENARIOS[key]
        m1, m2, v, alt, inc = s["mass1"], s["mass2"], s["vel"], s["alt"], s.get("inc", 0.0)
    else:
        raise HTTPException(404, f"Unknown scenario: {key}")

    result = compare_models(m1, m2, v, alt, inc)
    return result


@app.post("/api/scenarios/custom/compare")
async def compare_custom(req: CollisionRequest):
    result = compare_models(req.mass1_kg, req.mass2_kg, req.velocity_rel_kmps, req.alt_km, getattr(req, "inclination_deg", 0.0))
    return result


@app.get("/api/status")
async def status():
    counts = {}
    for f in ["all_objects.json", "turkish_sats.json"]:
        data = _load(f)
        counts[f] = len(data) if isinstance(data, list) else 0
    return {"status": "ok", "data_counts": counts, "scenarios": list(SCENARIOS.keys())}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)