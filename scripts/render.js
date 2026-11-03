import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { OfflineAudioContext } from 'node-web-audio-api'
import { compile } from '../src/score.js'
import { createSynth } from '../src/synth.js'

const SAMPLE_RATE = 44100

// Schedule directly: the live player's lookahead guard deliberately limits work
// per frame, whereas an offline context needs every note before rendering.
export async function render(song, seconds, voice = null, from = 0, progress = null) {
	const context = new OfflineAudioContext(2, Math.ceil(seconds * SAMPLE_RATE), SAMPLE_RATE)
	const synth = createSynth(context, context.destination, { raw: voice != null, strict: true })
	synth.out.gain.value = 0.6 // same output level as the jukebox player
	const session = synth.session(song)
	function schedule(timeline, offset) {
		for (const event of timeline.events) {
			const time = offset + event.t - from
			if (time >= seconds) break
			if (time >= 0 && (voice == null || event.v === voice)) session.play(event, time)
		}
	}
	// A pattern start is a fresh start, without earlier notes or reverb tails.
	schedule(song.intro, 0)
	if (song.loop.dur > 0) for (let offset = song.intro.dur; offset < from + seconds; offset += song.loop.dur) schedule(song.loop, offset)
	const timer = progress && setInterval(() => progress(Math.min(100, (100 * context.currentTime) / seconds)), 2000)
	try {
		const buffer = await context.startRendering()
		return Array.from({ length: 2 }, (_, channel) => {
			const samples = new Float32Array(buffer.length)
			buffer.copyFromChannel(samples, channel)
			return samples
		})
	} finally {
		if (timer) clearInterval(timer)
	}
}

export function measure(channels, start = 0, end = channels[0].length) {
	let peak = 0,
		energy = 0,
		clipped = 0
	start = Math.max(0, Math.round(start))
	end = Math.min(channels[0].length, Math.round(end))
	for (const channel of channels)
		for (let i = start; i < end; i++) {
			const sample = channel[i]
			if (!Number.isFinite(sample)) throw new Error('Synth produced a non-finite sample')
			peak = Math.max(peak, Math.abs(sample))
			energy += sample * sample
			if (Math.abs(sample) >= 1) clipped++
		}
	const count = Math.max(0, end - start) * channels.length
	return { peak, energy, rms: count ? Math.sqrt(energy / count) : 0, clipped }
}

const db = (value) => (value > 0 ? `${(20 * Math.log10(value)).toFixed(1)} dBFS` : 'silent')
const levels = (stats) =>
	`peak ${db(stats.peak)}, RMS ${db(stats.rms)}, ${stats.clipped ? `CLIPS (${stats.clipped} samples)` : 'no clipping'}`

// PCM16, with no normalization: reported clipping remains audible in the file.
export function wav(channels) {
	const frames = channels[0].length
	const bytes = frames * channels.length * 2
	const buffer = Buffer.alloc(44 + bytes)
	buffer.write('RIFF', 0)
	buffer.writeUInt32LE(36 + bytes, 4)
	buffer.write('WAVEfmt ', 8)
	buffer.writeUInt32LE(16, 16)
	buffer.writeUInt16LE(1, 20)
	buffer.writeUInt16LE(channels.length, 22)
	buffer.writeUInt32LE(SAMPLE_RATE, 24)
	buffer.writeUInt32LE(SAMPLE_RATE * channels.length * 2, 28)
	buffer.writeUInt16LE(channels.length * 2, 32)
	buffer.writeUInt16LE(16, 34)
	buffer.write('data', 36)
	buffer.writeUInt32LE(bytes, 40)
	for (let i = 0; i < frames; i++)
		for (let channel = 0; channel < channels.length; channel++) {
			const value = Math.max(-1, Math.min(1, channels[channel][i]))
			buffer.writeInt16LE(Math.round(value * (value < 0 ? 32768 : 32767)), 44 + (i * channels.length + channel) * 2)
		}
	return buffer
}

export function sections(song, seconds, from = 0) {
	const result = []
	const frames = Math.round(seconds * SAMPLE_RATE)
	function append(timeline, offset) {
		for (const section of timeline.sections) {
			const start = offset + section.start - from
			const end = start + section.dur
			const first = Math.round(start * SAMPLE_RATE)
			const last = Math.round(end * SAMPLE_RATE)
			// Adjacent sections can disagree by a fraction of a sample after subtraction.
			if (first >= frames) break
			if (last > 0) result.push({ ...section, start: Math.max(0, start), end: Math.min(seconds, end), partial: first < 0 || last > frames })
		}
	}
	append(song.intro, 0)
	if (song.loop.dur > 0) for (let offset = song.intro.dur; offset < from + seconds; offset += song.loop.dur) append(song.loop, offset)
	return result
}

export function bars(song, seconds, from = 0) {
	return sections(song, seconds, from).flatMap((section) =>
		Array.from({ length: Math.min(section.bars, Math.ceil((section.end - section.start) / section.barDur)) }, (_, bar) => {
			const start = section.start + bar * section.barDur
			return [start, Math.min(section.end, start + section.barDur)]
		}),
	)
}

