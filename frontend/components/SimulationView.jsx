import { useState, useEffect, useRef } from 'react'
import SimGlobe from './SimGlobe'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const EARTH_TEX = '/earth.jpg'
const PRESETS = [
  { label: 'T+0', ms: 0 }, { label: '+1dk', ms: 60000 }, { label: '+10dk', ms: 600000 },
  { label: '+1sa', ms: 3600000 }, { label: '+6sa', ms: 21600000 }, { label: '+1gun', ms: 86400000 },
]
const PLAY_SPEEDS = [1, 10, 100, 1000, 10000]

function fmt(ms) {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `T+${s}s`
  if (s < 3600) return `T+${Math.floor(s / 60)}dk`
  if (s < 86400) return `T+${(s / 3600).toFixed(1)}sa`
  return `T+${(s / 86400).toFixed(1)}gun`
}

function InputRow({ label, value, onChange, unit }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
      <span style={{ fontSize: 11, color: '#667', width: 50, flexShrink: 0 }}>{label}</span>
      <input type="number" value={value} onChange={e => onChange(parseFloat(e.target.value) || 0)}
        style={{ flex: 1, background: '#141a2a', border: '1px solid #1e2436', borderRadius: 3, color: '#aab', padding: '4px 6px', fontSize: 11, fontFamily: 'inherit', width: 60 }} />
      {unit && <span style={{ fontSize: 10, color: '#556', width: 30 }}>{unit}</span>}
    </div>
  )
}

function MetricRow({ label, nasa, ours, unit, good }) {
  const col = good === true ? '#5dca5d' : good === false ? '#f44' : '#fa3'
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid #141a2a', fontSize: 11 }}>
      <span style={{ flex: 1, color: '#667' }}>{label}</span>
      <span style={{ width: 80, textAlign: 'right', color: '#4488ff' }}>{nasa}</span>
      <span style={{ width: 80, textAlign: 'right', color: '#ff6644' }}>{ours}</span>
      <span style={{ width: 30, textAlign: 'right', fontSize: 10, color: col }}>{unit}</span>
    </div>
  )
}

