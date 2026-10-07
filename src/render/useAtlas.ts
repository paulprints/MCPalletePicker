import { useEffect } from 'react'
import { create } from 'zustand'
import { toast } from '../store/toasts'
import { loadAtlas, type Atlas } from './atlas'

interface AtlasState {
  atlas: Atlas | null
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
  load: () => void
}

export const useAtlasStore = create<AtlasState>((set, get) => ({
  atlas: null,
  status: 'idle',
  error: null,
  load: () => {
    // One attempt per page load: a failure falls back to flat colours for the session
    if (get().status !== 'idle') return
    set({ status: 'loading', error: null })
    loadAtlas().then(
      (atlas) => set({ atlas, status: 'ready' }),
      (e: Error) => {
        set({ status: 'error', error: e.message })
        toast('Block textures couldn’t be downloaded, so blocks are shown as flat colours. Everything else works.', 'error')
      },
    )
  },
}))

/** The texture atlas once loaded (null until then, or if it can't be downloaded). */
export function useAtlas(): Atlas | null {
  const atlas = useAtlasStore((s) => s.atlas)
  const load = useAtlasStore((s) => s.load)
  useEffect(() => load(), [load])
  return atlas
}
