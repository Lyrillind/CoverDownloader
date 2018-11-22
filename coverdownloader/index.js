import { argv } from 'yargs';
import axios from 'axios';
import child_process from 'child_process';
import colors from 'colors';
import fs from 'fs-extra';
import klaw from 'klaw';
import os from 'os';
import path from 'path';
import process from 'process';

const SORTED_DIR = 'SORTED';
const COVER_NAME = 'cover';

const AUDIO_EXT = ['.flac','.mp3','.aac','.ogg','.m4a','.wav','.ape','.aiff'];

const targetPath = argv.path ? argv.path.replace('~', os.homedir()) : '.';

const NeteaseService = 'http://localhost:3000';

const items = [];
klaw(targetPath)
  .on('data', item => items.push(item.path))
  .on('end', checkApiServer);

let serviceProcess;
function checkApiServer() {
  axios.get(NeteaseService).then(() => {
    console.log(colors.green('开始处理...'));
    const songs = items.filter(o => o.indexOf(SORTED_DIR) < 0 && AUDIO_EXT.includes(path.extname(o)));
    handleSongs(songs);
  }).catch((error) => {
    if (error.code === 'ECONNREFUSED') {
      if (!serviceProcess) {
        const NODE_BIN = '/usr/local/bin/node';
        const API_SERVICE_PATH = path.resolve(__dirname, './NeteaseCloudMusicApi/app.js');
        serviceProcess = child_process.spawn(NODE_BIN, [API_SERVICE_PATH], {
          detached: true,
        });
        serviceProcess.stdout.on('data', data => {
          if (data.toString().indexOf('server running @') >= 0) {
            checkApiServer();
          }
        });
      }
    } else {
      if (!serviceProcess) return;
      serviceProcess.kill('SIGINT');
    }
  });
}

function handleSongs(songs) {
  let count = 0;
  songs.sort((a, b) => path.basename(a) - path.basename(b));
  songs.forEach(song => {
    const filename = path.basename(song, path.extname(song));
    const title = filename.split('-').reverse()[0].trim();
    let artist = filename.replace(title, '').replace(/\s?-\s?$/, '')[0].trim();
    retrieveSongInfo(filename).then((info) => {
      const albumId = info.al.id;
      artist = info.ar ? info.ar[0].name : artist;
      return axios.get(`${NeteaseService}/album?id=${albumId}`);
    }).then((response) => {
      const { picUrl, name } = response.data.album;
      const targetDir = path.join(targetPath, SORTED_DIR, artist, name.replace(/\//g, '\\/'));
      return organizeSong(song, { album: name, artist, title }, picUrl, targetDir);
    }).then(() => {
      count += 1;
      if (count >= songs.length) {
        console.log(colors.green('全部处理完成'));
        if (!serviceProcess) return;
        serviceProcess.kill('SIGINT');
      }
    }).catch((error) => {
      console.log(colors.red('✕'), colors.gray(path.basename(song, path.extname(song))), error.toString());
    });
  });
}

function retrieveSongInfo(name) {
  return axios.get(`${NeteaseService}/search?keywords=${encodeURIComponent(name)}`).then((response) => {
    const { songs } = response.data.result;
    const { id } = songs[0];
    for (let i = 0; i < songs.length; i++) {
      const song = songs[i];
      const artist = song.artists[0].name;
      const songName = song.name;
      if (name.indexOf(artist) >= 0 && name.indexOf(songName) >= 0) {
        return axios.get(`${NeteaseService}/song/detail?ids=${id}`);
      }
    }
  }).then((response) => {
    return response.data.songs[0];
  });
}

function organizeSong(song, songInfo, picUrl, downloadDir) {
  fs.ensureDirSync(downloadDir);
  const targetLocation = path.join(downloadDir, `${COVER_NAME}${path.extname(picUrl)}`);
  return new Promise((resolve, reject) => {
    const downloadProcess = child_process.spawn('curl', [picUrl, '--output', targetLocation], {
      detached: true
    });
    downloadProcess.on('exit', () => {
      if (fs.pathExistsSync(targetLocation)) {
        const stats = fs.statSync(targetLocation);
        if (stats.size > 0) {
          const filename = path.basename(song).trim();
          const dest = path.join(downloadDir, filename.replace(/\s+-\s+/g, '-'));
          fs.copySync(song, dest, { overwrite: true });
          embedArtIntoSong(dest, songInfo, targetLocation, resolve);
          return;
        }
      }
      retry(song, picUrl, downloadDir);
    });
  }).then(() => {
    console.log(colors.green('✓'), colors.gray(path.basename(song, path.extname(song))));
  });
}

function retry(song, picUrl, downloadDir) {
  const targetLocation = path.join(downloadDir, `${COVER_NAME}${path.extname(picUrl)}`);
  if (fs.pathExistsSync(targetLocation)) {
    fs.removeSync(targetLocation);
  }
  organizeSong(song, picUrl, downloadDir);
}

function embedArtIntoSong(song, songInfo, coverPath, resolve) {
  const extname = path.extname(song);
  switch (extname) {
    case '.flac': {
      handleFLACFile(song, songInfo, coverPath, resolve);
      break;
    }
    case '.mp3': {
      handleMP3File(song, songInfo, coverPath, resolve);
      break;
    }
    default:
      break;
  }
}

function handleFLACFile(song, songInfo, coverPath, resolve) {
  const readProcess = child_process.spawn('metaflac', ['--list', song]);
  readProcess.stdout.on('data', (data) => {
    const output = data.toString();
    if (output.indexOf('type: 3 (Cover (front))') < 0) {
      const embedProcess = child_process.spawn('metaflac', [
        `--set-tag=TITLE=${songInfo.title}`,
        `--set-tag=ALBUM=${songInfo.album}`,
        `--set-tag=ARTIST=${songInfo.artist}`,
        `--import-picture-from=${coverPath}`,
        song
      ]);
      embedProcess.on('close', resolve);
    }
  });
}

function handleMP3File(song, songInfo, coverPath, resolve) {
  const readProcess = child_process.spawn('id3v2', ['-l', song]);
  readProcess.stdout.on('data', (data) => {
    if (data.toString().indexOf('APIC (Attached picture)') < 0) {
      const embedProcess = child_process.spawn('lame', [
        `--ti`, coverPath,
        song,
      ]);
      embedProcess.on('close exit disconnect error message', (outputInfo) => {
        console.log(outputInfo.toString());
        if (outputInfo.toString().indexOf('Writing LAME Tag...done') >= 0) {
          child_process.spawn('id3v2', [
            `-t`, `"${songInfo.title}"`,
            `-a`, `"${songInfo.artist}"`,
            `-A`, `"${songInfo.album}"`,
            song,
          ]);
          fs.removeSync(song);
          fs.moveSync(`${song}.mp3`, song, { overwrite: true });
          resolve();
        }
      });
    }
  });
}
