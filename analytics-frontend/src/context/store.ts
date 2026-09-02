import { createStore } from "jotai"

// A module-level Jotai store, used both by <Provider store={jotaiStore}>
// (context/providers/app-providers.tsx) and by code that runs outside React
// — the axios interceptors (api/interceptors/*) need to read/write the auth
// atom, and a plain `useAtomValue` hook is not available there.
export const jotaiStore = createStore()
