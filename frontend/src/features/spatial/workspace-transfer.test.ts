import { describe, expect, it } from 'vitest'
import { defaultPlan } from './plan-document'
import type { WorkspaceDocument } from './workspace-document'
import {
  createWorkspaceFromPlan,
  createWorkspaceHistory,
  parseWorkspace,
  pushWorkspaceChange,
  redoWorkspace,
  undoWorkspace,
  workspaceFileSizeLimit,
} from './workspace-document'
import { findWorkspaceStation } from './workspace-rooms'
import { getWorkspaceSummary, isSameWorkspace, serializeWorkspace } from './workspace-transfer'

const byteLength = (raw: string) => new TextEncoder().encode(raw).byteLength

function twoFloors(): WorkspaceDocument {
  const workspace = createWorkspaceFromPlan()
  workspace.name = 'Atelier Montréal 🪴'
  workspace.floors.push({ id: 'floor-support', name: 'Étage support' })
  const plan = structuredClone(defaultPlan)
  plan.id = 'room-support'
  plan.name = 'Salle équipe support'
  plan.width = 18
  plan.depth = 12
  plan.colors = { floor: '#123456', wall: '#abcdef', desk: '#aabbcc', accent: '#557799' }
  plan.display = { walls: false, decor: false }
  plan.workstations = plan.workstations.map((item, index) => ({
    ...item,
    id: `desk-support-${index}`,
    color: index === 0 ? '#556677' : item.color,
  }))
  plan.furniture = plan.furniture.map((item, index) => ({
    ...item,
    id: `furniture-support-${index}`,
    color: '#887766',
  }))
  workspace.rooms.push({ floorId: 'floor-support', plan })
  return workspace
}

function denseWorkspace(): WorkspaceDocument {
  const workspace = createWorkspaceFromPlan()
  workspace.rooms = Array.from({ length: 32 }, (_, roomIndex) => ({
    floorId: 'floor-01',
    plan: {
      ...structuredClone(defaultPlan),
      id: `room-dense-${roomIndex}`,
      name: 'Salle',
      width: 50,
      depth: 50,
      workstations: Array.from({ length: 64 }, (_, index) => ({
        id: `desk-${`${roomIndex}-${index}-`.padEnd(80, 'x')}`,
        label: 'a'.repeat(60),
        position: [-0.0000012345678901234567, 0, -0.0000012345678901234567],
        rotation: 0.0000012345678901234567,
        width: 0.8000000000000002,
        depth: 0.5000000000000001,
        color: '#abcdef',
      })),
      furniture: Array.from({ length: 64 }, (_, index) => ({
        id: `furniture-${`${roomIndex}-${index}-`.padEnd(80, 'x')}`,
        kind: 'partition',
        label: 'a'.repeat(60),
        position: [-0.0000012345678901234567, 0, -0.0000012345678901234567],
        rotation: 0.0000012345678901234567,
        width: 0.8000000000000002,
        depth: 0.5000000000000001,
        height: 0.15000000000000002,
        color: '#abcdef',
      })),
    },
  }))
  return workspace
}

function workspaceAtLimit(): WorkspaceDocument {
  const workspace = denseWorkspace()
  let remaining = workspaceFileSizeLimit - byteLength(JSON.stringify(workspace))
  for (const room of workspace.rooms) {
    for (const item of [...room.plan.workstations, ...room.plan.furniture]) {
      const count = Math.min(60, Math.floor(remaining / 2))
      item.label = '界'.repeat(count) + 'a'.repeat(60 - count)
      remaining -= count * 2
    }
  }
  if (remaining === 1) {
    workspace.name += 'a'
    remaining--
  }
  if (remaining !== 0) throw new Error('La fixture ne peut pas atteindre exactement la limite UTF-8.')
  return workspace
}

