# ISO GL ERC 2.0 - design prototype

Clickable prototype of a General Liability rating workspace built on ISO ERC 2.0
deliveries. This deployment runs **frontend-only** against in-memory fixtures.
No backend, no database, no real rating engine. It exists so the design and
engineering team can react to flows and information architecture before the
real product is built.

**Live demo:** https://danielroman-federato.github.io/iso-gl-erc-demo-/

## What you are looking at

| Screen | Purpose |
|---|---|
| **0** Carriers | Carrier implementation workspace switcher |
| **1** Ops Dashboard | ERC delivery ingest + content freshness |
| **2** Deviation Manager | LCM / tier / schedule deviation lifecycle |
| **3** Quote Entry | Risk + class data entry |
| **4** Rating Workbench | Live rating with diff banner + premium breakout |
| **5** Policy Workspace | Bound policy + audit package |
| **6** Data Browser | Raw ERC tables (loss costs, factors, ILTA, territory) |
| **7** Circular Adoption | Circular intake + ERC adoption gating |
| **8** Actuarial DAG | Editable rating algorithm with carrier overlay |

## Caveats

- All data is mock; numbers are illustrative, not actuarially meaningful.
- Edits do not persist between sessions (no backend).
- Some screens render empty until fixtures are expanded.
- Production scope and rationale live in the private working-prototype repo.

## Running locally

```
npm install
npm run dev
```

This serves the prototype on http://localhost:5174 with mock data.

To build for static hosting:

```
VITE_MOCK=1 npm run build
```
