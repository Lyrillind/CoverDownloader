import { argv } from 'yargs';
import colors from 'colors';
import fs from 'fs-extra';
import klaw from 'klaw';
import os from 'os';
import path from 'path';
import * as mm from 'music-metadata';
import escapeStringRegexp from 'escape-string-regexp';

const AUDIO_EXT = ['.flac','.mp3','.aac','.ogg','.m4a','.wav','.ape','.aiff'];

const targetPath = argv.path ? argv.path.replace('~', os.homedir()) : '.';

const DIR_NAME = 'FORMATED';

const items = [];
klaw(targetPath)
  .on('data', item => {
    if (!AUDIO_EXT.includes(path.extname(item.path))) return;
    if (path.dirname(item.path).indexOf(DIR_NAME) > 0) return;
    items.push(item.path);
  })
  .on('end', () => formatFilename((song, newFilename) => {
    if (!newFilename) return;
    fs.move(song, path.join(targetPath, DIR_NAME, newFilename), err => {
      if (err) return console.error(err);
      console.log(colors.green('✓'), colors.gray(`${path.basename(song)} => ${newFilename}`));
    });
  }));

function formatFilename(callback) {
  items.forEach(item => {
    const extname = path.extname(item);
    mm.parseFile(item)
      .then( metadata => {
        const { title, artist } = metadata.common;
        const newFilename = `${artist} - ${title}${extname}`;
        const originFilename = path.basename(item);
        const guess = new RegExp(`^${escapeStringRegexp(artist)}\\s?-\\s?${escapeStringRegexp(title)}${path.extname(item)}$`, 'i');
        if (!guess.test(originFilename)) {
          callback && callback(item, newFilename);
        }
      })
      .catch((err) => {
        console.error(err.message);
      });
  });
}
