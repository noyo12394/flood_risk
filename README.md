# FloodRisk FYRE — Lehigh Resilience Challenge

A small **3D classroom game** that teaches the catastrophe-model intuition:

> **hazard × exposure × vulnerability = risk**

Students drop into a stylised riverside Lehigh-like campus at night, pick a flood
scenario, and choose mitigations **before** the water rises. The 3D floodwater
animates up, buildings shift green → red as they take damage, and a CAT-model
dashboard shows loss, downtime, people affected and budget in real time. A
before/after reflection makes the key point: *the same flood can cost far less
when you change exposure and vulnerability — not the hazard.*

![screenshot](docs/screenshot.png)

## Features

- **Realistic procedural buildings** — brick / glass / concrete facades with lit
  windows, rooftop clutter and parapets, generated on a canvas (no downloaded
  assets). Windows go dark when a building loses power.
- **Four roles** — Emergency Manager, Infrastructure Engineer, Budget Officer and
  Risk/Insurance Analyst. Each sees the same disaster with a tailored dashboard.
- **Five mitigations** — deployable flood barriers, storm drainage, building
  elevation, substation raising and road elevation. Each changes hazard,
  vulnerability or a specific lifeline.
- **Four flood scenarios** — 10-, 50-, 100- and 500-year events.
- **Live CAT dashboard** — hazard depth, exposed assets, portfolio vulnerability,
  total loss, downtime, people affected, expected annual loss and premiums.
- **Rising 3D floodwater**, blocked evacuation routes, and a substation that
  trips offline when inundated.
- **Before/after reflection** with loss avoided and return-on-mitigation.

## Tech

- React + TypeScript + Vite
- three.js via `@react-three/fiber` and `@react-three/drei`
- All game logic is local (see `src/game/`), no backend or login required.

The numbers are **made-up-but-reasonable teaching values**, not a research-grade
model. `src/game/data.ts` (assets, costs, fragility) and `src/game/model.ts`
(the CAT formulas) are the two files to edit to swap in real Lehigh / INCORE data
later.

## Run locally

```bash
npm install
npm run dev      # http://127.0.0.1:5173
npm run build    # production build to dist/
npm run preview  # serve the production build
```

## Deploy

The repo is Vercel-ready (`vercel.json`, Vite framework preset). Import the repo
at [vercel.com/new](https://vercel.com/new) and deploy — no configuration needed.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/noyo12394/flood_risk)

## Controls

Drag to orbit · scroll to zoom · click any asset to scan it.
