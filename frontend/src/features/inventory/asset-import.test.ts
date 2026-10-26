import { describe, expect, it, vi } from 'vitest'
import { ApiError, apiClient } from '@/lib/api-client'
import { parseCsv } from '@/lib/csv'
import { attachServerErrors, importAssets, importTemplate, planImport } from './asset-import'

describe('préparation d’un import', () => {
  it('comprend les colonnes en français ou en anglais, les libellés et les dates françaises', () => {
    const plan = planImport([
      'Identifiant;NOM;Catégorie;État;Date d’achat;Personne;E-mail;Service;Commentaire',
      'IT-1;Portable;ordinateur;Affecté;5/3/2025;Camille Bernard;camille@exemple.fr;Accueil;à recycler',
      'IT-2;Switch;NETWORK_EQUIPMENT;;;;;;',
    ].join('\n'))

    expect(plan.problems).toEqual([])
    expect(plan.ignoredColumns).toEqual(['Commentaire'])
    expect(plan.rows.map((row) => row.input)).toEqual([
      expect.objectContaining({ assetTag: 'IT-1', category: 'COMPUTER', status: 'ASSIGNED', purchaseDate: '2025-03-05',
        assignee: { name: 'Camille Bernard', email: 'camille@exemple.fr', department: 'Accueil' } }),
      expect.objectContaining({ assetTag: 'IT-2', category: 'NETWORK_EQUIPMENT', status: 'AVAILABLE', assignee: null }),
    ])
  })

  it('affecte un matériel dont une personne est nommée sans état, et classe sans catégorie en « Autre »', () => {
    const [row] = planImport('tag,name,assignee\nIT-1,Casque,Léa Dubois').rows
    expect(row?.input).toMatchObject({ status: 'ASSIGNED', category: 'OTHER', assignee: { name: 'Léa Dubois' } })
  })

  it('signale chaque problème avec sa ligne dans le fichier', () => {
    const plan = planImport([
      'Identifiant;Nom;Catégorie;État;Date d’achat;Personne',
      'IT-1;;Imprimante;Disponible;;',
      'IT-2;Écran;Écran;Rangé;32/01/2025;',
      'IT-1;Doublon;;Disponible;;Camille',
    ].join('\n'))

    expect(plan.rows.map((row) => [row.line, row.errors])).toEqual([
      [2, { category: 'Catégorie inconnue : « Imprimante ».', name: 'Le nom du matériel est obligatoire.' }],
      [3, { status: 'État inconnu : « Rangé ».', purchaseDate: 'Renseignez une date d’achat valide.' }],
      [4, { assigneeName: 'Seul un matériel affecté peut nommer une personne : choisissez l’état « Affecté ».',
        assetTag: 'Identifiant déjà présent ligne 2.' }],
    ])
    expect(plan.rows.every((row) => row.input === null)).toBe(true)
  })

  it('refuse un fichier sans les colonnes obligatoires, vide ou trop long', () => {
    expect(planImport('Nom;Marque\nPortable;Dell').problems).toEqual(['Ajoutez une colonne « Identifiant » : elle est obligatoire.'])
    expect(planImport('').problems).toEqual(['Le fichier est vide.'])
    expect(planImport('tag;name').problems).toEqual(['Le fichier ne contient aucune ligne de matériel.'])
    const long = ['tag;name', ...Array.from({ length: 1001 }, (_, index) => `IT-${index};Portable`)].join('\n')
    expect(planImport(long).problems).toEqual(['Le fichier contient 1001 lignes : importez-en 1000 au plus à la fois.'])
  })

  it('propose un modèle que l’import accepte tel quel', () => {
    const plan = planImport(importTemplate)
    expect(parseCsv(importTemplate)[0]).toContain('Identifiant')
    expect(plan.problems).toEqual([])
    expect(plan.rows.every((row) => row.input !== null)).toBe(true)
  })

  it('rattache les refus du serveur aux lignes du fichier', () => {
    const { rows } = planImport('tag;name\nIT-1;Portable\nIT-2;Écran')
    const checked = attachServerErrors(rows, {
      'assets[1].assetTag': 'Déjà utilisé par un matériel de l’inventaire.', 'assets[0].assignee': 'Seul un matériel affecté peut nommer une personne.',
    })
    expect(checked.map((row) => [row.line, row.errors])).toEqual([
      [2, { assigneeName: 'Seul un matériel affecté peut nommer une personne.' }],
      [3, { assetTag: 'Déjà utilisé par un matériel de l’inventaire.' }],
    ])
  })
})

describe('envoi d’un import', () => {
  it('envoie les lignes en une demande et traduit les refus du serveur', async () => {
    const json = vi.spyOn(apiClient, 'requestJson').mockRejectedValue(
      new ApiError('http', 'Vérifiez les champs indiqués avant de réessayer.', 400, 'VALIDATION_ERROR', { 'assets[0].assetTag': 'Déjà utilisé par un matériel de l’inventaire.' }))
    const inputs = planImport('tag;name\nIT-1;Portable').rows.map((row) => row.input!)

    await expect(importAssets(inputs)).rejects.toMatchObject({ status: 400, fieldErrors: { 'assets[0].assetTag': 'Déjà utilisé par un matériel de l’inventaire.' } })
    expect(json).toHaveBeenCalledWith('/api/assets/import', expect.any(Function), expect.objectContaining({ method: 'POST', json: { assets: inputs } }))
    json.mockRestore()
  })
})
