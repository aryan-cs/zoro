# Zoro iOS UI rules

The target is Apple's own Settings app on iOS 27 in dark mode. The numbers below were
measured from simulator screenshots of Settings (iPhone 17, 3x) on 2026-11-25, and our
screens were re-measured the same way in iOS Safari. When in doubt, measure again:
`xcrun simctl io <device> screenshot`, then compare pixel rows/columns.

## Measured from Settings (iOS 27, dark)

| Element | Value |
|---|---|
| Page background | `#000000` |
| Cell background | `#1C1C1E` |
| Card side margin / corner radius | 16pt / 26pt |
| Row height | 52pt minimum, 17pt text vertically centered |
| Row text inset | 16pt from the card edge (32pt from the screen) |
| Separator | 1pt `#38383B`, from the row text to 16pt short of the card's right edge; none after the last row |
| Trailing value | 17pt, `#98989F` (secondary label on a cell), ends 16pt from the card edge when there's no chevron |
| Chevron | 6.5x11.5pt, `#98989F`, 11pt after the value, 19pt from the card edge |
| Section header | 17pt semibold, `#8D8D93`, sentence case, at x=32pt; cap top 32pt below the card above, baseline 10pt above its card |
| Cards with no header between | 35pt apart in Settings-style lists; 12pt between Fitness-style summary cards (Fitness, iOS 27) |
| Footnote | 15pt, `#8D8D93`, at x=32pt, ~10pt below its card |
| Row icon tile | 28pt square, 8pt radius, 14pt in from the card edge, ~18pt white glyph; row text and its separator then start 56pt in |
| Navigation bar | 44pt row directly under the status bar; 17pt semibold centered title; 44pt round glass back button 16pt from the edge |
| First section under the nav bar | header 19pt below (card 20pt if untitled) |
| Buttons (Fitness setup's Continue) | Liquid Glass capsule, white 17pt semibold label: lg 52pt full width, md 44pt, sm 34pt / 15pt inside rows; red label for destructive, blue text only in headers |
| Activity ring (Fitness) | 110pt across, 22pt stroke, track = ring color at ~18%, round caps from 12 o'clock, black arrow at the start, second lap past the goal with a shadow at its tip |
| Ring values (Fitness) | label 15pt white, value below in the ring color, SF Rounded semibold (20pt; 28pt for a single ring) with a smaller uppercase unit ("41/170CAL") |
| Tab bar (Fitness, iOS 27) | Liquid Glass capsule 62pt tall, 21pt side margins, 20pt above the bottom edge; selected pill inset 4pt, same gray as the bar with a 0.5pt rim; SF Symbol (~18.8pt) centered 24pt from the top, 10pt semibold label 4pt below; selected = tint |
| Icons | Apple SF Symbols (medium; chevrons semibold) from `src/ui/sf.ts` via `<Sym name size>`; export more with `scripts/sf-symbols.swift` |
| Summary cards (Fitness) | `FitCard`: #1C1C1E, 26pt corners, 16pt padding, 12pt apart, 17pt semibold title, gray 22pt chevron circle when the card opens something; `FitStat`: 15pt label over a 28pt SF Rounded value in a Fitness color (`FITNESS` in kit.tsx), units in small caps |
| Bar icons | Regular weight, ~16.5pt (Fitness's toolbar icons: 1.67pt stroke); back chevron semibold 17.5pt; grouped buttons 48pt each in one capsule with 4pt ends |
| Segmented control | Sized like Health's (iOS 27): 30pt capsule, thumb inset 2.5pt, 13pt medium labels, same weight when selected; drawn as Liquid Glass (translucent track, glass-lens thumb with a bright rim) |
| Workout cards (Fitness's Outdoor Walk card) | `WorkoutCard`: card = workout color ~10% over black, 20pt padding; glyph in the color top-left, 44pt play button filled with the color top-right (green check when done); 22pt bold one-line title; 48pt tiles at ~14% with one short fact each. No two-line list rows with trailing buttons. |
| Tint / destructive / success | `#0A84FF` / `#FF453A` / `#30D158` |

## Components

- Tab bar: Konsta Tabbar + ToolbarPane, icons only. Its press highlight is off
  (`highlight={false}`); index.css keeps the glass lens as the resting selection with an
  even rim, and only magnifies it after a 0.45s hold.
- Top bar, nav buttons, search field and segmented control are our own (`src/ui/bars.tsx`,
  `bars.css`), because Konsta's versions flash or don't match.

## Notes from the first alignment pass (some values superseded by the table above)

- `Header`: Konsta Navbar, 44px content row, 17px semibold centered title. Top
  padding is `max(16px, safe-area-top)`, with no extra 10px. Keep native back/link
  controls. `.zoro-navbar-title` zeros `--tw-translate-x/y` and transforms: the
  production CSS minifier can drop plain `translate: none`, leaving a -50% shift.
- `Section`: inset strong List with Konsta’s default 16px outer margins and
  24px corner radius. Keep this iOS 26 radius throughout; don’t mix 10px groups
  with these groups. Background remains Konsta’s dark grouped surface.
- Section labels: 32px from the viewport edge (aligned to row text), 15px
  semibold / 22px line height; 24px above and 8px below. Trailing header controls
  sit in a 22px alignment slot so they don’t increase section spacing.
- `Row`: minimum 44px, 17px body text / 22px line height, 16px inner leading and
  trailing inset. Long titles wrap and increase row height. Keep trailing values
  and chevrons in separate columns. Secondary text is rgba(235,235,245,0.6).
  Two-line rows use 8px vertical padding and a 15px / 20px secondary subtitle;
  don’t impose a 44px minimum on just their title line.
- Action `Row`: use `accent` or `danger`, not a manually styled button. Konsta
  ListButton puts `className` on its outer li, while the actual child defaults to
  52px. `.zoro-list-action > .k-list-button` sizes the control itself: 44px
  minimum, 22px line height, 11px vertical padding. Its separator starts 16px in.
  Never clip a 52px child with a 44px li. Supply danger colors via Konsta props.
- `Field`: 44px minimum row, 17px trailing input, 12px label/input gap. Labels
  may wrap. `.zoro-field-input` aligns WebKit date/time internals; outer
  `text-align:right` alone is insufficient. Keep the native picker.
- `Cell`: custom list content, normally 10px vertical padding. It already has
  16px horizontal insets. Full-width statistic grids cancel those with `-mx-4`
  before adding 16px inside each column. Don’t double-inset nested lists.
- `MacroSummary`: use the same Cell padding on Today and Food. `Bar` retains
  Konsta Progressbar defaults; avoid bespoke bars for the same information.
- `Btn`: standard 44px / 17px; compact 36px / 15px for contextual actions;
  large buttons retain Konsta defaults. `Seg` retains Konsta defaults. Don’t
  change whole control geometry just to align a neighboring label.
- `GlassSheet`: use the shared 36×5px grabber and safe-area bottom padding.
  Inside a 16px-padded sheet, remove a nested ListItem’s additional side insets.
  `SheetPage` is for full-screen forms; `NumberPrompt` is for numeric alerts.
- Footnotes: 13px via `Note`, normally 32px viewport insets. Workout headings
  and notes also align at 32px. Set inputs keep a stable 36px multiplication/unit
  column so “×” and “+lb ×” don’t shift weight values between exercises.
- Today’s `.zoro-workout-preview` reserves trailing space and centers Start
  across title plus subtitle, not against just the title baseline.

Verify `npm run build`, `npm test`, and `npx tsc -b`. Inspect the production
preview at 393×852, with safe areas, including long titles, two-line rows,
settings, scrolled content, search and sheets. Wait for navigation/segmented
animations before screenshots. Inspect computed geometry as well as images;
fixed pixel comparisons alone cannot validate responsive wrapping. Close any
browser session you create. Never substitute test content into production data.

Protected in this audit: TabBar and `.k-toolbar-pane`, navigation/swipe/update
logic, `.k-dialog`, `.stack-*`, sync, and all core/data/voice behavior.
