import fs from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import ignoremap from './ignoremap.js';
import dotenv from 'dotenv';
import { loadPlaylistCache, savePlaylistCache } from './utils/cache.js';
dotenv.config();

const exec = promisify(execFile);

// ===== CONFIG =====
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY; // See instructions below
const PLAYLISTS = [
  { id: 'PLRlfwH0QYLHjkJjheoubsreDpl1giCzgc', name: 'High Quality Music' }
];
const DOWNLOAD_DIR = './downloads';
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 5000; // 5 second delay between batches
const TEST_LIMIT = null; // Set to null to disable, or number to limit songs


const USE_CACHE = false;


const failedDownloads = [];

// ===== UTILITY FUNCTIONS =====
async function fetchPlaylistVideos(playlistId) {
  const videos = [];
  let pageToken = '';

  while (true) {
    const url = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
    url.searchParams.append('part', 'snippet,contentDetails');
    url.searchParams.append('playlistId', playlistId);
    url.searchParams.append('maxResults', '50');
    url.searchParams.append('key', YOUTUBE_API_KEY);
    if (pageToken) url.searchParams.append('pageToken', pageToken);

    const res = await fetch(url.toString());
    const data = await res.json();

    if (!data.items) break;

    // Fetch video details to get actual creator channel
    const videoIds = data.items.map(item => item.contentDetails.videoId).join(',');
    const videoDetailsUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
    videoDetailsUrl.searchParams.append('part', 'snippet');
    videoDetailsUrl.searchParams.append('id', videoIds);
    videoDetailsUrl.searchParams.append('key', YOUTUBE_API_KEY);
    
    const videoRes = await fetch(videoDetailsUrl.toString());
    const videoData = await videoRes.json();
    const videoMap = {};
    videoData.items.forEach(item => {
      videoMap[item.id] = item.snippet.channelTitle.replace(' - Topic', '');
    });

    data.items.forEach(item => {
      videos.push({
        title: item.snippet.title.replaceAll('[', '(').replaceAll(']', ')'),
        videoId: item.contentDetails.videoId,
        channelName: videoMap[item.contentDetails.videoId], // Now the actual creator
        position: item.snippet.position
      });
    });

    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }

  return videos;
}


function parseVideoTitle(title, channelName) {
  // const match = title.match(/^(.+?)\s*-\s*(.+)$/);
  // Try to parse "Artist - Song Title" format ignores - outside of brackets
  const match = title.match(/^((?:[^()\-]|\([^)]*\))*)\s*-\s*(.+)$/);
  
  if (match) {
    return {
      artist: match[1].trim(),
      name: match[2].trim()
    };
  }

  // Fallback: use channel name as artist, title as name
  return {
    artist: channelName,
    name: title
  };
}

async function getExistingFiles(dir) {
  try {
    const files = await fs.readdir(dir);
    const existing = new Set();
    
    files.forEach(file => {
      // Extract videoId from filename: "name - artist [videoId].mp3"
      const match = file.match(/\[([^\]]+)\]\.mp3$/);
      if (match) existing.add(match[1].replace(/.mp3$/, ''));
    });

    return existing;
  } catch {
    return new Set();
  }
}

