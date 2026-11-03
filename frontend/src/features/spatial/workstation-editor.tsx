import { useState, type FormEvent } from 'react'
import { Copy, Plus, RotateCw, Trash2, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { t } from '@/lib/i18n'
import { findWorkstation, type SpatialPlan, type Workstation } from './room-model'
import { clampWorkstation, findFreePlacement, normalizeRotation, overlaps } from './plan-geometry'
import { PlanAppearance } from './plan-appearance'
import { PlanTransferPanel } from './plan-transfer-panel'
import { workstationLabel } from './plan-transfer'
import { FurnitureCatalogPanel } from './furniture-catalog-panel'
import { FurnitureEditor } from './furniture-editor'
import { SelectionPanel } from './selection-panel'
import type { WorkspaceDocument } from './workspace-document'
import { SelectionRoomTransfer } from './selection-room-transfer'

interface Props {
  plan: SpatialPlan
  canEdit?: boolean
  persisted: boolean
  selectedId: string | null
  selectedIds: readonly string[]
  onChange: (plan: SpatialPlan) => boolean
  onSelect: (id: string | null) => void
  onSelectionChange: (ids: string[]) => void
  workspace: WorkspaceDocument
  onWorkspaceChange: (next: WorkspaceDocument) => boolean
  onSelectionMoved: (roomId: string, ids: string[]) => void
}

export function WorkstationEditor({
  plan,
  canEdit = true,
  persisted,
  selectedId,
  selectedIds,
  onChange,
  onSelect,
  onSelectionChange,
  workspace,
  onWorkspaceChange,
  onSelectionMoved,
}: Props) {
  const station = findWorkstation(selectedId, plan.workstations)
  const furniture = plan.furniture.find((item) => item.id === selectedId)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [section, setSection] = useState<'station' | 'catalog' | 'appearance' | 'files'>('station')
  const conflicts = station ? plan.workstations.filter((item) => item.id !== station.id && overlaps(item, station)) : []
  const changePlan = (next: SpatialPlan) => canEdit && onChange(next)
  const changeWorkspace = (next: WorkspaceDocument) => canEdit && onWorkspaceChange(next)

  function update(candidate: Workstation) {
    if (!canEdit) return
    try {
      const bounded = clampWorkstation(plan, candidate)
      if (
        !changePlan({
          ...plan,
          workstations: plan.workstations.map((item) => (item.id === bounded.id ? bounded : item)),
        })
      )
        return
      setError(null)
    } catch {
      setError(t('Ce poste ne rentre pas dans le plateau. Vérifiez ses dimensions.'))
    }
  }

  function add(source?: Workstation) {
    if (!canEdit) return
    if (plan.workstations.length >= 64) {
      setError(
        t('Ce plateau peut contenir jusqu’à 64 postes. Exportez un autre plateau pour organiser un nouvel espace.'),
      )
      return
    }
    let index = 1
    while (plan.workstations.some((item) => item.label === workstationLabel(index))) index++
    const candidate: Workstation = source
      ? {
          ...source,
          id: `desk-${crypto.randomUUID()}`,
          label: `${source.label.slice(0, 52)} (copie)`,
          position: [...source.position],
        }
      : {
          id: `desk-${crypto.randomUUID()}`,
          label: workstationLabel(index),
          position: [0, 0, 0],
          rotation: 0,
          width: 2,
          depth: 1,
          color: null,
        }
    const placed = findFreePlacement(plan, candidate)
    if (!placed) {
      setError(t('Aucune place libre pour ce poste. Déplacez le mobilier ou agrandissez le plateau.'))
      return
    }
    if (!changePlan({ ...plan, workstations: [...plan.workstations, placed] })) return
    onSelect(placed.id)
    setDeleting(null)
    setError(null)
  }

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canEdit || !station) return
    const data = new FormData(event.currentTarget)
    const label = String(data.get('label') || '').trim()
    if (!label || label.length > 60) {
      setError(t('Donnez un nom de 1 à 60 caractères au poste.'))
      return
    }
    const enteredX = Number(data.get('x')),
      enteredZ = Number(data.get('z'))
    const rotation = Number(data.get('rotation')),
      width = Number(data.get('width')),
      depth = Number(data.get('depth'))
    const x = enteredX === Math.round(station.position[0] * 100) / 100 ? station.position[0] : enteredX
    const z = enteredZ === Math.round(station.position[2] * 100) / 100 ? station.position[2] : enteredZ
    if (
      ![x, z, rotation, width, depth].every(Number.isFinite) ||
      width < 0.8 ||
      width > 3 ||
      depth < 0.5 ||
      depth > 1.5
    ) {
      setError(t('Vérifiez les valeurs et les dimensions du bureau.'))
      return
    }
    const angle =
      rotation === Math.round((station.rotation * 180) / Math.PI)
        ? station.rotation
        : normalizeRotation(((rotation % 360) * Math.PI) / 180)
    const color = data.has('inheritColor') ? null : String(data.get('color'))
    if (color !== null && !/^#[0-9a-fA-F]{6}$/.test(color)) {
      setError(t('Choisissez une couleur valide.'))
      return
    }
    update({ ...station, label, position: [x, 0, z], rotation: angle, width, depth, color })
  }

  return (
    <aside className="asset-inspector plan-editor" aria-label={t('Éditeur du plateau')}>
      <div className="editor-heading">
        <Wrench size={18} />
        <div>
          <p className="eyebrow">{t('ATELIER SPATIAL')}</p>
          <h2>{t('Composer l’espace')}</h2>
        </div>
      </div>
      <div className="editor-tabs" role="group" aria-label={t('Réglages de l’atelier')}>
        <button type="button" aria-pressed={section === 'station'} onClick={() => setSection('station')}>
          {t('Objets')}
        </button>
        <button type="button" aria-pressed={section === 'catalog'} onClick={() => setSection('catalog')}>
          {t('Catalogue')}
        </button>
        <button type="button" aria-pressed={section === 'appearance'} onClick={() => setSection('appearance')}>
          {t('Plateau & couleurs')}
        </button>
        <button type="button" aria-pressed={section === 'files'} onClick={() => setSection('files')}>
          {t('Fichiers')}
        </button>
      </div>
      {!canEdit && (
        <p className="location-help" role="status">
          {t('L’atelier est en lecture seule. Vos saisies restent affichées.')}
        </p>
      )}
      {section === 'files' ? (
        <PlanTransferPanel plan={plan} canEdit={canEdit} persisted={persisted} onChange={changePlan} />
      ) : (
        <fieldset disabled={!canEdit} className="spatial-edit-fields">
          {section === 'catalog' ? (
            <FurnitureCatalogPanel
              plan={plan}
              onChange={changePlan}
              onSelect={(id) => {
                onSelect(id)
                setSection('station')
              }}
            />
          ) : section === 'appearance' ? (
            <PlanAppearance plan={plan} onChange={changePlan} />
          ) : (
            <>
              <p className="location-help">
                {t('Créez votre implantation, poste par poste.')}{' '}
                {persisted
                  ? t('La version affichée est enregistrée sur le serveur.')
                  : t('Vos changements sont dans le brouillon. Enregistrez l’espace pour les partager.')}{' '}
                {t('Les saisies doivent d’abord être appliquées au plan.')}
              </p>
              <Button className="w-full" onClick={() => add()} disabled={plan.workstations.length >= 64}>
                <Plus />
                {t('Ajouter un poste')}
              </Button>
              {error && (
                <p className="storage-warning" role="alert">
                  {error}
                </p>
              )}
              {selectedIds.length > 1 ? (
                <SelectionPanel
                  key={selectedIds.join('|')}
                  plan={plan}
                  ids={selectedIds}
                  onChange={changePlan}
                  onSelectionChange={onSelectionChange}
                />
              ) : furniture ? (
                <FurnitureEditor
                  key={furniture.id}
                  item={furniture}
                  plan={plan}
                  onChange={changePlan}
                  onSelect={onSelect}
                />
              ) : station ? (
                <>
                  <div className="editor-section-title">
                    <h3>{station.label}</h3>
                    <span>
                      {plan.workstations.indexOf(station) + 1} / {plan.workstations.length}
                    </span>
                  </div>
                  <form key={JSON.stringify(station)} className="editor-form" onSubmit={apply}>
                    <label>
                      {t('Nom du poste')}
                      <input name="label" defaultValue={station.label} maxLength={60} required />
                    </label>
                    <div className="editor-field-pair">
                      <label>
                        Position X (m)
                        <input
                          name="x"
                          type="number"
                          step="any"
                          defaultValue={Math.round(station.position[0] * 100) / 100}
                          required
                        />
                      </label>
                      <label>
                        Position Z (m)
                        <input
                          name="z"
                          type="number"
                          step="any"
                          defaultValue={Math.round(station.position[2] * 100) / 100}
                          required
                        />
                      </label>
                    </div>
                    <label>
                      Orientation (°)
                      <input
                        name="rotation"
                        type="number"
                        step="any"
                        defaultValue={Math.round((station.rotation * 180) / Math.PI)}
                        required
                      />
                    </label>
                    <div className="editor-field-pair">
                      <label>
                        Largeur (m)
                        <input
                          name="width"
                          type="number"
                          min="0.8"
                          max="3"
                          step="any"
                          defaultValue={station.width}
                          required
                        />
                      </label>
                      <label>
                        Profondeur (m)
                        <input
                          name="depth"
                          type="number"
                          min="0.5"
                          max="1.5"
                          step="any"
                          defaultValue={station.depth}
                          required
                        />
                      </label>
                    </div>
                    <label>
                      {t('Couleur du poste')}
                      <input
                        name="color"
                        type="color"
                        defaultValue={station.color || plan.colors.desk}
                        onChange={(event) => {
                          const inherit = event.currentTarget.form?.elements.namedItem('inheritColor')
                          if (inherit instanceof HTMLInputElement) inherit.checked = false
                        }}
                      />
                    </label>
                    <label className="editor-checkbox">
                      <input name="inheritColor" type="checkbox" defaultChecked={station.color === null} />
                      {t('Utiliser la couleur de l’ambiance')}
                    </label>
                    <p className="location-help">
                      {t(
                        'Le centre du plateau est le point 0, 0. Le poste reste dans les limites de la pièce, fauteuil compris.',
                      )}
                    </p>
                    <Button variant="outline" type="submit" className="w-full">
                      {t('Appliquer au poste')}
                    </Button>
                  </form>
                  {conflicts.length > 0 && (
                    <p className="storage-warning" role="status">
                      {t('Ce poste chevauche : {names}. Vous pouvez ajuster l’implantation.', {
                        names: conflicts.map((item) => item.label).join(', '),
                      })}
                    </p>
                  )}
                  <div className="editor-actions">
                    <Button
                      variant="outline"
                      onClick={() =>
                        update({ ...station, rotation: normalizeRotation(station.rotation + Math.PI / 2) })
                      }
                    >
                      <RotateCw />
                      {t('Pivoter de 90°')}
                    </Button>
                    <Button variant="outline" onClick={() => add(station)} disabled={plan.workstations.length >= 64}>
                      <Copy />
                      {t('Dupliquer')}
                    </Button>
                  </div>
                  {deleting === station.id ? (
                    <div className="editor-delete-confirm">
                      <p>{t('Supprimer ce poste ? Ses localisations de matériel restent récupérables.')}</p>
                      <Button
                        variant="destructive"
                        onClick={() => {
                          if (!canEdit) return
                          const next = plan.workstations.filter((item) => item.id !== station.id)
                          if (!changePlan({ ...plan, workstations: next })) return
                          onSelect(next[0]?.id || null)
                          setDeleting(null)
                        }}
                      >
                        {t('Confirmer la suppression')}
                      </Button>
                      <Button variant="ghost" onClick={() => setDeleting(null)}>
                        {t('Conserver le poste')}
                      </Button>
                    </div>
                  ) : (
                    <Button variant="ghost" className="editor-delete" onClick={() => setDeleting(station.id)}>
                      <Trash2 />
                      {t('Supprimer ce poste')}
                    </Button>
                  )}
                </>
              ) : (
                <div className="editor-empty">
                  <p>
                    {t(
                      'Sélectionnez un poste dans le plan pour modifier ses propriétés, ou ajoutez le premier poste de votre espace.',
                    )}
                  </p>
                </div>
              )}
              <SelectionRoomTransfer
                key={selectedIds.join('|')}
                workspace={workspace}
                sourceRoomId={plan.id}
                ids={selectedIds}
                onChange={changeWorkspace}
                onMoved={onSelectionMoved}
              />
            </>
          )}
        </fieldset>
      )}
    </aside>
  )
}
