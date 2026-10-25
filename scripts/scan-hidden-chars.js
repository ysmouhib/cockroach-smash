#!/usr/bin/env node
// Fails if any file in the repo contains invisible or direction-changing
// characters: protection against "Trojan Source" style tricks in our own code
// (code that displays differently from what runs). Run on every push by CI.
//   node scripts/scan-hidden-chars.js

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// [first, last, name] code point ranges that should never appear in source files.
const HIDDEN = [
  [0x0000, 0x0008, 'control character'], [0x000B, 0x000C, 'control character'], [0x000E, 0x001F, 'control character'],
  [0x007F, 0x009F, 'control character'], [0x00A0, 0x00A0, 'no-break space'], [0x00AD, 0x00AD, 'soft hyphen'],
  [0x034F, 0x034F, 'combining grapheme joiner'], [0x061C, 0x061C, 'Arabic letter mark'],
  [0x115F, 0x1160, 'Hangul filler'], [0x180E, 0x180E, 'Mongolian vowel separator'],
  [0x200B, 0x200F, 'zero-width or direction mark'], [0x202A, 0x202E, 'bidi embedding or override'],
  [0x2060, 0x2064, 'word joiner or invisible operator'], [0x2066, 0x2069, 'bidi isolate'],
  [0x3164, 0x3164, 'Hangul filler'], [0xFE00, 0xFE0F, 'variation selector'], [0xFEFF, 0xFEFF, 'byte order mark'],
  [0xFFA0, 0xFFA0, 'Hangul filler'], [0xFFF9, 0xFFFB, 'interlinear annotation'],
  [0x1D173, 0x1D17A, 'musical formatting'], [0xE0000, 0xE007F, 'tag character'], [0xE0100, 0xE01EF, 'variation selector'],
];
const TEXT = /\.(js|mjs|cjs|json|sql|md|yml|yaml|html|css|txt|example)$|^\.gitignore$|^\.env/;

function hiddenKind(code) {
  for (const [first, last, name] of HIDDEN) if (code >= first && code <= last) return name;
  return null;
}

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' })
  .split('\n').filter((f) => f && TEXT.test(f.split('/').pop()));

let found = 0;
for (const file of files) {
  let text;
  try { text = readFileSync(file, 'utf8'); } catch { continue; }
  text.split('\n').forEach((line, i) => {
    for (const ch of line.replace(/\r$/, '')) {
      const code = ch.codePointAt(0);
      if (code === 0x09) continue; // tab
      const kind = hiddenKind(code);
      if (kind) {
        found++;
        console.log(`${file}:${i + 1}: U+${code.toString(16).toUpperCase().padStart(4, '0')} (${kind})`);
      }
    }
  });
}
console.log(found ? `\n${found} hidden character(s) found. Write them as visible escape codes instead.` : `No hidden characters in ${files.length} files.`);
process.exit(found ? 1 : 0);