describe('sauvegarde de l’espace complet', () => {
  it('exporte et relit deux étages et deux salles sans perdre de propriété, de relation ou d’identifiant', () => {
    const workspace = twoFloors(),
      source = structuredClone(workspace)
    const raw = serializeWorkspace(workspace)
    const imported = parseWorkspace(raw)
    expect(raw.endsWith('\n')).toBe(true)
    expect(byteLength(raw)).toBeLessThanOrEqual(workspaceFileSizeLimit)
    expect(imported).toEqual(workspace)
    expect(
      imported.rooms.map((room) => ({
        floorId: room.floorId,
        roomId: room.plan.id,
        desks: room.plan.workstations.map((item) => item.id),
        furniture: room.plan.furniture.map((item) => item.id),
      })),
    ).toEqual(
      workspace.rooms.map((room) => ({
        floorId: room.floorId,
        roomId: room.plan.id,
        desks: room.plan.workstations.map((item) => item.id),
        furniture: room.plan.furniture.map((item) => item.id),
      })),
    )
    expect(getWorkspaceSummary(imported)).toEqual({
      floorCount: 2,
      roomCount: 2,
      workstationCount: 16,
      furnitureCount: 8,
    })
    imported.rooms[1]!.plan.colors.floor = '#998877'
    imported.rooms[1]!.plan.workstations[0]!.position[0] = 0
    expect(workspace).toEqual(source)
  })

  it('compte aussi les étages et salles vides sans inventer de postes ou de mobilier', () => {
    const workspace = twoFloors()
    workspace.floors.push({ id: 'floor-reserve', name: 'Réserve' })
    workspace.rooms[1]!.plan.workstations = []
    workspace.rooms[1]!.plan.furniture = []
    expect(getWorkspaceSummary(workspace)).toEqual({
      floorCount: 3,
      roomCount: 2,
      workstationCount: 8,
      furnitureCount: 4,
    })
  })

  it('passe au JSON compact si l’indentation seule dépasserait la limite', () => {
    const workspace = denseWorkspace()
    expect(byteLength(JSON.stringify(workspace))).toBeLessThan(workspaceFileSizeLimit)
    expect(byteLength(JSON.stringify(workspace, null, 2))).toBeGreaterThan(workspaceFileSizeLimit)
    const raw = serializeWorkspace(workspace)
    expect(raw).toBe(JSON.stringify(parseWorkspace(JSON.stringify(workspace))))
    expect(byteLength(raw)).toBeLessThanOrEqual(workspaceFileSizeLimit)
    expect(parseWorkspace(raw)).toEqual(workspace)
  })

  it('exporte exactement deux millions d’octets UTF-8 puis refuse l’octet supplémentaire', () => {
    const workspace = workspaceAtLimit()
    const compact = JSON.stringify(workspace)
    expect(compact.length).toBeLessThan(workspaceFileSizeLimit)
    expect(byteLength(compact)).toBe(workspaceFileSizeLimit)
    const raw = serializeWorkspace(workspace)
    expect(byteLength(raw)).toBe(workspaceFileSizeLimit)
    expect(parseWorkspace(raw)).toEqual(workspace)
    workspace.name += 'a'
    expect(byteLength(JSON.stringify(workspace))).toBe(workspaceFileSizeLimit + 1)
    expect(() => serializeWorkspace(workspace)).toThrow(/trop volumineux/)
    expect(() => parseWorkspace(`${raw} `)).toThrow(/trop volumineux/)
  })

  it('reconnaît un import identique après validation sans masquer les changements de structure ou d’ID', () => {
    const workspace = twoFloors(),
      source = structuredClone(workspace)
    expect(isSameWorkspace(workspace, parseWorkspace(serializeWorkspace(workspace)))).toBe(true)
    expect(isSameWorkspace(workspace, { ...workspace, name: ` ${workspace.name} ` })).toBe(true)
    expect(isSameWorkspace(workspace, { ...workspace, floors: [...workspace.floors].reverse() })).toBe(false)
    expect(isSameWorkspace(workspace, { ...workspace, rooms: [...workspace.rooms].reverse() })).toBe(false)
    const changed = structuredClone(workspace)
    changed.rooms[1]!.plan.workstations[0]!.id = 'desk-renamed'
    expect(isSameWorkspace(workspace, changed)).toBe(false)
    changed.rooms[1]!.plan.workstations[0]!.id = workspace.rooms[1]!.plan.workstations[0]!.id
    changed.rooms[1]!.plan.name = 'Autre salle'
    expect(isSameWorkspace(workspace, changed)).toBe(false)
    expect(workspace).toEqual(source)
  })

  it('remplace l’espace en une étape annulable en conservant les identifiants utilisés par les liens externes', () => {
    const initial = createWorkspaceHistory(createWorkspaceFromPlan())
    const workspace = twoFloors()
    const station = workspace.rooms[0]!.plan.workstations.shift()!
    workspace.rooms[1]!.plan.workstations.push(station)
    const locations = { 42: station.id, 73: 'desk-orphan' }
    const imported = parseWorkspace(serializeWorkspace(workspace))
    const changed = pushWorkspaceChange(initial, imported)
    expect(changed.past).toHaveLength(1)
    expect(findWorkspaceStation(changed.present, locations[42])!.room.plan.id).toBe('room-support')
    expect(findWorkspaceStation(changed.present, locations[73])).toBeUndefined()
    const restored = undoWorkspace(changed)
    expect(restored.present).toBe(initial.present)
    expect(findWorkspaceStation(restored.present, locations[42])!.room.plan.id).toBe('plateau-a')
    expect(redoWorkspace(restored).present).toEqual(imported)
    expect(locations).toEqual({ 42: 'desk-01', 73: 'desk-orphan' })
    expect(pushWorkspaceChange(changed, parseWorkspace(serializeWorkspace(changed.present)))).toBe(changed)
  })

  it.each([
    [
      'étage absent',
      (workspace: WorkspaceDocument) => {
        workspace.rooms[1]!.floorId = 'floor-missing'
      },
    ],
    [
      'salle dupliquée',
      (workspace: WorkspaceDocument) => {
        workspace.rooms[1]!.plan.id = workspace.rooms[0]!.plan.id
      },
    ],
    [
      'poste dupliqué',
      (workspace: WorkspaceDocument) => {
        workspace.rooms[1]!.plan.workstations[0]!.id = 'desk-01'
      },
    ],
    [
      'meuble dupliqué',
      (workspace: WorkspaceDocument) => {
        workspace.rooms[1]!.plan.furniture[0]!.id = workspace.rooms[0]!.plan.furniture[0]!.id
      },
    ],
    [
      'position invalide',
      (workspace: WorkspaceDocument) => {
        workspace.rooms[1]!.plan.workstations[0]!.position[0] = 100
      },
    ],
  ])('refuse aussi les incohérences à l’export, à la comparaison et dans l’aperçu : %s', (_label, mutate) => {
    const workspace = twoFloors()
    mutate(workspace)
    expect(() => serializeWorkspace(workspace)).toThrow()
    expect(() => isSameWorkspace(twoFloors(), workspace)).toThrow()
    expect(() => getWorkspaceSummary(workspace)).toThrow()
  })
})

describe.each(['assets', 'locations', 'associations'])('le document ne transporte jamais le champ %s', (key) => {
  it.each([
    ['espace', (workspace: WorkspaceDocument) => workspace],
    ['étage', (workspace: WorkspaceDocument) => workspace.floors[0]!],
    ['salle', (workspace: WorkspaceDocument) => workspace.rooms[0]!],
    ['plan', (workspace: WorkspaceDocument) => workspace.rooms[0]!.plan],
    ['couleurs', (workspace: WorkspaceDocument) => workspace.rooms[0]!.plan.colors],
    ['affichage', (workspace: WorkspaceDocument) => workspace.rooms[0]!.plan.display],
    ['poste', (workspace: WorkspaceDocument) => workspace.rooms[0]!.plan.workstations[0]!],
    ['mobilier', (workspace: WorkspaceDocument) => workspace.rooms[0]!.plan.furniture[0]!],
  ])('refuse ce champ dans %s au lieu de le supprimer silencieusement', (_label, target) => {
    const workspace = twoFloors()
    Object.assign(target(workspace), { [key]: { 42: 'desk-01' } })
    expect(() => serializeWorkspace(workspace)).toThrow()
    expect(() => parseWorkspace(JSON.stringify(workspace))).toThrow()
  })
})
