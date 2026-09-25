import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const files = ['C4', 'Ds4', 'Fs4', 'A4', 'C5', 'Ds5', 'Fs5', 'A5'];
const directory = new URL('../public/audio/piano/', import.meta.url);
await mkdir(directory, { recursive: true });
const manifest = [];
for (const name of files) {
  const source = `https://tonejs.github.io/audio/salamander/${name}.mp3`;
  const response = await fetch(source, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 1000) throw new Error(`${name}: unexpected sample size`);
  await writeFile(new URL(`${name}.mp3`, directory), bytes);
  manifest.push({ file: `${name}.mp3`, source, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  process.stdout.write(`Prepared ${name}.mp3 (${bytes.length} bytes)\n`);
}
await writeFile(new URL('manifest.json', directory), JSON.stringify({ author: 'Alexander Holm', instrument: 'Salamander Grand Piano', license: 'CC BY 3.0', files: manifest }, null, 2) + '\n');
const license = await fetch('https://creativecommons.org/licenses/by/3.0/legalcode.txt', { signal: AbortSignal.timeout(30000) });
if (!license.ok) throw new Error(`License HTTP ${license.status}`);
await writeFile(new URL('CC-BY-3.0.txt', directory), await license.text());
