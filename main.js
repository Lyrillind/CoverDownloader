import FileSaver from 'file-saver';
import { argv } from 'yargs';
import axios from 'axios';
import child_process from 'child_process';
import colors from 'colors';
import fs from 'fs-extra';
import klaw from 'klaw';
import os from 'os';
import path from 'path';

const NODE_BIN = '/usr/local/bin/node';
const API_SERVICE_PATH = path.resolve(__dirname, './NeteaseCloudMusicApi/app.js');
const serviceProcess = child_process.spawn(NODE_BIN, [API_SERVICE_PATH], {
  detached: true,
});

const NeteaseService = 'http://localhost:3000';

const AUDIO_EXT = ['.flac','.mp3','.aac','.ogg','.m4a','.wav','.ape','.aiff'];

const targetPath = argv.path ? argv.path.replace('~', os.homedir()) : '.';

const items = [];
klaw(targetPath)
  .on('data', item => items.push(item.path))
  .on('end', checkApiServer);

function checkApiServer() {
  axios.get(NeteaseService).then(() => {
    console.log(colors.green('开始处理...'));
    const songs = items.filter(o => AUDIO_EXT.includes(path.extname(o)));
    handleSongs(songs);
  }).catch((error) => {
    console.log(error.toString());
    checkApiServer();
  });
}

function handleSongs(songs) {
  let count = 0;
  songs.forEach(song => {
    const songName = path.basename(song, path.extname(song));
    retrieveSongInfo(songName).then((info) => {
      const albumId = info.al.id;
      return axios.get(`${NeteaseService}/album?id=${albumId}`);
    }).then((response) => {
      const { picUrl, name } = response.data.album;
      const artist = songName.split('-')[0];
      const targetDir = path.join(targetPath, 'sorted', artist, name);
      return organizeSong(song, picUrl, targetDir);
    }).then(() => {
      count += 1;
      if (count >= songs.length) {
        serviceProcess.kill('SIGINT');
      }
    }).catch((error) => {
      console.log(song, error.toString());
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
  return axios.get(picUrl, {
    responseType: 'stream',
  }).then(response => {
    response.data.pipe(fs.createWriteStream(targetLocation));
  });
}
