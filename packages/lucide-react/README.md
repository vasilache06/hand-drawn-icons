# @vmaria/hand-drawn-icons

Hand-drawn Lucide icons for React, with roughness, hatch, and fill controls.

## Install

```sh
npm install @vmaria/hand-drawn-icons
```

```sh
pnpm add @vmaria/hand-drawn-icons
```

```sh
yarn add @vmaria/hand-drawn-icons
```

## Usage

```jsx
import { Bell } from '@vmaria/hand-drawn-icons';

export function Example() {
  return (
    <Bell
      color="#8d7a6b"
      roughness={0.5}
      hachureGap={5}
      fillStyle="hachure"
    />
  );
}
```

Share defaults with `LucideProvider`:

```jsx
import { LucideProvider, Bell, Cog } from '@vmaria/hand-drawn-icons';

<LucideProvider
  color="#8d7a6b"
  roughness={0.5}
  hachureGap={5}
  fillStyle="hachure"
>
  <Bell />
  <Cog />
</LucideProvider>
```

`fillStyle` can be `hachure`, `solid`, `zigzag`, `cross-hatch`, `dots`, `dashed`, or `zigzag-line`.

## Local playground

From the repo root:

```sh
pnpm install
pnpm roughen:play
```

Then open [http://localhost:4578/](http://localhost:4578/). Click an icon to copy React code.

## License

ISC. Icon geometry is based on [Lucide](https://lucide.dev).
