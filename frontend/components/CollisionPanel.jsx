import { useState } from 'react'

const SCENARIOS = {
  gokturk2_debris: { label: 'Gokturk-2 + debris', mass1: 400, mass2: 0.5, vel: 7.5, angle: 45 },
  fengyun1c: { label: 'Fengyun-1C (2007)', mass1: 750, mass2: 600, vel: 8.0, angle: 90 },
  iridium_cosmos: { label: 'Iridium-Cosmos (2009)', mass1: 560, mass2: 689, vel: 11.7, angle: 90 },
  sandbox: { label: 'Sandbox', mass1: 100, mass2: 1, vel: 10, angle: 90 },
}

export default function CollisionPanel({ onCollide, result }) {
  const [key, setKey] = useState('gokturk2_debris')
  const [params, setParams] = useState({ ...SCENARIOS.gokturk2_debris })
  const [busy, setBusy] = useState(false)

  const pick = (k) => { setKey(k); setParams({ ...SCENARIOS[k] }) }
  const set = (k, v) => setParams(p => ({ ...p, [k]: parseFloat(v) || 0 }))

  const run = async () => {
    setBusy(true)
    await onCollide({ mass1_kg: params.mass1, mass2_kg: params.mass2, velocity_rel_kmps: params.vel, angle_deg: params.angle })
    setBusy(false)
  }

  return (
    <div className="panel">
      <h3>Carpissma simulasyonu</h3>
      <div className="scn-row">
        {Object.entries(SCENARIOS).map(([k, s]) => (
          <button key={k} className={`scn-btn ${key === k ? 'active' : ''}`} onClick={() => pick(k)}>{s.label}</button>
        ))}
      </div>
      <div className="info-grid" style={{ marginTop: 8 }}>
        <span className="lbl">Cisim 1 (kg)</span>
        <input type="number" value={params.mass1} onChange={e => set('mass1', e.target.value)} />
        <span className="lbl">Cisim 2 (kg)</span>
        <input type="number" value={params.mass2} onChange={e => set('mass2', e.target.value)} />
        <span className="lbl">Hiz (km/s)</span>
        <input type="number" step="0.1" value={params.vel} onChange={e => set('vel', e.target.value)} />
        <span className="lbl">Aci (°)</span>
        <input type="number" value={params.angle} onChange={e => set('angle', e.target.value)} />
      </div>
      <button className="sim-btn" onClick={run} disabled={busy}>{busy ? 'Hesaplaniyor...' : 'CARPTIR'}</button>

      {result && (
        <div style={{ marginTop: 10 }}>
          <span className={`badge ${result.is_catastrophic ? 'cat' : 'noncat'}`}>
            {result.is_catastrophic ? 'CATASTROPHIC' : 'Non-catastrophic'}
          </span>
          <div className="info-grid" style={{ marginTop: 6 }}>
            <span className="lbl">Fragment</span><span style={{ color: '#f44' }}>{result.num_fragments?.toLocaleString()}</span>
            <span className="lbl">Enerji</span><span>{(result.energy_joules / 1e9).toFixed(2)} GJ</span>
            <span className="lbl">Sp. enerji</span><span>{result.specific_energy_jg?.toFixed(1)} J/g</span>
          </div>
        </div>
      )}
    </div>
  )
}