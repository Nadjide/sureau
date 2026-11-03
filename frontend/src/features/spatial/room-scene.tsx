import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
  type ReactNode,
  type RefObject,
} from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { OrbitControls, OrthographicCamera, RoundedBox, useCursor } from '@react-three/drei'
import {
  Plane,
  Raycaster,
  Vector2,
  Vector3,
  type Group,
  type OrthographicCamera as ThreeOrthographicCamera,
} from 'three'
import type { FurnitureItem, Workstation } from './room-model'
import type { SpatialPlan } from './plan-document'
import { translateSelection } from './plan-selection'
import { FurnitureModel } from './furniture-model'
import { t } from '@/lib/i18n'

type RoomSceneProps = {
  plan: SpatialPlan
  selectedWorkstationId: string | null
  selectedIds: readonly string[]
  multipleMode: boolean
  onSelect: (id: string, additive?: boolean, preserve?: boolean) => void
  resetToken: number
  focusToken: number
  dark: boolean
  localizedCounts: Readonly<Record<string, number>>
  editing: boolean
  snap: boolean
  onMove: (id: string, x: number, z: number) => void
}

type Vector = [number, number, number]
type ControlsRef = RefObject<ComponentRef<typeof OrbitControls> | null>
type RenderedDesks = Record<string, Group | null>
type ActiveDrag = { id: string; ids: readonly string[]; pointerId: number; cancel: () => void }
type MotionRegistry = Record<string, { stop: () => void; restore: () => void } | undefined>
type SpatialEntity = Workstation | FurnitureItem
type SceneObject = Pick<Workstation, 'id' | 'label' | 'position' | 'rotation' | 'width' | 'depth'> & {
  height: number
  labelHeight: number
  labelDepthOffset: number
  visible: boolean
  workstation: boolean
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(preference.matches)
    preference.addEventListener('change', update)
    return () => preference.removeEventListener('change', update)
  }, [])
  return reduced
}

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
      <RoundedBox
        args={[0.59, 0.12, 0.56]}
        radius={0.06}
        smoothness={3}
        position={[0, 0.49, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color="#586a80" roughness={0.95} />
      </RoundedBox>
      <RoundedBox
        args={[0.57, 0.58, 0.1]}
        radius={0.04}
        smoothness={3}
        position={[0, 0.84, 0.24]}
        rotation={[0.11, 0, 0]}
        castShadow
      >
        <meshStandardMaterial color="#586a80" roughness={0.95} />
      </RoundedBox>
      <Block size={[0.08, 0.39, 0.055]} position={[0, 0.64, 0.24]} color="#404c60" />
      {[-1, 1].map((side) => (
        <group key={side}>
          <Block size={[0.032, 0.18, 0.032]} position={[side * 0.33, 0.56, 0.06]} color="#3d495b" />
          <RoundedBox
            args={[0.075, 0.045, 0.31]}
            radius={0.019}
            smoothness={2}
            position={[side * 0.33, 0.66, 0.035]}
            castShadow
          >
            <meshStandardMaterial color="#354252" roughness={0.85} />
          </RoundedBox>
        </group>
      ))}
    </group>
  )
}

function objectScale(item: SpatialEntity): Vector {
  return 'kind' in item ? [item.width, item.height, item.depth] : [item.width / 2, 1, item.depth]
}

