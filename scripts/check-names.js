// Fails when a song's file name isn't the slug of its title, or an alias points nowhere.
import { readFileSync, readdirSync } from 'node:fs'
import { ALIASES } from '../src/aliases.js'
import { slug } from '../src/ui/slug.js'

const dir = new URL('../music/', import.meta.url)
const names = readdirSync(dir)
	.filter((f) => f.endsWith('.song'))
	.map((f) => f.slice(0, -5))
const bad = []
for (const name of names) {
	const title = readFileSync(new URL(`${name}.song`, dir), 'utf8')
		.match(/^title\s+(.+)$/m)?.[1]
		.trim()
	if (!title) bad.push(`${name}.song has no title`)
	else if (slug(title) !== name)
		bad.push(`${name}.song should be ${slug(title)}.song (title "${title}"); rename it and add the old name to ALIASES in src/aliases.js`)
}
for (const [old, to] of Object.entries(ALIASES)) {
	if (names.includes(old)) bad.push(`alias "${old}" is also a song`)
	if (!names.includes(to)) bad.push(`alias "${old}" points at missing song "${to}"`)
}
if (bad.length) {
	console.error(bad.join('\n'))
	process.exit(1)
}
