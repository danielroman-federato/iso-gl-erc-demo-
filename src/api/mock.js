// Mock API dispatcher used when VITE_MOCK=1 (Vercel design-prototype deploy).
//
// How it works:
//   1. All JSON files under ./fixtures/ are statically imported (Vite glob).
//   2. The `routes` table maps [METHOD, urlPattern] → fixture name or handler.
//   3. Unmapped routes return a typed empty fallback ([] for list paths, {} otherwise)
//      and log a console.warn so missing fixtures are obvious in DevTools.
//
// To add coverage:
//   - Capture real backend responses: `node scripts/capture-fixtures.mjs` (see DEPLOY_VERCEL.md).
//   - Or hand-author a fixture: drop `<name>.json` into ./fixtures/ and add a row to `routes`.

const FIXTURES = import.meta.glob("./fixtures/*.json", { eager: true });

function fixture(name) {
  const key = `./fixtures/${name}.json`;
  const mod = FIXTURES[key];
  if (!mod) return null;
  return JSON.parse(JSON.stringify(mod.default ?? mod));
}

// Route table — [METHOD, RegExp | string, fixtureName | handler]
// Handler signature: ({ path, method, match, opts }) => any
const routes = [
  // ── carriers ─────────────────────────────────────────────────────────────
  ["GET",   /^\/api\/carriers$/,                                   "carriers"],
  ["GET",   /^\/api\/carriers\/([^/]+)$/,                          ({ match }) => {
    const all = fixture("carriers") || [];
    const carrier = all.find((c) => c.carrier_id === decodeURIComponent(match[1])) || all[0] || {};
    // Screen 0 destructures { carrier, implementation, cw_groups, doi, summary }
    // — wrap the flat carrier row in the expected nested shape.
    return {
      carrier: { carrier_id: carrier.carrier_id, carrier_name: carrier.carrier_name },
      implementation: {
        impl_id: carrier.impl_id || `IMPL-${carrier.carrier_id}-GL`,
        lob: carrier.lob || "GL",
        status: carrier.impl_status || "ACTIVE",
        onboarding_status: carrier.onboarding_status || "retrofit",
        naic_code: carrier.naic_code || null,
        primary_state: carrier.primary_state || null,
        activated_at: carrier.activated_at || null,
      },
      cw_groups: [],
      doi: [],
      summary: {
        cw_count: carrier.cw_count ?? 0,
        state_count: carrier.state_count ?? 0,
        active_states: 0,
        intent_states: 0,
        doi_missing: 0,
      },
    };
  }],
  ["GET",   /^\/api\/carriers\/_wizard\/cw-bases/,                 "cw_bases"],
  ["GET",   /^\/api\/carriers\/_wizard\/states-for-cw/,            "states_for_cw"],
  ["GET",   /^\/api\/carriers\/([^/]+)\/events/,                   "carrier_events"],
  ["POST",  /^\/api\/carriers\/activate$/,                         ({ opts }) => ({ ok: true, carrier_id: tryBody(opts)?.carrier_id || "NEW_CARRIER" })],

  // ── phase A: ingest / deliveries / editions ──────────────────────────────
  ["GET",   /^\/api\/phase-a\/sample-folders$/,                    "phase_a_sample_folders"],
  ["GET",   /^\/api\/phase-a\/deliveries$/,                        "phase_a_deliveries"],
  ["GET",   /^\/api\/phase-a\/editions$/,                          "phase_a_editions"],
  ["GET",   /^\/api\/phase-a\/load-log\//,                         "phase_a_load_log"],
  ["GET",   /^\/api\/phase-a\/stc\//,                              "phase_a_stc"],
  ["GET",   /^\/api\/phase-a\/content-freshness$/,                 "phase_a_content_freshness"],
  ["GET",   /^\/api\/phase-a\/cw-dependency$/,                     "phase_a_cw_dependency"],
  ["POST",  /^\/api\/phase-a\/(run-pipeline|scan-ingest-root|mass-ingest)/, () => ({ ok: true, mock: true, message: "Ingest is disabled in design-prototype mode" })],

  // ── phase B: deviations / LCM / matrices ─────────────────────────────────
  ["GET",   /^\/api\/phase-b\/deviations$/,                        "phase_b_deviations"],
  ["GET",   /^\/api\/phase-b\/deviations\/([^/]+)$/,               ({ match }) => {
    const all = fixture("phase_b_deviations") || [];
    return all.find((d) => String(d.id) === match[1]) || all[0] || {};
  }],
  ["GET",   /^\/api\/phase-b\/coverage-matrix/,                    "phase_b_coverage_matrix"],
  ["GET",   /^\/api\/phase-b\/audit-log/,                          "phase_b_audit_log"],
  ["GET",   /^\/api\/phase-b\/carriers$/,                          "carriers"],
  ["GET",   /^\/api\/phase-b\/cw-editions$/,                       "phase_b_cw_editions"],
  ["GET",   /^\/api\/phase-b\/lcm-matrix/,                         "phase_b_lcm_matrix"],
  ["GET",   /^\/api\/phase-b\/deviation-matrix/,                   "phase_b_deviation_matrix"],
  ["POST",  /^\/api\/phase-b\/deviations\/.+\/(activate|approve|close|toggle-enabled)$/, () => ({ ok: true, mock: true })],
  ["POST",  /^\/api\/phase-b\/deviations\/cw-toggle-enabled$/,     () => ({ ok: true, mock: true })],
  ["POST",  /^\/api\/phase-b\/(lcm|deviation)-matrix\/batch-save$/, () => ({ ok: true, saved: 0, mock: true })],

  // ── phase C: quote / rate / bind / policy ────────────────────────────────
  ["POST",  /^\/api\/phase-c\/quotes$/,                            ({ opts }) => ({ ...(fixture("phase_c_quote_seed") || {}), ...(tryBody(opts) || {}), quote_id: "MOCK-Q-001" })],
  ["GET",   /^\/api\/phase-c\/quotes$/,                            "phase_c_quotes"],
  ["GET",   /^\/api\/phase-c\/quotes\/([^/]+)$/,                   "phase_c_quote_detail"],
  ["PATCH", /^\/api\/phase-c\/quotes\/([^/]+)$/,                   "phase_c_quote_detail"],
  ["POST",  /^\/api\/phase-c\/quotes\/([^/]+)\/eligibility$/,      "phase_c_eligibility"],
  ["POST",  /^\/api\/phase-c\/quotes\/([^/]+)\/rate$/,             "phase_c_rate_result"],
  ["POST",  /^\/api\/phase-c\/quotes\/([^/]+)\/select-forms$/,     () => ({ ok: true, mock: true })],
  ["GET",   /^\/api\/phase-c\/quotes\/([^/]+)\/form-fields/,       "phase_c_form_fields"],
  ["POST",  /^\/api\/phase-c\/quotes\/([^/]+)\/form-fields$/,      () => ({ ok: true, mock: true })],
  ["POST",  /^\/api\/phase-c\/quotes\/([^/]+)\/bind$/,             ({ match }) => ({ ok: true, policy_id: `MOCK-POL-${match[1]}`, mock: true })],
  ["GET",   /^\/api\/phase-c\/class-codes/,                        "phase_c_class_codes"],
  ["GET",   /^\/api\/phase-c\/domain-table/,                       "phase_c_domain_table"],
  ["GET",   /^\/api\/phase-c\/policies$/,                          "phase_c_policies"],
  ["GET",   /^\/api\/phase-c\/policies\/([^/]+)$/,                 "phase_c_policy_detail"],
  ["GET",   /^\/api\/phase-c\/territory-lookup/,                   "phase_c_territory"],
  ["GET",   /^\/api\/phase-c\/schedule-rating-spec/,               "phase_c_schedule_rating_spec"],
  ["GET",   /^\/api\/phase-c\/algorithm-dag/,                      "phase_c_algorithm_dag"],
  ["GET",   /^\/api\/phase-c\/carrier-algorithm-model/,            "phase_c_carrier_algorithm_model"],
  ["POST",  /^\/api\/phase-c\/carrier-algorithm-model$/,           () => ({ ok: true, mock: true })],

  // ── phase D: circulars / ERC adoptions ───────────────────────────────────
  ["GET",   /^\/api\/phase-d\/metrics$/,                           "phase_d_metrics"],
  ["GET",   /^\/api\/phase-d\/circulars$/,                         "phase_d_circulars"],
  ["GET",   /^\/api\/phase-d\/circulars\/([^/]+)$/,                "phase_d_circular_detail"],
  ["POST",  /^\/api\/phase-d\/circulars$/,                         ({ opts }) => ({ ...(tryBody(opts) || {}), id: "MOCK-CIRC-001", mock: true })],
  ["PATCH", /^\/api\/phase-d\/circulars\/.+\/decision$/,           () => ({ ok: true, mock: true })],
  ["POST",  /^\/api\/phase-d\/circulars\/.+\/approvals$/,          () => ({ ok: true, mock: true })],
  ["POST",  /^\/api\/phase-d\/circulars\/.+\/(pdf|parse-fill)$/,   () => ({ ok: true, mock: true })],
  ["POST",  /^\/api\/phase-d\/circulars\/(parse|intake)$/,         () => ({ ok: true, parsed: {}, mock: true })],
  ["POST",  /^\/api\/phase-d\/circulars\/.+\/reconcile-links$/,    () => ({ ok: true, mock: true })],
  ["PATCH", /^\/api\/phase-d\/pas-tasks\//,                        () => ({ ok: true, mock: true })],
  ["GET",   /^\/api\/phase-d\/erc-adoptions$/,                     "phase_d_erc_adoptions"],
  ["GET",   /^\/api\/phase-d\/erc-adoptions\/([^/]+)$/,            "phase_d_erc_adoption_detail"],
  ["POST",  /^\/api\/phase-d\/erc-adoptions\/.+\/activate$/,       () => ({ ok: true, mock: true })],
  ["POST",  /^\/api\/phase-d\/erc-adoptions\/bulk-activate$/,      () => ({ ok: true, activated: 0, mock: true })],
  ["POST",  /^\/api\/phase-d\/erc-circular-manifest\/backfill$/,   () => ({ ok: true, mock: true })],

  // ── data browser ────────────────────────────────────────────────────────
  ["GET",   /^\/api\/data\/states$/,                               "data_states"],
  ["GET",   /^\/api\/data\/erc-citations\/summary$/,               "data_erc_citations_summary"],
  ["GET",   /^\/api\/data\/erc-citations/,                         "data_erc_citations"],
  ["GET",   /^\/api\/data\/editions/,                              "data_editions"],
  ["GET",   /^\/api\/data\/deliveries/,                            "data_deliveries"],
  ["GET",   /^\/api\/data\/loss-costs\/table-names/,               "data_loss_cost_table_names"],
  ["GET",   /^\/api\/data\/loss-costs/,                            "data_loss_costs"],
  ["GET",   /^\/api\/data\/factors\/table-names/,                  "data_factor_table_names"],
  ["GET",   /^\/api\/data\/factors/,                               "data_factors"],
  ["GET",   /^\/api\/data\/ilta/,                                  "data_ilta"],
  ["GET",   /^\/api\/data\/territory/,                             "data_territory"],
  ["GET",   /^\/api\/data\/forms-list/,                            "data_forms_list"],
  ["GET",   /^\/api\/data\/forms/,                                 "data_forms"],
  ["GET",   /^\/api\/data\/quotes/,                                "data_quotes"],
  ["GET",   /^\/api\/data\/policies/,                              "data_policies"],
  ["GET",   /^\/api\/data\/erc-hierarchy$/,                        "data_erc_hierarchy"],
  ["GET",   /^\/api\/data\/validation-results/,                    "data_validation_results"],
  ["GET",   /^\/api\/data\/rating-algorithm\/table-presence/,      "data_rating_algorithm_table_presence"],
];

function tryBody(opts) {
  try {
    return opts?.body && typeof opts.body === "string" ? JSON.parse(opts.body) : null;
  } catch {
    return null;
  }
}

function emptyForPath(path) {
  // Heuristic: list-style paths get [], everything else gets {}.
  return /\/(list|deliveries|editions|carriers|quotes|policies|circulars|deviations|forms|factors|ilta|territory|states|class-codes|adoptions|events|loss-costs|citations|results|sample-folders)(\?|$)/i.test(path)
    ? []
    : {};
}

export async function mockApi(path, opts = {}) {
  // Strip query string for matching; keep it accessible to handlers via `opts.search`.
  const [bare, search = ""] = path.split("?");
  const method = (opts.method || "GET").toUpperCase();
  for (const [m, pattern, handlerOrName] of routes) {
    if (m !== method) continue;
    const match = typeof pattern === "string" ? (pattern === bare ? [bare] : null) : pattern.exec(bare);
    if (!match) continue;
    try {
      if (typeof handlerOrName === "function") {
        const result = await handlerOrName({ path, bare, search, method, match, opts });
        return result ?? emptyForPath(bare);
      }
      const data = fixture(handlerOrName);
      if (data === null) {
        console.warn(`[mock] route matched ${method} ${bare} → fixture "${handlerOrName}" not found; serving empty fallback`);
        return emptyForPath(bare);
      }
      return data;
    } catch (err) {
      console.error(`[mock] handler error for ${method} ${bare}:`, err);
      return emptyForPath(bare);
    }
  }
  console.warn(`[mock] unmapped ${method} ${path} — add a route in src/api/mock.js or a fixture in src/api/fixtures/`);
  return emptyForPath(bare);
}
