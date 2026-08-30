const filterFromName = [
	// basic
	"(Video)",
	"(TikTok Remix)",
	"(TikTok Songs)",
	"(Official)",
	"(Official Lyric Video)",
	"(Official Lyrics Video)",
	"(Official Music Video)",
	"(Official Audio)",
	"(Official Video)",
	"(Official Music Video)",
	"(Official MV)",
	"(FREE DOWNLOAD)",
	"(FREE)",
	"(visualizer)",
	"(Audio)",
	"(Static Video)",
	"(Lyrics)",
	"(Lyrics / Lyric Video)",
	"+ Lyrics",
	"(1080p HD)",
	"(Lyric Video)",
	"(Lyrics Video)",
	"(Radio Edit)",
	"(free download)",
	"(long version)",
	"(Diversity Release)",
	"(Future Bass Release)",
	"(JompaMusic Release)",

	// monstercat
	"(Monstercat Release)",
	"monstercat release)", // lol
	"(Monstercat FREE Release)",
	"(Monstercat Lyric Video)",
	"(Monstercat EP Release)",
	"(Monstercat Official Music Video)",
	"(Drumstep) - ",
	"(Drum and Bass | Monstercat)",
	"(DnB) - ",
	"(Electronic) - ",
	"(Future bass) - ",
	"(Indie dance) - ",

	// electro swing
	"#ElectroSwing |",
	"Glitch - Hop ||",

	// NCS
	"(Non Copyrighted Music)",
	"NCS - Copyright Free Music",
	"(NCS Release)",
	"| Animated Video",
	"| Music Video",
	"| DnB |",
	"| House |",
	"| Phonk |",
	"| Future Bass |",
	"| Future House |",
	"| Melodic Dubstep |",
	"| Glitch Hop |",

	// other
	"// Official Music Video // VALORANT Champions 2022",
	"// Official Music Video // VALORANT Champions 2021",
	"(Lethal League Blaze OST)",
	"| Arcane League of Legends | Riot Games Music",
	"【House】",
	"【Drum&Bass】",
	"(House Music) - ",
	"(Magic Free Release)",
];

const escapedFilters = filterFromName.map(
	(filter) => new RegExp(filter.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"),
);

export function parseVideoTitle(title, channelName) {
	// filter out common name patterns from the title that are not part of the artist/name
	const filteredTitle = escapedFilters.reduce(
		(acc, regex) => acc.replace(regex, ""),
		title,
	);
	// Try to parse "Artist - Song Title" format ignores - outside of brackets
	const match = filteredTitle.match(/^((?:[^()-]|\([^)]*\))*) - (.+)$/);

	if (match) {
		return {
			artist: match[1].trim(),
			name: match[2].trim(),
		};
	}

	// Fallback: use channel name as artist, title as name
	return {
		artist: channelName,
		name: filteredTitle,
	};
}

export function escapeFilename(str) {
	return String(str)
		.replace(/[<>:"|?*]/g, "")
		.replace(/\//g, "-")
		.trim();
}
