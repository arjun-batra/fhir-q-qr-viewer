# FHIR Form Viewer

A lightweight web app that renders FHIR R4/R5 Questionnaire and QuestionnaireResponse resources into a human-readable, read-only form.

## Features

- **Questionnaire only** → Renders as a blank form with field types, options, and required markers
- **QuestionnaireResponse only** → Renders answered Q&A pairs
- **Both (matched)** → Full form with answers filled in, choice fields show all options with selections highlighted
- **Both (mismatched)** → Detects unassociated resources, renders them separately with a warning
- Supports paste or file upload for JSON input
- Auto-detects FHIR R4 vs R5

## Local Development

```bash
npm install
npm run dev
```

Opens at `http://localhost:5173/fhir-viewer/`

## Deploy to GitHub Pages

### One-time setup

1. Create a GitHub repo (e.g. `fhir-viewer`)
2. Update `base` in `vite.config.js` if your repo name differs:
   ```js
   base: '/your-repo-name/',
   ```
3. Push your code:
   ```bash
   git init
   git add .
   git commit -m "initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/fhir-viewer.git
   git push -u origin main
   ```

### Deploy

```bash
npm run deploy
```

This builds the project and pushes the `dist` folder to the `gh-pages` branch.

Your app will be live at: `https://YOUR_USERNAME.github.io/fhir-viewer/`

### Enable GitHub Pages (first time only)

1. Go to your repo → **Settings** → **Pages**
2. Under **Source**, select **Deploy from a branch**
3. Select branch: `gh-pages`, folder: `/ (root)`
4. Click **Save**

## Supported FHIR Item Types

string, text, integer, decimal, boolean, date, dateTime, time, choice, open-choice, quantity, display, group (with nesting)
