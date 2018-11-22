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

const items = [];
klaw(targetPath)
  .on('data', item => {
    if (!AUDIO_EXT.includes(path.extname(item.path))) return;
    items.push(item.path)
  })
  .on('end', analysis);

let has = 0;
let none = 0;

function analysis() {
  let total = items.length;
  items.forEach(item => {
    const extname = path.extname(item);
    switch (extname) {
      case '.flac': {
        handleFLACFile(item, () => computeHasNone(total));
        break;
      }
      case '.mp3': {
        handleMP3File(item, () => computeHasNone(total));
        break;
      }
      default:
        total -= 1;
        break;
    }
  });
}

function handleFLACFile(song, callback) {
  const readProcess = child_process.spawn('metaflac', ['--list', song]);
  readProcess.stdout.on('data', (data) => {
    const output = data.toString();
    if (output.indexOf('type: 3 (Cover (front))') >= 0) {
      console.log(colors.green('✓'), colors.gray(path.basename(song, path.extname(song))));
      has += 1;
    } else {
      console.log(colors.red('✕'), colors.gray(path.basename(song, path.extname(song))));
      none += 1;
    }
    callback && callback();
  });
}

function handleMP3File(song, callback) {
  const readProcess = child_process.spawn('id3v2', ['-l', song]);
  readProcess.stdout.on('data', (data) => {
    if (data.toString().indexOf('APIC (Attached picture)') >= 0) {
      console.log(colors.green('✓'), colors.gray(path.basename(song, path.extname(song))));
      has += 1;
    } else {
      console.log(colors.red('✕'), colors.gray(path.basename(song, path.extname(song))));
      none += 1;
    }
    callback && callback();
  });
}

function computeHasNone(total) {
  if (has + none !== total) return;
  console.log('\n', colors.green(has), '-', colors.red(none), '-', total);
}
