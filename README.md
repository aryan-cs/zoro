# Zoro

A free, private training, food, and sleep tracker that installs on an iPhone as a Home Screen web app. No App Store, no account, no server: everything is stored on the phone.

**Live app:** https://aryan-cs.github.io/zoro/

## Install on iPhone

1. Open the link above in Safari.
2. Tap Share, then **Add to Home Screen**.
3. Open Zoro from the Home Screen icon (not from Safari, which keeps separate data).

## What it does

- **Today:** the date, then today's workout, food and body check-ins. Finished blocks move to the bottom. Settings is the gear in the corner.
- **Water:** log cups and bottles toward a daily goal in ounces.
- **Food:** scan barcodes (USDA label data first, then Open Food Facts), search, quick add, make custom foods, and track calories and macros against your targets.
- **Lift:** today's lifts with exact weights, sets and reps. Bench follows a 12-step table toward a new max; everything else uses double progression (add weight once every set hits the top of the rep range). Weeks 6 and 12 of each block are easy weeks. Logs sets, runs a rest timer, keeps the screen awake, and shows plates per side.
- **History:** lifts, weight trend with a calorie-burn estimate, measurements, food and water by day, and sleep.
- **Sleep:** enter bed and wake times, or paste last night's sleep from Apple Health using the Shortcut described in the app (Today → Sleep).
- **Backups:** Settings → Cloud backup saves everything to a private GitHub repo a few seconds after each change, using a fine-grained token that can only touch that repo. You can also export a JSON file.

## Develop

```bash
npm install
npm run dev      # http://localhost:5173/zoro/
npm test         # core logic tests
npm run build
```

Pushing to `master` deploys to GitHub Pages through `.github/workflows/deploy.yml`.

Food data: [Open Food Facts](https://world.openfoodfacts.org) (ODbL) and [USDA FoodData Central](https://fdc.nal.usda.gov) (CC0).