export default function SimulationView({ onApplyToWorld, onBack, orbitDataRef, simTimeRef, selectedSat }) {
  const [scenarios, setScenarios] = useState({})
  const [sel, setSel] = useState(selectedSat ? 'custom' : null)
  const isTr = selectedSat?.isTurkish
  const defMass = selectedSat ? (selectedSat.type === 'PAYLOAD' ? 1200 : selectedSat.type === 'ROCKET BODY' ? 2500 : 80) : 750
  const [mass1, setMass1] = useState(defMass)
  const [mass2, setMass2] = useState(0.5)
  const [vel, setVel] = useState(7.5)
  const [alt, setAlt] = useState(selectedSat ? Math.round(selectedSat.alt) : 865)
  const [inc, setInc] = useState(90.0) // Tahmini kutupsal egim
  const [nasaFrags, setNasaFrags] = useState([])
  const [ourFrags, setOurFrags] = useState([])
  const [nasaInfo, setNasaInfo] = useState(null)
  const [ourInfo, setOurInfo] = useState(null)
  const [metrics, setMetrics] = useState(null)
  const [loading, setLoading] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [kesslerEnabled, setKesslerEnabled] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [collisionTime, setCollisionTime] = useState(0)
  const [elapsedDisplay, setElapsedDisplay] = useState(0)

  const cameraStateRef = useRef(null)
  const activeSideRef = useRef('left')
  const intRef = useRef(null)

  useEffect(() => { fetch(`${API}/api/scenarios`).then(r => r.json()).then(setScenarios).catch(() => { }) }, [])

  // Playing: simTimeRef ilerler
  useEffect(() => {
    if (playing && collisionTime > 0) {
      intRef.current = setInterval(() => {
        simTimeRef.current += speed * 50
        setElapsedDisplay(simTimeRef.current - collisionTime)
      }, 50)
    }
    return () => { if (intRef.current) clearInterval(intRef.current) }
  }, [playing, speed, collisionTime, simTimeRef])

  // Sadece manual ileri/geri sarma veya play butonu ile zaman isler.

  const jumpTo = (offsetMs) => {
    setPlaying(false)
    simTimeRef.current = collisionTime + offsetMs
    setElapsedDisplay(offsetMs)
  }

  const pickScenario = (key) => {
    const s = scenarios[key]
    if (!s) return
    setSel(key)
    setMass1(s.mass1_kg); setMass2(s.mass2_kg); setVel(s.velocity_rel_kmps); setAlt(s.alt_km); setInc(s.inclination_deg || 0)
  }

  const runSim = async () => {
    setLoading(true); setNasaFrags([]); setOurFrags([])
    setMetrics(null); setPlaying(false)

    // Carpismma zamani = simdi
    const ct = Date.now()
    setCollisionTime(ct)
    simTimeRef.current = ct
    setElapsedDisplay(0)

    try {
      const body = { mass1_kg: mass1, mass2_kg: mass2, velocity_rel_kmps: vel, alt_km: alt, inclination_deg: inc }
      const url = sel ? `${API}/api/scenarios/${sel}/compare` : `${API}/api/scenarios/custom/compare`
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) throw new Error()
      const d = await res.json()
      if (d.nasa_model) { setNasaFrags(d.nasa_model.fragments || []); setNasaInfo(d.nasa_model) }
      if (d.our_model) { setOurFrags(d.our_model.fragments || []); setOurInfo(d.our_model) }
      setMetrics(d.metrics || null)
      setPlaying(true) // Otomatik olarak oynatmayi baslat
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const handleApply = () => {
    if (!onApplyToWorld || ourFrags.length === 0) return
    // simTimeRef aynen kalir — kesintisiz gecis
    onApplyToWorld({ fragments: ourFrags, collisionTime, altKm: alt, inclinationDeg: inc, scenario: sel || 'custom', metrics })
  }

  return (
    <div style={{ display: 'flex', height: '100%', background: '#000010' }}>

      {/* SOL PANEL */}
      <div style={{ width: 260, flexShrink: 0, background: '#0a0e18', borderRight: '1px solid #1a1e2a', display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
        <div style={{ padding: '8px 10px', borderBottom: '1px solid #1a1e2a' }}>
          <button onClick={onBack} style={{ fontSize: 10, padding: '4px 10px', background: '#141a2a', border: '1px solid #1e2436', borderRadius: 4, color: '#889', cursor: 'pointer', fontFamily: 'inherit', width: '100%' }}>← Dunya gorunumune don</button>
        </div>

        <div style={{ padding: '8px 10px', borderBottom: '1px solid #1a1e2a' }}>
          {selectedSat && (
            <div style={{ marginBottom: 12, padding: '8px', background: 'rgba(255,51,0,0.1)', border: '1px solid #f30', borderRadius: 4 }}>
              <div style={{ fontSize: 10, color: '#f30', textTransform: 'uppercase', marginBottom: 4 }}>Secili Hedef (Patlatilacak)</div>
              <div style={{ fontSize: 12, color: '#fff', fontWeight: 'bold' }}>{selectedSat.name}</div>
              <div style={{ fontSize: 10, color: '#aa9' }}>Tip: {selectedSat.type} | Irtifa: {selectedSat.alt?.toFixed(1)} km</div>
            </div>
          )}
          <div style={{ fontSize: 10, color: '#556', textTransform: 'uppercase', marginBottom: 6, letterSpacing: 0.5 }}>Senaryolar</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {Object.entries(scenarios).map(([k, s]) => (
              <div key={k} onClick={() => pickScenario(k)} style={{
                padding: '5px 8px', textAlign: 'left',
                background: sel === k ? 'rgba(255,100,68,0.1)' : '#141a2a',
                border: `1px solid ${sel === k ? '#f64' : '#1e2436'}`,
                borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit',
              }}>
                <div style={{ fontSize: 10, color: sel === k ? '#f64' : '#889', fontWeight: sel === k ? 'bold' : 'normal' }}>{s.name}</div>
                {s.desc && <div style={{ fontSize: 9, color: '#556', marginTop: 2, lineHeight: 1.2 }}>{s.desc}</div>}
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: '8px 10px', borderBottom: '1px solid #1a1e2a' }}>
          <div style={{ fontSize: 10, color: '#556', textTransform: 'uppercase', marginBottom: 6, letterSpacing: 0.5 }}>Parametreler</div>
          <InputRow label="Hedef" value={mass1} onChange={setMass1} unit="kg" />
          <InputRow label="Carpan" value={mass2} onChange={setMass2} unit="kg" />
          <InputRow label="Hiz" value={vel} onChange={setVel} unit="km/s" />
          <InputRow label="Irtifa" value={alt} onChange={setAlt} unit="km" />
          <InputRow label="Egim" value={inc} onChange={setInc} unit="°" />
          <button onClick={runSim} disabled={loading} style={{
            width: '100%', padding: '7px', marginTop: 4, fontSize: 11, fontWeight: 500,
            background: loading ? '#141a2a' : 'rgba(255,100,68,0.12)',
            border: '1px solid rgba(255,100,68,0.3)', borderRadius: 4,
            color: loading ? '#556' : '#f64', cursor: loading ? 'wait' : 'pointer', fontFamily: 'inherit',
          }}>{loading ? 'Hesaplaniyor...' : 'SIMULE ET'}</button>
        </div>

        {metrics && (
          <div style={{ padding: '8px 10px', borderBottom: '1px solid #1a1e2a' }}>
            <div style={{ fontSize: 10, color: '#556', textTransform: 'uppercase', marginBottom: 6, letterSpacing: 0.5 }}>Sonuclar</div>
            <div style={{ display: 'flex', padding: '2px 0', fontSize: 10, borderBottom: '1px solid #141a2a' }}>
              <span style={{ flex: 1 }}></span>
              <span style={{ width: 80, textAlign: 'right', color: '#4488ff', fontSize: 9 }}>NASA</span>
              <span style={{ width: 80, textAlign: 'right', color: '#ff6644', fontSize: 9 }}>Bizim</span>
              <span style={{ width: 30 }}></span>
            </div>
            <MetricRow label="Fragment" nasa={nasaInfo?.num_fragments?.toLocaleString()} ours={ourInfo?.num_fragments?.toLocaleString()} unit="" good={Math.abs(metrics.count_error_pct) < 20} />
            <MetricRow label="Ort. hiz" nasa={`${metrics.speed_mean_nasa}`} ours={`${metrics.speed_mean_our}`} unit="m/s" good={metrics.speed_mse < 200} />
            <MetricRow label="Ort. irtifa" nasa={`${metrics.alt_mean_nasa}`} ours={`${metrics.alt_mean_our}`} unit="km" good={metrics.alt_mse_km < 100} />
            <MetricRow label="Kutle KL" nasa="ref" ours={`${metrics.mass_kl_divergence}`} unit="" good={metrics.mass_kl_divergence < 1} />
            <div style={{ textAlign: 'center', marginTop: 8, padding: '8px 0', borderTop: '1px solid #1a1e2a' }}>
              <div style={{ fontSize: 9, color: '#556', textTransform: 'uppercase' }}>Benzerlik</div>
              <div style={{ fontSize: 32, fontWeight: 500, color: metrics.overall_score > 70 ? '#5dca5d' : metrics.overall_score > 40 ? '#fa3' : '#f44' }}>{Math.round(metrics.overall_score)}%</div>
            </div>
            {nasaInfo && (
              <div style={{ fontSize: 10, color: '#445', marginTop: 4, padding: '4px 0', borderTop: '1px solid #141a2a' }}>
                <div>Enerji: {nasaInfo.energy_joules > 1e9 ? (nasaInfo.energy_joules / 1e9).toFixed(2) + ' GJ' : (nasaInfo.energy_joules / 1e6).toFixed(1) + ' MJ'}</div>
                <div>{nasaInfo.is_catastrophic ? 'CATASTROPHIC (E/M > 40 J/g)' : 'Non-catastrophic'}</div>
              </div>
            )}
          </div>
        )}

        {ourFrags.length > 0 && (
          <div style={{ padding: '8px 10px', borderBottom: '1px solid #1a1e2a' }}>
            <label style={{ fontSize: 11, color: '#fa0', display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
              <input type="checkbox" checked={kesslerEnabled} onChange={e => setKesslerEnabled(e.target.checked)} />
              ⚡ Kessler İkincil Patlama
            </label>
            <div style={{ fontSize: 9, color: '#667', marginTop: 4, lineHeight: 1.3 }}>
              Enkaz bulutunun yörüngesi üzerindeki başka bir uyduya çarpma anını görselleştirir. Atmosferik drag etkileri de aktiftir.
            </div>
          </div>
        )}

        {ourFrags.length > 0 && (
          <div style={{ padding: '8px 10px' }}>
            <button onClick={handleApply} style={{
              width: '100%', padding: '8px', fontSize: 11, fontWeight: 500,
              background: 'rgba(93,202,93,0.1)', border: '1px solid rgba(93,202,93,0.3)',
              borderRadius: 4, color: '#5dca5d', cursor: 'pointer', fontFamily: 'inherit',
            }}>Dunyaya uygula →</button>
          </div>
        )}
      </div>

      {/* SAG: 2 GLOBE + ZAMAN */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ flex: 1, display: 'flex', minHeight: 0, position: 'relative' }}>
          {loading && <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 10, fontSize: 14, color: '#4488ff' }}>Hesaplaniyor...</div>}
          {!nasaFrags.length && !ourFrags.length && !loading && (
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', fontSize: 13, color: '#334', zIndex: 10, textAlign: 'center' }}>
              Soldan senaryo secin veya<br />parametreleri girip SIMULE ET'e basin
            </div>
          )}

          <div style={{ flex: 1, borderRight: '1px solid #1a1e2a' }}>
            <SimGlobe fragments={nasaFrags} color="#4488ff" label="NASA Standard Breakup"
              textureUrl={EARTH_TEX} count={nasaInfo?.num_fragments}
              simTimeRef={simTimeRef} collisionTime={collisionTime}
              parentAltKm={alt} cameraStateRef={cameraStateRef} side="left" activeSideRef={activeSideRef}
              modelName="Ampirik (KessPy)" orbitDataRef={orbitDataRef} kesslerEnabled={kesslerEnabled} />
          </div>
          <div style={{ flex: 1 }}>
            <SimGlobe fragments={ourFrags} color="#ff6644" label="Grady-Kipp + Mott"
              textureUrl={EARTH_TEX} count={ourInfo?.num_fragments}
              simTimeRef={simTimeRef} collisionTime={collisionTime}
              parentAltKm={alt} cameraStateRef={cameraStateRef} side="right" activeSideRef={activeSideRef}
              modelName="Zabita Sakir Fizik Modeli" orbitDataRef={orbitDataRef} kesslerEnabled={kesslerEnabled} />
          </div>
        </div>

        {(nasaFrags.length > 0 || ourFrags.length > 0) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: '#080c16', borderTop: '1px solid #1a1e2a', flexShrink: 0 }}>
            {PRESETS.map(p => (
              <button key={p.label} onClick={() => jumpTo(p.ms)} style={{
                fontSize: 10, padding: '3px 7px', background: '#141a2a',
                border: `1px solid ${Math.abs(elapsedDisplay - p.ms) < 1000 ? '#4488ff' : '#1e2436'}`,
                borderRadius: 3, color: Math.abs(elapsedDisplay - p.ms) < 1000 ? '#4488ff' : '#778',
                cursor: 'pointer', fontFamily: 'inherit',
              }}>{p.label}</button>
            ))}
            <div style={{ width: 1, height: 14, background: '#1e2436' }} />
            <button onClick={() => setPlaying(p => !p)} style={{
              fontSize: 13, padding: '2px 8px', background: playing ? 'rgba(68,136,255,0.1)' : '#141a2a',
              border: `1px solid ${playing ? '#4488ff' : '#1e2436'}`, borderRadius: 3,
              color: playing ? '#4488ff' : '#778', cursor: 'pointer', fontFamily: 'inherit',
            }}>{playing ? '||' : '>'}</button>
            {PLAY_SPEEDS.map(s => (
              <button key={s} onClick={() => setSpeed(s)} style={{
                fontSize: 9, padding: '2px 4px', background: '#141a2a',
                border: `1px solid ${speed === s ? '#4488ff' : '#1e2436'}`, borderRadius: 3,
                color: speed === s ? '#4488ff' : '#556', cursor: 'pointer', fontFamily: 'inherit',
              }}>{s}x</button>
            ))}
            <input type="range" min={0} max={86400000} step={10000} value={Math.max(0, elapsedDisplay)}
              onChange={e => jumpTo(parseInt(e.target.value))} style={{ flex: 1, accentColor: '#4488ff' }} />
            <span style={{ fontSize: 11, color: '#8ab', minWidth: 70, textAlign: 'right' }}>{fmt(Math.max(0, elapsedDisplay))}</span>
          </div>
        )}
      </div>
    </div>
  )
}