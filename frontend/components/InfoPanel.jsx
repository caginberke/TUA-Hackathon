export default function InfoPanel({ sat, onDetonate }) {
    if (!sat) {
      return (
        <div className="panel">
          <h3>Uydu bilgisi</h3>
          <p className="hint">Globe'da bir cismi secin</p>
        </div>
      )
    }
  
    const speed = Math.sqrt(sat.vx * sat.vx + sat.vy * sat.vy + sat.vz * sat.vz)
  
    return (
      <div className="panel">
        <h3 style={{ color: sat.isTurkish ? '#ffd700' : '#88aacc' }}>{sat.name || 'Bilinmeyen'}</h3>
        <div className="info-grid">
          <span className="lbl">NORAD</span><span>{sat.id}</span>
          <span className="lbl">Tip</span><span>{sat.type}</span>
          <span className="lbl">Ulke</span><span>{sat.country || '—'}</span>
          <span className="lbl">Irtifa</span><span>{sat.alt?.toFixed(1)} km</span>
          <span className="lbl">Hiz</span><span>{speed.toFixed(2)} km/s</span>
          <span className="lbl">Enlem</span><span>{sat.lat?.toFixed(2)}°</span>
          <span className="lbl">Boylam</span><span>{sat.lon?.toFixed(2)}°</span>
          <span className="lbl">RCS</span><span>{sat.rcs || '—'}</span>
        </div>
        <button className="sim-nav" style={{marginTop:'12px', width:'100%', background:'#ff3300', color:'#fff', border:'none', padding:'8px', borderRadius:'4px', cursor:'pointer'}} 
                onClick={onDetonate}>
          💥 Bu Uyduda Patlama Simüle Et
        </button>
      </div>
    )
  }