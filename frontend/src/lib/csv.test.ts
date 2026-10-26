import { describe, expect, it } from 'vitest'
import { decodeText, parseCsv, toCsv } from './csv'

describe('lecture d’un CSV de tableur', () => {
  it('reconnaît le point-virgule des tableurs français et retire la marque d’ordre des octets', () => {
    expect(parseCsv('﻿Identifiant;Nom\r\nIT-1;Portable, 14 pouces\r\n')).toEqual([['Identifiant', 'Nom'], ['IT-1', 'Portable, 14 pouces']])
  })

  it('reconnaît la virgule et les champs entre guillemets, sur plusieurs lignes', () => {
    expect(parseCsv('tag,name\nIT-1,"Écran ""Dell"", 27"""\nIT-2,"Ligne 1\nLigne 2"')).toEqual([
      ['tag', 'name'], ['IT-1', 'Écran "Dell", 27"'], ['IT-2', 'Ligne 1\nLigne 2'],
    ])
  })

  it('garde les cellules vides et ignore les lignes vides', () => {
    expect(parseCsv('a;b;c\n\n1;;3\n;;\n')).toEqual([['a', 'b', 'c'], ['1', '', '3']])
  })

  it('relit exactement ce qu’il écrit', () => {
    const rows = [['Identifiant', 'Nom'], ['IT-1', 'Portable "pro"; 14'], ['IT-2', '']]
    expect(parseCsv(toCsv(rows))).toEqual([rows[0], rows[1], ['IT-2', '']])
  })

  it('lit l’UTF-8 et, à défaut, l’encodage Windows des exports Excel', () => {
    expect(decodeText(new TextEncoder().encode('Écran').buffer)).toBe('Écran')
    expect(decodeText(new Uint8Array([0xc9, 0x63, 0x72, 0x61, 0x6e]).buffer)).toBe('Écran')
  })
})
