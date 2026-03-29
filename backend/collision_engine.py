import math
import random
import logging
import numpy as np
from dataclasses import dataclass
from typing import List

log = logging.getLogger(__name__)

EARTH_R = 6371.0
MU = 398600.4418
CATASTROPHIC_THRESHOLD = 40000.0  
MIN_DV_THRESHOLD = 100.0 

@dataclass
class Fragment:
    fid: int
    mass_kg: float
    size_m: float
    delta_v: list 
    velocity: list = None
    position: list = None
    area_to_mass: float = 0.0

@dataclass
class CollisionResult:
    is_catastrophic: bool
    energy_joules: float
    specific_energy_jkg: float
    num_fragments: int
    fragments: List[Fragment]
    params: dict
    model_name: str = ""


class Satellite:
    def __init__(self, sid: int, mass: float, r_eci: np.ndarray, v_eci: np.ndarray):
        self.sid = sid
        self.mass = mass
        self.r_eci = r_eci  
        self.v_eci = v_eci  

    def get_ric_matrix(self) -> np.ndarray:
        """ECI'dan RIC (Radial, In-track, Cross-track) sistemine dönüşüm matrisi."""
        r_unit = self.r_eci / np.linalg.norm(self.r_eci)
        h = np.cross(self.r_eci, self.v_eci)
        c_unit = h / np.linalg.norm(h)
        i_unit = np.cross(c_unit, r_unit)
        return np.array([r_unit, i_unit, c_unit])


class PhysicsModel:

    @staticmethod
    def kinetic_energy(m_projectile, v_rel_ms):
        return 0.5 * m_projectile * (v_rel_ms ** 2)

    @staticmethod
    def is_catastrophic(energy_j, target_mass):
        if target_mass <= 0:
            return False
        return (energy_j / target_mass) >= CATASTROPHIC_THRESHOLD

    @staticmethod
    def fragment_count(total_mass, lc_min=0.1):
        if total_mass <= 0:
            return 0
        return int(min(0.1 * (total_mass ** 0.75) * (lc_min ** (-1.71)), 5000))

    @staticmethod
    def mef(v_rel_kmps):
        if v_rel_kmps < 2:
            return 1.5
        elif v_rel_kmps < 8:
            return 1.8 + 0.1 * v_rel_kmps
        else:
            return 2.5 + 0.05 * min(v_rel_kmps, 15)

    @staticmethod
    def get_eci_velocity(dv_ric: np.ndarray, r_eci: np.ndarray, v_eci: np.ndarray) -> np.ndarray:
        r_unit = r_eci / np.linalg.norm(r_eci)
        h = np.cross(r_eci, v_eci)
        c_unit = h / np.linalg.norm(h)
        i_unit = np.cross(c_unit, r_unit)
        
        m_ric_to_eci = np.array([r_unit, i_unit, c_unit]).T
        return m_ric_to_eci @ dv_ric

    @staticmethod
    def normalize_budget(fragments: List[Fragment], max_energy: float):
        if not fragments: return
        current_ke = sum(0.5 * f.mass_kg * (np.linalg.norm(f.delta_v)**2) for f in fragments)
        
        if current_ke > max_energy:
            scale_factor = np.sqrt(max_energy / current_ke)
            for f in fragments:
                f.delta_v *= scale_factor

    @staticmethod
    def momentum_delta_v_ric(masses, v_rel_mag):
        delta_vs_ric = []
        v_rel = v_rel_mag / 1000.0
        for m in masses:

            if v_rel < 5.0:
                mu_v = 300.0
            else:
                mu_v = 135.0 * (v_rel / 7.0)
            
            sigma_v = 0.4 * mu_v
            
            sigma_log = np.sqrt(np.log(1 + (sigma_v/mu_v)**2))
            mu_log = np.log(mu_v) - 0.5 * sigma_log**2
            dv_mag = float(np.random.lognormal(mu_log, sigma_log))

            dv_radial = np.random.normal(0, 0.8)
            dv_intrack = np.random.normal(0, 1.0)
            dv_crosstrack = np.random.normal(0, 0.6)
            
            vec = np.array([dv_radial, dv_intrack, dv_crosstrack])
            vec = vec / max(np.linalg.norm(vec), 1e-6)
            
            dv_ric = vec * dv_mag
            delta_vs_ric.append(dv_ric)
            
        return delta_vs_ric

    @staticmethod
    def grady_kipp_mass_distribution(num, total_mass, v_rel_ms):
        strain_rate = v_rel_ms / 1.0
        beta = min(max(1.5 + 0.3 * math.log10(max(strain_rate, 1)), 1.2), 4.0)
        m0 = total_mass / (num * math.gamma(1 + 1/beta))
        
        masses = []
        remaining = total_mass
        for i in range(num):
            u = random.random()
            m = m0 * (-math.log(max(1 - u, 1e-10))) ** (1/beta)
            m = min(m, remaining * 0.3)
            m = max(m, 1e-6)
            masses.append(m)
            remaining -= m
            
        s = sum(masses)
        return [m * (total_mass / s) for m in masses] if s > 0 else masses

    @staticmethod
    def mott_size_from_mass(mass, density=2800):
        return (6 * (mass / density) / math.pi) ** (1/3)

    @staticmethod
    def generate_fragments(num, target: Satellite, m_projectile, v_rel_vec_ms, is_cat):
        v_rel_mag = np.linalg.norm(v_rel_vec_ms)
        total_mass = (target.mass + m_projectile) if is_cat else min(m_projectile * (v_rel_mag / 1000), target.mass * 0.1)
        total_mass = max(total_mass, 0.1)
        
        initial_energy = PhysicsModel.kinetic_energy(m_projectile, v_rel_mag)

        masses = PhysicsModel.grady_kipp_mass_distribution(num, total_mass, v_rel_mag)
        dvs_ric = PhysicsModel.momentum_delta_v_ric(masses, v_rel_mag)

        frags = []
        for i in range(num):
            m = masses[i]
            dv_eci = PhysicsModel.get_eci_velocity(dvs_ric[i], target.r_eci, target.v_eci)
            
            if np.linalg.norm(dv_eci) < MIN_DV_THRESHOLD:
                continue

            size = PhysicsModel.mott_size_from_mass(m)
            area = math.pi * (size / 2) ** 2
            am = area / m if m > 1e-8 else 0

            frags.append(Fragment(
                fid=len(frags), mass_kg=round(m, 8), size_m=round(size, 6),
                delta_v=np.round(dv_eci, 4).tolist(), 
                area_to_mass=round(am, 6),
            ))

        PhysicsModel.normalize_budget(frags, initial_energy)
        
        return frags