function Movable({
  item,
  selected,
  selectedIds,
  multipleMode,
  onSelect,
  plan,
  editing,
  snap,
  onMove,
  dragRef,
  controlsRef,
  renderedDesksRef,
  reducedMotion,
  motionRegistryRef,
  children,
}: {
  item: SpatialEntity
  selected: boolean
  selectedIds: readonly string[]
  multipleMode: boolean
  onSelect: RoomSceneProps['onSelect']
  plan: SpatialPlan
  editing: boolean
  snap: boolean
  onMove: RoomSceneProps['onMove']
  dragRef: RefObject<ActiveDrag | null>
  controlsRef: ControlsRef
  renderedDesksRef: RefObject<RenderedDesks>
  reducedMotion: boolean
  motionRegistryRef: RefObject<MotionRegistry>
  children: ReactNode
}) {
  const { gl, camera, invalidate } = useThree()
  const [hovered, setHovered] = useState(false)
  useCursor(hovered, editing ? 'grab' : 'pointer')
  const groupRef = useRef<Group | null>(null)
  const [initial] = useState(() => ({
    position: [...item.position] as Vector,
    rotation: [0, item.rotation, 0] as Vector,
    scale: objectScale(item),
  }))
  const motion = useRef<{
    startedAt: number
    fromPosition: Vector3
    toPosition: Vector3
    fromScale: Vector3
    toScale: Vector3
    fromRotation: number
    rotationDelta: number
  } | null>(null)
  const suppressClick = useRef(false)
  const clickIntent = useRef<boolean | null>(null)
  const colors = plan.colors
  const accent = colors.accent
  const selectionKey = [...selectedIds].sort().join('|')

  const animateTo = useCallback(
    (station: SpatialEntity) => {
      const group = groupRef.current
      if (!group) return
      const target = new Vector3(...station.position)
      const scale = new Vector3(...objectScale(station))
      const delta = Math.atan2(
        Math.sin(station.rotation - group.rotation.y),
        Math.cos(station.rotation - group.rotation.y),
      )
      if (
        group.position.distanceToSquared(target) < 1e-10 &&
        group.scale.distanceToSquared(scale) < 1e-10 &&
        Math.abs(delta) < 1e-6
      ) {
        motion.current = null
        return
      }
      motion.current = {
        startedAt: performance.now(),
        fromPosition: group.position.clone(),
        toPosition: target,
        fromScale: group.scale.clone(),
        toScale: scale,
        fromRotation: group.rotation.y,
        rotationDelta: delta,
      }
      invalidate()
    },
    [invalidate],
  )

  useEffect(() => {
    if (dragRef.current?.ids.includes(item.id)) dragRef.current.cancel()
    animateTo(item)
  }, [item, dragRef, animateTo])

  useEffect(() => {
    const registry = motionRegistryRef.current
    const id = item.id
    registry[id] = {
      stop: () => {
        motion.current = null
      },
      restore: () => animateTo(item),
    }
    return () => {
      delete registry[id]
    }
  }, [item, animateTo, motionRegistryRef])

  useEffect(
    () => () => {
      if (dragRef.current?.ids.includes(item.id)) dragRef.current.cancel()
      delete renderedDesksRef.current[item.id]
    },
    [dragRef, renderedDesksRef, item.id],
  )

  useEffect(() => {
    if (dragRef.current?.ids.includes(item.id)) dragRef.current.cancel()
  }, [editing, snap, multipleMode, plan.width, plan.depth, dragRef, item.id])

  useEffect(() => {
    const active = dragRef.current
    const ids = selectionKey ? selectionKey.split('|') : []
    if (active?.id === item.id && (active.ids.length !== ids.length || active.ids.some((id) => !ids.includes(id))))
      active.cancel()
  }, [selectionKey, item.id, dragRef])

  useFrame(() => {
    if (dragRef.current?.ids.includes(item.id)) return
    const animation = motion.current
    const group = groupRef.current
    if (!animation || !group) return
    const progress = reducedMotion ? 1 : Math.min(1, (performance.now() - animation.startedAt) / 200)
    const eased = progress * progress * (3 - 2 * progress)
    group.position.lerpVectors(animation.fromPosition, animation.toPosition, eased)
    group.scale.lerpVectors(animation.fromScale, animation.toScale, eased)
    group.rotation.y = animation.fromRotation + animation.rotationDelta * eased
    if (progress === 1) motion.current = null
    else invalidate()
  }, -0.5)

  function choose(event: ThreeEvent<MouseEvent>) {
    event.stopPropagation()
    const additive =
      event.detail > 0 && clickIntent.current !== null
        ? clickIntent.current
        : multipleMode || event.shiftKey || event.ctrlKey || event.metaKey
    clickIntent.current = null
    if (suppressClick.current || event.delta > 3) return
    onSelect(item.id, additive)
  }

  function beginDrag(event: ThreeEvent<PointerEvent>) {
    if (event.button === 0 && !dragRef.current) {
      suppressClick.current = false
      clickIntent.current = multipleMode || event.shiftKey || event.ctrlKey || event.metaKey
    }
    if (!editing || event.button !== 0 || dragRef.current) return
    if (clickIntent.current) return
    const group = groupRef.current
    if (!group) return
    const floor = new Plane(new Vector3(0, 1, 0), 0)
    const point = new Vector3()
    if (!event.ray.intersectPlane(floor, point)) return
    event.stopPropagation()
    event.nativeEvent.stopImmediatePropagation()
    event.nativeEvent.preventDefault()

    const pointerId = event.pointerId
    const startX = event.clientX
    const startY = event.clientY
    const offsetX = group.position.x - point.x
    const offsetZ = group.position.z - point.z
    const pointer = new Vector2()
    const ray = new Raycaster()
    const canvas = gl.domElement
    const controls = controlsRef.current
    const controlsWereEnabled = controls?.enabled ?? true
    const previousCursor = canvas.style.cursor
    let moved = false
    const dragIds = selectedIds.includes(item.id) ? [...selectedIds] : [item.id]
    const dragSet = new Set(dragIds)
    let draft = plan
    for (const id of dragIds) motionRegistryRef.current[id]?.stop()
    suppressClick.current = false
    if (controls) controls.enabled = false
    canvas.style.setProperty('cursor', 'grabbing')

    function preview(native: PointerEvent) {
      if (native.pointerId !== pointerId) return
      native.preventDefault()
      native.stopPropagation()
      if (!moved && Math.hypot(native.clientX - startX, native.clientY - startY) <= 3) return
      const bounds = canvas.getBoundingClientRect()
      if (!bounds.width || !bounds.height) return
      pointer.set(
        ((native.clientX - bounds.left) / bounds.width) * 2 - 1,
        -((native.clientY - bounds.top) / bounds.height) * 2 + 1,
      )
      ray.setFromCamera(pointer, camera)
      if (!ray.ray.intersectPlane(floor, point)) return
      moved = true
      draft = translateSelection(plan, dragIds, item.id, point.x + offsetX, point.z + offsetZ, snap)
      for (const object of [...draft.workstations, ...draft.furniture]) {
        if (dragSet.has(object.id)) renderedDesksRef.current[object.id]?.position.set(...object.position)
      }
      invalidate()
    }

    function cleanup() {
      window.removeEventListener('pointermove', preview, true)
      window.removeEventListener('pointerup', finish, true)
      window.removeEventListener('pointercancel', pointerCancelled, true)
      window.removeEventListener('lostpointercapture', pointerCancelled, true)
      window.removeEventListener('keydown', keyDown, true)
      window.removeEventListener('blur', cancel)
      dragRef.current = null
      if (controls) controls.enabled = controlsWereEnabled
      canvas.style.setProperty('cursor', previousCursor)
      if (canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId)
    }

    function cancel() {
      cleanup()
      suppressClick.current = true
      for (const id of dragIds) motionRegistryRef.current[id]?.restore()
      invalidate()
    }

    function pointerCancelled(native: PointerEvent) {
      if (native.pointerId === pointerId) cancel()
    }

    function keyDown(native: KeyboardEvent) {
      if (native.key !== 'Escape') return
      native.preventDefault()
      native.stopPropagation()
      cancel()
    }

    function finish(native: PointerEvent) {
      if (native.pointerId !== pointerId) return
      cleanup()
      suppressClick.current = true
      // Return to the current model if the parent rejects this move.
      for (const id of dragIds) motionRegistryRef.current[id]?.restore()
      const anchor = [...draft.workstations, ...draft.furniture].find((object) => object.id === item.id)
      if (moved && anchor) onMove(item.id, anchor.position[0], anchor.position[2])
      invalidate()
    }

    dragRef.current = { id: item.id, ids: dragIds, pointerId, cancel }
    window.addEventListener('pointermove', preview, { capture: true, passive: false })
    window.addEventListener('pointerup', finish, true)
    window.addEventListener('pointercancel', pointerCancelled, true)
    window.addEventListener('lostpointercapture', pointerCancelled, true)
    window.addEventListener('keydown', keyDown, true)
    window.addEventListener('blur', cancel)
    try {
      canvas.setPointerCapture(pointerId)
    } catch {
      cancel()
      return
    }
    onSelect(item.id, false, true)
    invalidate()
  }

  return (
    <group
      ref={(group) => {
        groupRef.current = group
        renderedDesksRef.current[item.id] = group
      }}
      position={initial.position}
      rotation={initial.rotation}
      scale={initial.scale}
      onClick={choose}
      onPointerDown={beginDrag}
      onPointerOver={(event) => {
        event.stopPropagation()
        setHovered(true)
      }}
      onPointerOut={() => setHovered(false)}
    >
      {(selected || hovered) &&
        ('kind' in item ? (
          <mesh position={[0, 0.025 / item.height, 0]}>
            <boxGeometry args={[1.08, 0.02 / item.height, 1.08]} />
            <meshBasicMaterial color={accent} transparent opacity={selected ? 0.2 : 0.1} depthWrite={false} />
          </mesh>
        ) : (
          <RoundedBox
            args={[2.28, 0.3, 2.24]}
            scale={[1, 0.057, 1]}
            radius={0.14}
            smoothness={3}
            position={[0, 0.043, 0.35]}
          >
            <meshBasicMaterial color={accent} transparent opacity={selected ? 0.19 : 0.09} depthWrite={false} />
          </RoundedBox>
        ))}
      {children}
    </group>
  )
}

