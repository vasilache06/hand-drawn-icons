import fs from 'fs/promises';
import path from 'path';
import rough from 'roughjs';
import { parseSync, type INode } from 'svgson';
import type { Options, PathInfo } from 'roughjs/bin/core.js';
import {
  getCurrentDirPath,
  readSvgDirectory,
} from '../tools/build-helpers/helpers.ts';

const currentDir = getCurrentDirPath(import.meta.url);
const ROOT_DIR = path.resolve(currentDir, '..');
const ICONS_DIR = path.resolve(ROOT_DIR, 'icons');
const ORIGINALS_DIR = path.resolve(ROOT_DIR, 'icons-original');
const CONFIG_PATH = path.resolve(ROOT_DIR, 'rough.config.json');
const PREVIEW_DIR = path.resolve(ROOT_DIR, 'rough-preview');

const SVG_ROOT_ATTRS = `xmlns="http://www.w3.org/2000/svg"
  width="24"
  height="24"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"`;

const FILL_STYLES = new Set([
  'hachure',
  'solid',
  'zigzag',
  'cross-hatch',
  'dots',
  'dashed',
  'zigzag-line',
]);

type RoughIconConfig = {
  roughness: number;
  hachureGap: number;
  fillStyle: string;
  bowing: number;
  strokeWidth: number;
  fillWeight: number;
  hachureAngle: number;
  disableMultiStroke: boolean;
  disableMultiStrokeFill: boolean;
  fixedDecimalPlaceDigits: number;
};

const DEFAULT_CONFIG: RoughIconConfig = {
  roughness: 0.5,
  hachureGap: 5,
  fillStyle: 'hachure',
  bowing: 0.8,
  strokeWidth: 1.25,
  fillWeight: 1,
  hachureAngle: -45,
  disableMultiStroke: true,
  disableMultiStrokeFill: true,
  fixedDecimalPlaceDigits: 2,
};