def simulate(mass1, mass2, vel_kmps, alt_km=800, inclination_deg=0.0, lc_min=0.1):
    v_ms = vel_kmps * 1000
    
    r_mag = EARTH_R + alt_km
    v_orb = math.sqrt(MU / r_mag)
    inc_rad = math.radians(inclination_deg)
    
    target_sat = Satellite(
        sid=1, mass=mass1, 
        r_eci=np.array([r_mag, 0.0, 0.0]), 
        v_eci=np.array([0.0, v_orb * math.cos(inc_rad), v_orb * math.sin(inc_rad)])
    )
    
    v_rel_vec = np.array([v_ms, 0, 0]) 

    energy = PhysicsModel.kinetic_energy(mass2, v_ms)
    se = energy / mass1 if mass1 > 0 else 0
    cat = se >= CATASTROPHIC_THRESHOLD

    total_breakup_mass = mass1 + mass2 if cat else mass2 * (v_ms / 1000)
    nf_initial = PhysicsModel.fragment_count(total_breakup_mass, lc_min)

    frags = PhysicsModel.generate_fragments(nf_initial, target_sat, mass2, v_rel_vec, cat)
    
    for f in frags:
        f.velocity = (target_sat.v_eci + (np.array(f.delta_v) / 1000.0)).tolist()
        f.position = target_sat.r_eci.tolist()

    return CollisionResult(
        is_catastrophic=cat,
        energy_joules=round(energy, 2),
        specific_energy_jkg=round(se, 2),
        num_fragments=len(frags), 
        fragments=frags,
        params={"mass1": mass1, "mass2": mass2, "vel": vel_kmps, "alt": alt_km},
        model_name="Physics (RIC-ECI Optimized + Energy Budget)",
    )



