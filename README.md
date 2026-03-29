# Gerçek Zamanlı Uzay Çöpü & Çarpışma Simülatörü

> **TUA (Türkiye Uzay Ajansı) Hackathon 2025 Projesi**  
> Dünya yörüngesindeki 35.000+ nesneyi gerçek TLE verileriyle görselleştiren, fizik tabanlı uzay çarpışma simülasyonu ve karşılaştırmalı model analizi platformu.

---

## 🗂️ Proje Yapısı

```
zabitasakir/
├── backend/              # Python FastAPI sunucusu
│   ├── main.py           # API endpoint'leri
│   ├── collision_engine.py  # Fizik motoru (Grady-Kipp + NASA KessPy)
│   ├── orbit_engine.py   # SGP4 yörünge hesaplamaları
│   ├── data_collector.py # TLE veri toplayıcı (CelesTrak)
│   └── requirements.txt  # Python bağımlılıkları
├── frontend/             # React + Vite uygulaması
│   ├── src/App.jsx       # Ana uygulama bileşeni
│   ├── components/       # Globe, SimGlobe, SimulationView...
│   ├── hooks/            # useOrbitData (TLE propagasyon)
│   └── public/           # Statik dosyalar (earth.jpg vb.)
└── data/                 # Yerel TLE veri dosyaları (JSON)
    ├── all_objects.json   # Tüm yörüngedeki nesneler
    └── turkish_sats.json  # Türkiye uydularının TLE'leri
```

---

## ⚙️ Gereksinimler

| Araç | Minimum Sürüm | Kontrol |
|------|---------------|---------|
| Python | 3.10+ | `python --version` |
| Node.js | 18+ | `node --version` |
| npm | 9+ | `npm --version` |

---

## 🚀 Kurulum ve Çalıştırma

Projeyi çalıştırmak için **iki terminal** açmanız gerekecektir: biri Backend, biri Frontend için.

### 1. Depoyu Klonla

```bash
git clone <repo-url>
cd zabitasakir
```

---

### 2. Backend Kurulumu (Terminal 1)

```bash
cd backend
```

**Sanal ortam oluştur ve aktive et:**

```bash
# macOS / Linux
python3 -m venv venv
source venv/bin/activate

# Windows
python -m venv venv
venv\Scripts\activate
```

**Bağımlılıkları yükle:**

```bash
pip install fastapi uvicorn numpy scipy pydantic kesspy
```

> ⚠️ `kesspy` paketi NASA Standard Breakup Model karşılaştırması için zorunludur.  
> Yüklenemezse sistem otomatik olarak yalnızca kendi fizik motorumuzu kullanır.

**Backend'i başlat:**

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

✅ Başarılı olursa terminalde şunu görürsünüz:
```
INFO:     Uvicorn running on http://0.0.0.0:8000
INFO:     Application startup complete.
```

Backend API dokümantasyonuna tarayıcıdan ulaşmak için: [http://localhost:8000/docs](http://localhost:8000/docs)

---

### 3. Frontend Kurulumu (Terminal 2)

```bash
cd frontend
```

**Bağımlılıkları yükle:**

```bash
npm install
```

**Geliştirme sunucusunu başlat:**

```bash
npm run dev
```

✅ Başarılı olursa terminalde şunu görürsünüz:
```
  VITE vX.X.X  ready in XXX ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: http://192.168.x.x:5173/
```

Uygulamayı açmak için: [http://localhost:5173](http://localhost:5173)

---

## 🌍 TLE Verilerini Güncelleme (Opsiyonel)

`data/` klasöründeki `.json` dosyaları CelesTrak'tan çekilmiş yörünge verilerini içerir. Verileri güncellemek isterseniz:

```bash
cd backend
python data_collector.py
```

Bu komut `all_objects.json` ve `turkish_sats.json` dosyalarını otomatik olarak günceller. İnternet bağlantısı gerektirir.

---

## 🧪 API Endpoint'leri

Tüm endpoint'ler `http://localhost:8000` üzerinden sunulur.

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| `GET` | `/api/tle/all` | Tüm kataloglanan uzay nesnelerini (TLE) döner |
| `GET` | `/api/satellites/turkish` | Türk uydularının anlık pozisyonlarını döner |
| `GET` | `/api/scenarios` | Hazır çarpışma senaryolarını listeler |
| `POST` | `/api/scenarios/custom/compare` | İki modeli (NASA vs Fizik) karşılaştırır |
| `POST` | `/api/collision/simulate` | Yalnızca kendi fizik motorumuzu çalıştırır |
| `GET` | `/api/status` | Backend sağlık kontrolü |

**Örnek `compare` isteği:**
```json
POST /api/scenarios/custom/compare
{
    "mass1_kg": 560,
    "mass2_kg": 689,
    "velocity_rel_kmps": 11.7,
    "alt_km": 790,
    "inclination_deg": 86.4
}
```

---

## 🔬 Fizik Motoru Hakkında

Bu proje iki farklı çarpışma modelini aynı anda çalıştırır ve karşılaştırır:

| | NASA Standard Breakup | Zabıta Şakir Fizik Motoru |
|---|---|---|
| **Yöntem** | Ampirik (istatistiksel) | First-principles (fizik türevli) |
| **Dağılım** | İzotropik (küresel, her yöne eşit) | RIC elipsoidal (momentum korunumu) |
| **Teori** | KessPy / EVOLVE 4.0 | Grady-Kipp + Mott Fragmentation |
| **Referans** | Johnson et al. (2001) | Grady & Kipp (1985), Mott (1947) |

---


## 🏗️ Teknoloji Yığını

**Backend:** Python · FastAPI · NumPy · SciPy · KessPy · Uvicorn  
**Frontend:** React 19 · Vite · Three.js · @react-three/fiber · @react-three/drei · satellite.js  
**Veri Kaynağı:** CelesTrak / Space-Track.org (TLE katalogları)
