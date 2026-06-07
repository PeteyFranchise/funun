import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { DEMO_VAULT_PROJECTS, type VaultProjectRow } from '@/lib/vault/demo'
import type { VaultProjectType } from '@/types'
import { readinessItemsForProject } from '@/lib/vault/readiness'

/**
 * Approximate the live DB trigger's 0–100 readiness score for demo mode:
 * earned points over the points applicable to this project type. The real
 * backend computes this in Postgres (calculate_vault_readiness).
 */
function recomputeScore(project: VaultProjectRow): number {
  const items = readinessItemsForProject({
    type: project.type,
    tracks: project.tracks,
    assets: project.vault_assets,
    documents: project.vault_documents,
    tool_outputs: project.tool_outputs,
  })
  const total = items.reduce((s, i) => s + i.points, 0)
  if (total === 0) return 0
  const earned = items.filter(i => i.status === 'complete').reduce((s, i) => s + i.points, 0)
  return Math.round((earned / total) * 100)
}

/**
 * File-backed store for demo mode (NEXT_PUBLIC_VAULT_DEMO=true).
 *
 * Lets the create form actually persist during local preview without a
 * Supabase backend. Seeds from DEMO_VAULT_PROJECTS on first read and writes
 * to the OS temp dir so it never pollutes the repo. Delete the file to reset.
 *
 * Server-only: this module uses Node fs and must not be imported by client code.
 */

const STORE_PATH = path.join(os.tmpdir(), 'artistos-vault-demo.json')
const DEMO_USER = '00000000-0000-0000-0000-000000000000'

async function readStore(): Promise<VaultProjectRow[]> {
  try {
    const raw = await fs.readFile(STORE_PATH, 'utf8')
    return JSON.parse(raw) as VaultProjectRow[]
  } catch {
    // First run (or reset): seed and persist.
    await fs.writeFile(STORE_PATH, JSON.stringify(DEMO_VAULT_PROJECTS, null, 2), 'utf8')
    return [...DEMO_VAULT_PROJECTS]
  }
}

export async function getDemoProjects(): Promise<VaultProjectRow[]> {
  return readStore()
}

export async function getDemoProject(id: string): Promise<VaultProjectRow | null> {
  const projects = await readStore()
  return projects.find(p => p.id === id) ?? null
}

export async function addDemoProject(input: {
  title: string
  type: VaultProjectType
  genre?: string | null
  release_date?: string | null
}): Promise<VaultProjectRow> {
  const projects = await readStore()
  const now = new Date().toISOString()

  const project: VaultProjectRow = {
    id: `demo-${Date.now()}`,
    user_id: DEMO_USER,
    title: input.title,
    type: input.type,
    status: 'in_progress',
    release_date: input.release_date ?? null,
    vault_readiness_score: 0,
    genre: input.genre ?? null,
    sub_genre: null,
    cover_art_url: null,
    upc: null,
    is_public: false,
    notes: null,
    created_at: now,
    updated_at: now,
    tracks: [],
    vault_assets: [],
    vault_documents: [],
    tool_outputs: [],
  }

  projects.unshift(project)
  await fs.writeFile(STORE_PATH, JSON.stringify(projects, null, 2), 'utf8')
  return project
}

export async function updateDemoProject(
  projectId: string,
  patch: Partial<VaultProjectRow>
): Promise<VaultProjectRow | null> {
  const projects = await readStore()
  const project = projects.find(p => p.id === projectId)
  if (!project) return null

  Object.assign(project, patch)
  // Type drives which readiness items apply, so the score can shift.
  project.vault_readiness_score = recomputeScore(project)
  project.updated_at = new Date().toISOString()

  await fs.writeFile(STORE_PATH, JSON.stringify(projects, null, 2), 'utf8')
  return project
}

export async function addDemoAsset(
  projectId: string,
  input: { type: string }
): Promise<VaultProjectRow | null> {
  const projects = await readStore()
  const project = projects.find(p => p.id === projectId)
  if (!project) return null

  project.vault_assets.push({ id: `demo-asset-${Date.now()}`, type: input.type })
  project.vault_readiness_score = recomputeScore(project)
  project.updated_at = new Date().toISOString()

  await fs.writeFile(STORE_PATH, JSON.stringify(projects, null, 2), 'utf8')
  return project
}

export async function addDemoDocument(
  projectId: string,
  input: { type: string; status: string }
): Promise<VaultProjectRow | null> {
  const projects = await readStore()
  const project = projects.find(p => p.id === projectId)
  if (!project) return null

  project.vault_documents.push({
    id: `demo-doc-${Date.now()}`,
    type: input.type,
    status: input.status,
  })
  project.vault_readiness_score = recomputeScore(project)
  project.updated_at = new Date().toISOString()

  await fs.writeFile(STORE_PATH, JSON.stringify(projects, null, 2), 'utf8')
  return project
}

export async function updateDemoDocument(
  projectId: string,
  docId: string,
  patch: { status: string }
): Promise<VaultProjectRow | null> {
  const projects = await readStore()
  const project = projects.find(p => p.id === projectId)
  if (!project) return null
  const doc = project.vault_documents.find(d => d.id === docId)
  if (!doc) return null

  doc.status = patch.status
  project.vault_readiness_score = recomputeScore(project)
  project.updated_at = new Date().toISOString()

  await fs.writeFile(STORE_PATH, JSON.stringify(projects, null, 2), 'utf8')
  return project
}

export async function deleteDemoDocument(
  projectId: string,
  docId: string
): Promise<VaultProjectRow | null> {
  const projects = await readStore()
  const project = projects.find(p => p.id === projectId)
  if (!project) return null
  const before = project.vault_documents.length
  project.vault_documents = project.vault_documents.filter(d => d.id !== docId)
  if (project.vault_documents.length === before) return null

  project.vault_readiness_score = recomputeScore(project)
  project.updated_at = new Date().toISOString()

  await fs.writeFile(STORE_PATH, JSON.stringify(projects, null, 2), 'utf8')
  return project
}

export async function addDemoToolOutput(
  projectId: string,
  input: { tool_slug: string; title?: string }
): Promise<VaultProjectRow | null> {
  const projects = await readStore()
  const project = projects.find(p => p.id === projectId)
  if (!project) return null

  project.tool_outputs.push({ id: `demo-tool-${Date.now()}`, tool_slug: input.tool_slug })
  project.vault_readiness_score = recomputeScore(project)
  project.updated_at = new Date().toISOString()

  await fs.writeFile(STORE_PATH, JSON.stringify(projects, null, 2), 'utf8')
  return project
}

export async function deleteDemoProject(projectId: string): Promise<boolean> {
  const projects = await readStore()
  const next = projects.filter(p => p.id !== projectId)
  if (next.length === projects.length) return false

  await fs.writeFile(STORE_PATH, JSON.stringify(next, null, 2), 'utf8')
  return true
}

export async function addDemoTrack(
  projectId: string,
  input: { title: string; isrc?: string | null; track_number?: number }
): Promise<VaultProjectRow | null> {
  const projects = await readStore()
  const project = projects.find(p => p.id === projectId)
  if (!project) return null

  const nextNumber =
    input.track_number ??
    (project.tracks.reduce((max, t) => Math.max(max, t.track_number ?? 0), 0) + 1)

  project.tracks.push({
    id: `demo-track-${Date.now()}`,
    title: input.title,
    track_number: nextNumber,
    isrc: input.isrc ?? null,
  })
  project.vault_readiness_score = recomputeScore(project)
  project.updated_at = new Date().toISOString()

  await fs.writeFile(STORE_PATH, JSON.stringify(projects, null, 2), 'utf8')
  return project
}
