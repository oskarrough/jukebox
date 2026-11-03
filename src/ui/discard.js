// What the × on a song in the list does, and putting a song back where it was.

// A song never saved is forgotten, one with unsaved edits drops them, and a
// saved one loses its file, which only the dev server can do.
export function fate({ made, unsaved, canDelete }) {
	if (made) return 'forget'
	if (unsaved) return 'revert'
	return canDelete ? 'delete' : null
}

// The song listed after `name`, else the one before it, else none.
export function neighbour(names, name) {
	const i = names.indexOf(name)
	return names[i + 1] ?? names[i - 1] ?? null
}

// `files` with song `name` back in the place it had in `order`; songs that
// weren't in `order` follow.
export function reinsert(files, name, text, order) {
	const all = { ...files, [name]: text }
	const keys = [...order.filter((k) => k in all), ...Object.keys(all).filter((k) => !order.includes(k))]
	return Object.fromEntries(keys.map((k) => [k, all[k]]))
}
