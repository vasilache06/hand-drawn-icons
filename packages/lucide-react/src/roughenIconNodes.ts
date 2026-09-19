import rough from 'roughjs';
import type { Options, PathInfo } from 'roughjs/bin/core.js';
import type { LucideIconData, LucideIconNode } from './types';

export type RoughFillStyle =
  | 'hachure'
  | 'solid'
  | 'zigzag'
  | 'cross-hatch'
  | 'dots'
  | 'dashed'
  | 'zigzag-line';

export type RoughIconOptions = {
  roughness?: number;
  hachureGap?: number;
  fillStyle?: RoughFillStyle;
  bowing?: number;
  fillWeight?: number;
  hachureAngle?: number;
};

type DrawableNode = {
  name: string;
  attributes: Record<string, string>;
};

const DEFAULT_ROUGH_OPTIONS = {
  roughness: 0.5,
  hachureGap: 5,
  fillStyle: 'hachure' as RoughFillStyle,
  bowing: 0.8,
  fillWeight: 1,
  hachureAngle: -45,
  strokeWidth: 1.25,
  disableMultiStroke: true,
  disableMultiStrokeFill: true,
  fixedDecimalPlaceDigits: 2,
  maxRandomnessOffset: 1,
};

export function seedFromName(name: string): number {
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

function pathCommandCount(data: string): number {
  return (data.match(/[MmLlHhVvCcSsQqTtAaZz]/g) ?? []).length;
}

function shouldFill(node: DrawableNode): boolean {
  const fill = node.attributes.fill;
  if (fill && fill !== 'none') {
    return true;
  }

  if (
    node.name === 'circle' ||
    node.name === 'ellipse' ||
    node.name === 'rect' ||
    node.name === 'polygon'
  ) {
    return true;
  }

  if (node.name === 'path') {
    const data = node.attributes.d ?? '';
    if (/[Zz]/.test(data)) {
      return true;
    }

    if (/[AaCcSsQqTt]/.test(data) && pathCommandCount(data) >= 4) {
      return true;
    }
  }

  return false;
}

function isTinyFilledDot(node: DrawableNode): boolean {
  if (node.name !== 'circle') {
    return false;
  }

  const radius = num(node.attributes.r);
  const fill = node.attributes.fill;

  return radius > 0 && radius <= 1 && Boolean(fill) && fill !== 'none';
}

function isDegeneratePath(data: string): boolean {
  const numbers = [...data.matchAll(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)]
    .map((match) => Number(match[0]))
    .filter((value) => Number.isFinite(value));

  if (numbers.length < 4) {
    return true;
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (let index = 0; index < numbers.length - 1; index += 2) {
    minX = Math.min(minX, numbers[index]);
    maxX = Math.max(maxX, numbers[index]);
    minY = Math.min(minY, numbers[index + 1]);
    maxY = Math.max(maxY, numbers[index + 1]);
  }

  return maxX - minX < 0.2 && maxY - minY < 0.2;
}

function pathInfoToNode(info: PathInfo): LucideIconNode | undefined {
  const d = info.d?.trim();
  if (!d || isDegeneratePath(d)) {
    return undefined;
  }

  const fill = info.fill && info.fill !== 'none' ? 'currentColor' : undefined;
  const strokeIsNone = info.stroke === 'none' || info.strokeWidth === 0;

  if (fill && strokeIsNone) {
    return ['path', { d, fill: 'currentColor', stroke: 'none' }];
  }

  return ['path', { d }];
}

function toDrawableNode(node: LucideIconNode): DrawableNode[] {
  const [name, attributes, children] = node;
  if (name === 'g' && children?.length) {
    return children.flatMap(toDrawableNode);
  }

  const nextAttributes: Record<string, string> = {};
  for (const [key, value] of Object.entries(attributes ?? {})) {
    if (value !== undefined && value !== null) {
      nextAttributes[key] = String(value);
    }
  }

  return [{ name, attributes: nextAttributes }];
}

function drawableToNodes(
  generator: ReturnType<typeof rough.generator>,
  node: DrawableNode,
  options: Options,
): LucideIconNode[] {
  if (isTinyFilledDot(node)) {
    return [
      [
        'circle',
        {
          cx: node.attributes.cx ?? '0',
          cy: node.attributes.cy ?? '0',
          r: node.attributes.r ?? '0',
          fill: node.attributes.fill && node.attributes.fill !== 'none' ? node.attributes.fill : 'currentColor',
        },
      ],
    ];
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
      const diameter = num(node.attributes.r) * 2;
      if (diameter <= 0) {
        return [];
      }
      drawable = generator.circle(num(node.attributes.cx), num(node.attributes.cy), diameter, shapeOptions);
      break;
    }
    case 'ellipse': {
      const width = num(node.attributes.rx) * 2;
      const height = num(node.attributes.ry) * 2;
      if (width <= 0 || height <= 0) {
        return [];
      }
      drawable = generator.ellipse(
        num(node.attributes.cx),
        num(node.attributes.cy),
        width,
        height,
        shapeOptions,
      );
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
      drawable =
        rx > 0 || ry > 0
          ? generator.path(roundedRectPath(x, y, width, height, rx, ry), shapeOptions)
          : generator.rectangle(x, y, width, height, shapeOptions);
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
    .map(pathInfoToNode)
    .filter((next): next is LucideIconNode => {
      if (!next) {
        return false;
      }

      const key = JSON.stringify(next);
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
}

export function roughenIconData(icon: LucideIconData, options: RoughIconOptions = {}): LucideIconData {
  const roughness = options.roughness ?? DEFAULT_ROUGH_OPTIONS.roughness;
  const fillStyle = options.fillStyle ?? DEFAULT_ROUGH_OPTIONS.fillStyle;
  const hachureGap = options.hachureGap ?? DEFAULT_ROUGH_OPTIONS.hachureGap;
  const generator = rough.generator({
    options: {
      ...DEFAULT_ROUGH_OPTIONS,
      roughness,
      fillStyle,
      hachureGap,
      bowing: options.bowing ?? DEFAULT_ROUGH_OPTIONS.bowing,
      fillWeight: options.fillWeight ?? DEFAULT_ROUGH_OPTIONS.fillWeight,
      hachureAngle: options.hachureAngle ?? DEFAULT_ROUGH_OPTIONS.hachureAngle,
      seed: seedFromName(icon.name ?? 'icon'),
      stroke: 'currentColor',
      fill: 'currentColor',
    },
  });

  const node = icon.node
    .flatMap(toDrawableNode)
    .flatMap((drawable) => drawableToNodes(generator, drawable, generator.defaultOptions));

  return {
    ...icon,
    node: node.length > 0 ? node : icon.node,
  };
}
