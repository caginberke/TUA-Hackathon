import { useRef, useMemo, useEffect } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Stars, Html } from '@react-three/drei'
import * as THREE from 'three'

const R = 6.371
const SCALE = 1 / 1000
const MAX_SAT = 35000
const TYPE_COLORS = {
  PAYLOAD: [0.27, 0.53, 1.0], 'ROCKET BODY': [1.0, 0.27, 0.27],
  DEBRIS: [0.5, 0.5, 0.5], UNKNOWN: [0.35, 0.35, 0.35], TBA: [0.35, 0.35, 0.35],
}
const GOLD = [1.0, 0.84, 0.0]

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
      <mesh><sphereGeometry args={[R, 48, 48]} />{tex ? <meshStandardMaterial map={tex} roughness={0.85}/> : <meshStandardMaterial color="#1a4a7a" roughness={0.8}/>}</mesh>
      <mesh><sphereGeometry args={[R*1.008, 32, 32]} /><meshBasicMaterial color="#4488ff" transparent opacity={0.03} side={THREE.BackSide}/></mesh>
    </group>
  )
}

function LiveSatellites({ orbitDataRef, simTimeRef }) {
  const meshRef = useRef()
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const colorAttr = useRef(null)
  useFrame(() => {
    const data = orbitDataRef?.current
    if (!data?.ready || !data.pos || !meshRef.current) return
    const count = Math.min(data.count, MAX_SAT)
    meshRef.current.count = count
    if (!colorAttr.current) {
      colorAttr.current = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SAT*3), 3)
      meshRef.current.geometry.setAttribute('color', colorAttr.current)
    }
    const pos=data.pos, vel=data.vel, dt=(simTimeRef.current-data.baseTime)/1000, colors=colorAttr.current.array
    for (let i=0; i<count; i++) {
      const i3=i*3
      const [ex,ey,ez] = rodrigues(pos[i3],pos[i3+1],pos[i3+2],vel[i3],vel[i3+1],vel[i3+2],dt)
      dummy.position.set(ex*SCALE, ez*SCALE, -ey*SCALE)
      const isTr = data.turkish[i]
      dummy.scale.setScalar(isTr ? 0.035 : 0.008)
      dummy.updateMatrix()
      meshRef.current.setMatrixAt(i, dummy.matrix)
      
      const c = isTr ? GOLD : TYPE_COLORS[data.types[i]] || TYPE_COLORS.UNKNOWN
      colors[i3]=c[0]; colors[i3+1]=c[1]; colors[i3+2]=c[2]
    }
    colorAttr.current.needsUpdate = true
    meshRef.current.instanceMatrix.needsUpdate = true
  })
  return <instancedMesh ref={meshRef} args={[null,null,MAX_SAT]} frustumCulled={false}><sphereGeometry args={[1,4,4]}/><meshBasicMaterial vertexColors toneMapped={false}/></instancedMesh>
}

function CameraSync({ cameraStateRef, side, activeSideRef }) {
  const { camera } = useThree()
  useFrame(() => {
    if (!cameraStateRef.current) cameraStateRef.current = { px:0, py:0, pz:16 }
    if (activeSideRef.current === side) {
      cameraStateRef.current.px = camera.position.x
      cameraStateRef.current.py = camera.position.y
      cameraStateRef.current.pz = camera.position.z
    } else {
      camera.position.set(cameraStateRef.current.px, cameraStateRef.current.py, cameraStateRef.current.pz)
      camera.lookAt(0,0,0)
    }
  })
  return null
}

