# Mock fixtures

Static JSON snapshots returned by `src/api/mock.js` when `VITE_MOCK=1` is set
(used for the Vercel design-prototype deploy where no backend is running).

## File naming

The mock dispatcher matches a fixture **by name**, declared in the `routes`
table inside `src/api/mock.js`. Filename = `<route-name>.json`.

## Populating these from a real backend

The shipped files are bare-minimum stubs. To capture realistic data:

```bash
# 1. Run the backend + ingest the sample ERC delivery so DB has content
./start.sh   # or start.bat on Windows

# 2. From frontend/, run the capture script (needs Node 18+)
cd frontend
node ../scripts/capture-fixtures.mjs --base http://localhost:8000 --carrier ACME
```

The script overwrites the JSON files in this directory. Diff before committing
to avoid checking in identifiers or PII you don't intend to share publicly.

## Adding coverage for a new endpoint

1. Add a row to the `routes` table in `src/api/mock.js`.
2. Either point it at a fixture name and drop the file here, or use an inline
   handler function for synthetic responses (echoing POST bodies, etc.).
