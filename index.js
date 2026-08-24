import fs from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import dotenv from 'dotenv';
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
        title: item.snippet.title,
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
  // Try to parse "Artist - Song Title" format
  const match = title.match(/^(.+?)\s*-\s*(.+)$/);
  
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
  const filename = `${escapeFilename(title)} - ${escapeFilename(artist)} [${videoId}].mp3`;
  const fullPath = path.join(outputPath, filename);

  try {
    await exec('yt-dlp', [
      '-x',
      '--audio-format', 'mp3',
      '--convert-thumbnails', 'jpg',
      '--embed-thumbnail',
      '--ppa', 'ThumbnailsConvertor+FFmpeg:-vf crop=ih:ih',
      '--postprocessor-args', `FFmpegMetadata:-metadata title="${title}" -metadata artist="${artist}" -metadata album="${title}"`,
      '--exec', 'ffmpeg -i {input} -metadata title="' + title + '" -metadata artist="' + artist + '" -metadata album="' + title + '" -c copy {output}',
      '-o', fullPath.replace('.mp3', '.%(ext)s'),
      `https://www.youtube.com/watch?v=${videoId}`
    ]);

    console.log(`✓ Downloaded: ${filename}`);
    return { filename, success: true };
  } catch (err) {
    console.error(`✗ Failed: ${filename}`);
    console.error(err.message);
    return { filename, success: false };
  }
}

async function createPlaylistFile(playlistDir, playlistName, videos) {
  const m3uPath = path.join(playlistDir, `_${escapeFilename(playlistName)}.m3u8`);
  
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
      m3uContent += `${filename}\n`;
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
    let videos = await fetchPlaylistVideos(playlist.id);
    
    if (TEST_LIMIT) {
      videos = videos.slice(0, TEST_LIMIT);
      console.log(`Test mode: limited to ${TEST_LIMIT} videos`);
    }

    const playlistDir = path.join(DOWNLOAD_DIR, escapeFilename(playlist.name));
    await fs.mkdir(playlistDir, { recursive: true });

    // Get existing downloads
    const existing = await getExistingFiles(playlistDir);
    const toDownload = videos.filter(v => !existing.has(v.videoId));

    console.log(`Found ${videos.length} videos, ${toDownload.length} to download`);

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

    console.log(`✓ Complete: ${playlist.name}`);
  }
}

main().catch(console.error);
