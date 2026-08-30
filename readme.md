# Youtube playlist sync script

NodeJS script that uses `yt-dlp` and `ffmpeg` to keep an up-to-date local copy of a Youtube playlist. Downloads every video and saves it to a folder per playlist and creates a `.m3u8` playlist file. When running again any missing videos are downloaded, videos no longer in the playlist are NOT removed. They are just not included in the playlist. This i a feature not a bug.
Initially vibe-coded but at this point I've changed just about everything. I probably won't be updating this ever unless I personally need new features/fixes.

Playlist file matches videos and order of playlist. Existing mp3 files are used for the playlist file. You can update the `mp3` files manually to fix metadata, as long as the video id in square brackets matches the youtube video it will be fine, you just have to re-generate the playlist file by running the script or it will be missing from the playlist.

If a video is deleted from youtube it's videoID still exists in your youtube playlist, so you do not have to worry about it being gone for your local version.

The created `mp3` files have metadata inferred from the videos title / channel name. The video thumbnail is used as album art.

### Installation

You need `node`, `yt-dlp` and `ffmpeg` installed on your system.

Install with your package manager e.g. `sudo pacman -S node yt-dlp ffmpeg`

For windows I recommend using chocolatey: https://chocolatey.org/install#install-step2 `choco install nodejs-lts yt-dlp ffmpeg`

Then install dependencies with `npm ci`

Get a youtube API key and add it to `.env` as `YOUTUBE_API_KEY`

Run the script with `npm run sync` after you have defined playlists in `playlists.txt`

### Usage

Define your playlists in `playlists.txt` and run the script with `npm run sync`.

Playlists are defined as `PLAYLIST_ID PLAYLIST_NAME` on each line separated by a space.
The playlist id can be found in the youtube playlist url e.g. `https://www.youtube.com/playlist?list=PLAYLIST_ID`

`playlists.txt` example:
```
PLRlfwH0QYLHjkJjheoubsreDpl1giCzgc High Quality Music
PLRlfwH0QYLHhmMjpNMfaLjO1rxliCGGtR Fox Stevenson
```

```
npm run sync
```

You will see the videos pile up under `downloads/PLAYLIST_NAME/` as they are downloaded. Once it's done a playlist file can be found under `downloads/PLAYLIST_NAME.m3u8`.
Anytime you want to update the playlist, simply run `npm run sync` again.

Videos are downloaded one at a time, and every 10 we wait an additional 5 seconds to avoid rate limiting. Not sure if that is really necessary but im leaving it in.

You can filter out unwanted videos by adding video IDs to an `ignore.txt` file. Each line should contain a single video ID, you can write comments to remind yourself why a video is being ignored by just writing it on the same line as the video ID separated by a space.

`ignore.txt` example:
```
IlDcpgDDxDw riptide lyrics, in YT playlist twice
```

### Metadata

The metadata is inferred from the video title / channel name. The logic assumes the video title follows the format `ARTIST - SONG` if no artist is found, the channel name is used as the artist.
The video thumbnail is used as album art. Album string is always the song name. So albums don't work out of the box.
I also try to filter out a bunch of unwanted phrases from the video titles for example `"(Official Video)", "(Lyrics)", etc.`.
It's not perfect, but it works well enough for my needs, you can update the tags and filenames manually, as long as the filename ends with `[VIDEO_ID].mp3` it will use that metadata. This way you can preserve album functionality of music players by adding the album yourself to the playlist downloads, just add the video ID to the filename, corresponding with the video ID of the same song in your playlist.

This system allows you to insert other songs into the playlist replacing videos. For example if you have a high quality version of an album you bought, you can put it's files into the downloads for a playlist and add video IDs of the songs in your youtube playlists to the filename. Then it will use those versions of the songs instead of downloading the youtube video for them.
