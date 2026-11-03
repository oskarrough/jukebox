// A file name from a song's title: "Karl-Marx-Straße" is karl-marx-strasse.
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
