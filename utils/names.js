export function parseVideoTitle(title, channelName) {
	// const match = title.match(/^(.+?)\s*-\s*(.+)$/);
	// Try to parse "Artist - Song Title" format ignores - outside of brackets
	const match = title.match(/^((?:[^()-]|\([^)]*\))*)\s*-\s*(.+)$/);

	if (match) {
		return {
			artist: match[1].trim(),
			name: match[2].trim(),
		};
	}

	// Fallback: use channel name as artist, title as name
	return {
		artist: channelName,
		name: title,
	};
}

export function escapeFilename(str) {
	return String(str)
		.replace(/[<>:"|?*]/g, "")
		.replace(/\//g, "-")
		.trim();
}