function escapeFilename(str) {
  return String(str).replace(/[<>:"|?*]/g, '').replace(/\//g, '-').trim();
}

async function downloadVideo(videoId, title, artist, outputPath) {
	console.log('videoId, title, artist, outputPath', videoId, title, artist, outputPath)
  const filename = `${escapeFilename(title)} - ${escapeFilename(artist)} [${videoId}].mp3`;
  const fullPath = path.join(outputPath, filename);

  try {
    const { stdout, stderr } = await exec('yt-dlp', [
      '-x',
      '--audio-format', 'mp3',
      '--convert-thumbnails', 'jpg',
      '--embed-thumbnail',
      '--ppa', 'ThumbnailsConvertor+FFmpeg:-vf crop=ih:ih',
      // '--exec', `ffmpeg -i "{}" -metadata title="${title.replace(/"/g, '\\"')}" -metadata artist="${artist.replace(/"/g, '\\"')}" -metadata album="${title.replace(/"/g, '\\"')}"`,
      '-o', fullPath.replace('.mp3', '.%(ext)s'),
      `https://www.youtube.com/watch?v=${videoId}`
    ], {
      // stdio: ['pipe', 'pipe', 'pipe'] // suppress output
    });
    await exec('ffmpeg', [
      '-i', fullPath,
      '-metadata', `title=${title.replace(/"/g, '\\"')}`,
      '-metadata', `artist=${artist.replace(/"/g, '\\"')}`,
      '-metadata', `album=${title.replace(/"/g, '\\"')}`,
      '-c', 'copy',
      fullPath.replace(/\.mp3$/, '.tmp.mp3'),
    ]);
    await exec('mv', [
      fullPath.replace(/\.mp3$/, '.tmp.mp3'),
      fullPath
    ])

    console.log(`✓ Downloaded: ${filename}`);
    return { filename, success: true };
  } catch (err) {
    console.error(`✗ Failed: ${filename}`);
    failedDownloads.push({ filename, videoId, link: `https://www.youtube.com/watch?v=${videoId}` });
    console.error(err.message);
    return { filename, success: false };
  }
}


async function createPlaylistFile(playlistDir, playlistName, videos) {
  const m3uPath = path.join(DOWNLOAD_DIR, `${escapeFilename(playlistName)}.m3u8`);
  
  let m3uContent = '#EXTM3U\n';

  for (const video of videos) {
    const { artist, name } = parseVideoTitle(video.title, video.channelName);
    const filename = `${escapeFilename(name)} - ${escapeFilename(artist)} [${video.videoId}].mp3`;
    const fullPath = path.join(playlistDir, filename);

    // Check if file exists
    try {
      await fs.access(fullPath);
      // File exists, add to playlist
      m3uContent += `#EXTINF:-1,${artist} - ${name}\n`;
      m3uContent += `${escapeFilename(playlistName)}/${filename}\n`;
    } catch {
      // File doesn't exist, skip
    }
  }

  await fs.writeFile(m3uPath, m3uContent, 'utf8');
  console.log(`✓ Updated playlist: _${escapeFilename(playlistName)}.m3u8`);
}

// ===== MAIN =====

async function main() {
  await fs.mkdir(DOWNLOAD_DIR, { recursive: true });

  for (const playlist of PLAYLISTS) {
    console.log(`\n=== Processing: ${playlist.name} ===`);

    // Fetch videos
    console.log('Fetching playlist videos...');
    let videos;
    if (USE_CACHE) {
      videos = await loadPlaylistCache(DOWNLOAD_DIR, playlist.id);
      if (!videos) {
        console.log('Cache miss, fetching from API...');
        videos = await fetchPlaylistVideos(playlist.id);
        await savePlaylistCache(DOWNLOAD_DIR, playlist.id, videos);
      }
    } else {
      console.log('Fetching from API...');
      videos = await fetchPlaylistVideos(playlist.id);
      await savePlaylistCache(playlist.id, videos);
    }
    
    if (TEST_LIMIT) {
      videos = videos.slice(0, TEST_LIMIT);
      console.log(`Test mode: limited to ${TEST_LIMIT} videos`);
    }

    const playlistDir = path.join(DOWNLOAD_DIR, escapeFilename(playlist.name));
    await fs.mkdir(playlistDir, { recursive: true });

    // Get existing downloads
    const existing = await getExistingFiles(playlistDir);
    let toDownload = videos.filter(v => !existing.has(v.videoId));
    let nrIgnored = 0;
    toDownload = toDownload.filter(v => {
      if (ignoremap[v.videoId]) {
        nrIgnored++;
        return false;
      }
      return true;
    });

    console.log(`Found ${videos.length} videos, ${toDownload.length} to download (${nrIgnored} ignored)`);

    // Download in batches
    for (let i = 0; i < toDownload.length; i += BATCH_SIZE) {
      const batch = toDownload.slice(i, i + BATCH_SIZE);

      if (i > 0) {
        console.log(`Waiting ${BATCH_DELAY_MS}ms before next batch...`);
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
      }

      console.log(`\nBatch ${Math.floor(i / BATCH_SIZE) + 1}:`);
      for (const video of batch) {
        const { artist, name } = parseVideoTitle(video.title, video.channelName);
        await downloadVideo(video.videoId, name, artist, playlistDir);
      }
    }

    // Create playlist file
    console.log('\nCreating playlist file...');
    await createPlaylistFile(playlistDir, playlist.name, videos);

    if (failedDownloads.length > 0) {
      console.log('\nFailed downloads:');
      for (const { filename, videoId, link } of failedDownloads) {
        let text = `- ${filename} (${videoId}) - ${link}`;
        console.log(`\x1b[31m${text}\x1b[0m`);
      }
    }

    console.log(`✓ Complete: ${playlist.name}`);
  }
}

main().catch(console.error);
