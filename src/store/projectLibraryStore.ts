import { create } from 'zustand'
import {
  loadProjectLibrary,
  setActiveProjectId as persistActiveProjectId,
  type ProjectSummary,
} from '../services/projectPersistence'

interface ProjectLibraryState {
  projects: ProjectSummary[]
  activeProjectId?: string
  initialized: boolean
  isLoading: boolean
  error?: string
  refresh: () => Promise<void>
  setActiveProjectId: (projectId?: string) => Promise<void>
  upsertProject: (summary: ProjectSummary, makeActive?: boolean) => void
  removeProjectSummary: (projectId: string) => void
  setError: (message?: string) => void
}

export const useProjectLibraryStore = create<ProjectLibraryState>((set) => ({
  projects: [],
  initialized: false,
  isLoading: false,
  error: undefined,

  refresh: async () => {
    set({ isLoading: true, error: undefined })
    try {
      const library = await loadProjectLibrary()
      set({
        projects: library.projects,
        activeProjectId: library.activeProjectId,
        initialized: true,
        isLoading: false,
      })
    } catch (error) {
      set({
        initialized: true,
        isLoading: false,
        error: error instanceof Error ? error.message : '项目库读取失败。',
      })
    }
  },

  setActiveProjectId: async (projectId) => {
    await persistActiveProjectId(projectId)
    set({ activeProjectId: projectId })
  },

  upsertProject: (summary, makeActive = false) => {
    set((state) => ({
      projects: [
        summary,
        ...state.projects.filter((project) => project.id !== summary.id),
      ].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
      ...(makeActive ? { activeProjectId: summary.id } : {}),
    }))
  },

  removeProjectSummary: (projectId) => {
    set((state) => ({
      projects: state.projects.filter((project) => project.id !== projectId),
      activeProjectId: state.activeProjectId === projectId ? undefined : state.activeProjectId,
    }))
  },

  setError: (error) => set({ error }),
}))
