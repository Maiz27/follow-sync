import type { IconBaseProps } from 'react-icons';

/**
 * Brand glyphs: the dashboard's concepts drawn in the logo's own grammar
 * (a square node, a 2-unit shaft, a 6-unit head) on a 24 grid. The left node
 * is you, the right node is them. Same props as a react-icons icon, so they
 * drop into every `IconType` slot.
 */
const Glyph = ({
  children,
  size = '1em',
  color,
  title,
  className,
  style,
  ...rest
}: IconBaseProps & { children: React.ReactNode }) => (
  <svg
    viewBox='0 0 24 24'
    width={size}
    height={size}
    fill='currentColor'
    className={className}
    style={{ color, ...style }}
    aria-hidden={title ? undefined : true}
    role={title ? 'img' : undefined}
    focusable='false'
    {...rest}
  >
    {title && <title>{title}</title>}
    {children}
  </svg>
);

/** You → them, and them → you: a mutual follow. The logo at icon size. */
export const MutualGlyph = (props: IconBaseProps) => (
  <Glyph {...props}>
    <path d='M2 3h6v2h8V3l6 3-6 3V7H8v2H2z' />
    <path d='M22 21h-6v-2H8v2l-6-3 6-3v2h8v-2h6z' />
  </Glyph>
);

/** A follow arriving at you. */
export const FollowersGlyph = (props: IconBaseProps) => (
  <Glyph {...props}>
    <path d='M2 9h6v6H2zM14 9v2h8v2h-8v2l-6-3z' />
  </Glyph>
);

/** A follow leaving you. */
export const FollowingGlyph = (props: IconBaseProps) => (
  <Glyph {...props}>
    <path d='M2 9h6v2h8V9l6 3-6 3v-2H8v2H2z' />
  </Glyph>
);

/** You follow; nothing comes back. */
export const OneWayOutGlyph = (props: IconBaseProps) => (
  <Glyph {...props}>
    <path d='M2 3h6v2h8V3l6 3-6 3V7H8v2H2z' />
    <path d='M16 15h6v6h-6z' />
  </Glyph>
);

/** They follow; you have not followed back. */
export const OneWayInGlyph = (props: IconBaseProps) => (
  <Glyph {...props}>
    <path d='M2 3h6v6H2z' />
    <path d='M22 21h-6v-2H8v2l-6-3 6-3v2h8v-2h6z' />
  </Glyph>
);

/** You follow an account that is no longer there: a hollow node. */
export const GhostGlyph = (props: IconBaseProps) => (
  <Glyph {...props}>
    <path d='M2 3h6v2h8V3l6 3-6 3V7H8v2H2z' />
    <path fillRule='evenodd' d='M16 15h6v6h-6zm1.5 1.5v3h3v-3z' />
  </Glyph>
);
