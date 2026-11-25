# Zoro iOS UI rules

Use Konsta iOS components through `src/ui/kit.tsx`. Black page background, mint
`#48fa78`, system font, and sentence-case labels; retain the date as Today’s title.
Apple’s typography guidance: https://developer.apple.com/design/human-interface-guidelines/typography
These are Zoro’s concrete layout targets, not a claim that every Apple app uses
identical metrics. Physical iPhone comparison remains necessary.

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
