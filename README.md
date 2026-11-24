# Health Dashboard

Personal health tracking dashboard with longitudinal blood work visualization, diet planning, and fitness tracking.

## Features

- **Longitudinal Tracking** - 29 biomarkers tracked across 8+ reports (Apr 2022 - Jun 2026)
- **Trend-Adjusted Health Score** - Composite score (0-100) factoring current values, trends, and persistence
- **Interactive Charts** - Click any card to flip and see what the marker means for you
- **Diet & Workout Plan** - Personalized vegetarian meal plan and exercise schedule targeting specific markers
- **Client-Side PDF Parsing** - Upload new lab reports directly in the browser; no data leaves your device
- **Light/Dark Mode** - Toggle with persistence
- **Mobile Responsive** - Fully usable on phones

## Privacy

- All data stored in browser localStorage only
- PDFs parsed locally via PDF.js - never uploaded anywhere
- GitHub hosts only the static code, not health data
- `baseline.json` contains pre-parsed numbers (no PII beyond name)

## Tech Stack

- Vanilla HTML/CSS/JS (no build step)
- [Chart.js](https://www.chartjs.org/) + annotation plugin for visualization
- [PDF.js](https://mozilla.github.io/pdf.js/) for client-side PDF extraction
- GitHub Pages for hosting

## Usage

1. Visit the hosted page
2. View dashboard with pre-loaded historical data
3. Upload new PDF reports via the Upload tab (coming soon)
4. Track meals and workouts via the Track tab (coming soon)

## Local Development

Just open `index.html` in a browser. No server needed.

## Scoring Methodology

Weighted composite based on:
- Framingham Risk Score components (lipid/diabetes weighting)
- ATA hypothyroidism guidelines (elevated thyroid weight for subclinical hypo)
- LAI-2020 Indian cardiovascular risk data

Score = Current value (60%) + Trend direction (25%) + Persistence penalty (15%)

Max score is 100 (all markers in optimal range - achievable with medication/diet/exercise).
