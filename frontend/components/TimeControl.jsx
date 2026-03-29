import { useState, useEffect, useRef } from 'react'

const SPEEDS = [1, 10, 100, 1000]

function fmt(d) {
  const p = n => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth()+1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} UTC`
}

function fmtInput(d) {
  const p = n => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth()+1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
}

export default function TimeControl({ time, onTimeChange, onTimeScrub, speed, onSpeedChange }) {
  const [playing, setPlaying] = useState(false)
  const intervalRef = useRef(null)

  useEffect(() => {
    if (playing) {
      intervalRef.current = setInterval(() => {
        onTimeChange(prev => new Date(prev.getTime() + speed * 1000))
      }, 50)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [playing, speed, onTimeChange])

  const jump = (ms) => {
    setPlaying(false)
    const next = new Date(time.getTime() + ms)
    onTimeScrub(next)
  }

  const reset = () => {
    setPlaying(false)
    onTimeScrub(new Date())
  }

  const handleDateInput = (e) => {
    const d = new Date(e.target.value + 'Z')
    if (!isNaN(d.getTime())) {
      setPlaying(false)
      onTimeScrub(d)
    }
  }

  const handleSlider = (e) => {
    setPlaying(false)
    const next = new Date(Date.now() + parseFloat(e.target.value) * 3600000)
    onTimeScrub(next)
  }

  const diffH = (time.getTime() - Date.now()) / 3600000

  return (
    <div className="time-control">
      <div className="time-buttons">
        <button onClick={() => jump(-3600000)}>◀◀</button>
        <button onClick={() => jump(-360000)}>◀</button>
        <button onClick={() => setPlaying(p => !p)} className={playing ? 'active' : ''}>
          {playing ? '⏸' : '▶'}
        </button>
        <button onClick={() => jump(360000)}>▶</button>
        <button onClick={() => jump(3600000)}>▶▶</button>
        <button onClick={reset}>Simdi</button>
      </div>
      <div className="speed-selector">
        {SPEEDS.map(s => (
          <button key={s} className={speed === s ? 'active' : ''} onClick={() => onSpeedChange(s)}>{s}x</button>
        ))}
      </div>
      <input type="range" className="time-slider" min={-168} max={168} step={1}
        value={Math.max(-168, Math.min(168, Math.round(diffH)))}
        onChange={handleSlider} />
      <input type="datetime-local" className="date-input" value={fmtInput(time)} onChange={handleDateInput} />
      <span className="time-display">{fmt(time)}</span>
    </div>
  )
}