// Every song in music/, as plain text by name: { konvoi: 'title Konvoi\n…' }.
// Vite bundles them, so a new .song file there shows up on its own.
const files = import.meta.glob('../music/*.song', { query: '?raw', import: 'default', eager: true })

export const SONGS = Object.fromEntries(Object.entries(files).map(([path, text]) => [path.match(/([^/]+)\.song$/)[1], text]))
export const NAMES = Object.keys(SONGS)
