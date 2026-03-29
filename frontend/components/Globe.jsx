import { useRef, useMemo, useCallback, useState, useEffect } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Stars, Html } from '@react-three/drei'
import * as THREE from 'three'

const R = 6.371
const SCALE = 1 / 1000
const MAX_INSTANCES = 35000
const COLORS = {
  PAYLOAD: [0.27, 0.53, 1.0], 'ROCKET BODY': [1.0, 0.27, 0.27],
  DEBRIS: [0.5, 0.5, 0.5], UNKNOWN: [0.35, 0.35, 0.35], TBA: [0.35, 0.35, 0.35],
}
const GOLD = [1.0, 0.84, 0.0]
const SEL = [0.0, 1.0, 0.53]

function rodrigues(px, py, pz, vx, vy, vz, dt) {
  const r = Math.sqrt(px*px+py*py+pz*pz), v = Math.sqrt(vx*vx+vy*vy+vz*vz)
  if (r < 1 || v < 0.001) return [px, py, pz]
  const theta = (v/r)*dt
  const hx=py*vz-pz*vy, hy=pz*vx-px*vz, hz=px*vy-py*vx
  const hm = Math.sqrt(hx*hx+hy*hy+hz*hz)
  if (hm < 0.001) return [px, py, pz]
  const kx=hx/hm, ky=hy/hm, kz=hz/hm
  const c=Math.cos(theta), s=Math.sin(theta), d=kx*px+ky*py+kz*pz
  return [px*c+(ky*pz-kz*py)*s+kx*d*(1-c), py*c+(kz*px-kx*pz)*s+ky*d*(1-c), pz*c+(kx*py-ky*px)*s+kz*d*(1-c)]
}

function Earth({ textureUrl }) {
  const tex = useMemo(() => textureUrl ? new THREE.TextureLoader().load(textureUrl) : null, [textureUrl])
  return (
    <group>
      <mesh><sphereGeometry args={[R,64,64]}/>{tex?<meshStandardMaterial map={tex} roughness={0.85}/>:<meshStandardMaterial color="#1a4a7a" roughness={0.8}/>}</mesh>
      <mesh><sphereGeometry args={[R*1.008,48,48]}/><meshBasicMaterial color="#4488ff" transparent opacity={0.03} side={THREE.BackSide}/></mesh>
    </group>
  )
}

