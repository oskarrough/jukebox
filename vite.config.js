import solid from '@solidjs/vite-plugin'
import { writeFileSync } from 'node:fs'

// While composing: the page's ⌘S writes the song straight into music/.
// POST /__save?name=konvoi with the song's text. Dev server only.
const saveSongs = {
	name: 'jukebox-save',
	configureServer(server) {
		server.middlewares.use('/__save', (req, res) => {
			const name = new URL(req.url, 'http://x').searchParams.get('name') ?? ''
			if (req.method !== 'POST' || !/^[a-z0-9][a-z0-9-]*$/.test(name)) {
				res.statusCode = 400
				return res.end()
			}
			let body = ''
			req.on('data', (chunk) => (body += chunk))
			req.on('end', () => {
				writeFileSync(new URL(`./music/${name}.song`, import.meta.url), body.endsWith('\n') ? body : `${body}\n`)
				res.end('ok')
			})
		})
	},
}

// Solid's start mode: no index.html or entry file. It renders src/App.jsx
// inside src/Document.jsx, and `vite build` writes a static site to dist/client.
export default {
	plugins: [solid({ start: true, diagnostics: true }), saveSongs],
	server: { host: true, allowedHosts: ['.ts.net'] },
	build: { target: 'esnext' },
}