def simulate_nasa(mass1, mass2, vel_kmps, alt_km=800, inclination_deg=0.0, lc_min=0.1):
    try:
        from kesspy import Satellite as KessSat, CollisionEvent, run_collision
    except ImportError:
        log.error("kesspy not installed")
        return None

    r = EARTH_R + alt_km
    v_orb = math.sqrt(MU / r)
    inc_rad = math.radians(inclination_deg)
    vy = v_orb * math.cos(inc_rad)
    vz = v_orb * math.sin(inc_rad)

    pos1 = np.array([r, 0.0, 0.0], dtype=np.float32)
    vel1 = np.array([0.0, vy, vz], dtype=np.float32)
    pos2 = np.array([r, 0.0, 0.0], dtype=np.float32)
    vel2 = np.array([0.0, vy - vel_kmps, vz], dtype=np.float32)

    s1 = KessSat(pos1, vel1, np.float32(mass1))
    s2 = KessSat(pos2, vel2, np.float32(mass2))
    event = CollisionEvent(s1, s2, np.float32(lc_min))
    raw = run_collision(event)

    frags = []
    for i, f in enumerate(raw):
        arr = np.asarray(f, dtype=np.float64)
        dv = arr[6].tolist() if arr.shape[0] > 6 else [0, 0, 0]
        mass = float(arr[4][0]) if arr.shape[0] > 4 else 0.001
        lc = float(arr[2][0]) if arr.shape[0] > 2 else 0.01
        am = float(arr[5][0]) if arr.shape[0] > 5 else 0.01
        

        f_obj = Fragment(fid=len(frags), mass_kg=round(mass, 8), size_m=round(lc, 6),
                              delta_v=[round(dv[0], 4), round(dv[1], 4), round(dv[2], 4)],
                              area_to_mass=round(am, 6))
        f_obj.velocity = (vel1 + (np.array(f_obj.delta_v) / 1000.0)).tolist()
        f_obj.position = pos1.tolist()
        frags.append(f_obj)

    v_ms = vel_kmps * 1000
    energy = 0.5 * mass2 * v_ms ** 2
    se = energy / mass1 if mass1 > 0 else 0

    return CollisionResult(
        is_catastrophic=se >= CATASTROPHIC_THRESHOLD,
        energy_joules=round(energy, 2),
        specific_energy_jkg=round(se, 2),
        num_fragments=len(frags),
        fragments=frags,
        params={"mass1": mass1, "mass2": mass2, "vel": vel_kmps, "alt": alt_km},
        model_name="NASA Standard Breakup Model (KessPy)",
    )



def compare_models(mass1, mass2, vel_kmps, alt_km=800, inclination_deg=0.0, lc_min=0.1):
    our = simulate(mass1, mass2, vel_kmps, alt_km, inclination_deg, lc_min)
    nasa = simulate_nasa(mass1, mass2, vel_kmps, alt_km, inclination_deg, lc_min)

    if not nasa:
        return {"error": "NASA model unavailable", "our_model": _to_dict(our)}

    metrics = _compute_metrics(our, nasa, alt_km, inclination_deg)

    return {
        "our_model": _to_dict(our),
        "nasa_model": _to_dict(nasa),
        "metrics": metrics,
    }

def _compute_metrics(our, nasa, parent_alt, inclination_deg):
    our_speeds = [np.linalg.norm(f.delta_v) for f in our.fragments]
    nasa_speeds = [np.linalg.norm(f.delta_v) for f in nasa.fragments]

    our_masses = sorted([f.mass_kg for f in our.fragments])
    nasa_masses = sorted([f.mass_kg for f in nasa.fragments])

    our_alts = _compute_alts(our.fragments, parent_alt, inclination_deg)
    nasa_alts = _compute_alts(nasa.fragments, parent_alt, inclination_deg)

    count_err = (our.num_fragments - nasa.num_fragments) / max(nasa.num_fragments, 1) * 100
    speed_err = abs(np.mean(our_speeds) - np.mean(nasa_speeds)) if nasa_speeds and our_speeds else 0
    alt_err = abs(np.mean(our_alts) - np.mean(nasa_alts)) if nasa_alts and our_alts else 0
    mass_kl = _kl_divergence(our_masses, nasa_masses)

    count_score = max(0, 100 - abs(count_err))
    speed_score = max(0, 100 - speed_err * 0.1)
    alt_score = max(0, 100 - alt_err * 0.5)
    mass_score = max(0, 100 - mass_kl * 100)
    overall = count_score * 0.25 + speed_score * 0.25 + alt_score * 0.25 + mass_score * 0.25

    return {
        "count_error_pct": round(count_err, 1),
        "speed_mean_our": round(float(np.mean(our_speeds)), 2) if our_speeds else 0,
        "speed_mean_nasa": round(float(np.mean(nasa_speeds)), 2) if nasa_speeds else 0,
        "speed_mse": round(speed_err, 2),
        "alt_mean_our": round(float(np.mean(our_alts)), 1) if our_alts else 0,
        "alt_mean_nasa": round(float(np.mean(nasa_alts)), 1) if nasa_alts else 0,
        "alt_mse_km": round(alt_err, 1),
        "mass_kl_divergence": round(mass_kl, 4),
        "count_score": round(count_score, 1),
        "speed_score": round(speed_score, 1),
        "alt_score": round(alt_score, 1),
        "mass_score": round(mass_score, 1),
        "overall_score": round(overall, 1),
    }

