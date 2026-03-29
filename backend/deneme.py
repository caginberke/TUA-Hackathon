import numpy as np
import json
from kesspy import Satellite, run_collision, CollisionEvent

def simulate_and_save():
    try:
        print("--- NASA Standard Breakup Model Simülasyonu Başlatıldı ---")

        # 1. UYDULARI OLUŞTUR
        pos1 = np.array([0.0, 0.0, 7171.0], dtype=np.float32)
        vel1 = np.array([7.5, 0.0, 0.0], dtype=np.float32)
        s1 = Satellite(pos1, vel1, np.float32(750.0))

        pos2 = np.array([0.0, 0.0, 7171.0], dtype=np.float32)
        vel2 = np.array([-0.5, 0.0, 0.0], dtype=np.float32)
        s2 = Satellite(pos2, vel2, np.float32(600.0))

        # 2. ÇARPIŞMA OLAYI
        lc_min = np.float32(0.01)
        event = CollisionEvent(s1, s2, lc_min)

        # 3. SİMÜLASYONU ÇALIŞTIR
        print("Çarpışma hesaplanıyor...")
        frags = run_collision(event)
        
        total_frags = len(frags)
        print(f"BAŞARILI! Toplam {total_frags} adet fragment oluştu.")

        # ====================== TAM YAP I ANALİZİ ======================
        print("\n" + "="*80)
        print("🚨 FRAGMENT YAPISI - TAM İÇERİK ANALİZİ (ilk 2 parça)")
        print("="*80)
        
        for k in range(min(2, total_frags)):
            item = frags[k]
            print(f"\nFragment #{k}:")
            print(f"   Tip             : {type(item)}")
            print(f"   Shape           : {getattr(item, 'shape', 'Yok')}")
            print(f"   ndim            : {getattr(item, 'ndim', 'Yok')}")
            print(f"   dtype           : {getattr(item, 'dtype', 'Yok')}")
            print(f"   Tam İçerik      :\n{item.tolist()}\n")
        # ============================================================

        # 4. VERİLERİ PARSE ET (şimdi 2D yapıya göre)
        debris_list = []
        
        for i in range(total_frags):
            item = frags[i]
            
            try:
                if isinstance(item, np.ndarray) and item.ndim == 2:
                    # 2D Array parsing (shape muhtemelen (6,3) veya (8,3))
                    arr = item  # okunabilirlik için
                    
                    # Tahmini indeksler (debug çıktısına göre ayarlanacak)
                    v_vec = np.asarray(arr[3] if arr.shape[0] > 3 else arr[0], dtype=np.float64).flatten()  # velocity
                    p_vec = np.asarray(arr[1] if arr.shape[0] > 1 else [0,0,7171], dtype=np.float64).flatten()  # position
                    
                    mass = float(arr[4][0]) if arr.shape[0] > 4 and len(arr[4]) > 0 else 0.1
                    lc   = float(arr[2][0]) if arr.shape[0] > 2 and len(arr[2]) > 0 else 0.01
                    
                    parse_method = f"2D ndarray (shape={arr.shape})"
                
                else:
                    raise ValueError("Beklenmeyen tip")

                if i < 3:   # ilk 3 parçada kontrol
                    speed = np.linalg.norm(v_vec)
                    print(f"Fragment {i} → {parse_method} | Hız: {speed:.3f} km/s | Mass: {mass:.6f} | Lc: {lc:.4f}")

            except Exception as e:
                if i == 0:
                    print(f"⚠️ Parsing hatası (ilk fragment): {e}")
                v_vec = np.zeros(3, dtype=np.float64)
                p_vec = np.array([0.0, 0.0, 7171.0], dtype=np.float64)
                mass = 0.1
                lc = 0.01

            debris_list.append({
                "id": i,
                "velocity": v_vec.tolist(),
                "position": p_vec.tolist(),
                "mass": float(mass),
                "lc": float(lc)
            })

        # 5. İSTATİSTİKLER
        speeds = [np.linalg.norm(d["velocity"]) for d in debris_list]

        print(f"\n--- Simülasyon İstatistikleri ---")
        print(f"Toplam parça          : {len(speeds)}")
        print(f"Maksimum Debris Hızı  : {max(speeds):.2f} km/s")
        print(f"Ortalama Debris Hızı  : {np.mean(speeds):.2f} km/s")
        print(f"Minimum Debris Hızı   : {min(speeds):.2f} km/s")

        # 6. JSON
        with open("simulation_results.json", "w") as f_out:
            json.dump(debris_list, f_out, indent=2)
        
        print("\nVeriler 'simulation_results.json' dosyasına başarıyla yazıldı!")

    except Exception as e:
        print(f"\nBüyük Hata: {e}")
        
if __name__ == "__main__":
    simulate_and_save()