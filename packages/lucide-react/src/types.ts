import type { SVGProps, ForwardRefExoticComponent, RefAttributes } from 'react';
import type {
  LucideIconData as SharedLucideIconData,
  LucideIconNode as SharedLucideIconNode,
} from '@lucide/shared/types';

export type SVGAttributes = Partial<SVGProps<SVGSVGElement>>;

export type LucideIconNode = SharedLucideIconNode<string, SVGAttributes>;

export type LucideIconData = SharedLucideIconData<string, SVGAttributes>;

/**
 * @deprecated Use LucideIconNode instead.
 */
export type IconNode = LucideIconNode[];

type ElementAttributes = RefAttributes<SVGSVGElement> & SVGAttributes;

export type RoughFillStyle =
  | 'hachure'
  | 'solid'
  | 'zigzag'
  | 'cross-hatch'
  | 'dots'
  | 'dashed'
  | 'zigzag-line';

export interface LucideProps extends ElementAttributes {
  size?: string | number;
  /**
   * @deprecated Use `nonScalingStroke` instead.
   */
  absoluteStrokeWidth?: boolean;
  nonScalingStroke?: boolean;
  /**
   * How wobbly the hand-drawn outline is.
   * @default 0.5
   */
  roughness?: number;
  /**
   * Gap between hatch lines. Smaller is denser.
   * @default 5
   */
  hachureGap?: number;
  /**
   * Fill pattern used for closed shapes.
   * @default 'hachure'
   */
  fillStyle?: RoughFillStyle;
}

export type LucideIcon = ForwardRefExoticComponent<
  Omit<LucideProps, 'ref'> & RefAttributes<SVGSVGElement>
>;
