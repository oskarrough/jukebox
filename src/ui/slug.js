// A file name from a song's title: "Noch nicht am Feld" is noch-nicht-am-feld.
export const slug = (title) =>
	title
		.replace(/ß/g, 'ss')
		.replace(/ä/gi, 'ae')
		.replace(/ö/gi, 'oe')
		.replace(/ü/gi, 'ue')
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '') || 'song'
