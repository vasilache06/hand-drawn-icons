import fs from 'fs/promises';
import path from 'path';
import { PNG } from 'pngjs';
import { getCurrentDirPath } from '../tools/build-helpers/helpers.ts';

const currentDir = getCurrentDirPath(import.meta.url);
const ROOT_DIR = path.resolve(currentDir, '..');
const PLACEHOLDER_DIR = path.resolve(ROOT_DIR, 'placeholder');

export type PlaceholderAsset = {
  name: string;
  source: string;
  svg: string;
};

function slugify(fileName: string): string {
  return path
    .parse(fileName)
    .name.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function uniqueName(used: Set<string>, base: string): string {
  if (!used.has(base)) {
    used.add(base);
    return base;
  }

  let index = 2;
  while (used.has(`${base}-${index}`)) {
    index += 1;
  }

  const name = `${base}-${index}`;
  used.add(name);
  return name;
}

function pngToSvg(buffer: Buffer): string {
  const png = PNG.sync.read(buffer);
  const href = `data:image/png;base64,${buffer.toString('base64')}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${png.width} ${png.height}" width="${png.width}" height="${png.height}">
  <image href="${href}" width="${png.width}" height="${png.height}" />
</svg>
`;
}

export async function convertPlaceholders(): Promise<PlaceholderAsset[]> {
  const files = await fs.readdir(PLACEHOLDER_DIR);
  const svgFiles = files.filter((fileName) => fileName.toLowerCase().endsWith('.svg')).sort();
  const pngFiles = files.filter((fileName) => fileName.toLowerCase().endsWith('.png')).sort();

  const used = new Set<string>();
  const assets: PlaceholderAsset[] = [];

  for (const fileName of svgFiles) {
    const name = uniqueName(used, slugify(fileName));
    const source = path.join(PLACEHOLDER_DIR, fileName);
    const svg = await fs.readFile(source, 'utf-8');
    assets.push({ name, source: fileName, svg });
  }

  for (const fileName of pngFiles) {
    const base = slugify(fileName);
    if (used.has(base)) {
      continue;
    }

    const name = uniqueName(used, base);
    const source = path.join(PLACEHOLDER_DIR, fileName);
    const buffer = await fs.readFile(source);
    const svg = pngToSvg(buffer);

    await fs.writeFile(path.join(PLACEHOLDER_DIR, `${name}.svg`), svg, 'utf-8');
    assets.push({ name, source: fileName, svg });
    console.log(`Converted ${fileName} → ${name}.svg`);
  }

  assets.sort((a, b) => a.name.localeCompare(b.name));
  return assets;
}

const isDirectRun = process.argv[1]?.replaceAll('\\', '/').endsWith('convertPlaceholders.mts');
if (isDirectRun) {
  await convertPlaceholders();
}
