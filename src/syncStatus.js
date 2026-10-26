import { create } from 'zustand'

/** Ephemeral sync status for the UI: { user, state, error?, at? }. */
export const useSync = create(() => ({ user: null, state: 'idle' }))
