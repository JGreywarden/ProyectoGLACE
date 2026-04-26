import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { router } from '@/router'
import { useGameStore, GameState } from '@/stores/gameStore'
import { useSaveStore } from '@/stores/saveStore'
import '@/index.css'

// ─── bootstrap ────────────────────────────────────────────────────────────────
// Runs once before React renders. Order matters:
//   1. hydrate save-slot metadata so MainMenu can show saved games immediately
//   2. advance the state machine from BOOT → MAIN_MENU
//   3. (future) kick off non-blocking async preloads via dataStore when implemented

useSaveStore.getState().loadSlotMetadata()
useGameStore.getState().changeState(GameState.MAIN_MENU)

// dev-only: expose stores on window for repro / inspection. NEVER ship in prod.
if (import.meta.env.DEV) {
  void (async () => {
    const { useTrainingStore } = await import('@/features/training')
    const { useProgramStore }  = await import('@/features/program')
    const { useNarrativeStore } = await import('@/features/narrative')
    ;(window as unknown as { __GLACE__?: unknown }).__GLACE__ = {
      gameStore:      useGameStore,
      saveStore:      useSaveStore,
      trainingStore:  useTrainingStore,
      programStore:   useProgramStore,
      narrativeStore: useNarrativeStore,
      GameState,
    }
  })()
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
)
