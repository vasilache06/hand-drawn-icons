import fs from 'fs/promises';
import http from 'http';
import path from 'path';
import { convertPlaceholders } from './convertPlaceholders.mts';
import { getCurrentDirPath, readSvgDirectory } from '../tools/build-helpers/helpers.ts';

const currentDir = getCurrentDirPath(import.meta.url);
const ROOT_DIR = path.resolve(currentDir, '..');
const ICONS_DIR = path.resolve(ROOT_DIR, 'icons');
const ORIGINALS_DIR = path.resolve(ROOT_DIR, 'icons-original');
const PLAYGROUND_SRC = path.resolve(currentDir, 'playground');
const PREVIEW_DIR = path.resolve(ROOT_DIR, 'rough-preview');
const PORT = Number(process.env.PORT) || 4578;
const FEATURED = ['lock', 'bell', 'cog', 'lightbulb', 'lock-keyhole'];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

async function sourceSvgPath(fileName: string): Promise<string> {
  const original = path.join(ORIGINALS_DIR, fileName);
  try {
    await fs.access(original);
    return original;
  } catch {
    return path.join(ICONS_DIR, fileName);
  }
}

async function writePlayground(): Promise<void> {
  await fs.mkdir(PREVIEW_DIR, { recursive: true });

  const svgFiles = (await readSvgDirectory(ICONS_DIR)).sort((a, b) => {
    const aName = a.replace(/\.svg$/, '');
    const bName = b.replace(/\.svg$/, '');
    const aFeatured = FEATURED.indexOf(aName);
    const bFeatured = FEATURED.indexOf(bName);
    if (aFeatured !== -1 || bFeatured !== -1) {
      return (aFeatured === -1 ? 99 : aFeatured) - (bFeatured === -1 ? 99 : bFeatured);
    }
    return aName.localeCompare(bName);
  });

  const icons = await Promise.all(
    svgFiles.map(async (fileName) => ({
      name: fileName.replace(/\.svg$/, ''),
      svg: await fs.readFile(await sourceSvgPath(fileName), 'utf-8'),
    })),
  );

  const placeholders = await convertPlaceholders();

  await fs.writeFile(path.join(PREVIEW_DIR, 'icons-data.json'), JSON.stringify(icons), 'utf-8');
  await fs.writeFile(
    path.join(PREVIEW_DIR, 'placeholder-data.json'),
    JSON.stringify(placeholders.map(({ name, svg }) => ({ name, svg }))),
    'utf-8',
  );
  await fs.copyFile(path.join(PLAYGROUND_SRC, 'index.html'), path.join(PREVIEW_DIR, 'index.html'));
  await fs.copyFile(path.join(PLAYGROUND_SRC, 'app.js'), path.join(PREVIEW_DIR, 'app.js'));
  await fs.copyFile(
    path.join(ROOT_DIR, 'node_modules/roughjs/bundled/rough.esm.js'),
    path.join(PREVIEW_DIR, 'rough.esm.js'),
  );

  console.log(
    `Playground assets written to ${PREVIEW_DIR} (${icons.length} icons, ${placeholders.length} placeholders)`,
  );
}

function serve(): void {
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', `http://127.0.0.1:${PORT}`);
    const relative = (url.pathname === '/' ? '/index.html' : url.pathname).replace(/^\/+/, '');
    const filePath = path.resolve(PREVIEW_DIR, relative);
    const ext = path.extname(url.pathname === '/' ? '/index.html' : url.pathname).toLowerCase();

    if (!filePath.startsWith(PREVIEW_DIR)) {
      response.writeHead(403);
      response.end('Forbidden');
      return;
    }

    try {
      const data = await fs.readFile(filePath);
      response.writeHead(200, { 'content-type': MIME[ext] ?? 'application/octet-stream' });
      response.end(data);
    } catch {
      response.writeHead(404);
      response.end('Not found');
    }
  });

  server.listen(PORT, () => {
    console.log(`Playground: http://localhost:${PORT}/`);
  });
}

await writePlayground();
if (!process.argv.includes('--no-serve')) {
  serve();
}
