import { describe, expect, it } from 'vitest'
import { guideSteps, rightsNote, roleSentence } from './guide-steps'

const notesFor = (role: 'ADMIN' | 'EDITOR' | 'VIEWER') =>
  guideSteps.filter((step) => rightsNote(step, role) !== null).map((step) => step.id)

describe('guide adapté au rôle', () => {
  it('prévient chaque compte des étapes qu’il ne peut pas suivre, et seulement de celles-là', () => {
    expect(notesFor('ADMIN')).toEqual([])
    expect(notesFor('EDITOR')).toEqual(['team'])
    expect(notesFor('VIEWER')).toEqual(['spaces', 'inventory', 'placement', 'assignment', 'team'])
  })

  it('présente le rôle de la personne dès la première étape', () => {
    expect(roleSentence('VIEWER')).toMatch(/lecteur/)
    expect(new Set([roleSentence('ADMIN'), roleSentence('EDITOR'), roleSentence('VIEWER')]).size).toBe(3)
  })
})
