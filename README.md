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

## Supported FHIR Item Types

string, text, integer, decimal, boolean, date, dateTime, time, choice, open-choice, quantity, display, group (with nesting)
