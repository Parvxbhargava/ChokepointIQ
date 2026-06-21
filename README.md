# ChokepointIQ

AI-powered parking-induced congestion intelligence for Bengaluru Traffic Police.

ChokepointIQ converts geotagged parking violation records into congestion-aware enforcement decisions. It identifies repeated illegal parking hotspots, scores their likely traffic impact, recommends police/tow actions, simulates limited enforcement resources, and suggests where future curbside occupancy sensors should be deployed.

## Problem Statement

On-street illegal parking and spillover parking near commercial areas, metro stations, events, and junctions can reduce usable carriageway width and choke intersections.

Current enforcement is mostly patrol-based and reactive. Raw parking violation counts do not show which hotspots are most likely to disrupt traffic, which vehicles need towing, where officers should be sent first, or where real-time sensors would be most useful.

ChokepointIQ answers:

> Which parking hotspots are most likely to disrupt traffic, which vehicles and violations should be prioritized, what enforcement action should be taken, and where should real-time sensors be deployed?

## Key Features

- City control-room dashboard for Bengaluru parking congestion intelligence
- CSV upload support for parking violation datasets
- Leaflet/OpenStreetMap hotspot visualization
- Chokepoint Impact Score from 0-100
- All-time hotspot discovery and shift-specific time forecasting
- Explainable hotspot score breakdown
- Priority vehicle and violation analytics
- Recommended police actions with P1-P4 priority
- Tow vs officer-clearing reasoning based on vehicle size
- Resource-constrained what-if simulator
- Critical scenario reroute traces
- Future curbside sensor deployment recommendations
- Local backend time engine for full-dataset shift analysis

## Tech Stack

- React + Vite
- Tailwind CSS
- Leaflet + OpenStreetMap
- Recharts
- PapaParse
- Node.js local backend API

## Dataset

The original hackathon dataset is a large CSV file and is not committed to GitHub because it is larger than GitHub's normal file limit.

Download the dataset from the hackathon/problem statement link and place it here:

```txt
dataset/jan to may police violation_anonymized791b166.csv
```

The app also includes a small built-in sample dataset, so the frontend can run even without the full CSV. The local backend needs the full CSV at the path above unless `CHOKEPOINT_CSV_PATH` is set.

## How It Works

### 1. Data Preparation

Each raw CSV row is normalized into an enforcement signal:

- latitude and longitude
- local IST hour from `created_datetime`
- weekday/weekend and shift
- vehicle type
- violation type
- police station
- junction name
- severity, obstruction, and junction sensitivity

### 2. Hotspot Clustering

Nearby violations are grouped into micro-hotspots using rounded latitude/longitude. This converts raw points into actionable enforcement zones.

### 3. Chokepoint Impact Score

Each hotspot receives a 0-100 score using:

- frequency
- violation severity
- vehicle obstruction
- peak-hour timing
- recurrence
- junction conflict
- police station load
- validation confidence

Risk bands:

```txt
80+  Critical
65+  High
48+  Watch
<48  Emerging
```

### 4. Time Lens

The dashboard supports two time modes:

- **All-Time View:** Finds chronic recurring hotspots for long-term planning and sensor placement.
- **Shift Forecast:** Uses `created_datetime` to focus on selected hour, shift, and weekday/weekend context.

Shift groups:

```txt
Morning peak: 7-11
Midday: 12-15
Evening peak: 16-20
Night: 21-6
```

### 5. Recommended Actions

For every high-risk hotspot, the system estimates:

- priority level
- action type
- police units required
- tow vehicles required
- target response time
- estimated clearing time
- expected local risk reduction
- reroute requirement

Action examples:

- Critical reroute + tow
- Rapid officer clearing
- Immediate towing
- Tow standby
- Officer verification
- Repeat patrol
- Targeted enforcement

## Running Locally

Install dependencies:

```powershell
pnpm install
```

Run frontend only:

```powershell
pnpm dev
```

Run backend only:

```powershell
pnpm backend
```

Run frontend and backend together:

```powershell
pnpm dev:full
```

Open:

```txt
http://127.0.0.1:5173
```

Backend health check:

```txt
http://127.0.0.1:8787/api/health
```

If the CSV is stored somewhere else:

```powershell
$env:CHOKEPOINT_CSV_PATH="D:\path\to\dataset.csv"
pnpm backend
```

## Build

```powershell
pnpm build
```

Preview production build:

```powershell
pnpm preview
```

## Prototype Scope

This is a hackathon-quality decision-support prototype. It focuses on storytelling, explainability, and operational intelligence rather than production infrastructure.

The current metrics are decision-support estimates based on dataset-derived logic. With a production-grade backend, ChokepointIQ can become significantly more powerful through:

- live curbside sensor alerts
- real dispatch outcome tracking
- real-time tow and officer availability
- stronger geospatial clustering
- routing engine integration
- live congestion-feed validation
- feedback learning from cleared/uncleared enforcement actions
- station-wise operational dashboards

The prototype proves the intelligence layer. A production backend turns it into a live traffic command system.

## Final Pitch

ChokepointIQ transforms parking violation data into congestion-aware traffic intelligence. It does not only show where violations happened. It explains which hotspots are most likely to disrupt traffic, why they matter, what action should be taken, how limited resources should be allocated, and where future sensors should be deployed.

**ChokepointIQ: From parking violations to traffic-flow protection.**