function Satellites({ orbitDataRef, simTimeRef, selectedId, onSelect, turkLabelsRef }) {
  const meshRef = useRef()
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const scenePos = useRef(new Array(MAX_INSTANCES))
  const colorAttr = useRef(null)
  const hoverMeshRef = useRef(null)
  const { camera, gl } = useThree()

  useFrame(() => {
    const data = orbitDataRef.current
    if (!data.ready || !data.pos || !meshRef.current) return
    const count = Math.min(data.count, MAX_INSTANCES)
    meshRef.current.count = count
    if (!colorAttr.current) {
      colorAttr.current = new THREE.InstancedBufferAttribute(new Float32Array(MAX_INSTANCES*3), 3)
      meshRef.current.geometry.setAttribute('color', colorAttr.current)
    }
    const pos=data.pos, vel=data.vel, dt=(simTimeRef.current-data.baseTime)/1000, colors=colorAttr.current.array
    const tl = []
    for (let i=0; i<count; i++) {
      const i3=i*3
      const [ex,ey,ez] = rodrigues(pos[i3],pos[i3+1],pos[i3+2],vel[i3],vel[i3+1],vel[i3+2],dt)
      const sx=ex*SCALE, sy=ez*SCALE, sz=-ey*SCALE
      scenePos.current[i] = [sx,sy,sz]
      dummy.position.set(sx,sy,sz)
      const isTr = data.turkish[i]
      dummy.scale.setScalar(isTr ? 0.04 : 0.008)
      dummy.updateMatrix()
      meshRef.current.setMatrixAt(i, dummy.matrix)
      const isSel = String(data.ids[i])===String(selectedId)
      const c = isSel ? SEL : isTr ? GOLD : COLORS[data.types[i]] || COLORS.UNKNOWN
      colors[i3]=c[0]; colors[i3+1]=c[1]; colors[i3+2]=c[2]
      if (isTr) tl.push({id:data.ids[i],name:data.names[i],x:sx,y:sy,z:sz,alt:data.geo[i3+2]})
    }
    colorAttr.current.needsUpdate = true
    meshRef.current.instanceMatrix.needsUpdate = true
    turkLabelsRef.current = tl
  })

  const handlePointerDown = useCallback((e) => {
    if (e.button !== 0) return
    const data = orbitDataRef.current
    if (!data.ready) return
    const rect = gl.domElement.getBoundingClientRect()
    const mx = (e.clientX-rect.left)/rect.width*2-1
    const my = -(e.clientY-rect.top)/rect.height*2+1
    
    let closest=-1, minD=0.015
    const v = new THREE.Vector3()
    for (let i=0; i<Math.min(data.count,MAX_INSTANCES); i++) {
      const sp = scenePos.current[i]
      if (!sp) continue
      
      if (sp[0]*camera.position.x + sp[1]*camera.position.y + sp[2]*camera.position.z < 0) continue
      
      v.set(sp[0],sp[1],sp[2]).project(camera)
      if (v.z > 1 || v.z < -1) continue
      
      const d = (v.x-mx)**2+(v.y-my)**2
      if (d < minD) { minD=d; closest=i }
    }
    
    if (closest < 0) return
    const geo=data.geo, i3=closest*3
    onSelect({
      id:data.ids[closest], name:data.names[closest], type:data.types[closest],
      country:data.countries[closest], rcs:data.rcs[closest], isTurkish:data.turkish[closest],
      lat:geo[i3], lon:geo[i3+1], alt:geo[i3+2], scenePos:scenePos.current[closest],
    })
  }, [camera, gl.domElement, orbitDataRef, onSelect])

  const lastMove = useRef(0)
  const handlePointerMove = useCallback((e) => {
    const now = Date.now()
    if (now - lastMove.current < 50) return // Throttle to 20fps for performance
    lastMove.current = now
    
    const data = orbitDataRef.current
    if (!data.ready) return
    const rect = gl.domElement.getBoundingClientRect()
    const mx = (e.clientX-rect.left)/rect.width*2-1
    const my = -(e.clientY-rect.top)/rect.height*2+1
    
    let closest=-1, minD=0.015
    const v = new THREE.Vector3()
    for (let i=0; i<Math.min(data.count,MAX_INSTANCES); i++) {
      const sp = scenePos.current[i]
      if (!sp) continue
      if (sp[0]*camera.position.x + sp[1]*camera.position.y + sp[2]*camera.position.z < 0) continue
      v.set(sp[0],sp[1],sp[2]).project(camera)
      if (v.z > 1 || v.z < -1) continue
      const d = (v.x-mx)**2+(v.y-my)**2
      if (d < minD) { minD=d; closest=i }
    }
    
    if (closest >= 0) {
      gl.domElement.style.cursor = 'pointer'
      if (hoverMeshRef.current) {
        hoverMeshRef.current.position.set(...scenePos.current[closest])
        hoverMeshRef.current.visible = true
      }
    } else {
      gl.domElement.style.cursor = 'default'
      if (hoverMeshRef.current) hoverMeshRef.current.visible = false
    }
  }, [camera, gl.domElement, orbitDataRef])

  useEffect(() => {
    const el = gl.domElement
    el.addEventListener('pointerdown', handlePointerDown)
    el.addEventListener('pointermove', handlePointerMove)
    return () => {
      el.removeEventListener('pointerdown', handlePointerDown)
      el.removeEventListener('pointermove', handlePointerMove)
    }
  }, [gl, handlePointerDown, handlePointerMove])

  return (
    <group>
      <instancedMesh ref={meshRef} args={[null,null,MAX_INSTANCES]} frustumCulled={false}>
        <sphereGeometry args={[1,4,4]}/>
        <meshBasicMaterial vertexColors toneMapped={false}/>
      </instancedMesh>
      <mesh ref={hoverMeshRef} visible={false}>
        <sphereGeometry args={[0.06, 8, 8]}/>
        <meshBasicMaterial color="#ff3300" wireframe transparent opacity={0.8} />
      </mesh>
    </group>
  )
}

function TurkishLabels({ labelsRef }) {
  const [labels, setLabels] = useState([])
  const fc = useRef(0)
  useFrame(() => { fc.current++; if (fc.current%10===0 && labelsRef.current?.length) setLabels([...labelsRef.current]) })
  return labels.map(s => (
    <Html key={s.id} position={[s.x,s.y+(s.alt>10000?2:0.2),s.z]} center style={{color:'#ffd700',fontSize:'10px',fontFamily:'monospace',pointerEvents:'none',whiteSpace:'nowrap',textShadow:'0 0 8px #000'}}>{s.name}</Html>
  ))
}

function CameraFollower({ target, controlsRef }) {
  const { camera } = useThree()
  const tp = useRef(null)
  useEffect(() => { if (target?.scenePos) tp.current = new THREE.Vector3(...target.scenePos) }, [target])
  useFrame(() => {
    if (!tp.current || !controlsRef.current) return
    // Sadece baktığı yeri kameradan yumuşakça odakla, fiziksel kamerayı uyduya yapıştırma
    controlsRef.current.target.lerp(tp.current, 0.05)
    controlsRef.current.update()
  })
  return null
}

