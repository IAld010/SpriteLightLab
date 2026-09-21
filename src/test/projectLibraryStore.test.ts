import { beforeEach, describe, expect, it } from 'vitest'
import type { ProjectSummary } from '../services/projectPersistence'
import { useProjectLibraryStore } from '../store/projectLibraryStore'

const older: ProjectSummary = {
  id: 'project:old',
  name: '旧项目',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  sourceName: 'old.png',
  sourceMode: 'frames',
  frameCount: 1,
  animationCount: 1,
  warningCount: 0,
}

const newer: ProjectSummary = {
  ...older,
  id: 'project:new',
  name: '新项目',
  updatedAt: '2026-02-01T00:00:00.000Z',
}

describe('project library store', () => {
  beforeEach(() => {
    useProjectLibraryStore.setState({
      projects: [],
      activeProjectId: undefined,
      initialized: false,
      isLoading: false,
      error: undefined,
    })
  })

  it('keeps projects ordered by most recent update', () => {
    useProjectLibraryStore.getState().upsertProject(older)
    useProjectLibraryStore.getState().upsertProject(newer, true)

    const state = useProjectLibraryStore.getState()
    expect(state.projects.map((project) => project.id)).toEqual(['project:new', 'project:old'])
    expect(state.activeProjectId).toBe('project:new')
  })

  it('removes a summary and clears active state when needed', () => {
    useProjectLibraryStore.setState({ projects: [newer], activeProjectId: newer.id })
    useProjectLibraryStore.getState().removeProjectSummary(newer.id)

    const state = useProjectLibraryStore.getState()
    expect(state.projects).toEqual([])
    expect(state.activeProjectId).toBeUndefined()
  })
})
