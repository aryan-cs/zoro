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
| Cards with no header between | 35pt apart |
| Footnote | 15pt, `#8D8D93`, at x=32pt, ~10pt below its card |
| Navigation bar | 44pt row directly under the status bar; 17pt semibold centered title; 44pt round glass back button 16pt from the edge |
| First section under the nav bar | header 19pt below (card 20pt if untitled) |
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
