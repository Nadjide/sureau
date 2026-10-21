import { useMemo, useState } from 'react'
import { RoundedBox, useCursor } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { Color, type Group } from 'three'
import type { FurnitureItem } from './room-model'

type Vector = [number, number, number]

function Piece({ size, position, color, rounded = false, metal = false }: {
  size: Vector
  position: Vector
  color: string
  rounded?: boolean
  metal?: boolean
}) {
  const material = <meshStandardMaterial color={color} roughness={metal ? 0.4 : 0.9} metalness={metal ? 0.55 : 0} />
  return rounded
    ? <RoundedBox args={size} position={position} radius={Math.min(...size) * 0.18} smoothness={2} bevelSegments={2} castShadow receiveShadow>{material}</RoundedBox>
    : <mesh position={position} castShadow receiveShadow><boxGeometry args={size} />{material}</mesh>
}

function FurnitureGeometry({ item }: { item: FurnitureItem }) {
  const { color, kind } = item
  const shade = useMemo(() => new Color(color).multiplyScalar(0.7).getStyle(), [color])

  if (kind === 'table') return <>
    <Piece size={[1, 0.1, 1]} position={[0, 0.94, 0]} color={color} rounded />
    {[-1, 1].flatMap((x) => [-1, 1].map((z) => (
      <Piece key={`${x}-${z}`} size={[0.045, 0.9, 0.075]} position={[x * 0.42, 0.45, z * 0.38]} color="#596573" metal />
    )))}
  </>

  if (kind === 'cabinet') return <>
    <Piece size={[1, 1, 0.94]} position={[0, 0.5, 0]} color={shade} rounded />
    {[-1, 1].map((side) => <group key={side}>
      <Piece size={[0.477, 0.91, 0.045]} position={[side * 0.248, 0.51, 0.47]} color={color} rounded />
      <Piece size={[0.018, 0.15, 0.02]} position={[side * 0.07, 0.53, 0.49]} color="#485564" metal />
    </group>)}
  </>

  if (kind === 'plant') return <>
    <mesh position={[0, 0.2, 0]} castShadow receiveShadow>
      <cylinderGeometry args={[0.36, 0.27, 0.4, 16]} />
      <meshStandardMaterial color="#b9ab95" roughness={0.95} />
    </mesh>
    <mesh position={[0, 0.403, 0]}>
      <cylinderGeometry args={[0.325, 0.325, 0.015, 16]} />
      <meshStandardMaterial color="#4a4437" roughness={1} />
    </mesh>
    {Array.from({ length: 6 }, (_, index) => <group key={index} rotation={[0, index * Math.PI / 3, 0]}>
      <mesh position={[0.14, index % 2 ? 0.71 : 0.66, 0]} scale={[0.09, 0.28, 0.16]} rotation={[0, 0, -0.4]} castShadow>
        <sphereGeometry args={[1, 8, 6]} />
        <meshStandardMaterial color={index % 2 ? color : shade} roughness={0.95} />
      </mesh>
    </group>)}
  </>

  if (kind === 'partition') return <>
    <Piece size={[0.96, 0.85, 0.4]} position={[0, 0.565, 0]} color={color} rounded />
    {[-1, 1].map((side) => <group key={side}>
      <Piece size={[0.035, 0.15, 0.35]} position={[side * 0.35, 0.09, 0]} color="#687482" metal />
      <Piece size={[0.13, 0.045, 1]} position={[side * 0.35, 0.025, 0]} color="#687482" metal />
    </group>)}
  </>

  return <>
    {[-1, 1].flatMap((x) => [-1, 1].map((z) => (
      <Piece key={`${x}-${z}`} size={[0.045, 0.13, 0.085]} position={[x * 0.39, 0.065, z * 0.33]} color="#64534b" />
    )))}
    <Piece size={[0.96, 0.25, 0.94]} position={[0, 0.245, 0]} color={shade} rounded />
    <Piece size={[0.96, 0.66, 0.17]} position={[0, 0.65, -0.365]} color={color} rounded />
    {[-1, 1].map((side) => <group key={side}>
      <Piece size={[0.13, 0.53, 0.9]} position={[side * 0.435, 0.495, 0]} color={color} rounded />
      <Piece size={[0.38, 0.17, 0.66]} position={[side * 0.2, 0.435, 0.08]} color={color} rounded />
      <Piece size={[0.38, 0.38, 0.13]} position={[side * 0.2, 0.72, -0.22]} color={color} rounded />
    </group>)}
  </>
}

export function FurnitureModel({ item, selected, accent, onSelect, onObjectRef }: {
  item: FurnitureItem
  selected: boolean
  accent: string
  onSelect: (id: string) => void
  onObjectRef: (id: string, group: Group | null) => void
}) {
  const [hovered, setHovered] = useState(false)
  useCursor(hovered)

  function choose(event: ThreeEvent<MouseEvent>) {
    event.stopPropagation()
    if (event.delta <= 3) onSelect(item.id)
  }

  return <group
    ref={(group) => onObjectRef(item.id, group)}
    position={item.position}
    rotation={[0, item.rotation, 0]}
    scale={[item.width, item.height, item.depth]}
    onClick={choose}
    onPointerOver={(event) => { event.stopPropagation(); setHovered(true) }}
    onPointerOut={() => setHovered(false)}
  >
    {(selected || hovered) && <mesh position={[0, 0.025 / item.height, 0]}>
      <boxGeometry args={[1.08, 0.02 / item.height, 1.08]} />
      <meshBasicMaterial color={accent} transparent opacity={selected ? 0.2 : 0.1} depthWrite={false} />
    </mesh>}
    <FurnitureGeometry item={item} />
  </group>
}
