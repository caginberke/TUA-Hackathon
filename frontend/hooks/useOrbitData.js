import { useState, useEffect, useCallback, useRef } from 'react'

const TURKISH_IDS = new Set([39030, 39522, 40984, 47306, 60233, 41875, 33056, 39152, 50212])
const REPROPAGATE_MS = 30000

export default function useOrbitData(apiUrl) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [stats, setStats] = useState({ total: 0, payload: 0, debris: 0, rocket: 0 })

  const orbitDataRef = useRef({
    count: 0,
    ids: [], names: [], types: [], countries: [], rcs: [], turkish: [],
    pos: null, vel: null, geo: null,
    baseTime: 0,
    ready: false,
  })

  const workerRef = useRef(null)
  const repropRef = useRef(null)
  const simTimeRef = useRef(Date.now())

  useEffect(() => {
    const worker = new Worker(
      new URL('../workers/orbitWorker.js', import.meta.url),
      { type: 'module' }
    )
    workerRef.current = worker

    worker.onmessage = (e) => {
      const d = e.data
      if (d.type === 'ready') setLoading(false)
      if (d.type === 'positions') {
        const n = d.count
        const pos = new Float64Array(n * 3)
        const vel = new Float64Array(n * 3)
        const geo = new Float64Array(n * 3)
        for (let i = 0; i < n; i++) {
          pos[i * 3] = d.px[i]; pos[i * 3 + 1] = d.py[i]; pos[i * 3 + 2] = d.pz[i]
          vel[i * 3] = d.vx[i]; vel[i * 3 + 1] = d.vy[i]; vel[i * 3 + 2] = d.vz[i]
          geo[i * 3] = d.glat[i]; geo[i * 3 + 1] = d.glon[i]; geo[i * 3 + 2] = d.galt[i]
        }
        orbitDataRef.current = {
          count: n,
          ids: d.ids, names: d.names, types: d.types,
          countries: d.countries, rcs: d.rcs, turkish: d.turkish,
          pos, vel, geo,
          baseTime: d.time,
          ready: true,
        }
      }
    }

    async function load() {
      try {
        setLoading(true)
        const res = await fetch(`${apiUrl}/api/tle/all`)
        if (!res.ok) throw new Error('API error')
        const data = await res.json()

        const sats = data.satellites.map(s => ({
          ...s, isTurkish: TURKISH_IDS.has(Number(s.id)),
        }))

        const tc = {}
        for (const s of sats) tc[s.type] = (tc[s.type] || 0) + 1
        setStats({
          total: sats.length,
          payload: tc['PAYLOAD'] || 0,
          debris: tc['DEBRIS'] || 0,
          rocket: tc['ROCKET BODY'] || 0,
        })

        worker.postMessage({ type: 'init', data: { satellites: sats } })
        setError(null)

        repropRef.current = setInterval(() => {
          worker.postMessage({ type: 'propagate', data: { time: simTimeRef.current } })
        }, REPROPAGATE_MS)

      } catch (e) {
        setError('Backend baglantisi kurulamadi')
        setLoading(false)
      }
    }
    load()

    return () => {
      worker.terminate()
      if (repropRef.current) clearInterval(repropRef.current)
    }
  }, [apiUrl])

  const requestPropagate = useCallback((timeMs) => {
    simTimeRef.current = timeMs
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'propagate', data: { time: timeMs } })
    }
  }, [])

  return { orbitDataRef, loading, error, stats, requestPropagate, simTimeRef }
}