import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { loadPlaylistCache, savePlaylistCache } from "./utils/cache.js";
import { escapeFilename } from "./utils/names.js";
import { prompt } from "./utils/prompt.js";
import {
	createPlaylistFile,
	downloadVideo,
	fetchPlaylistVideos,
	getExistingFiles,
} from "./utils/videos.js";

dotenv.config();

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY; // See instructions below
const DOWNLOAD_DIR = "./downloads";
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 5000; // 5 second delay between batches
const TEST_LIMIT = null; // Set to null to disable, or number to limit songs

const failedDownloads = [];

async function getPlaylists() {
	const playlists = [];
	const content = await fs.readFile("playlists.txt", "utf8").catch(() => null);
	if (!content) throw new Error("playlists.txt not found");

	const lines = content.split("\n");
	for (const line of lines) {
		if (line.trim() === "") continue;
		if (line.trim().startsWith("#")) continue;
		const separatorIndex = line.indexOf(" ");
		if (separatorIndex === -1) throw new Error(`Invalid line: ${line}`);
		playlists.push({
			id: line.substring(0, separatorIndex),
			name: line.substring(separatorIndex + 1),
		});
	}
	return playlists;
}

async function getIgnoreMap() {
	const content = await fs.readFile("ignore.txt", "utf8").catch(() => null);
	if (!content) return {};
	const lines = content.split("\n");
	const ignoreMap = {};
	for (const line of lines) {
		if (line.trim() === "") continue;
		const separatorIndex = line.indexOf(" ");
		let videoId = line.trim();
		if (separatorIndex > 0) {
			videoId = line.substring(0, separatorIndex);
		}
		ignoreMap[videoId] = true;
	}
	return ignoreMap;
}

async function main() {
	await fs.mkdir(DOWNLOAD_DIR, { recursive: true });
	const playlists = await getPlaylists();
	const ignoreMap = await getIgnoreMap();

	for (const playlist of playlists) {
		console.log(`\n=== Processing: ${playlist.name} ===`);

		// Fetch videos
		console.log("Fetching playlist videos...");
		let playlistItems;
		playlistItems = await loadPlaylistCache(DOWNLOAD_DIR, playlist.id);
		if (playlistItems) {
			const answer = await prompt(
				"Previously saved playlist state found. Do you want to reuse it? (y/n) ",
				["y", "n"],
				{ "--use-cache": "y", "--no-cache": "n" },
			);
			if (answer === "n") {
				playlistItems = null;
			}
		}
		if (!playlistItems) {
			console.log("Fetching from API...");
			playlistItems = await fetchPlaylistVideos(playlist.id, YOUTUBE_API_KEY);
			await savePlaylistCache(DOWNLOAD_DIR, playlist.id, playlistItems);
		}

		if (TEST_LIMIT) {
			playlistItems = playlistItems.slice(0, TEST_LIMIT);
			console.log(`Test mode: limited to ${TEST_LIMIT} videos`);
		}

		const playlistDir = path.join(DOWNLOAD_DIR, escapeFilename(playlist.name));
		await fs.mkdir(playlistDir, { recursive: true });

		// Get existing downloads
		const existing = await getExistingFiles(playlistDir);
		if (!existing) process.exit(1);
		playlistItems.forEach((item) => {
			{
				const existingItem = existing[item.videoId];
				if (existingItem) {
					item.name = existingItem.name;
					item.album = existingItem.album;
					item.artist = existingItem.artist;
					item.existingFileName = existingItem.existingFileName;
				}
			}
		});
		let toDownload = playlistItems.filter((item) => !item.existingFileName);
		let nrIgnored = 0;
		toDownload = toDownload.filter((v) => {
			if (ignoreMap[v.videoId]) {
				nrIgnored++;
				return false;
			}
			return true;
		});

		console.log(
			`Found ${playlistItems.length} videos, ${toDownload.length} to download (${nrIgnored} ignored)`,
		);

		// Download in batches
		for (let i = 0; i < toDownload.length; i += BATCH_SIZE) {
			const batch = toDownload.slice(i, i + BATCH_SIZE);

			if (i > 0) {
				console.log(`Waiting ${BATCH_DELAY_MS}ms before next batch...`);
				await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
			}

			console.log(`\nBatch ${Math.floor(i / BATCH_SIZE) + 1}:`);
			for (const video of batch) {
				const result = await downloadVideo(
					video.videoId,
					video.name,
					video.album,
					video.artist,
					playlistDir,
				);
				if (!result.success)
					failedDownloads.push({
						filename: result.escapeFilename,
						videoId: video.videoId,
						link: `https://www.youtube.com/watch?v=${video.videoId}`,
					});
			}
		}

		// Create playlist file
		console.log("\nCreating playlist file...");
		await createPlaylistFile(
			DOWNLOAD_DIR,
			playlistDir,
			playlist.name,
			playlistItems,
		);

		if (failedDownloads.length > 0) {
			console.log("\nFailed downloads:");
			for (const { filename, videoId, link } of failedDownloads) {
				const text = `- ${filename} (${videoId}) - ${link}`;
				console.log(`\x1b[31m${text}\x1b[0m`);
			}
		}

		console.log(`✓ Complete: ${playlist.name}`);
	}
}

main().catch(console.error);
