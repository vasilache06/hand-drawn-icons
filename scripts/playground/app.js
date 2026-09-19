import rough from './rough.esm.js';

const FEATURED = ['lock', 'bell', 'cog', 'lightbulb', 'lock-keyhole'];

const state = {
  roughness: 0.5,
  hachureGap: 5,
  fillStyle: 'hachure',
  color: '#8d7a6b',
  search: '',
  selected: 'bell',
  tab: 'react',
  gallery: 'icons',
  icons: [],
  placeholders: [],
};

function seedFromName(name) {
  let hash = 1;
  for (const char of name) {
    hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0;
  }
  return (hash % 2147483646) + 1;
}

function toPascalCase(value) {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parsePoints(points) {
  const numbers = String(points)
    .trim()
    .split(/[\s,]+/)
    .map(Number)
    .filter((value) => Number.isFinite(value));
  const pairs = [];
  for (let i = 0; i < numbers.length - 1; i += 2) {
    pairs.push([numbers[i], numbers[i + 1]]);
  }
  return pairs;
}

function roundedRectPath(x, y, width, height, rx, ry) {
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

function pathCommandCount(data) {
  return (data.match(/[MmLlHhVvCcSsQqTtAaZz]/g) || []).length;
}

function shouldFill(el) {
  const fill = el.getAttribute('fill');
  if (fill && fill !== 'none') return true;
  const name = el.tagName.toLowerCase();
  if (name === 'circle' || name === 'ellipse' || name === 'rect' || name === 'polygon') return true;
  if (name === 'path') {
    const data = el.getAttribute('d') || '';
    if (/[Zz]/.test(data)) return true;
    if (/[AaCcSsQqTt]/.test(data) && pathCommandCount(data) >= 4) return true;
  }
  return false;
}

function isTinyFilledDot(el) {
  if (el.tagName.toLowerCase() !== 'circle') return false;
  const radius = num(el.getAttribute('r'));
  const fill = el.getAttribute('fill');
  return radius > 0 && radius <= 1 && fill && fill !== 'none';
}

function isDegeneratePath(data) {
  const numbers = [...data.matchAll(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)]
    .map((match) => Number(match[0]))
    .filter((value) => Number.isFinite(value));
  if (numbers.length < 4) return true;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < numbers.length - 1; i += 2) {
    minX = Math.min(minX, numbers[i]);
    maxX = Math.max(maxX, numbers[i]);
    minY = Math.min(minY, numbers[i + 1]);
    maxY = Math.max(maxY, numbers[i + 1]);
  }
  return maxX - minX < 0.2 && maxY - minY < 0.2;
}

function flattenElements(svg) {
  return [...svg.querySelectorAll('path, circle, ellipse, rect, line, polygon, polyline')];
}

function drawableToMarkup(generator, el, options) {
  if (isTinyFilledDot(el)) {
    const cx = el.getAttribute('cx') || '0';
    const cy = el.getAttribute('cy') || '0';
    const r = el.getAttribute('r') || '0';
    const fill = el.getAttribute('fill') || 'currentColor';
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" />`;
  }

  const name = el.tagName.toLowerCase();
  const fill = shouldFill(el) ? 'currentColor' : 'none';
  const shapeOptions = {
    ...options,
    fill,
    stroke: 'currentColor',
    fillStyle: fill === 'none' ? 'solid' : options.fillStyle,
  };

  let drawable;
  switch (name) {
    case 'path':
      drawable = generator.path(el.getAttribute('d') || '', shapeOptions);
      break;
    case 'circle':
      drawable = generator.circle(
        num(el.getAttribute('cx')),
        num(el.getAttribute('cy')),
        num(el.getAttribute('r')) * 2,
        shapeOptions,
      );
      break;
    case 'ellipse':
      drawable = generator.ellipse(
        num(el.getAttribute('cx')),
        num(el.getAttribute('cy')),
        num(el.getAttribute('rx')) * 2,
        num(el.getAttribute('ry')) * 2,
        shapeOptions,
      );
      break;
    case 'rect': {
      const x = num(el.getAttribute('x'));
      const y = num(el.getAttribute('y'));
      const width = num(el.getAttribute('width'));
      const height = num(el.getAttribute('height'));
      const rx = num(el.getAttribute('rx'), num(el.getAttribute('ry')));
      const ry = num(el.getAttribute('ry'), rx);
      drawable =
        rx > 0 || ry > 0
          ? generator.path(roundedRectPath(x, y, width, height, rx, ry), shapeOptions)
          : generator.rectangle(x, y, width, height, shapeOptions);
      break;
    }
    case 'line':
      drawable = generator.line(
        num(el.getAttribute('x1')),
        num(el.getAttribute('y1')),
        num(el.getAttribute('x2')),
        num(el.getAttribute('y2')),
        { ...shapeOptions, fill: 'none' },
      );
      break;
    case 'polygon':
      drawable = generator.polygon(parsePoints(el.getAttribute('points') || ''), shapeOptions);
      break;
    case 'polyline':
      drawable = generator.linearPath(parsePoints(el.getAttribute('points') || ''), {
        ...shapeOptions,
        fill: 'none',
      });
      break;
    default:
      return '';
  }

  return generator
    .toPaths(drawable)
    .map((info) => {
      const d = (info.d || '').trim();
      if (!d || isDegeneratePath(d)) return '';
      if (info.fill && info.fill !== 'none' && (info.stroke === 'none' || info.strokeWidth === 0)) {
        return `<path d="${d}" fill="currentColor" stroke="none" />`;
      }
      return `<path d="${d}" />`;
    })
    .filter(Boolean)
    .join('');
}

function roughenSvg(svgText, name) {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const svg = doc.documentElement;
  const generator = rough.generator({
    options: {
      roughness: state.roughness,
      hachureGap: state.hachureGap,
      fillStyle: state.fillStyle,
      bowing: 0.8,
      strokeWidth: 1.25,
      fillWeight: 1,
      hachureAngle: -45,
      disableMultiStroke: true,
      disableMultiStrokeFill: true,
      fixedDecimalPlaceDigits: 2,
      maxRandomnessOffset: 1,
      seed: seedFromName(name),
      stroke: 'currentColor',
      fill: 'currentColor',
    },
  });

  const children = flattenElements(svg)
    .map((el) => drawableToMarkup(generator, el, generator.defaultOptions))
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">${children}</svg>`;
}

function formatNumber(value) {
  return Number.isInteger(value) ? String(value) : String(value);
}

function codeSnippet() {
  const component = toPascalCase(state.selected);
  const roughness = formatNumber(state.roughness);
  const gap = formatNumber(state.hachureGap);
  const fill = state.fillStyle;

  if (state.tab === 'provider') {
    return `import { LucideProvider, ${component} } from 'lucide-react';

<LucideProvider
  color="${state.color}"
  roughness={${roughness}}
  hachureGap={${gap}}
  fillStyle="${fill}"
>
  <${component} />
</LucideProvider>`;
  }

  if (state.tab === 'cli') {
    return `pnpm roughen -- --roughness ${roughness} --hachure-gap ${gap} --fill-style ${fill}`;
  }

  return `import { ${component} } from 'lucide-react';

<${component}
  color="${state.color}"
  roughness={${roughness}}
  hachureGap={${gap}}
  fillStyle="${fill}"
/>`;
}

function visibleIcons() {
  const query = state.search.trim().toLowerCase();
  const icons = query
    ? state.icons.filter((icon) => icon.name.includes(query))
    : state.icons;

  return icons.slice().sort((a, b) => {
    const aFeatured = FEATURED.indexOf(a.name);
    const bFeatured = FEATURED.indexOf(b.name);
    if (aFeatured !== -1 || bFeatured !== -1) {
      return (aFeatured === -1 ? 99 : aFeatured) - (bFeatured === -1 ? 99 : bFeatured);
    }
    return a.name.localeCompare(b.name);
  });
}

function renderCode() {
  document.getElementById('code').textContent = codeSnippet();
}

let paintToken = 0;

function renderGrid() {
  const token = ++paintToken;
  const grid = document.getElementById('grid');
  const icons = visibleIcons();
  document.getElementById('count').textContent = `${icons.length} iconițe`;
  grid.replaceChildren();

  let index = 0;
  const batch = 24;

  function paint() {
    if (token !== paintToken) {
      return;
    }

    const fragment = document.createDocumentFragment();
    const end = Math.min(index + batch, icons.length);

    for (; index < end; index += 1) {
      const icon = icons[index];
      const article = document.createElement('article');
      article.className = `card${icon.name === state.selected ? ' selected' : ''}`;
      article.dataset.name = icon.name;
      try {
        article.innerHTML = `${roughenSvg(icon.svg, icon.name)}<span class="label">${icon.name}</span>`;
      } catch {
        article.innerHTML = `${icon.svg}<span class="label">${icon.name}</span>`;
      }
      article.style.color = state.color;
      fragment.append(article);
    }

    if (token !== paintToken) {
      return;
    }

    grid.append(fragment);
    if (index < icons.length) {
      requestAnimationFrame(paint);
    }
  }

  paint();
}

function renderPlaceholders() {
  const grid = document.getElementById('placeholder-grid');
  const placeholders = state.placeholders;
  document.getElementById('placeholder-count').textContent = `${placeholders.length} placeholdere`;
  grid.replaceChildren();

  const fragment = document.createDocumentFragment();
  for (const item of placeholders) {
    const article = document.createElement('article');
    article.className = 'card';
    article.innerHTML = `${item.svg}<span class="label">${item.name}</span>`;
    fragment.append(article);
  }
  grid.append(fragment);
}

function setGallery(gallery) {
  state.gallery = gallery;
  document.querySelectorAll('[data-gallery]').forEach((button) => {
    button.classList.toggle('active', button.dataset.gallery === gallery);
  });
  document.getElementById('icons-panel').hidden = gallery !== 'icons';
  document.getElementById('placeholders-panel').hidden = gallery !== 'placeholders';
}

function bind() {
  const roughness = document.getElementById('roughness');
  const gap = document.getElementById('hachure-gap');
  const fill = document.getElementById('fill-style');
  const color = document.getElementById('color');
  const search = document.getElementById('search');
  let timer = 0;

  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      renderCode();
      renderGrid();
    }, 40);
  };

  roughness.addEventListener('input', () => {
    state.roughness = Number(roughness.value);
    document.getElementById('roughness-value').textContent = formatNumber(state.roughness);
    schedule();
  });
  gap.addEventListener('input', () => {
    state.hachureGap = Number(gap.value);
    document.getElementById('hachure-gap-value').textContent = formatNumber(state.hachureGap);
    schedule();
  });
  fill.addEventListener('change', () => {
    state.fillStyle = fill.value;
    schedule();
  });
  color.addEventListener('input', () => {
    state.color = color.value;
    renderCode();
    document.getElementById('grid').style.color = state.color;
  });
  search.addEventListener('input', () => {
    state.search = search.value;
    schedule();
  });

  document.getElementById('grid').addEventListener('click', (event) => {
    const card = event.target.closest('.card');
    if (!card) return;
    state.selected = card.dataset.name;
    document.querySelectorAll('.card.selected').forEach((el) => el.classList.remove('selected'));
    card.classList.add('selected');
    renderCode();
  });

  document.querySelectorAll('[data-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      state.tab = button.dataset.tab;
      document.querySelectorAll('[data-tab]').forEach((el) => el.classList.toggle('active', el === button));
      renderCode();
    });
  });

  document.querySelectorAll('[data-gallery]').forEach((button) => {
    button.addEventListener('click', () => {
      setGallery(button.dataset.gallery);
    });
  });

  document.getElementById('copy').addEventListener('click', async () => {
    await navigator.clipboard.writeText(codeSnippet());
    document.getElementById('copy').textContent = 'Copiat';
    setTimeout(() => {
      document.getElementById('copy').textContent = 'Copiază';
    }, 1200);
  });
}

const [icons, placeholders] = await Promise.all([
  fetch('./icons-data.json').then((response) => response.json()),
  fetch('./placeholder-data.json').then((response) => response.json()).catch(() => []),
]);
state.icons = icons;
state.placeholders = placeholders;
if (!icons.some((icon) => icon.name === state.selected) && icons[0]) {
  state.selected = icons[0].name;
}

bind();
renderCode();
renderGrid();
renderPlaceholders();
