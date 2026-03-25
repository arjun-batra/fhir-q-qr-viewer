# FHIR Form Viewer

A lightweight web app that renders FHIR R4/R5 Questionnaire and QuestionnaireResponse resources into a human-readable, read-only form.

## Features

- **Questionnaire only** — Renders as a blank form with field types, options, and required markers
- **QuestionnaireResponse only** — Renders answered Q&A pairs
- **Both (matched)** — Full form with answers filled in, choice fields show all options with selections highlighted
- **Both (mismatched)** — Detects unassociated resources, renders them separately with a warning
- Supports paste or file upload for JSON input
- Auto-detects FHIR R4 vs R5

## Supported FHIR Item Types

string, text, integer, decimal, boolean, date, dateTime, time, choice, open-choice, quantity, display, group (with nesting)

## Local Development

```bash
npm install
npm run dev
```

Opens at `http://localhost:5173/fhir-viewer/`

## Deploy to GitHub Pages

### Step 1: Create repo and push

```bash
git init
git add .
git commit -m "initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/fhir-viewer.git
git push -u origin main
```

> If your repo name is NOT `fhir-viewer`, update `base` in `vite.config.js` to match.

### Step 2: Enable GitHub Pages (one-time)

1. Go to your repo on GitHub
2. **Settings** → **Pages**
3. Under **Source**, select **GitHub Actions**
4. That's it — no branch selection needed

### Step 3: Deploy

Deployments happen automatically on every push to `main` via the included GitHub Actions workflow (`.github/workflows/deploy.yml`).

Your app will be live at: `https://YOUR_USERNAME.github.io/fhir-viewer/`
