const fs = require('node:fs');
const path = require('node:path');
const source = path.resolve(__dirname, '../../jogos-assets');
const target = path.resolve(__dirname, '../jogos-assets');
// Docker already copies these assets; local builds use the repository source.
if (fs.existsSync(source)) fs.cpSync(source, target, { recursive: true });
if (!fs.existsSync(target)) throw new Error('Diretório jogos-assets não encontrado.');
