import { execSync } from 'node:child_process'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import solid from '@solidjs/vite-plugin'

// The git commit the build came from, else the day it was built; sent along with feedback.
let version = new Date().toISOString().slice(0, 10)
try {
	version = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
		.toString()
		.trim()
} catch {
	// No git in this build: the date will do.
}

// While composing: the page's ⌘S writes the song straight into music/.
// POST /__save?name=konvoi with the song's text. POST /__delete?name=konvoi
// removes the file. Dev server only.
const songName = (req) => {
	const name = new URL(req.url, 'http://x').searchParams.get('name') ?? ''
	return req.method === 'POST' && /^[a-z0-9][a-z0-9-]*$/.test(name) ? name : null
}
const saveSongs = {
	name: 'jukebox-save',
	// A song deleted or made again would reload the page, as nothing imports it
	// by name; the list of songs changed instead, which the page takes without
	// a reload.
	hotUpdate({ type, file }) {
		if (type === 'update' || !file.endsWith('.song')) return
		return [...(this.environment.moduleGraph.getModulesByFile(fileURLToPath(new URL('./src/songs.js', import.meta.url))) ?? [])]
	},
	configureServer(server) {
		// Serve the standalone pages in tools/ before Solid's page handler takes the URL.
		server.middlewares.use(async (req, res, next) => {
			const { pathname: path, search } = new URL(req.url, 'http://x')
			if (!['GET', 'HEAD'].includes(req.method) || search || !/^\/tools\/[\w-]+\.html$/.test(path)) return next()
			let page
			try {
				page = readFileSync(new URL(`.${path}`, import.meta.url), 'utf8')
			} catch {
				return next()
			}
			page = await server.transformIndexHtml(path, page)
			res.setHeader('Content-Type', 'text/html; charset=utf-8')
			res.end(req.method === 'HEAD' ? undefined : page)
		})
		server.middlewares.use('/__delete', (req, res) => {
			const name = songName(req)
			if (!name) {
				res.statusCode = 400
				return res.end()
			}
			rmSync(new URL(`./music/${name}.song`, import.meta.url), { force: true })
			res.end('ok')
		})
		server.middlewares.use('/__save', (req, res) => {
			const name = songName(req)
			if (!name) {
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
	define: { __JUKEBOX_VERSION__: JSON.stringify(version) },
	server: { host: true, allowedHosts: ['.ts.net'] },
	build: { target: 'esnext' },
}