def _compute_alts(fragments, parent_alt, inclination_deg):
    parent_r = (EARTH_R + parent_alt) * 1000
    parent_vel_mag = math.sqrt(MU * 1e6 / parent_r)
    
    inc_rad = math.radians(inclination_deg)
    parent_vel_vec = np.array([0.0, parent_vel_mag * math.cos(inc_rad), parent_vel_mag * math.sin(inc_rad)])
    
    alts = []
    for f in fragments:
        dv = np.array(f.delta_v)
        
        new_vel_vec = parent_vel_vec + dv
        new_vel_mag = np.linalg.norm(new_vel_vec)
        
        energy = (new_vel_mag**2) / 2 - (MU * 1e6 / parent_r)
        if energy < 0:
            a = -MU * 1e6 / (2 * energy) / 1000
            alts.append(max(100, min(a - EARTH_R, 5000)))
        else:
            alts.append(parent_alt) 
    return alts

def _kl_divergence(p_samples, q_samples, bins=50):
    if not p_samples or not q_samples:
        return 0
    lo = min(min(p_samples), min(q_samples))
    hi = max(max(p_samples), max(q_samples))
    if hi <= lo:
        return 0
    p_hist, _ = np.histogram(p_samples, bins=bins, range=(lo, hi), density=True)
    q_hist, _ = np.histogram(q_samples, bins=bins, range=(lo, hi), density=True)
    p_hist = p_hist + 1e-10
    q_hist = q_hist + 1e-10
    p_hist = p_hist / p_hist.sum()
    q_hist = q_hist / q_hist.sum()
    return float(np.sum(p_hist * np.log(p_hist / q_hist)))

def _to_dict(result):
    frags = [{"fid": f.fid, "mass_kg": f.mass_kg, "size_m": f.size_m,
              "delta_v": f.delta_v, "velocity": f.velocity, "position": f.position, "am": f.area_to_mass} for f in result.fragments[:1000]]
    speeds = [np.linalg.norm(f.delta_v) for f in result.fragments]
    return {
        "model_name": result.model_name,
        "is_catastrophic": result.is_catastrophic,
        "energy_joules": result.energy_joules,
        "specific_energy_jkg": result.specific_energy_jkg,
        "num_fragments": result.num_fragments,
        "fragments": frags,
        "speed_mean": round(float(np.mean(speeds)), 2) if speeds else 0,
        "speed_max": round(float(max(speeds)), 2) if speeds else 0,
        "mass_total": round(sum(f.mass_kg for f in result.fragments), 2),
    }


SCENARIOS = {
    "fengyun1c": {"name": "Fengyun-1C ASAT", "desc": "2007'de Çin'in test amacıyla vurduğu uydu (Tarihin en büyük enkaz bulutu).", "mass1": 750, "mass2": 600, "vel": 8.0, "alt": 865, "inc": 98.6},
    "iridium_cosmos": {"name": "Iridium-Cosmos", "desc": "2009'da iki iletişim uydusunun kazara kafa kafaya çarpıştığı yörünge kazası.", "mass1": 560, "mass2": 689, "vel": 11.7, "alt": 790, "inc": 86.4},
    "cosmos1408": {"name": "Cosmos 1408 ASAT", "desc": "2021'de anti-uydu füzesiyle yaratılan devasa hedef patlaması.", "mass1": 2200, "mass2": 500, "vel": 7.4, "alt": 480, "inc": 82.6},
    "small_debris": {"name": "Small debris hit", "desc": "Küçük bir boya veya somun parçasının (~500gr) 10km/s hızla koca bir uyduya çarpması.", "mass1": 400, "mass2": 0.5, "vel": 10.0, "alt": 650, "inc": 90.0},
}

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    for name, s in SCENARIOS.items():
        print(f"\n{'='*60}")
        print(f" {s['name']}")
        print(f"{'='*60}")
        result = compare_models(s["mass1"], s["mass2"], s["vel"], s["alt"], s.get("inc", 0.0))
        if "error" in result:
            print(f"  Error: {result['error']}")
            continue
        our = result["our_model"]
        nasa = result["nasa_model"]
        m = result["metrics"]
        print(f"  Bizim ({our['model_name']}):")
        print(f"    Fragments: {our['num_fragments']} | Speed avg: {our['speed_mean']} m/s | Mass total: {our['mass_total']} kg")
        print(f"  NASA ({nasa['model_name']}):")
        print(f"    Fragments: {nasa['num_fragments']} | Speed avg: {nasa['speed_mean']} m/s | Mass total: {nasa['mass_total']} kg")
        print(f"  Metrikler:")
        print(f"    Count err: {m['count_error_pct']}% | Speed MSE: {m['speed_mse']} m/s | Alt MSE: {m['alt_mse_km']} km")
        print(f"    Mass KL: {m['mass_kl_divergence']} | Overall: {m['overall_score']}%")