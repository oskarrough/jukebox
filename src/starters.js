// The styles a new song can start from: short working songs to hear, read and
// change. Each is a song's body after its head; `starter()` in key.js adds the
// title, tags and key. Blank is the plain head and isn't listed here.
export const STARTERS = [
	{
		id: 'house',
		name: 'House',
		key: 'Am',
		text: `tempo    124
beats    4
steps    4
reverb   0.25

# The pad and the bass follow the chord row and duck on every kick, so the mix breathes.
voice pad    pad     vol=0.5 pump=0.6 rev=0.4 center=C4
voice bass   synbass vol=0.55 pump=0.8 part=root
voice kick   kick    vol=0.9
voice clap   clap    vol=0.5 pan=0.1
voice hat    ohat    vol=0.3 pan=-0.2
voice ride   hat     vol=0.25 pan=0.2

pattern A
chords | Am7 | Fmaj7 | C | G |
pad    | x--------------- | % | % | % |
bass   | .x.x .x.x .x.x .x.x | % | % | % |
kick   | X... x... x... x... | % | % | % |
clap   | .... x... .... x... | % | % | % |
hat    | ..x. ..x. ..x. ..x. | % | % | % |
ride   | xxxx xxxx xxxx xxxx | % | % | % |

pattern B from A
pad    | x--- ---- x--- ---- | x--- ---- x--- ---- | x--- ---- x--- ---- | x--- ---- x--- x--- |
ride   | oxox oxox oxox oxox | % | % | % |

loop A B
`,
	},
	{
		id: 'dub',
		name: 'Dub',
		key: 'Dm',
		text: `tempo    72
beats    4
steps    4
reverb   0.45

# The stab echoes three steps late, a little quieter each time, left then right.
voice stab   pad     vol=0.8 att=0.004 rel=0.3 bright=0.7 rev=0.45 echo=3 tail=0.6 part=rootless center=Bb3
voice sub    808     vol=0.7 drive=0.2
voice kick   kick    vol=0.9
voice rim    rim     vol=0.35 pan=-0.3 rev=0.5
voice hat    hat     vol=0.3 pan=0.2

pattern A
chords | Dm9 | % | Bbmaj9 | Gm9 |
stab   | ..x. .... .... .... | % | % | % |
sub    | D1------- .. D1--- F1- | D1------- .. D1--- F1- | Bb0------- .. Bb0--- C1- | G0------- .. G0--- A0- |
kick   | X... .... x... .... | % | % | % |
rim    | .... .... ..o. .... | .... ...o .... ..x. | .... .... ..o. .... | .... ...o .... ..x. |
hat    | ..x. ..x. ..x. ..x. | % | % | % |

# The kick drops out and the stab moves to a new chord.
pattern B from A
chords | Dm9 | Fmaj9 | Gm9 | A7sus4 |
kick   | _ | _ | X... .... x... .... | X... .... x... .... |

loop A B
`,
	},
	{
		id: 'cumbia',
		name: 'Cumbia',
		key: 'Am',
		text: `tempo    92
beats    4
steps    4
reverb   0.2

voice lead   accordion vol=0.6 pan=-0.15 rev=0.3
voice bass   upright   vol=0.75
voice guiro  guiro     vol=0.4 pan=0.3
voice conga  conga     vol=0.5 pan=-0.3
voice clave  clave     vol=0.3 pan=0.2

pattern A
lead  | A4-- C5 E5-- C5 A4--- .. E4- | A4-- C5 E5-- C5 D5---- . C5- | B4-- D5 E5-- D5 B4--- .. G4- | A4----------- .... |
bass  | A1--- . E2-- A1--- . E2-- | A1--- . E2-- A1--- . E2-- | G1--- . D2-- G1--- . D2-- | E1--- . B1-- E1--- . A1-- |
guiro | x.xx x.xx x.xx x.xx | % | % | % |
conga | ..x. ..X. ..x. ..X. | % | % | % |
clave | x..x ..x. x..x ..x. | % | % | % |

pattern B from A
lead  | E5-- E5 D5-- C5 D5-- E5 C5--- | B4-- C5 D5-- C5 B4-- A4 G4--- | A4-- C5 E5-- C5 A4--- .. E4- | A4----------- .... |

loop A B
`,
	},
	{
		id: 'chip',
		name: 'Chip',
		key: 'C',
		text: `tempo    150
beats    4
steps    4
reverb   0.1

# The arpeggio plays the chord row, one note a step on its way up.
voice arp    chip     vol=0.4 part=up center=C4 echo=6 tail=0.35
voice lead   square   vol=0.3 pan=0.2 gate=0.6
voice bass   triangle vol=0.7
voice kick   kick     vol=0.8
voice snare  snare    vol=0.5
voice hat    hat      vol=0.3

pattern A
chords | C | G | Am | F |
arp    | xxxx xxxx xxxx xxxx | % | % | % |
lead   | E5--- G5-- C6----- G5-- | D5--- G5-- B5----- G5-- | C5--- E5-- A5----- E5-- | A4--- C5-- F5----- C5-- |
bass   | C2-- . C2-- . C2-- . G1-- . | G1-- . G1-- . G1-- . D2-- . | A1-- . A1-- . A1-- . E2-- . | F1-- . F1-- . F1-- . C2-- . |
kick   | x... ..x. x... ..x. | % | % | % |
snare  | .... x... .... x... | % | % | % |
hat    | x.x. x.x. x.x. x.x. | % | % | % |

pattern B from A
chords | Am | F | C | G |
lead   | E6--- D6-- C6----- A5-- | C6--- A5-- F5----- C6-- | E6--- G6-- C7----- G6-- | D6--- B5-- G5----- B5-- |
kick   | x... x... x... xxx. | % | % | % |

loop A B
`,
	},
	{
		id: 'ballad',
		name: 'Ballad',
		key: 'C',
		text: `tempo    68
beats    4
steps    4
reverb   0.4

voice keys   rhodes  vol=0.55 rev=0.4 center=C4
voice str    strings vol=0.45 pan=-0.2 att=0.4 rel=1 rev=0.5 center=C4
voice bass   upright vol=0.6 part=root
voice tune   celesta vol=0.45 pan=0.2 rev=0.5

pattern A
chords | C | G/B | Am7 | Fmaj7 |
keys   | x... x.x. x... x.x. | % | % | % |
str    | x--------------- | % | % | % |
bass   | x--------------- | % | % | % |
tune   | E5--- G5--- C6------- | D5--- G5--- B5------- | C5--- E5--- A5------- | A4--- C5--- F5------- |

pattern B from A
chords | Dm7 | G7 | Em7 | Am7 |
tune   | F5--- A5--- D6------- | D5--- F5--- B5------- | G5--- B5--- E6------- | E5--- A5--- C6------- |

loop A B
`,
	},
]
