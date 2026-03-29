import { useState, useCallback } from 'react'
import Globe from '../components/Globe'
import InfoPanel from '../components/InfoPanel'
import TimeControl from '../components/TimeControl'
import SimulationView from '../components/SimulationView'
import useOrbitData from '../hooks/useOrbitData'
import './App.css'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const EARTH_TEX = '/earth.jpg'

export default function App() {
  const [mode, setMode] = useState('world')
  const [selectedSat, setSelectedSat] = useState(null)
  const [simTime, setSimTime] = useState(() => new Date())
  const [speed, setSpeed] = useState(1)
  const [fragments, setFragments] = useState([])
  const [collisionTime, setCollisionTime] = useState(0)
  const [fragAltKm, setFragAltKm] = useState(800)
  const [fragIncDeg, setFragIncDeg] = useState(0)
  const [appliedScenario, setAppliedScenario] = useState(null)

  const { orbitDataRef, loading, error, stats, requestPropagate, simTimeRef } = useOrbitData(API)

  const handleTimeChange = useCallback((fn) => {
    const t = typeof fn === 'function' ? fn(simTime) : fn
    setSimTime(t); simTimeRef.current = t.getTime()
  }, [simTime, simTimeRef])

  const handleTimeScrub = useCallback((fn) => {
    const t = typeof fn === 'function' ? fn(simTime) : fn
    setSimTime(t); simTimeRef.current = t.getTime(); requestPropagate(t.getTime())
  }, [simTime, simTimeRef, requestPropagate])

  const handleApply = useCallback((data) => {
    // simTimeRef degismiyor — kesintisiz gecis
    setFragments(data.fragments || [])
    setCollisionTime(data.collisionTime || 0)
    setFragAltKm(data.altKm || 800)
    setFragIncDeg(data.inclinationDeg || 0)
    setAppliedScenario(data.scenario)
    setMode('world')
  }, [])

  if (mode === 'simulation') {
    return (
      <div className="app">
        <SimulationView onApplyToWorld={handleApply} onBack={() => { simTimeRef.current = Date.now(); setMode('world') }}
          orbitDataRef={orbitDataRef} simTimeRef={simTimeRef} selectedSat={selectedSat}/>
      </div>
    )
  }

  return (
    <div className="app">
      <div className="stats-bar">
        <span>Cisim: <b>{stats.total.toLocaleString()}</b></span>
        <span>Uydu: <b>{stats.payload.toLocaleString()}</b></span>
        <span>Debris: <b>{stats.debris.toLocaleString()}</b></span>
        <span>Roket: <b>{stats.rocket.toLocaleString()}</b></span>
        {fragments.length > 0 && <span>Fragment: <b className="fc">{fragments.length}</b></span>}
        {appliedScenario && <span className="applied">Senaryo: {appliedScenario}</span>}
        <span style={{ flex: 1 }} />
        <button className="sim-nav" onClick={() => setMode('simulation')}>Simulasyon modu →</button>
      </div>
      <div className="viewport">
        <div className="globe-wrap">
          <Globe orbitDataRef={orbitDataRef} simTimeRef={simTimeRef}
            fragments={fragments} collisionTime={collisionTime} fragAltKm={fragAltKm} fragIncDeg={fragIncDeg}
            selectedSat={selectedSat} onSelectSat={setSelectedSat} textureUrl={EARTH_TEX}/>
          {loading && <div className="load-msg">Veriler yukleniyor...</div>}
          {error && <div className="err-msg">{error}</div>}
          <div className="legend">
            <div className="lg-item"><span className="lg-dot" style={{background:'#ffd700'}}/> Turk uydusu</div>
            <div className="lg-item"><span className="lg-dot" style={{background:'#4488ff'}}/> Aktif uydu</div>
            <div className="lg-item"><span className="lg-dot" style={{background:'#888'}}/> Debris</div>
            <div className="lg-item"><span className="lg-dot" style={{background:'#ff4444'}}/> Roket govdesi</div>
            {fragments.length > 0 && <div className="lg-item"><span className="lg-dot" style={{background:'#ff3300'}}/> Fragment</div>}
          </div>
        </div>
        <div className="panels">
          <InfoPanel sat={selectedSat} onDetonate={() => setMode('simulation')}/>
        </div>
      </div>
      <TimeControl time={simTime} onTimeChange={handleTimeChange}
        onTimeScrub={handleTimeScrub} speed={speed} onSpeedChange={setSpeed}/>
    </div>
  )
}