function FragmentCloud({ fragments, simTimeRef, collisionTime, parentAltKm, color }) {
  const meshRef = useRef()
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const dataRef = useRef({ pos: null, vel: null, ready: false })
  const count = fragments.length

  useEffect(() => {
    if (count === 0) return
    const pos = new Float32Array(count * 3)
    const vel = new Float32Array(count * 3)
    const am = new Float32Array(count)
    
    for (let i = 0; i < count; i++) {
        const f = fragments[i]
        const i3 = i * 3
        if (f.position && f.velocity) {
            pos[i3] = f.position[0]; pos[i3+1] = f.position[1]; pos[i3+2] = f.position[2]
            vel[i3] = f.velocity[0]; vel[i3+1] = f.velocity[1]; vel[i3+2] = f.velocity[2]
        } else {
            const cr = 6371 + (parentAltKm || 800)
            pos[i3] = cr; pos[i3+1] = 0; pos[i3+2] = 0
            const dv = f.delta_v || [0,0,0]
            vel[i3] = dv[0]; vel[i3+1] = dv[1] + 7.5; vel[i3+2] = dv[2]
        }
        am[i] = f.am || 0
    }
    dataRef.current = { pos, vel, am, ready: true }
  }, [fragments, count, parentAltKm])

  useFrame(() => {
    if (!meshRef.current || count === 0 || !dataRef.current.ready || !collisionTime) return
    const elapsed = Math.max(0, simTimeRef.current - collisionTime)
    const dt = elapsed / 1000 // saniye cinsinden
    const { pos, vel, am } = dataRef.current
    
    for (let i = 0; i < count; i++) {
      const i3 = i * 3
      let [ex, ey, ez] = rodrigues(pos[i3], pos[i3+1], pos[i3+2], vel[i3], vel[i3+1], vel[i3+2], dt)
      
      // Atmosferik Surtunme (Drag) Mekanigi: Area-to-mass (am) orani yuksek hafif parcalar merkeze daha hizli duser (Suni Hızlandırma)
      // Visualizer amacli sönümleme katsayisini bilerek yuksek tuttuk.
      if (am[i] > 0.05) {
          const decay = Math.max(0.6, 1.0 - (dt * am[i] * 0.000008))
          ex *= decay; ey *= decay; ez *= decay;
      }

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
  return <instancedMesh ref={meshRef} args={[null,null,Math.max(count,1)]} frustumCulled={false}><sphereGeometry args={[1,4,4]}/><meshBasicMaterial color={color} toneMapped={false}/></instancedMesh>
}

function Flash({ simTimeRef, collisionTime, parentAltKm }) {
  const ref = useRef()
  const cr = R + (parentAltKm || 800) / 1000
  useFrame(() => {
    if (!ref.current) return
    const t = (simTimeRef.current - collisionTime) / 1000
    if (t < 0 || t > 4) { ref.current.visible = false; return }
    ref.current.visible = true
    ref.current.scale.setScalar(Math.min(t*2, 0.8))
    ref.current.material.opacity = Math.max(0, 1-t*0.4)
  })
  return <mesh ref={ref} position={[cr,0,0]}><sphereGeometry args={[1,12,12]}/><meshBasicMaterial color="#ffaa00" transparent toneMapped={false}/></mesh>
}

function EvasionSatellites({ simTimeRef, collisionTime, parentAltKm }) {
  const meshRef1 = useRef()
  const meshRef2 = useRef()
  const ringRef1 = useRef()
  const ringRef2 = useRef()
  const textRef = useRef()

  const cr = R + (parentAltKm || 800) / 1000
  // Iki uydunun baslangic konumlarini hedefin biraz ilerisine (In-track/Cross-track offset) yerlestirelim.
  const pos1 = useMemo(() => new THREE.Vector3(cr, 0.4, 0.2), [cr])
  const pos2 = useMemo(() => new THREE.Vector3(cr, -0.4, -0.2), [cr])

  useFrame(() => {
    if (!collisionTime || !meshRef1.current) return
    const elapsed = simTimeRef.current - collisionTime
    
    // Carpismadan az once ve carpisma sirasinda (Orn: -500ms ile 5000ms arasi)
    const isWarned = elapsed > -500 && elapsed < 8000
    if (ringRef1.current) ringRef1.current.visible = isWarned
    if (ringRef2.current) ringRef2.current.visible = isWarned
    if (textRef.current) textRef.current.style.opacity = isWarned ? 1 : 0
    
    if (isWarned) {
        // Warning animasyonu
        const p = (Math.sin(elapsed * 0.01) + 1) / 2
        ringRef1.current.scale.setScalar(1.0 + p * 0.5)
        ringRef2.current.scale.setScalar(1.0 + p * 0.5)
        ringRef1.current.material.opacity = Math.max(0, 0.8 - p*0.5)
        ringRef2.current.material.opacity = Math.max(0, 0.8 - p*0.5)
        
        // Manevra (Kacis hareketini dikey/radial olarak yumusakca kaydir - Orbital Evasion)
        const shift = Math.min(1.0, elapsed > 0 ? elapsed / 2000 : 0) * 0.3
        meshRef1.current.position.set(pos1.x + shift, pos1.y + shift*0.5, pos1.z)
        meshRef2.current.position.set(pos2.x - shift, pos2.y - shift*0.5, pos2.z)
        ringRef1.current.position.copy(meshRef1.current.position)
        ringRef2.current.position.copy(meshRef2.current.position)
    } else {
        meshRef1.current.position.copy(pos1)
        meshRef2.current.position.copy(pos2)
    }
  })

  // Eger henuz oynatilmiyorsa gizle
  if (!collisionTime) return null

  return (
    <group>
        <mesh ref={meshRef1} position={pos1}><sphereGeometry args={[0.04, 8, 8]}/><meshBasicMaterial color="#00ffcc"/></mesh>
        <mesh ref={meshRef2} position={pos2}><sphereGeometry args={[0.03, 8, 8]}/><meshBasicMaterial color="#00ffcc"/></mesh>
        
        <mesh ref={ringRef1} visible={false}><sphereGeometry args={[0.08, 16, 16]}/><meshBasicMaterial color="#ff0044" wireframe transparent opacity={0.6}/></mesh>
        <mesh ref={ringRef2} visible={false}><sphereGeometry args={[0.06, 16, 16]}/><meshBasicMaterial color="#ff0044" wireframe transparent opacity={0.6}/></mesh>
        
        <Html position={[cr, 0.8, 0]}>
            <div ref={textRef} style={{ fontSize: 9, color:'#ff0044', fontWeight:'bold', background:'rgba(0,0,0,0.6)', padding:'2px 6px', borderRadius:4, border:'1px solid #ff0044', whiteSpace:'nowrap', opacity:0, transition:'opacity 0.2s' }}>
                ⚠️ CAW: MANEVRA KOMUTU ILETILDI
            </div>
        </Html>
    </group>
  )
}

function Scene({ fragments, color, textureUrl, simTimeRef, collisionTime, parentAltKm, cameraStateRef, side, activeSideRef, orbitDataRef, kesslerEnabled }) {
  return (
    <>
      <ambientLight intensity={0.4}/><directionalLight position={[10,5,8]} intensity={1.2}/>
      <Stars radius={200} depth={60} count={800} factor={2} fade/>
      <Earth textureUrl={textureUrl}/>
      {orbitDataRef && <LiveSatellites orbitDataRef={orbitDataRef} simTimeRef={simTimeRef}/>}
      <CameraSync cameraStateRef={cameraStateRef} side={side} activeSideRef={activeSideRef}/>
      {collisionTime > 0 && <Flash simTimeRef={simTimeRef} collisionTime={collisionTime} parentAltKm={parentAltKm}/>}
      <FragmentCloud fragments={fragments} simTimeRef={simTimeRef} collisionTime={collisionTime} parentAltKm={parentAltKm} color={color}/>
      <EvasionSatellites simTimeRef={simTimeRef} collisionTime={collisionTime} parentAltKm={parentAltKm} />
      {kesslerEnabled && fragments?.length > 0 && (
          <FragmentCloud fragments={fragments.slice(0, Math.floor(fragments.length/10))} simTimeRef={simTimeRef} collisionTime={collisionTime + 2000} parentAltKm={parentAltKm + 150} color="#ffaa00" />
      )}
      <OrbitControls enablePan={false} minDistance={7.5} maxDistance={40} rotateSpeed={0.4} zoomSpeed={0.8}/>
    </>
  )
}

export default function SimGlobe({ fragments, color, label, textureUrl, count, simTimeRef, collisionTime, parentAltKm, cameraStateRef, side, activeSideRef, modelName, orbitDataRef, kesslerEnabled }) {
  const handleMouseDown = () => { activeSideRef.current = side }
  return (
    <div style={{ width:'100%', height:'100%', position:'relative' }} onMouseDown={handleMouseDown}>
      <div style={{ position:'absolute', top:6, left:'50%', transform:'translateX(-50%)', zIndex:1, fontSize:11, padding:'3px 12px', borderRadius:4, background:color==='#4488ff'?'rgba(68,136,255,0.12)':'rgba(255,100,68,0.12)', color, pointerEvents:'none' }}>{label}</div>
      <div style={{ position:'absolute', bottom:8, left:'50%', transform:'translateX(-50%)', zIndex:1, fontSize:10, color:'#667', pointerEvents:'none' }}>
          {(count||0) + (kesslerEnabled ? Math.floor((count||0)/10) : 0)} fragment {kesslerEnabled && <span style={{color:'#fa0'}}>(Kessler Devrede)</span>}
      </div>
      {modelName && <div style={{ position:'absolute', top:28, left:'50%', transform:'translateX(-50%)', zIndex:1, fontSize:9, color:'#445', pointerEvents:'none' }}>{modelName}</div>}
      <Canvas camera={{position:[0,0,16],fov:45}} gl={{antialias:true}} style={{background:'#000010'}}>
        <Scene fragments={fragments||[]} color={color} textureUrl={textureUrl} simTimeRef={simTimeRef} collisionTime={collisionTime||0} parentAltKm={parentAltKm} cameraStateRef={cameraStateRef} side={side} activeSideRef={activeSideRef} orbitDataRef={orbitDataRef} kesslerEnabled={kesslerEnabled}/>
      </Canvas>
    </div>
  )
}