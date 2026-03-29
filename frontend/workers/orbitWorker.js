import * as satellite from 'satellite.js'

let satrecs = []

self.onmessage = (e) => {
  const { type, data } = e.data

  if (type === 'init') {
    satrecs = []
    for (const sat of data.satellites) {
      try {
        const satrec = satellite.twoline2satrec(sat.tle1, sat.tle2)
        satrecs.push({
          satrec, id: sat.id, name: sat.name, type: sat.type,
          country: sat.country, rcs: sat.rcs, isTurkish: sat.isTurkish,
        })
      } catch (e) {}
    }
    self.postMessage({ type: 'ready', count: satrecs.length })
    propagate(Date.now())
  }

  if (type === 'propagate') {
    propagate(data.time)
  }
}

function propagate(timeMs) {
  const date = new Date(timeMs)
  const gmst = satellite.gstime(date)

  const ids = []
  const names = []
  const types = []
  const countries = []
  const rcsArr = []
  const turkishArr = []
  const px = [], py = [], pz = []
  const vx = [], vy = [], vz = []
  const glat = [], glon = [], galt = []

  for (let i = 0; i < satrecs.length; i++) {
    const s = satrecs[i]
    try {
      const pv = satellite.propagate(s.satrec, date)
      if (!pv.position || pv.position === false) continue
      const geo = satellite.eciToGeodetic(pv.position, gmst)

      ids.push(s.id)
      names.push(s.name)
      types.push(s.type)
      countries.push(s.country)
      rcsArr.push(s.rcs)
      turkishArr.push(s.isTurkish)

      px.push(pv.position.x)
      py.push(pv.position.y)
      pz.push(pv.position.z)
      vx.push(pv.velocity.x)
      vy.push(pv.velocity.y)
      vz.push(pv.velocity.z)

      glat.push(satellite.degreesLat(geo.latitude))
      glon.push(satellite.degreesLong(geo.longitude))
      galt.push(geo.height)
    } catch (e) {}
  }

  self.postMessage({
    type: 'positions',
    time: timeMs,
    count: ids.length,
    ids, names, types, countries, rcs: rcsArr, turkish: turkishArr,
    px, py, pz, vx, vy, vz, glat, glon, galt,
  })
}