function readArg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) {
    return undefined;
  }

  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) {
    return undefined;
  }

  return value;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function toNumber(value: string | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function seedFromName(name: string): number {
  let hash = 1;
  for (const char of name) {
    hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0;
  }

  return (hash % 2_147_483_646) + 1;
}

function num(value: string | undefined, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parsePoints(points: string): [number, number][] {
  const numbers = points
    .trim()
    .split(/[\s,]+/)
    .map(Number)
    .filter((value) => Number.isFinite(value));

  const pairs: [number, number][] = [];
  for (let index = 0; index < numbers.length - 1; index += 2) {
    pairs.push([numbers[index], numbers[index + 1]]);
  }

  return pairs;
}

function roundedRectPath(
  x: number,
  y: number,
  width: number,
  height: number,
  rx: number,
  ry: number,
): string {
  const radiusX = Math.min(Math.max(rx, 0), width / 2);
  const radiusY = Math.min(Math.max(ry, 0), height / 2);

  return [
    `M${x + radiusX} ${y}`,
    `H${x + width - radiusX}`,
    `A${radiusX} ${radiusY} 0 0 1 ${x + width} ${y + radiusY}`,
    `V${y + height - radiusY}`,
    `A${radiusX} ${radiusY} 0 0 1 ${x + width - radiusX} ${y + height}`,
    `H${x + radiusX}`,
    `A${radiusX} ${radiusY} 0 0 1 ${x} ${y + height - radiusY}`,
    `V${y + radiusY}`,
    `A${radiusX} ${radiusY} 0 0 1 ${x + radiusX} ${y}`,
    'Z',
  ].join('');
}

function flattenNodes(nodes: INode[]): INode[] {
  return nodes.flatMap((node) => {
    if (node.name === 'g' || node.name === 'svg') {
      return flattenNodes(node.children ?? []);
    }

    return [node];
  });
}

function shouldFill(node: INode): boolean {
  const fill = node.attributes.fill;
  if (fill && fill !== 'none') {
    return true;
  }

  if (node.name === 'circle' || node.name === 'ellipse' || node.name === 'rect' || node.name === 'polygon') {
    return true;
  }

  if (node.name === 'path') {
    const data = node.attributes.d ?? '';
    if (/[Zz]/.test(data)) {
      return true;
    }

    // Open curved shapes (bell, heart, bulb) still enclose an area worth hatching.
    if (/[AaCcSsQqTt]/.test(data)) {
      return true;
    }
  }

  return false;
}

function isTinyFilledDot(node: INode): boolean {
  if (node.name !== 'circle') {
    return false;
  }

  const radius = num(node.attributes.r);
  const fill = node.attributes.fill;

  return radius > 0 && radius <= 1 && fill !== 'none';
}

function formatTinyCircle(node: INode): string {
  const cx = node.attributes.cx ?? '0';
  const cy = node.attributes.cy ?? '0';
  const r = node.attributes.r ?? '0';
  const fill = node.attributes.fill && node.attributes.fill !== 'none' ? node.attributes.fill : 'currentColor';

  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" />`;
}

function pathInfoToElement(info: PathInfo): string | undefined {
  const d = info.d?.trim();
  if (!d) {
    return undefined;
  }

  const fill = info.fill && info.fill !== 'none' ? 'currentColor' : undefined;
  const strokeIsNone = info.stroke === 'none' || info.strokeWidth === 0;

  if (fill && strokeIsNone) {
    return `<path d="${d}" fill="currentColor" stroke="none" />`;
  }

  return `<path d="${d}" />`;
}

function drawableToElements(
  generator: ReturnType<typeof rough.generator>,
  node: INode,
  options: Options,
): string[] {
  if (isTinyFilledDot(node)) {
    return [formatTinyCircle(node)];
  }

  const fill = shouldFill(node) ? 'currentColor' : 'none';
  const shapeOptions: Options = {
    ...options,
    fill,
    stroke: 'currentColor',
    fillStyle: fill === 'none' ? 'solid' : options.fillStyle,
  };

  let drawable;

  switch (node.name) {
    case 'path': {
      const d = node.attributes.d;
      if (!d) {
        return [];
      }
      drawable = generator.path(d, shapeOptions);
      break;
    }
    case 'circle': {
      const cx = num(node.attributes.cx);
      const cy = num(node.attributes.cy);
      const diameter = num(node.attributes.r) * 2;
      if (diameter <= 0) {
        return [];
      }
      drawable = generator.circle(cx, cy, diameter, shapeOptions);
      break;
    }
    case 'ellipse': {
      const cx = num(node.attributes.cx);
      const cy = num(node.attributes.cy);
      const width = num(node.attributes.rx) * 2;
      const height = num(node.attributes.ry) * 2;
      if (width <= 0 || height <= 0) {
        return [];
      }
      drawable = generator.ellipse(cx, cy, width, height, shapeOptions);
      break;
    }
    case 'rect': {
      const x = num(node.attributes.x);
      const y = num(node.attributes.y);
      const width = num(node.attributes.width);
      const height = num(node.attributes.height);
      const rx = num(node.attributes.rx, num(node.attributes.ry));
      const ry = num(node.attributes.ry, rx);
      if (width <= 0 || height <= 0) {
        return [];
      }
      if (rx > 0 || ry > 0) {
        drawable = generator.path(roundedRectPath(x, y, width, height, rx, ry), shapeOptions);
      } else {
        drawable = generator.rectangle(x, y, width, height, shapeOptions);
      }
      break;
    }
    case 'line': {
      drawable = generator.line(
        num(node.attributes.x1),
        num(node.attributes.y1),
        num(node.attributes.x2),
        num(node.attributes.y2),
        { ...shapeOptions, fill: 'none' },
      );
      break;
    }
    case 'polygon': {
      const points = parsePoints(node.attributes.points ?? '');
      if (points.length < 3) {
        return [];
      }
      drawable = generator.polygon(points, shapeOptions);
      break;
    }
    case 'polyline': {
      const points = parsePoints(node.attributes.points ?? '');
      if (points.length < 2) {
        return [];
      }
      drawable = generator.linearPath(points, { ...shapeOptions, fill: 'none' });
      break;
    }
    default:
      return [];
  }

  const seen = new Set<string>();
  return generator
    .toPaths(drawable)
    .map(pathInfoToElement)
    .filter((element): element is string => {
      if (!element) {
        return false;
      }

      if (seen.has(element)) {
        return false;
      }

      seen.add(element);
      return true;
    });
}

function roughenSvg(svg: string, iconName: string, config: RoughIconConfig): string {
  const parsed = parseSync(svg);
  const generator = rough.generator({
    options: {
      roughness: config.roughness,
      bowing: config.bowing,
      strokeWidth: config.strokeWidth,
      fillWeight: config.fillWeight,
      fillStyle: config.fillStyle,
      hachureGap: config.hachureGap,
      hachureAngle: config.hachureAngle,
      disableMultiStroke: config.disableMultiStroke,
      disableMultiStrokeFill: config.disableMultiStrokeFill,
      fixedDecimalPlaceDigits: config.fixedDecimalPlaceDigits,
      seed: seedFromName(iconName),
      stroke: 'currentColor',
      fill: 'currentColor',
    },
  });

  const children = flattenNodes(parsed.children ?? []).flatMap((node) =>
    drawableToElements(generator, node, generator.defaultOptions),
  );

  if (children.length === 0) {
    throw new Error(`${iconName}.svg produced no drawable paths`);
  }

  return `<svg
  ${SVG_ROOT_ATTRS}
>
  ${children.join('\n  ')}
</svg>
`;
}

function previewPage(icons: Array<{ name: string; svg: string }>, config: RoughIconConfig): string {
  const cards = icons
    .map(
      ({ name, svg }) => `    <article class="card">
      ${svg.replace(/width="24"/, 'width="72"').replace(/height="24"/, 'height="72"')}
      <span class="label">${name}</span>
    </article>`,
    )
    .join('\n');

  return `<!doctype html>
<html lang="ro">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Hand-drawn icons</title>
    <style>
      :root {
        color-scheme: light;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        background: #f6f3ee;
        color: #8d7a6b;
        font-family: ui-sans-serif, system-ui, sans-serif;
      }
      header {
        padding: 24px 28px 8px;
      }
      h1 {
        margin: 0 0 8px;
        font-size: 20px;
        font-weight: 600;
        color: #5c4e44;
      }
      .meta {
        margin: 0;
        color: #9a8b80;
        font-size: 14px;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 16px;
        padding: 20px 24px 40px;
      }
      .card {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 22px;
        padding: 28px 16px 16px;
        background: #fff;
        border: 1px solid #efe8e1;
        border-radius: 16px;
      }
      .card svg {
        color: #8d7a6b;
        overflow: visible;
      }
      .label {
        font-size: 13px;
        line-height: 1.4;
        color: #9a8b80;
        border: 1px solid #e6ddd6;
        border-radius: 999px;
        padding: 2px 10px;
        background: #fcfbf9;
      }
    </style>
  </head>
  <body>
    <header>
      <h1>Hand-drawn icons</h1>
      <p class="meta">
        Roughness ${config.roughness} · Densitate hașuri ${config.hachureGap} · Stil umplere ${config.fillStyle}
      </p>
    </header>
    <section class="grid">
${cards}
    </section>
  </body>
</html>
`;
}

async function loadConfig(): Promise<RoughIconConfig> {
  try {
    const raw = await fs.readFile(CONFIG_PATH, 'utf-8');
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

async function ensureOriginals(files: string[]): Promise<void> {
  await fs.mkdir(ORIGINALS_DIR, { recursive: true });
  const existing = new Set(await fs.readdir(ORIGINALS_DIR));

  await Promise.all(
    files.map(async (fileName) => {
      if (existing.has(fileName)) {
        return;
      }

      await fs.copyFile(path.join(ICONS_DIR, fileName), path.join(ORIGINALS_DIR, fileName));
    }),
  );
}

function printUsage(): void {
  console.log(`Convert Lucide SVGs into rough, hatched, hand-drawn icons.

Usage:
  pnpm roughen
  pnpm roughen -- --roughness 0.5 --hachure-gap 5 --fill-style hachure
  pnpm roughen -- --only lock,bell,cog,lightbulb --preview

Options:
  --roughness <n>       Outline wobble (default 0.5)
  --hachure-gap <n>     Hatch density / gap (default 5)
  --fill-style <name>   hachure | solid | zigzag | cross-hatch | dots | dashed | zigzag-line
  --only a,b,c          Convert only these icon names
  --out <dir>           Output directory (default: icons)
  --preview             Write rough-preview/index.html
  --dry-run             Convert without writing icon files
`);
}

async function main(): Promise<void> {
  if (hasFlag('help') || hasFlag('h')) {
    printUsage();
    return;
  }

  const fileConfig = await loadConfig();
  const fillStyle = readArg('fill-style') ?? fileConfig.fillStyle;

  if (!FILL_STYLES.has(fillStyle)) {
    throw new Error(`Unknown fill style "${fillStyle}". Use one of: ${[...FILL_STYLES].join(', ')}`);
  }

  const config: RoughIconConfig = {
    ...fileConfig,
    roughness: toNumber(readArg('roughness'), fileConfig.roughness),
    hachureGap: toNumber(readArg('hachure-gap'), fileConfig.hachureGap),
    fillStyle,
  };

  const outputDir = path.resolve(ROOT_DIR, readArg('out') ?? 'icons');
  const dryRun = hasFlag('dry-run');
  const writePreview = hasFlag('preview') || hasFlag('dry-run');
  const only = new Set(
    (readArg('only') ?? '')
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean),
  );

  const svgFiles = (await readSvgDirectory(ICONS_DIR))
    .filter((fileName) => (only.size === 0 ? true : only.has(fileName.replace(/\.svg$/, ''))))
    .sort();

  if (svgFiles.length === 0) {
    throw new Error('No matching SVG files found.');
  }

  await ensureOriginals(svgFiles);

  if (!dryRun) {
    await fs.mkdir(outputDir, { recursive: true });
  }

  console.log(
    `Roughening ${svgFiles.length} icons · roughness=${config.roughness} · hachureGap=${config.hachureGap} · fillStyle=${config.fillStyle}`,
  );

  const converted: Array<{ name: string; svg: string }> = [];
  let failures = 0;

  for (const fileName of svgFiles) {
    const iconName = fileName.replace(/\.svg$/, '');
    const sourcePath = path.join(ORIGINALS_DIR, fileName);
    const svg = await fs.readFile(sourcePath, 'utf-8');

    try {
      const nextSvg = roughenSvg(svg, iconName, config);
      converted.push({ name: iconName, svg: nextSvg });

      if (!dryRun) {
        await fs.writeFile(path.join(outputDir, fileName), nextSvg, 'utf-8');
      }
    } catch (error) {
      failures += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Failed ${fileName}: ${message}`);
    }
  }

  if (writePreview) {
    await fs.mkdir(PREVIEW_DIR, { recursive: true });
    await fs.writeFile(path.join(PREVIEW_DIR, 'index.html'), previewPage(converted, config), 'utf-8');
    console.log(`Preview written to ${path.join(PREVIEW_DIR, 'index.html')}`);
  }

  console.log(`Converted ${converted.length} icons${failures ? `, ${failures} failed` : ''}.`);
  if (!dryRun) {
    console.log(`Wrote SVGs to ${outputDir}`);
    console.log('Originals are kept in icons-original/ so you can re-run with different properties.');
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
