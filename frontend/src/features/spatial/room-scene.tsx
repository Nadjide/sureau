import { useEffect, useMemo, useRef, useState, type ComponentRef, type RefObject } from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { OrbitControls, OrthographicCamera, RoundedBox, useCursor } from '@react-three/drei'
import { Vector3, type OrthographicCamera as ThreeOrthographicCamera } from 'three'
import type { Workstation } from './room-model'
import type { SpatialPlan } from './plan-document'

type RoomSceneProps = {
  plan: SpatialPlan
  selectedWorkstationId: string | null
  onSelect: (id: string) => void
  resetToken: number
  focusToken: number
  dark: boolean
  localizedCounts: Readonly<Record<string, number>>
}

type Vector = [number, number, number]

type BlockProps = {
  size: Vector
  position?: Vector
  rotation?: Vector
  color: string
  roughness?: number
  metalness?: number
  castShadow?: boolean
}

function Block({
  size,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  color,
  roughness = 0.75,
  metalness = 0,
  castShadow = true,
}: BlockProps) {
  return (
    <mesh position={position} rotation={rotation} castShadow={castShadow} receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
    </mesh>
  )
}

function Chair() {
  return (
    <group position={[0, 0, 0.94]} rotation={[0, -0.08, 0]}>
      {[0, 1, 2, 3, 4].map((index) => (
        <group key={index} rotation={[0, (index * Math.PI * 2) / 5, 0]}>
          <Block size={[0.055, 0.035, 0.33]} position={[0, 0.09, 0.14]} color="#444e50" metalness={0.6} />
          <mesh position={[0, 0.065, 0.29]} castShadow>
            <sphereGeometry args={[0.046, 8, 8]} />
            <meshStandardMaterial color="#282f30" roughness={0.9} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 0.27, 0]} castShadow>
        <cylinderGeometry args={[0.036, 0.047, 0.36, 10]} />
        <meshStandardMaterial color="#7c8586" metalness={0.65} roughness={0.3} />
      </mesh>
      <RoundedBox args={[0.59, 0.12, 0.56]} radius={0.06} smoothness={3} position={[0, 0.49, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#586a80" roughness={0.95} />
      </RoundedBox>
      <RoundedBox args={[0.57, 0.58, 0.1]} radius={0.04} smoothness={3} position={[0, 0.84, 0.24]} rotation={[0.11, 0, 0]} castShadow>
        <meshStandardMaterial color="#586a80" roughness={0.95} />
      </RoundedBox>
      <Block size={[0.08, 0.39, 0.055]} position={[0, 0.64, 0.24]} color="#404c60" />
      {[-1, 1].map((side) => (
        <group key={side}>
          <Block size={[0.032, 0.18, 0.032]} position={[side * 0.33, 0.56, 0.06]} color="#3d495b" />
          <RoundedBox args={[0.075, 0.045, 0.31]} radius={0.019} smoothness={2} position={[side * 0.33, 0.66, 0.035]} castShadow>
            <meshStandardMaterial color="#354252" roughness={0.85} />
          </RoundedBox>
        </group>
      ))}
    </group>
  )
}

function Desk({
  workstation,
  selected,
  onSelect,
  colors,
}: {
  workstation: Workstation
  selected: boolean
  onSelect: (id: string) => void
  colors: SpatialPlan['colors']
}) {
  const [hovered, setHovered] = useState(false)
  useCursor(hovered)
  const accent = colors.accent

  function choose(event: ThreeEvent<MouseEvent>) {
    event.stopPropagation()
    onSelect(workstation.id)
  }

  return (
    <group
      position={workstation.position}
      rotation={[0, workstation.rotation, 0]}
      scale={[workstation.width / 2, 1, workstation.depth]}
      onClick={choose}
      onPointerOver={(event) => { event.stopPropagation(); setHovered(true) }}
      onPointerOut={() => setHovered(false)}
    >
      {(selected || hovered) && (
        <RoundedBox args={[2.28, 0.3, 2.24]} scale={[1, 0.057, 1]} radius={0.14} smoothness={3} position={[0, 0.043, 0.35]}>
          <meshBasicMaterial color={accent} transparent opacity={selected ? 0.19 : 0.09} depthWrite={false} />
        </RoundedBox>
      )}
      <RoundedBox args={[2, 0.09, 1]} radius={0.045} smoothness={3} position={[0, 0.79, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={workstation.color || colors.desk} roughness={0.72} />
      </RoundedBox>
      <Block size={[1.88, 0.065, 0.055]} position={[0, 0.74, -0.44]} color={selected ? accent : '#b79672'} />
      {[-1, 1].map((side) => (
        <group key={side}>
          <Block size={[0.055, 0.72, 0.065]} position={[side * 0.86, 0.385, -0.36]} color="#647184" metalness={0.6} />
          <Block size={[0.055, 0.72, 0.065]} position={[side * 0.86, 0.385, 0.36]} color="#647184" metalness={0.6} />
          <Block size={[0.07, 0.045, 0.82]} position={[side * 0.86, 0.045, 0]} color="#505d5e" metalness={0.5} />
        </group>
      ))}
      <Block size={[1.69, 0.055, 0.05]} position={[0, 0.29, -0.37]} color="#697575" metalness={0.55} />
      <Block size={[0.37, 0.025, 0.23]} position={[0, 0.85, -0.2]} color="#4e5b5c" metalness={0.3} />
      <Block size={[0.055, 0.23, 0.055]} position={[0, 0.96, -0.23]} color="#596768" metalness={0.5} />
      <RoundedBox args={[0.96, 0.55, 0.065]} radius={0.026} smoothness={3} position={[0, 1.19, -0.23]} castShadow>
        <meshStandardMaterial color="#334347" roughness={0.6} />
      </RoundedBox>
      <mesh position={[0, 1.195, -0.194]}>
        <planeGeometry args={[0.87, 0.46]} />
        <meshStandardMaterial color="#1b2d45" emissive="#162b45" emissiveIntensity={0.35} roughness={0.35} />
      </mesh>
      <Block size={[0.71, 0.025, 0.005]} position={[0, 1.35, -0.188]} color="#94afd1" castShadow={false} />
      <Block size={[0.21, 0.19, 0.005]} position={[-0.245, 1.185, -0.188]} color="#304d73" castShadow={false} />
      <Block size={[0.39, 0.035, 0.005]} position={[0.12, 1.235, -0.188]} color="#567ca8" castShadow={false} />
      <Block size={[0.3, 0.024, 0.005]} position={[0.075, 1.155, -0.188]} color="#42658d" castShadow={false} />
      <RoundedBox args={[0.58, 0.026, 0.2]} radius={0.009} smoothness={2} position={[0, 0.85, 0.19]} castShadow>
        <meshStandardMaterial color="#d6dce5" roughness={0.8} />
      </RoundedBox>
      {[0, 1, 2].map((row) => (
        <Block key={row} size={[0.5, 0.004, 0.018]} position={[0, 0.865, 0.132 + row * 0.049]} color="#a3adbd" castShadow={false} />
      ))}
      <RoundedBox args={[0.09, 0.06, 0.145]} scale={[1, 0.62, 1]} radius={0.025} smoothness={3} position={[0.44, 0.854, 0.185]} castShadow>
        <meshStandardMaterial color="#d4dce5" roughness={0.75} />
      </RoundedBox>
      <Block size={[0.27, 0.014, 0.35]} position={[-0.69, 0.845, 0.04]} rotation={[0, 0.08, 0]} color="#eee9db" />
      <Block size={[0.018, 0.018, 0.23]} position={[-0.62, 0.864, 0.04]} rotation={[0, 0.08, 0]} color="#536e69" />
      <Chair />
    </group>
  )
}

function Plant({ position, scale = 1 }: { position: Vector; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.22, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.26, 0.19, 0.39, 20]} />
        <meshStandardMaterial color="#bbae94" roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.421, 0]}>
        <cylinderGeometry args={[0.235, 0.235, 0.015, 20]} />
        <meshStandardMaterial color="#514b3a" roughness={1} />
      </mesh>
      {[0, 1, 2, 3, 4, 5, 6].map((index) => (
        <group key={index} rotation={[0, (index * Math.PI * 2) / 7, 0]}>
          <mesh position={[0.12, 0.86 + (index % 2) * 0.13, 0]} scale={[0.095, 0.46, 0.19]} rotation={[0, 0, -0.37 - (index % 3) * 0.13]} castShadow>
            <sphereGeometry args={[1, 10, 8]} />
            <meshStandardMaterial color={index % 2 ? '#526f47' : '#688458'} roughness={0.9} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function Architecture({ dark, plan }: { dark: boolean; plan: SpatialPlan }) {
  const wall = plan.colors.wall
  const frame = dark ? '#758397' : '#b3bfcd'
  const floor = plan.colors.floor

  return (
    <group scale={[plan.width / 13, 1, plan.depth / 9]}>
      <RoundedBox args={[13.5, 0.36, 9.5]} radius={0.16} smoothness={4} position={[0, -0.22, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={dark ? '#59697f' : '#c8d0dc'} roughness={0.8} />
      </RoundedBox>
      <Block size={[13, 0.08, 9]} position={[0, -0.025, 0]} color={floor} />
      {[-5, -3, -1, 1, 3, 5].map((x) => (
        <Block key={x} size={[0.012, 0.002, 8.92]} position={[x, 0.017, 0]} color={dark ? '#858f9f' : '#d9dce1'} castShadow={false} />
      ))}
      <RoundedBox args={[11.3, 0.25, 4.95]} scale={[1, 0.048, 1]} radius={0.12} smoothness={3} position={[0, 0.025, 0]} receiveShadow>
        <meshStandardMaterial color={floor} roughness={1} />
      </RoundedBox>
      <Block size={[13.15, 0.72, 0.17]} position={[0, 0.37, -4.5]} color={wall} />
      <Block size={[13.15, 0.15, 0.19]} position={[0, 2.12, -4.5]} color={wall} />
      <Block size={[13.12, 0.055, 0.28]} position={[0, 0.76, -4.46]} color={frame} />
      {[-6.5, -3.25, 0, 3.25, 6.5].map((x) => (
        <Block key={x} size={[0.15, 1.4, 0.19]} position={[x, 1.42, -4.5]} color={wall} />
      ))}
      {[-4.875, -1.625, 1.625, 4.875].map((x) => (
        <group key={x}>
          <Block size={[3.05, 1.25, 0.035]} position={[x, 1.42, -4.56]} color={dark ? '#8298b4' : '#c0d1e4'} roughness={0.3} castShadow={false} />
          <Block size={[3.09, 0.035, 0.07]} position={[x, 0.81, -4.49]} color={frame} />
          <Block size={[3.09, 0.035, 0.07]} position={[x, 2.015, -4.49]} color={frame} />
          <Block size={[0.035, 1.23, 0.07]} position={[x, 1.42, -4.49]} color={frame} />
        </group>
      ))}
      <Block size={[0.17, 1.13, 9.12]} position={[-6.5, 0.58, 0]} color={wall} />
      <Block size={[0.21, 0.06, 9.16]} position={[-6.5, 1.17, 0]} color={frame} />
      <Block size={[0.025, 0.07, 8.98]} position={[-6.398, 0.06, 0]} color={frame} />
      <Block size={[2.18, 0.94, 0.63]} position={[3.85, 0.51, -3.99]} color={dark ? '#929da9' : '#c3ccd4'} />
      <Block size={[2.23, 0.055, 0.68]} position={[3.85, 1.0, -3.99]} color={plan.colors.desk} />
      {[-1, 1].map((side) => (
        <group key={side}>
          <Block size={[1.04, 0.82, 0.025]} position={[3.85 + side * 0.54, 0.53, -3.66]} color={dark ? '#8493a7' : '#b5c2d2'} />
          <Block size={[0.04, 0.13, 0.035]} position={[3.85 + side * 0.12, 0.58, -3.637]} color="#65758a" metalness={0.4} />
        </group>
      ))}
      <Plant position={[-5.72, 0.025, -3.6]} />
      <Plant position={[5.76, 0.025, 3.55]} scale={0.88} />
      <Plant position={[-5.7, 0.025, 3.48]} scale={0.75} />
    </group>
  )
}

type LabelElements = Record<string, HTMLButtonElement | null>

function LabelProjector({ labels, workstations }: {
  labels: RefObject<LabelElements>
  workstations: readonly Workstation[]
}) {
  const projected = useMemo(() => new Vector3(), [])

  useFrame(({ camera, size }) => {
    camera.updateMatrixWorld()

    for (const workstation of workstations) {
      const label = labels.current[workstation.id]
      if (!label) continue
      projected.set(
        workstation.position[0] - Math.sin(workstation.rotation) * workstation.depth * 0.12,
        workstation.position[1] + 1.69,
        workstation.position[2] - Math.cos(workstation.rotation) * workstation.depth * 0.12,
      ).project(camera)
      const x = (projected.x * 0.5 + 0.5) * size.width
      const y = (-projected.y * 0.5 + 0.5) * size.height
      const visible = projected.z >= -1 && projected.z <= 1 && x >= 0 && x <= size.width && y >= 0 && y <= size.height
      label.style.setProperty('visibility', visible ? 'visible' : 'hidden')
      label.style.setProperty('transform', `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`)
    }
  })

  return null
}
type CameraTransition = {
  startedAt: number
  fromPosition: Vector3
  toPosition: Vector3
  fromTarget: Vector3
  toTarget: Vector3
  fromZoom: number
  toZoom: number
}

function CameraRig({ resetToken, focusToken, selectedWorkstationId, plan }: {
  resetToken: number
  focusToken: number
  selectedWorkstationId: string | null
  plan: SpatialPlan
}) {
  const { size, invalidate } = useThree()
  const cameraRef = useRef<ThreeOrthographicCamera>(null)
  const controlsRef = useRef<ComponentRef<typeof OrbitControls>>(null)
  const transition = useRef<CameraTransition | null>(null)
  const lastCommand = useRef({ resetToken, focusToken: 0 })
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  const sceneScale = Math.max(1, plan.width / 13, plan.depth / 9)
  const overviewPosition = useMemo(
    () => new Vector3(13.5 * sceneScale, 14.6 * sceneScale + 0.4, 17 * sceneScale),
    [sceneScale],
  )
  const zoom = Math.max(2, Math.min(
    size.width / (plan.width * 0.79 + plan.depth * 0.63 + 2.5),
    size.height / (plan.width * 0.36 + plan.depth * 0.45 + 3.7),
  ))
  const maxZoom = Math.max(zoom * 2.2, Math.min(size.width / 4, size.height / 3.5))

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(preference.matches)
    preference.addEventListener('change', update)
    return () => preference.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    const camera = cameraRef.current
    const controls = controlsRef.current
    if (!camera || !controls) return
    transition.current = null
    camera.position.copy(overviewPosition)
    camera.zoom = zoom
    camera.updateProjectionMatrix()
    controls.target.set(0, 0.4, 0)
    controls.update()
    invalidate()
  }, [zoom, overviewPosition, invalidate])

  useEffect(() => {
    const reset = lastCommand.current.resetToken !== resetToken
    const focus = lastCommand.current.focusToken !== focusToken
    lastCommand.current = { resetToken, focusToken }
    if (!reset && !focus) return

    const camera = cameraRef.current
    const controls = controlsRef.current
    if (!camera || !controls) return
    const station = plan.workstations.find((item) => item.id === selectedWorkstationId)
    if (!reset && !station) return

    const target = !reset && station
      ? new Vector3(station.position[0], 0.4, station.position[2])
      : new Vector3(0, 0.4, 0)
    const position = reset
      ? overviewPosition.clone()
      : camera.position.clone().sub(controls.target).add(target)
    const focusedZoom = station
      ? Math.min(maxZoom, Math.max(zoom * 1.85, Math.min(
          size.width / (station.width * 1.5 + 2),
          size.height / (station.depth + 3.5),
        )))
      : zoom

    transition.current = {
      startedAt: performance.now(),
      fromPosition: camera.position.clone(),
      toPosition: position,
      fromTarget: controls.target.clone(),
      toTarget: target,
      fromZoom: camera.zoom,
      toZoom: reset ? zoom : focusedZoom,
    }
    invalidate()
  }, [focusToken, resetToken, selectedWorkstationId, zoom, maxZoom, overviewPosition, plan.workstations, size.width, size.height, invalidate])

  useFrame(() => {
    const animation = transition.current
    const camera = cameraRef.current
    const controls = controlsRef.current
    if (!animation || !camera || !controls) return

    const progress = reducedMotion ? 1 : Math.min(1, (performance.now() - animation.startedAt) / 650)
    const eased = progress * progress * (3 - 2 * progress)
    camera.position.lerpVectors(animation.fromPosition, animation.toPosition, eased)
    controls.target.lerpVectors(animation.fromTarget, animation.toTarget, eased)
    camera.zoom = animation.fromZoom + (animation.toZoom - animation.fromZoom) * eased
    camera.updateProjectionMatrix()
    controls.update()
    if (progress === 1) transition.current = null
    else invalidate()
  })

  function constrainPan() {
    const camera = cameraRef.current
    const controls = controlsRef.current
    if (!camera || !controls) return
    const offsetX = Math.max(-plan.width / 2, Math.min(plan.width / 2, controls.target.x)) - controls.target.x
    const offsetY = 0.4 - controls.target.y
    const offsetZ = Math.max(-plan.depth / 2, Math.min(plan.depth / 2, controls.target.z)) - controls.target.z
    controls.target.x += offsetX
    controls.target.y += offsetY
    controls.target.z += offsetZ
    camera.position.x += offsetX
    camera.position.y += offsetY
    camera.position.z += offsetZ
    invalidate()
  }

  return (
    <>
      <OrthographicCamera ref={cameraRef} makeDefault position={overviewPosition} near={0.1} far={150 * sceneScale} zoom={zoom} />
      <OrbitControls
        ref={controlsRef}
        makeDefault
        target={[0, 0.4, 0]}
        minZoom={zoom * 0.7}
        maxZoom={maxZoom}
        minPolarAngle={0.38}
        maxPolarAngle={1.16}
        minAzimuthAngle={-0.25}
        maxAzimuthAngle={1.3}
        enableDamping={false}
        screenSpacePanning={false}
        zoomSpeed={0.7}
        rotateSpeed={0.65}
        panSpeed={0.65}
        onChange={constrainPan}
        onStart={() => { transition.current = null }}
      />
    </>
  )
}

export default function RoomScene({ plan, selectedWorkstationId, onSelect, resetToken, focusToken, dark, localizedCounts }: RoomSceneProps) {
  const labels = useRef<LabelElements>({})

  return (
    <div
      role="group"
      aria-label={`Maquette 3D de ${plan.name}. Sélectionnez un poste pour l’explorer.`}
      style={{ position: 'relative', width: '100%', height: '100%' }}
    >
      <Canvas
        frameloop="demand"
        dpr={[1, 1.5]}
        shadows="percentage"
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
        style={{ width: '100%', height: '100%', touchAction: 'none' }}
        fallback={<div className="scene-fallback" role="status">La vue 3D est indisponible sur cet appareil. Utilisez le plan 2D pour explorer les postes.</div>}
      >
        <color attach="background" args={[dark ? '#141d2a' : '#eef2f7']} />
        <CameraRig plan={plan} resetToken={resetToken} focusToken={focusToken} selectedWorkstationId={selectedWorkstationId} />
        <LabelProjector labels={labels} workstations={plan.workstations} />
        <ambientLight intensity={dark ? 0.7 : 0.9} />
        <hemisphereLight args={['#e4ebf5', '#8b93a1', 1.1]} />
        <directionalLight
          position={[-plan.width * 0.23, Math.max(plan.width, plan.depth) * 0.85, plan.depth * 0.78]}
          intensity={2.5}
          color="#fff6e6"
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-Math.max(plan.width, plan.depth) * 0.85}
          shadow-camera-right={Math.max(plan.width, plan.depth) * 0.85}
          shadow-camera-top={Math.max(plan.width, plan.depth) * 0.7}
          shadow-camera-bottom={-Math.max(plan.width, plan.depth) * 0.7}
          shadow-camera-near={0.5}
          shadow-camera-far={Math.max(plan.width, plan.depth) * 3}
          shadow-bias={-0.0003}
          shadow-normalBias={0.025}
        />
        <directionalLight position={[6, 5, -4]} intensity={0.75} color="#d6e5ff" />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.415, 0]} receiveShadow>
          <planeGeometry args={[200, 200]} />
          <shadowMaterial transparent opacity={dark ? 0.2 : 0.13} />
        </mesh>
        <Architecture dark={dark} plan={plan} />
        {plan.workstations.map((workstation) => (
          <Desk key={workstation.id} workstation={workstation} colors={plan.colors} selected={workstation.id === selectedWorkstationId} onSelect={onSelect} />
        ))}
      </Canvas>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        {plan.workstations.map((workstation) => (
          <button
            key={workstation.id}
            ref={(element) => { labels.current[workstation.id] = element }}
            type="button"
            className={`scene-label${selectedWorkstationId === workstation.id ? ' is-selected' : ''}`}
            style={{ position: 'absolute', left: 0, top: 0, visibility: 'hidden', pointerEvents: 'auto', borderColor: selectedWorkstationId === workstation.id ? plan.colors.accent : undefined }}
            aria-label={`Sélectionner ${workstation.label} dans la vue 3D`}
            aria-pressed={selectedWorkstationId === workstation.id}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => { event.stopPropagation(); onSelect(workstation.id) }}
          >
            {workstation.label}
            {!!localizedCounts[workstation.id] && <span className="scene-link-count">{localizedCounts[workstation.id]}</span>}
          </button>
        ))}
      </div>
    </div>
  )
}
