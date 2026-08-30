import fs from "node:fs/promises";
import path from "node:path";

async function getCachedPlaylistPath(parentFolder, playlistId) {
	return path.join(parentFolder, `.cache_${playlistId}.json`);
}

export async function savePlaylistCache(parentFolder, playlistId, videos) {
	const cachePath = await getCachedPlaylistPath(parentFolder, playlistId);
	await fs.writeFile(cachePath, JSON.stringify(videos, null, 2), "utf8");
	console.log(`✓ Cached playlist`);
}

export async function loadPlaylistCache(parentFolder, playlistId) {
	const cachePath = await getCachedPlaylistPath(parentFolder, playlistId);
	try {
		const data = await fs.readFile(cachePath, "utf8");
		console.log(`✓ Loaded from cache`);
		return JSON.parse(data);
	} catch {
		return null;
	}
}
