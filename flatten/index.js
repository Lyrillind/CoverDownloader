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
    if (!AUDIO_EXT.includes(path.extname(item.path).toLowerCase())) return;
    items.push(item.path)
  })
  .on('end', flattenFolder);

function flattenFolder() {
  items.forEach(item => {
    fs.copy(item, path.join(targetPath, 'flatten', path.basename(item)));
  });
}
