import FileSaver from 'file-saver';
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
      }
      checkApiServer();
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
    const songName = path.basename(song, path.extname(song));
    retrieveSongInfo(songName).then((info) => {
      const albumId = info.al.id;
      return axios.get(`${NeteaseService}/album?id=${albumId}`);
    }).then((response) => {
      const { picUrl, name } = response.data.album;
      const artist = songName.split('-')[0].trim();
      const targetDir = path.join(targetPath, SORTED_DIR, artist, name);
      return organizeSong(song, picUrl, targetDir);
    }).then(() => {
      count += 1;
      if (count >= songs.length) {
        console.log(colors.green('全部处理完成'));
        if (!serviceProcess) return;
        serviceProcess.kill('SIGINT');
      }
    }).catch((error) => {
      console.log(colors.red('✕'), colors.gray(path.basename(song, path.extname(song))));
    });
  });
}

function retrieveSongInfo(name) {
  return axios.get(`${NeteaseService}/search?keywords=${encodeURIComponent(name)}`).then((response) => {
    const { songs } = response.data.result;
    const { id } = songs[0];
    return axios.get(`${NeteaseService}/song/detail?ids=${id}`);
  }).then((response) => {
    return response.data.songs[0];
  });
}

function organizeSong(song, picUrl, downloadDir) {
  fs.ensureDirSync(downloadDir);
  fs.copy(song, path.join(downloadDir, path.basename(song)));
  const targetLocation = path.join(downloadDir, `cover${path.extname(picUrl)}`);
  return new Promise((resolve, reject) => {
    const downloadProcess = child_process.spawn('curl', [picUrl, '--output', targetLocation], {
      detached: true
    });
    downloadProcess.on('exit', () => {
      if (fs.pathExistsSync(targetLocation)) {
        const stats = fs.statSync(targetLocation);
        if (stats.size > 0) {
          console.log(colors.green('✓'), colors.gray(path.basename(song, path.extname(song))));
          resolve();
          return;
        }
      }
      retry(song, picUrl, downloadDir);
    });
  });
}

function retry(song, picUrl, downloadDir) {
  const targetLocation = path.join(downloadDir, `cover${path.extname(picUrl)}`);
  if (fs.pathExistsSync(targetLocation)) {
    fs.removeSync(targetLocation);
  }
  organizeSong(song, picUrl, downloadDir);
}
