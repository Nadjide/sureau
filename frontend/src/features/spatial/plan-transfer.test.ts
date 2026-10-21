import { describe, expect, it } from 'vitest'
import { defaultPlan, parsePlan, planFileSizeLimit } from './plan-document'
import { createPlanHistory, pushPlanChange, redoPlan, undoPlan } from './plan-history'
import { createEmptyPlan, createExamplePlan, serializePlan } from './plan-transfer'

describe('transfert de plans', () => {
  it('exporte et réimporte le plateau versionné sans altérer ses propriétés', () => {
    const plan = createExamplePlan()
    plan.name = 'Équipe support 🪴'
    plan.colors = { floor: '#123456', wall: '#abcdef', desk: '#8899aa', accent: '#662233' }
    plan.display = { walls: false, decor: true }
    plan.workstations[0]!.color = '#ccbbaa'
    const serialized = serializePlan(plan)
    expect(serialized.endsWith('\n')).toBe(true)
    expect(new TextEncoder().encode(serialized).byteLength).toBeLessThanOrEqual(planFileSizeLimit)
    expect(parsePlan(serialized)).toEqual(plan)
  })

  it('refuse les données d’inventaire et les associations ajoutées au document avant export', () => {
    const plan = createExamplePlan()
    const withAssets = { ...plan, assets: [{ assetTag: 'CONFIDENTIEL' }] }
    const withAssociations = { ...plan, associations: { 42: 'desk-01' } }
    expect(() => serializePlan(withAssets)).toThrow()
    expect(() => serializePlan(withAssociations)).toThrow()
    const invalidStation = { ...plan.workstations[0]!, assetIds: [42] }
    expect(() => serializePlan({ ...plan, workstations: [invalidStation] })).toThrow()
  })

  it('vide les postes et le mobilier dans une copie indépendante du plateau personnalisé', () => {
    const source = createExamplePlan()
    source.name = 'Espace support'
    source.width = 20
    source.colors.floor = '#112233'
    source.display.decor = false
    const empty = createEmptyPlan(source)
    expect(empty).toEqual({ ...source, workstations: [], furniture: [] })
    expect(source.furniture.length).toBeGreaterThan(0)
    expect(source.workstations).toHaveLength(8)
    empty.colors.floor = '#445566'
    empty.display.decor = true
    expect(source.colors.floor).toBe('#112233')
    expect(source.display.decor).toBe(false)
    expect(parsePlan(serializePlan(empty))).toEqual(empty)
  })

  it('restaure une copie indépendante de l’exemple avec les identifiants d’origine', () => {
    const first = createExamplePlan()
    const second = createExamplePlan()
    first.name = 'Autre nom'
    first.workstations[0]!.position[0] = 0
    first.display.walls = false
    expect(second).toEqual(defaultPlan)
    expect(second.workstations.map((station) => station.id)).toEqual(defaultPlan.workstations.map((station) => station.id))
    expect(first.workstations).not.toBe(defaultPlan.workstations)
  })

  it('refuse de vider ou exporter un document source invalide', () => {
    const source = createExamplePlan()
    source.workstations[0]!.position[0] = 999
    expect(() => createEmptyPlan(source)).toThrow()
    expect(() => serializePlan(source)).toThrow()
  })

  it('importe un fichier validé comme une seule action entièrement annulable', () => {
    const previous = createExamplePlan()
    previous.name = 'Avant import'
    const history = createPlanHistory(previous)
    const imported = createEmptyPlan(createExamplePlan())
    imported.name = 'Plateau importé'
    imported.colors.accent = '#112233'
    const file = serializePlan(imported)
    const changed = pushPlanChange(history, parsePlan(file))
    expect(changed.past).toHaveLength(1)
    expect(changed.present).toEqual(imported)
    expect(undoPlan(changed).present).toEqual(previous)
    expect(redoPlan(undoPlan(changed)).present).toEqual(imported)
    expect(() => parsePlan('{broken')).toThrow()
    expect(history.present).toEqual(previous)
    expect(history.past).toEqual([])
  })
})
