import { Compass, LayoutGrid, MapPin, Monitor, ShieldCheck, UserRound, Users, type LucideIcon } from 'lucide-react'
import type { SessionUser } from '@/features/auth/auth-api'

type Role = SessionUser['role']

/** Who can follow a step; everyone can read it, and the guide says when an account lacks the rights. */
export type GuideAudience = 'everyone' | 'editors' | 'administrators'

export interface GuideStep {
  id: string
  icon: LucideIcon
  title: string
  summary: string
  /** What to look for on screen: `label` is the exact wording of the button or menu. */
  actions: readonly { label: string; text: string }[]
  tip?: string
  audience: GuideAudience
}

export const guideSteps: readonly GuideStep[] = [
  {
    id: 'welcome', icon: Compass, audience: 'everyone',
    title: 'Bienvenue dans Sureau',
    summary: 'Sureau réunit votre parc informatique et vos espaces de travail : chaque matériel a sa fiche, chaque poste sa place dans le plan, et toute l’équipe partage la même version.',
    actions: [
      { label: 'Espaces', text: 'le plan de vos salles, en 2D ou en 3D, avec les postes et le mobilier.' },
      { label: 'Matériel', text: 'l’inventaire : recherche, filtres, fiches et historique.' },
      { label: 'Mes espaces', text: 'la colonne de gauche liste les étages et les salles ; un clic ouvre la salle.' },
    ],
  },
  {
    id: 'spaces', icon: LayoutGrid, audience: 'editors',
    title: 'Composer vos espaces',
    summary: 'Partez de l’exemple ou d’une salle vide, puis dessinez vos salles comme elles sont.',
    actions: [
      { label: 'Préparer l’exemple', text: 'ou « Créer une salle vide », à la première ouverture de Espaces.' },
      { label: 'Gérer les espaces', text: 'ajoute, renomme ou réorganise les étages et les salles.' },
      { label: 'Modifier', text: 'ouvre l’atelier : postes, mobilier du catalogue, plateau et couleurs. Ctrl+Z annule.' },
      { label: 'Enregistrer l’espace', text: 'partage vos changements avec l’équipe. Jusque-là, ils restent un brouillon.' },
    ],
    tip: 'Si quelqu’un enregistre en même temps que vous, Sureau le signale et garde votre brouillon : rechargez la version du serveur ou exportez votre copie avant de choisir.',
  },
  {
    id: 'inventory', icon: Monitor, audience: 'editors',
    title: 'Recenser le matériel',
    summary: 'Chaque équipement a une fiche : un identifiant de parc unique, un nom, une catégorie et un état.',
    actions: [
      { label: 'Ajouter du matériel', text: 'crée une fiche, avec marque, modèle, numéro de série et date d’achat si vous les avez.' },
      { label: 'Importer', text: 'crée tout un fichier CSV d’un coup. Téléchargez le modèle ; l’aperçu signale chaque ligne à corriger.' },
      { label: 'Rechercher du matériel', text: 'par nom, identifiant, numéro de série ou personne, et filtrez par état.' },
    ],
  },
  {
    id: 'placement', icon: MapPin, audience: 'editors',
    title: 'Placer le matériel sur un poste',
    summary: 'Le plan montre où se trouve chaque équipement.',
    actions: [
      { label: 'Localisation dans le plan', text: 'dans la fiche du matériel, choisissez son poste.' },
      { label: 'Voir dans le plan', text: 'ouvre la salle et sélectionne le poste du matériel.' },
      { label: 'Enregistrer l’espace', text: 'partage les localisations avec le reste de l’espace.' },
    ],
    tip: 'Placer un matériel ne change pas son état : un ordinateur peut être sur un poste et rester disponible.',
  },
  {
    id: 'assignment', icon: UserRound, audience: 'editors',
    title: 'Affecter et suivre',
    summary: 'Sachez à tout moment qui utilise quoi, et ce qui a changé.',
    actions: [
      { label: 'Modifier la fiche', text: 'choisissez l’état « Affecté » et nommez la personne équipée, avec son e-mail et son service. Elle n’a pas besoin de compte.' },
      { label: 'Voir l’historique', text: 'chaque changement de la fiche et de poste, avec son auteur et sa date. Tout compte peut le consulter.' },
      { label: 'Retirer du parc', text: 'pour le matériel qui quitte l’inventaire. Un matériel affecté doit d’abord être rendu.' },
    ],
  },
  {
    id: 'team', icon: Users, audience: 'administrators',
    title: 'Travailler en équipe',
    summary: 'Chaque personne a son compte et son rôle : administrateur, éditeur ou lecteur.',
    actions: [
      { label: 'Gérer l’équipe', text: 'dans le menu de votre compte : créez les comptes, choisissez leur rôle, désactivez ceux qui partent.' },
      { label: 'E-mail', text: 'renseigné sur un compte, il permet la connexion d’entreprise si votre instance la propose.' },
      { label: 'Changer mon mot de passe', text: 'dans le menu de votre compte, pour tout le monde.' },
    ],
  },
  {
    id: 'data', icon: ShieldCheck, audience: 'everyone',
    title: 'Protéger vos données',
    summary: 'Vos données restent sur votre instance. Deux réflexes les gardent en sécurité.',
    actions: [
      { label: 'Exporter le brouillon', text: 'une copie de votre espace en cours, à garder avant une manipulation importante.' },
      { label: 'Sauvegardes', text: 'la personne qui administre le serveur sauvegarde la base avec « deploy/sureau.sh backup », décrit dans le guide d’exploitation.' },
    ],
    tip: 'Le thème clair ou sombre se change avec l’icône lune ou soleil de l’en-tête. Ce guide reste accessible par le bouton « Guide ».',
  },
]

const roleSentences: Record<Role, string> = {
  ADMIN: 'Vous êtes administrateur : vous gérez le matériel, les espaces et les comptes de l’équipe.',
  EDITOR: 'Vous êtes éditeur : vous modifiez le matériel et les espaces.',
  VIEWER: 'Vous êtes lecteur : vous consultez tout, sans rien modifier.',
}

export function roleSentence(role: Role): string {
  return roleSentences[role]
}

/** Null when the account can follow the step; otherwise, what it lacks. */
export function rightsNote(step: GuideStep, role: Role): string | null {
  if (step.audience === 'editors' && role === 'VIEWER') {
    return 'Votre compte est en lecture seule : ces actions demandent un compte éditeur ou administrateur.'
  }
  if (step.audience === 'administrators' && role !== 'ADMIN') {
    return 'La gestion de l’équipe est réservée aux administrateurs. Vous pouvez toujours changer votre mot de passe.'
  }
  return null
}
