import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { parseFile } from "music-metadata";
import { escapeFilename, parseVideoTitle } from "./names.js";

const exec = promisify(execFile);

export async function fetchPlaylistVideos(playlistId, YOUTUBE_API_KEY) {
	const fullPlaylistArray = [];
	let pageToken = "";

	while (true) {
		const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
		url.searchParams.append("part", "snippet,contentDetails");
		url.searchParams.append("playlistId", playlistId);
		url.searchParams.append("maxResults", "50");
		url.searchParams.append("key", YOUTUBE_API_KEY);
		if (pageToken) url.searchParams.append("pageToken", pageToken);

		const res = await fetch(url.toString());
		const data = await res.json();

		if (!data.items) break;

		const videoItems = data.items.map((playlistItem) => {
			const { name, artist } = parseVideoTitle(
				playlistItem.snippet.title.replaceAll("[", "(").replaceAll("]", ")"),
				playlistItem.snippet.videoOwnerChannelTitle.replace(/ - Topic$/, ""),
			);

			return {
				videoId: playlistItem.contentDetails.videoId,
				videoTitle: playlistItem.snippet.title,
				channelName: playlistItem.snippet.videoOwnerChannelTitle,
				artist,
				name,
				album: name,
			};
		});
		fullPlaylistArray.push(...videoItems);

		if (!data.nextPageToken) break;
		pageToken = data.nextPageToken;
	}

	return fullPlaylistArray;
}

export async function getExistingFiles(dir) {
	try {
		const files = await fs.readdir(dir);
		const existing = {};

		for (const file of files) {
			// Extract videoId from filename: "name - artist [videoId].mp3"
			const match = file.match(/\[([^\]]+)\]\.mp3$/);
			if (match) {
				// existing.add(match[1].replace(/.mp3$/, ''));
				const youtubeId = match[1].replace(/.mp3$/, "");
				const metadata = await parseFile(path.join(dir, file));
				existing[youtubeId] = {
					id: youtubeId,
					name: metadata.common.title,
					album: metadata.common.album,
					artist: metadata.common.artist,
					existingFileName: file,
				};
			}
		}

		return existing;
	} catch (error) {
		console.error("Failed to get existing files", error);
		return null;
	}
}

export async function downloadVideo(videoId, title, album, artist, outputPath) {
	const filename = `${escapeFilename(title)} - ${escapeFilename(artist)} [${videoId}].mp3`;
	const fullPath = path.join(outputPath, filename);
	console.log("Downloading:", videoId, title, album, artist, fullPath);

	try {
		await exec("yt-dlp", [
			"-x",
			"--audio-format",
			"mp3",
			"--convert-thumbnails",
			"jpg",
			"--embed-thumbnail",
			"--ppa",
			"ThumbnailsConvertor+FFmpeg:-vf crop=ih:ih",
			"-o",
			fullPath.replace(".mp3", ".%(ext)s"),
			`https://www.youtube.com/watch?v=${videoId}`,
		]);
		await exec("ffmpeg", [
			"-i",
			fullPath,
			"-metadata",
			`title=${title.replace(/"/g, '\\"')}`,
			"-metadata",
			`artist=${artist.replace(/"/g, '\\"')}`,
			"-metadata",
			`album=${album.replace(/"/g, '\\"')}`,
			"-c",
			"copy",
			fullPath.replace(/\.mp3$/, ".tmp.mp3"),
		]);
		await exec("mv", [fullPath.replace(/\.mp3$/, ".tmp.mp3"), fullPath]);

		console.log(`✓ Downloaded: ${filename}`);
		return { filename, success: true };
	} catch (err) {
		console.error(`✗ Failed: ${filename}`);
		console.error(err.message);
		return { filename, success: false };
	}
}

export async function createPlaylistFile(
	DOWNLOAD_DIR,
	playlistDir,
	playlistName,
	playlistItems,
) {
	const m3uPath = path.join(
		DOWNLOAD_DIR,
		`${escapeFilename(playlistName)}.m3u8`,
	);

	let m3uContent = "#EXTM3U\n";

	for (const item of playlistItems) {
		const filename =
			item.existingFileName ||
			`${escapeFilename(item.name)} - ${escapeFilename(item.artist)} [${item.videoId}].mp3`;
		const fullPath = path.join(playlistDir, filename);

		// Check if file exists
		try {
			await fs.access(fullPath);
			// File exists, add to playlist
			m3uContent += `#EXTINF:-1,${item.artist} - ${item.name}\n`;
			m3uContent += `${escapeFilename(playlistName)}/${filename}\n`;
		} catch {
			// File doesn't exist, skip
		}
	}

	await fs.writeFile(m3uPath, m3uContent, "utf8");
	console.log(`✓ Updated playlist: _${escapeFilename(playlistName)}.m3u8`);
}