async function main(args) {
	const [name, ...flags] = args
	const usage = 'Usage: bun run render <song or path.song> [--from pattern] [--seconds 20] [--voices]'
	if (!name || name.startsWith('--')) throw new Error(usage)
	let duration,
		pattern,
		solos = false
	const seen = new Set()
	for (let i = 0; i < flags.length; i++) {
		const flag = flags[i]
		if (seen.has(flag)) throw new Error(usage)
		seen.add(flag)
		if (flag === '--voices') solos = true
		else if ((flag === '--seconds' || flag === '--from') && flags[i + 1] && !flags[i + 1].startsWith('--')) {
			if (flag === '--seconds') duration = flags[++i]
			else pattern = flags[++i]
		} else throw new Error(usage)
	}
	const file = resolve(name.endsWith('.song') || name.includes('/') ? name : join('music', `${name}.song`))
	const song = compile(await readFile(file, 'utf8'))
	if (song.errors.length) throw new Error(song.errors.map((error) => `Line ${error.line}: ${error.msg}`).join('\n'))
	let from = 0
	if (pattern !== undefined) {
		const section = sections(song, song.intro.dur + song.loop.dur).find((section) => section.name === pattern)
		if (!section) throw new Error(`No played pattern called ${pattern}`)
		from = section.start
	}
	const seconds = duration === undefined ? song.intro.dur + song.loop.dur - from : Number(duration)
	if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 600)
		throw new Error('Render length must be more than 0 and at most 600 seconds')
	async function renderPart(label, voice = null) {
		const started = performance.now()
		console.log(`Rendering ${label}: ${seconds.toFixed(2)}s${pattern === undefined ? '' : ` from ${pattern}`}…`)
		const audio = await render(song, seconds, voice, from, (percent) => {
			console.log(`Rendering ${label}: ${percent.toFixed(0)}% (${((performance.now() - started) / 1000).toFixed(1)}s elapsed)`)
		})
		console.log(`Rendered ${label} in ${((performance.now() - started) / 1000).toFixed(2)}s`)
		return audio
	}
	const mix = await renderPart('mix')
	console.log(`Overall (finished mix): ${levels(measure(mix))}`)
	const folder = join(dirname(file), 'renders')
	const output = join(folder, `${basename(file, extname(file))}.wav`)
	await mkdir(folder, { recursive: true })
	await writeFile(output, wav(mix))
	console.log(`WAV: ${output} (${seconds.toFixed(2)}s, stereo 44.1 kHz, no normalization)`)
	const boundary = song.intro.dur - from
	if (from > 0) console.log('Intro vs loop: skipped; render from the start to compare')
	else if (!boundary) console.log('Intro vs loop: no intro')
	else if (seconds <= boundary) console.log('Intro vs loop: loop not reached; render longer to compare')
	else if (!song.loop.dur) console.log('Intro vs loop: no loop')
	else {
		const intro = measure(mix, 0, boundary * SAMPLE_RATE)
		const loop = measure(mix, boundary * SAMPLE_RATE)
		const difference =
			intro.rms && loop.rms ? `${(20 * Math.log10(intro.rms / loop.rms)).toFixed(1)} dB (intro minus loop)` : 'one or both are silent'
		console.log(
			`Intro vs loop RMS: ${db(intro.rms)} / ${db(loop.rms)}; ${difference}${seconds < boundary + song.loop.dur ? '; partial loop' : ''}`,
		)
	}
	console.log('RMS by pattern (finished mix, in play order):')
	for (const section of sections(song, seconds, from)) {
		const rms = measure(mix, section.start * SAMPLE_RATE, section.end * SAMPLE_RATE).rms
		console.log(
			`  ${section.name}: RMS ${db(rms)} (${section.start.toFixed(2)}–${section.end.toFixed(2)}s${section.partial ? '; partial' : ''})`,
		)
	}
	const strip = bars(song, seconds, from)
		.map(([start, end]) => {
			const rms = measure(mix, start * SAMPLE_RATE, end * SAMPLE_RATE).rms
			if (!rms) return '_'
			return '123456789'[Math.max(0, Math.min(8, Math.floor((20 * Math.log10(rms) + 48) / 6)))]
		})
		.join('')
	console.log(`RMS by bar: ${strip} (_ silent; 1 < -42, 2 -42…-36, …, 9 >= 0 dBFS; last bar may be partial)`)
	if (solos) {
		const voices = []
		for (let voice = 0; voice < song.voices.length; voice++) {
			const stats = measure(await renderPart(`voice ${voice + 1}/${song.voices.length} (${song.voices[voice].name})`, voice))
			voices.push(stats)
			console.log(`  ${song.voices[voice].name}: ${levels(stats)}`)
		}
		const totalEnergy = voices.reduce((sum, voice) => sum + voice.energy, 0)
		console.log('Voices (solo, weighted, before shared compression; share = solo energy / total solo energy):')
		voices.forEach((stats, index) => {
			console.log(
				`  ${song.voices[index].name}: ${levels(stats)}, share ${totalEnergy ? ((100 * stats.energy) / totalEnergy).toFixed(1) : '0.0'}%`,
			)
		})
	}
	console.log('Adjust voice vol= for balance; reduce levels if clipping. RMS is a level guide, not a listening judgment.')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main(process.argv.slice(2)).catch((error) => {
		console.error(error.message)
		process.exitCode = 1
	})
}