function DeskModel({
  workstation,
  selected,
  colors,
}: {
  workstation: Workstation
  selected: boolean
  colors: SpatialPlan['colors']
}) {
  const accent = colors.accent
  return (
    <>
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
        <Block
          key={row}
          size={[0.5, 0.004, 0.018]}
          position={[0, 0.865, 0.132 + row * 0.049]}
          color="#a3adbd"
          castShadow={false}
        />
      ))}
      <RoundedBox
        args={[0.09, 0.06, 0.145]}
        scale={[1, 0.62, 1]}
        radius={0.025}
        smoothness={3}
        position={[0.44, 0.854, 0.185]}
        castShadow
      >
        <meshStandardMaterial color="#d4dce5" roughness={0.75} />
      </RoundedBox>
      <Block size={[0.27, 0.014, 0.35]} position={[-0.69, 0.845, 0.04]} rotation={[0, 0.08, 0]} color="#eee9db" />
      <Block size={[0.018, 0.018, 0.23]} position={[-0.62, 0.864, 0.04]} rotation={[0, 0.08, 0]} color="#536e69" />
      <Chair />
    </>
  )
}

function Architecture({ dark, plan }: { dark: boolean; plan: SpatialPlan }) {
  const wall = plan.colors.wall
  const frame = dark ? '#758397' : '#b3bfcd'
  const floor = plan.colors.floor

  return (
    <group scale={[plan.width / 13, 1, plan.depth / 9]}>
      <RoundedBox
        args={[13.5, 0.36, 9.5]}
        radius={0.16}
        smoothness={4}
        position={[0, -0.22, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={dark ? '#59697f' : '#c8d0dc'} roughness={0.8} />
      </RoundedBox>
      <Block size={[13, 0.08, 9]} position={[0, -0.025, 0]} color={floor} />
      {[-5, -3, -1, 1, 3, 5].map((x) => (
        <Block
          key={x}
          size={[0.012, 0.002, 8.92]}
          position={[x, 0.017, 0]}
          color={dark ? '#858f9f' : '#d9dce1'}
          castShadow={false}
        />
      ))}
      <RoundedBox
        args={[11.3, 0.25, 4.95]}
        scale={[1, 0.048, 1]}
        radius={0.12}
        smoothness={3}
        position={[0, 0.025, 0]}
        receiveShadow
      >
        <meshStandardMaterial color={floor} roughness={1} />
      </RoundedBox>
      {plan.display.walls && (
        <group>
          <Block size={[13.15, 0.72, 0.17]} position={[0, 0.37, -4.5]} color={wall} />
          <Block size={[13.15, 0.15, 0.19]} position={[0, 2.12, -4.5]} color={wall} />
          <Block size={[13.12, 0.055, 0.28]} position={[0, 0.76, -4.46]} color={frame} />
          {[-6.5, -3.25, 0, 3.25, 6.5].map((x) => (
            <Block key={x} size={[0.15, 1.4, 0.19]} position={[x, 1.42, -4.5]} color={wall} />
          ))}
          {[-4.875, -1.625, 1.625, 4.875].map((x) => (
            <group key={x}>
              <Block
                size={[3.05, 1.25, 0.035]}
                position={[x, 1.42, -4.56]}
                color={dark ? '#8298b4' : '#c0d1e4'}
                roughness={0.3}
                castShadow={false}
              />
              <Block size={[3.09, 0.035, 0.07]} position={[x, 0.81, -4.49]} color={frame} />
              <Block size={[3.09, 0.035, 0.07]} position={[x, 2.015, -4.49]} color={frame} />
              <Block size={[0.035, 1.23, 0.07]} position={[x, 1.42, -4.49]} color={frame} />
            </group>
          ))}
          <Block size={[0.17, 1.13, 9.12]} position={[-6.5, 0.58, 0]} color={wall} />
          <Block size={[0.21, 0.06, 9.16]} position={[-6.5, 1.17, 0]} color={frame} />
        </group>
      )}
      <Block size={[0.025, 0.07, 8.98]} position={[-6.398, 0.06, 0]} color={frame} />
    </group>
  )
}

type LabelElements = Record<string, HTMLButtonElement | null>

function LabelProjector({
  labels,
  objects,
  renderedDesksRef,
  selectedWorkstationId,
  selectedIds,
}: {
  labels: RefObject<LabelElements>
  objects: readonly SceneObject[]
  renderedDesksRef: RefObject<RenderedDesks>
  selectedWorkstationId: string | null
  selectedIds: readonly string[]
}) {
  const projected = useMemo(() => new Vector3(), [])
  const invalidate = useThree((state) => state.invalidate)

  useEffect(() => {
    invalidate()
  }, [selectedWorkstationId, selectedIds, objects, invalidate])

  useFrame(({ camera, size }) => {
    camera.updateMatrixWorld()
    const positions: Array<{
      label: HTMLButtonElement
      x: number
      y: number
      visible: boolean
      selected: boolean
      primary: boolean
      left: number
      right: number
      top: number
      bottom: number
    }> = []

    // Read all label sizes before changing any styles.
    for (const object of objects) {
      const label = labels.current[object.id]
      if (!label) continue
      const group = renderedDesksRef.current[object.id]
      const position = group?.position
      const rotation = group?.rotation.y ?? object.rotation
      const depth = group?.scale.z ?? object.depth
      const labelHeight = object.workstation ? object.labelHeight : (group?.scale.y ?? object.height) + 0.25
      projected
        .set(
          (position?.x ?? object.position[0]) - Math.sin(rotation) * depth * object.labelDepthOffset,
          (position?.y ?? object.position[1]) + labelHeight,
          (position?.z ?? object.position[2]) - Math.cos(rotation) * depth * object.labelDepthOffset,
        )
        .project(camera)
      const x = (projected.x * 0.5 + 0.5) * size.width
      const y = (-projected.y * 0.5 + 0.5) * size.height
      const visible =
        object.visible &&
        projected.z >= -1 &&
        projected.z <= 1 &&
        x >= 0 &&
        x <= size.width &&
        y >= 0 &&
        y <= size.height
      const width = label.offsetWidth
      const height = label.offsetHeight
      positions.push({
        label,
        x,
        y,
        visible,
        selected: selectedIds.includes(object.id),
        primary: object.id === selectedWorkstationId,
        left: x - width / 2 - 2,
        right: x + width / 2 + 2,
        top: y - height / 2 - 2,
        bottom: y + height / 2 + 2,
      })
    }

    positions.sort(
      (first, second) =>
        Number(second.primary) - Number(first.primary) || Number(second.selected) - Number(first.selected),
    )
    const accepted: typeof positions = []
    for (const position of positions) {
      const collides = accepted.some(
        (other) =>
          position.left < other.right &&
          position.right > other.left &&
          position.top < other.bottom &&
          position.bottom > other.top,
      )
      const visible = position.visible && !collides
      if (visible) accepted.push(position)
      position.label.style.setProperty('visibility', visible ? 'visible' : 'hidden')
      position.label.style.setProperty(
        'transform',
        `translate3d(${position.x}px, ${position.y}px, 0) translate(-50%, -50%)`,
      )
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

function CameraRig({
  resetToken,
  focusToken,
  selectedWorkstationId,
  plan,
  objects,
  controlsRef,
  dragRef,
  reducedMotion,
}: {
  resetToken: number
  focusToken: number
  selectedWorkstationId: string | null
  plan: SpatialPlan
  objects: readonly SceneObject[]
  controlsRef: ControlsRef
  dragRef: RefObject<ActiveDrag | null>
  reducedMotion: boolean
}) {
  const { size, invalidate } = useThree()
  const cameraRef = useRef<ThreeOrthographicCamera>(null)
  const transition = useRef<CameraTransition | null>(null)
  const panHeight = useRef(0.4)
  const lastCommand = useRef({ resetToken, focusToken: 0 })
  const sceneScale = Math.max(1, plan.width / 13, plan.depth / 9)
  const overviewPosition = useMemo(
    () => new Vector3(13.5 * sceneScale, 14.6 * sceneScale + 0.4, 17 * sceneScale),
    [sceneScale],
  )
  const tallest = Math.max(2.2, ...objects.filter((object) => object.visible).map((object) => object.height))
  const zoom = Math.max(
    2,
    Math.min(
      size.width / (plan.width * 0.79 + plan.depth * 0.63 + 2.5),
      size.height / (plan.width * 0.36 + plan.depth * 0.45 + 3.7 + Math.max(0, tallest - 2.2) * 1.7),
    ),
  )
  const maxZoom = Math.max(zoom * 2.2, Math.min(size.width / 4, size.height / 3.5))

  useEffect(() => {
    dragRef.current?.cancel()
    const camera = cameraRef.current
    const controls = controlsRef.current
    if (!camera || !controls) return
    transition.current = null
    camera.position.copy(overviewPosition)
    camera.zoom = zoom
    camera.updateProjectionMatrix()
    panHeight.current = 0.4
    controls.target.set(0, 0.4, 0)
    controls.update()
    invalidate()
  }, [zoom, overviewPosition, controlsRef, dragRef, size.width, size.height, invalidate])

  useEffect(() => {
    const reset = lastCommand.current.resetToken !== resetToken
    const focus = lastCommand.current.focusToken !== focusToken
    lastCommand.current = { resetToken, focusToken }
    if (!reset && !focus) return

    const camera = cameraRef.current
    const controls = controlsRef.current
    if (!camera || !controls) return
    const station = objects.find((item) => item.id === selectedWorkstationId)
    if (!reset && (!station || !station.visible)) return

    const target =
      !reset && station
        ? new Vector3(
            station.position[0],
            station.workstation ? 0.4 : Math.max(0.4, station.height * 0.45),
            station.position[2],
          )
        : new Vector3(0, 0.4, 0)
    const position = reset ? overviewPosition.clone() : camera.position.clone().sub(controls.target).add(target)
    const focusedZoom = station
      ? Math.min(
          maxZoom,
          Math.max(
            zoom,
            Math.min(size.width / (station.width * 1.5 + 2), size.height / (station.depth + station.height + 2)),
          ),
        )
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
  }, [
    focusToken,
    resetToken,
    selectedWorkstationId,
    zoom,
    maxZoom,
    overviewPosition,
    objects,
    size.width,
    size.height,
    controlsRef,
    invalidate,
  ])

  useFrame(() => {
    if (dragRef.current) {
      transition.current = null
      return
    }
    const animation = transition.current
    const camera = cameraRef.current
    const controls = controlsRef.current
    if (!animation || !camera || !controls) return

    const progress = reducedMotion ? 1 : Math.min(1, (performance.now() - animation.startedAt) / 650)
    const eased = progress * progress * (3 - 2 * progress)
    camera.position.lerpVectors(animation.fromPosition, animation.toPosition, eased)
    controls.target.lerpVectors(animation.fromTarget, animation.toTarget, eased)
    panHeight.current = controls.target.y
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
    const offsetY = panHeight.current - controls.target.y
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
      <OrthographicCamera
        ref={cameraRef}
        makeDefault
        position={overviewPosition}
        near={0.1}
        far={150 * sceneScale}
        zoom={zoom}
      />
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
        onStart={() => {
          transition.current = null
        }}
      />
    </>
  )
}

export default function RoomScene({
  plan,
  selectedWorkstationId,
  selectedIds,
  multipleMode,
  onSelect,
  resetToken,
  focusToken,
  dark,
  localizedCounts,
  editing,
  snap,
  onMove,
}: RoomSceneProps) {
  const labels = useRef<LabelElements>({})
  const labelClickIntentsRef = useRef<Record<string, boolean | undefined>>({})
  const renderedDesksRef = useRef<RenderedDesks>({})
  const controlsRef = useRef<ComponentRef<typeof OrbitControls>>(null)
  const dragRef = useRef<ActiveDrag | null>(null)
  const motionRegistryRef = useRef<MotionRegistry>({})
  const reducedMotion = useReducedMotion()
  const objects = useMemo<SceneObject[]>(
    () => [
      ...plan.workstations.map((station) => ({
        ...station,
        height: 1.44,
        labelHeight: 1.69,
        labelDepthOffset: 0.12,
        visible: true,
        workstation: true,
      })),
      ...plan.furniture.map((item) => ({
        ...item,
        labelHeight: item.height + 0.25,
        labelDepthOffset: 0,
        visible: plan.display.decor || (item.kind !== 'plant' && item.kind !== 'cabinet'),
        workstation: false,
      })),
    ],
    [plan.workstations, plan.furniture, plan.display.decor],
  )

  useEffect(() => () => dragRef.current?.cancel(), [])

  return (
    <div
      role="group"
      aria-label={t('Maquette 3D de {name}. Sélectionnez un poste ou un meuble pour l’explorer.', { name: plan.name })}
      style={{ position: 'relative', width: '100%', height: '100%' }}
    >
      <Canvas
        frameloop="demand"
        dpr={[1, 1.5]}
        shadows="percentage"
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
        style={{ width: '100%', height: '100%', touchAction: 'none' }}
        fallback={
          <div className="scene-fallback" role="status">
            {t('La vue 3D est indisponible sur cet appareil. Utilisez le plan 2D pour explorer les postes.')}
          </div>
        }
      >
        <color attach="background" args={[dark ? '#141d2a' : '#eef2f7']} />
        <CameraRig
          plan={plan}
          objects={objects}
          resetToken={resetToken}
          focusToken={focusToken}
          selectedWorkstationId={selectedWorkstationId}
          controlsRef={controlsRef}
          dragRef={dragRef}
          reducedMotion={reducedMotion}
        />
        <LabelProjector
          labels={labels}
          objects={objects}
          renderedDesksRef={renderedDesksRef}
          selectedWorkstationId={selectedWorkstationId}
          selectedIds={selectedIds}
        />
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
          <Movable
            key={workstation.id}
            item={workstation}
            plan={plan}
            selected={selectedIds.includes(workstation.id)}
            selectedIds={selectedIds}
            multipleMode={multipleMode}
            onSelect={onSelect}
            editing={editing}
            snap={snap}
            onMove={onMove}
            dragRef={dragRef}
            controlsRef={controlsRef}
            renderedDesksRef={renderedDesksRef}
            reducedMotion={reducedMotion}
            motionRegistryRef={motionRegistryRef}
          >
            <DeskModel workstation={workstation} selected={selectedIds.includes(workstation.id)} colors={plan.colors} />
          </Movable>
        ))}
        {plan.furniture
          .filter((item) => plan.display.decor || (item.kind !== 'plant' && item.kind !== 'cabinet'))
          .map((item) => (
            <Movable
              key={item.id}
              item={item}
              plan={plan}
              selected={selectedIds.includes(item.id)}
              selectedIds={selectedIds}
              multipleMode={multipleMode}
              onSelect={onSelect}
              editing={editing}
              snap={snap}
              onMove={onMove}
              dragRef={dragRef}
              controlsRef={controlsRef}
              renderedDesksRef={renderedDesksRef}
              reducedMotion={reducedMotion}
              motionRegistryRef={motionRegistryRef}
            >
              <FurnitureModel item={item} />
            </Movable>
          ))}
      </Canvas>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        {objects.map(
          (object, index) =>
            object.visible && (
              <button
                key={object.id}
                ref={(element) => {
                  labels.current[object.id] = element
                }}
                type="button"
                className={`scene-label${selectedIds.includes(object.id) ? ' is-selected' : ''}`}
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  visibility: 'hidden',
                  pointerEvents: 'auto',
                  borderColor: selectedIds.includes(object.id) ? plan.colors.accent : undefined,
                }}
                aria-label={t('Sélectionner {name} dans la vue 3D', { name: object.label })}
                title={object.label}
                aria-pressed={selectedIds.includes(object.id)}
                onPointerDown={(event) => {
                  event.stopPropagation()
                  if (event.button === 0)
                    labelClickIntentsRef.current[object.id] =
                      multipleMode || event.shiftKey || event.ctrlKey || event.metaKey
                }}
                onPointerCancel={() => {
                  delete labelClickIntentsRef.current[object.id]
                }}
                onClick={(event) => {
                  event.stopPropagation()
                  const intent = labelClickIntentsRef.current[object.id]
                  delete labelClickIntentsRef.current[object.id]
                  onSelect(
                    object.id,
                    event.detail > 0 && intent !== undefined
                      ? intent
                      : multipleMode || event.shiftKey || event.ctrlKey || event.metaKey,
                  )
                }}
              >
                {objects.length > 16 && selectedWorkstationId !== object.id ? index + 1 : object.label}
                {!!localizedCounts[object.id] && <span className="scene-link-count">{localizedCounts[object.id]}</span>}
              </button>
            ),
        )}
      </div>
    </div>
  )
}