function FragmentCloud({ fragments, simTimeRef, collisionTime, altKm, color, fragIncDeg }) {
  const meshRef = useRef()
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const dataRef = useRef({ pos: null, vel: null, ready: false })
  const count = fragments.length

  useEffect(() => {
    if (count === 0) return
    const pos = new Float32Array(count * 3)
    const vel = new Float32Array(count * 3)
    
    for (let i = 0; i < count; i++) {
        const f = fragments[i]
        const i3 = i * 3
        if (f.position && f.velocity) {
            pos[i3] = f.position[0]; pos[i3+1] = f.position[1]; pos[i3+2] = f.position[2]
            vel[i3] = f.velocity[0]; vel[i3+1] = f.velocity[1]; vel[i3+2] = f.velocity[2]
        } else {
            const cr = 6371 + (altKm || 800)
            pos[i3] = cr; pos[i3+1] = 0; pos[i3+2] = 0
            const dv = f.delta_v || [0,0,0]
            vel[i3] = dv[0]; vel[i3+1] = dv[1] + 7.5; vel[i3+2] = dv[2]
        }
    }
    dataRef.current = { pos, vel, ready: true }
  }, [fragments, count, altKm, fragIncDeg])

  useFrame(() => {
    if (!meshRef.current || count === 0 || !dataRef.current.ready || !collisionTime) return
    const elapsed = Math.max(0, simTimeRef.current - collisionTime)
    const dt = elapsed / 1000 // saniye cinsinden
    const { pos, vel } = dataRef.current
    
    for (let i = 0; i < count; i++) {
      const i3 = i * 3
      const [ex, ey, ez] = rodrigues(pos[i3], pos[i3+1], pos[i3+2], vel[i3], vel[i3+1], vel[i3+2], dt)
      const sx = ex * SCALE
      const sy = ez * SCALE
      const sz = -ey * SCALE
      
      dummy.position.set(sx, sy, sz)
      dummy.scale.setScalar(0.015)
      dummy.updateMatrix()
      meshRef.current.setMatrixAt(i, dummy.matrix)
    }
    meshRef.current.count = count
    meshRef.current.instanceMatrix.needsUpdate = true
  })

  if (count === 0) return null
  return <instancedMesh ref={meshRef} args={[null,null,Math.max(count,1)]} frustumCulled={false}><sphereGeometry args={[1,4,4]}/><meshBasicMaterial color={color || "#ff3300"} toneMapped={false}/></instancedMesh>
}

function Scene({ orbitDataRef, simTimeRef, fragments, collisionTime, fragAltKm, fragIncDeg, selectedSat, onSelect, textureUrl }) {
  const turkLabelsRef = useRef([])
  const controlsRef = useRef()
  return (
    <>
      <ambientLight intensity={0.4}/><directionalLight position={[10,5,8]} intensity={1.3}/>
      <Stars radius={300} depth={80} count={2000} factor={3} fade/>
      <Earth textureUrl={textureUrl}/>
      <Satellites orbitDataRef={orbitDataRef} simTimeRef={simTimeRef} selectedId={selectedSat?.id} onSelect={onSelect} turkLabelsRef={turkLabelsRef}/>
      <TurkishLabels labelsRef={turkLabelsRef}/>
      <FragmentCloud fragments={fragments} simTimeRef={simTimeRef} collisionTime={collisionTime} altKm={fragAltKm} fragIncDeg={fragIncDeg}/>
      <CameraFollower target={selectedSat} controlsRef={controlsRef}/>
      <OrbitControls ref={controlsRef} enablePan={false} minDistance={7.5} maxDistance={80} rotateSpeed={0.4} zoomSpeed={0.8}/>
    </>
  )
}

export default function Globe({ orbitDataRef, simTimeRef, fragments, collisionTime, fragAltKm, fragIncDeg, selectedSat, onSelectSat, textureUrl }) {
  return (
    <div style={{width:'100%',height:'100%',cursor:'crosshair'}}>
      <Canvas camera={{position:[0,0,18],fov:45}} gl={{antialias:true}} style={{background:'#000010'}}>
        <Scene orbitDataRef={orbitDataRef} simTimeRef={simTimeRef} fragments={fragments} collisionTime={collisionTime} fragAltKm={fragAltKm} fragIncDeg={fragIncDeg} selectedSat={selectedSat} onSelect={onSelectSat} textureUrl={textureUrl}/>
      </Canvas>
    </div>
  )
}