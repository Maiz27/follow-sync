# Follow Sync brand

The mark is **Nodes**: two accounts, each sending a follow toward the other. It says reciprocity without borrowing a
letter from the name. Everything in the app's visual language extends from it: a square node, a straight shaft, a
pointed head, zero radius, one accent.

## Files

| File                                         | Use                                                                                                                                                        |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fs-nodes-symbol.svg`                        | Symbol master (256 grid, ink). Source of `src/components/brand/mark.tsx`.                                                                                  |
| `fs-nodes-symbol-small.svg`                  | Small-size cut for 16 to 24 px. Source of the app-icon tiles.                                                                                              |
| `fs-nodes-symbol-color.svg` / `-on-dark.svg` | Ink + accent on light; white + accent on dark.                                                                                                             |
| `fs-nodes-horizontal*.svg`                   | Primary lockup (ink, colour, on-dark). Used in the README header and the OG image.                                                                         |
| `fs-nodes-stacked*.svg`                      | Stacked lockup for square spaces.                                                                                                                          |
| `fs-nodes-wordmark.svg`                      | "Follow Sync" outlined from Space Grotesk Bold. Never retype it.                                                                                           |
| `fs-nodes-tile.svg`                          | Square ink tile with the small cut: source of `icon-96.png`, `apple-icon.png` and the manifest icons in `public/imgs/logo`.                                |
| `fs-nodes-favicon-tile.svg`                  | 16-grid favicon drawing on an ink tile: source of `favicon.ico`. The browser-tab SVG (`public/imgs/logo/icon.svg`) uses the same drawing without the tile. |

Regenerate the rasters from `fs-nodes-tile.svg` at 16/32/48 (ICO), 96, 180, 192 and 512 px.

## Colour

| Name       | HEX                             | Token                        | Use                                           |
| ---------- | ------------------------------- | ---------------------------- | --------------------------------------------- |
| Ink        | `#111111`                       | `--foreground` / `--primary` | the mark and wordmark on light; app-icon tile |
| Paper      | `#FFFFFF`                       | `--background`               | the mark and wordmark on dark                 |
| Sync Green | `#16A34A` light, `#22C55E` dark | `--brand`                    | the accent only                               |

The accent marks the reciprocal or positive signal and nothing else: the logo's returning arrow, bulk-action
progress, success toasts, plus deltas in the changes summary. Buttons, tabs and focus rings stay monochrome.
Never set text in green on white, and never put the mark on green.

## Type

Space Grotesk (SIL OFL 1.1). Wordmark: Bold 700, tracking −1 %. UI: 400/500 for text, 600/700 for emphasis.

## Clear space and minimum size

Clear space on every side equals one node (22 % of the symbol height). Minimum sizes: horizontal lockup 120 px,
stacked 96 px, symbol 24 px, small cut 16 px.

## Brand glyphs

`src/components/brand/glyphs.tsx` draws the dashboard's concepts in the mark's grammar on a 24 grid: Followers,
Following, One-Way Out, One-Way In, Mutual and Ghost (a hollow node). The left node is you, the right node is them.
Use them for product concepts; keep Lucide for generic UI actions.

## Don'ts

Don't stretch, rotate, outline, add gradients or shadows, swap the arrows, change the lockup ratios, or recreate the
wordmark by typing it. Trademark clearance has not been checked.
