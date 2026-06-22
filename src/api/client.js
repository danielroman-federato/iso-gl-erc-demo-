// Default to relative URLs — Vite proxies /api/* to the backend (see vite.config.js).
// Override with VITE_API_BASE in .env.local if you need to point at a remote backend.
const BASE = import.meta.env.VITE_API_BASE ?? "";

// Mock mode — when VITE_MOCK=1, short-circuit fetch() and serve fixtures from ./mock.
// Used for the Vercel design-prototype deploy where no backend is running.
const MOCK = import.meta.env.VITE_MOCK === "1" || import.meta.env.VITE_MOCK === "true";
let mockApiPromise = null;
async function getMockApi() {
  if (!mockApiPromise) mockApiPromise = import("./mock.js").then((m) => m.mockApi);
  return mockApiPromise;
}

async function api(path, opts = {}) {
  if (MOCK) {
    const mockApi = await getMockApi();
    return mockApi(path, opts);
  }
  const res = await rawFetch(`${path}`, {
    headers: { "Content-Type": "application/json", ...opts.headers },
    ...opts,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json();
}

// Wrapper for code paths that call fetch() directly (PDF downloads, FormData uploads).
// In mock mode we return a synthetic Response so callers that .blob() / .json() / check .ok
// keep working — the payload is a tiny placeholder.
async function rawFetch(path, opts = {}) {
  if (MOCK) {
    const mockApi = await getMockApi();
    const data = await mockApi(path, opts);
    const isBinary = path.endsWith(".pdf") || path.includes("worksheet") || path.includes("audit-package");
    if (isBinary) {
      const body = new Blob([`Mock artifact for ${path}\n\nThis is a design-prototype deploy — no backend is wired.`], { type: "text/plain" });
      return new Response(body, { status: 200 });
    }
    return new Response(JSON.stringify(data ?? {}), { status: 200, headers: { "Content-Type": "application/json" } });
  }
  return fetch(`${BASE}${path}`, opts);
}

export const phaseB = {
  deviations: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ""))
    ).toString();
    return api(`/api/phase-b/deviations${qs ? "?" + qs : ""}`);
  },
  getDeviation: (id) => api(`/api/phase-b/deviations/${id}`),
  createDeviation: (payload) =>
    api("/api/phase-b/deviations", { method: "POST", body: JSON.stringify(payload) }),
  activate: (id, actor = "system") =>
    api(`/api/phase-b/deviations/${id}/activate`, { method: "POST", body: JSON.stringify({ actor }) }),
  approve: (id, approval_date, actor = "system") =>
    api(`/api/phase-b/deviations/${id}/approve`, { method: "POST", body: JSON.stringify({ approval_date, actor }) }),
  close: (id, actor = "system") =>
    api(`/api/phase-b/deviations/${id}/close`, { method: "POST", body: JSON.stringify({ actor }) }),
  toggleEnabled: (id, enabled, actor = "ui_toggle") =>
    api(`/api/phase-b/deviations/${id}/toggle-enabled`, {
      method: "POST", body: JSON.stringify({ enabled, actor }),
    }),
  cwToggleEnabled: (carrier_id, cw_project_reference, deviation_type, enabled, actor = "ui_cw_toggle") =>
    api(`/api/phase-b/deviations/cw-toggle-enabled`, {
      method: "POST",
      body: JSON.stringify({ carrier_id, cw_project_reference, deviation_type, enabled, actor }),
    }),
  coverageMatrix: (carrier_id) => {
    const qs = carrier_id ? `?carrier_id=${carrier_id}` : "";
    return api(`/api/phase-b/coverage-matrix${qs}`);
  },
  auditLog: (deviation_id) => {
    const qs = deviation_id ? `?deviation_id=${deviation_id}` : "";
    return api(`/api/phase-b/audit-log${qs}`);
  },
  carriers: () => api("/api/phase-b/carriers"),
  createCarrier: (payload) =>
    api("/api/phase-b/carriers", { method: "POST", body: JSON.stringify(payload) }),
  cwEditions: () => api("/api/phase-b/cw-editions"),
  lcmMatrix: (cw_edition_id, carrier_id) =>
    api(`/api/phase-b/lcm-matrix?cw_edition_id=${encodeURIComponent(cw_edition_id)}&carrier_id=${encodeURIComponent(carrier_id)}`),
  batchSaveLcm: (payload) =>
    api("/api/phase-b/lcm-matrix/batch-save", { method: "POST", body: JSON.stringify(payload) }),
  deviationMatrix: (cw_edition_id, carrier_id) =>
    api(`/api/phase-b/deviation-matrix?cw_edition_id=${encodeURIComponent(cw_edition_id)}&carrier_id=${encodeURIComponent(carrier_id)}`),
  batchSaveDeviation: (payload) =>
    api("/api/phase-b/deviation-matrix/batch-save", { method: "POST", body: JSON.stringify(payload) }),
};

export const phaseC = {
  createQuote: (payload) =>
    api("/api/phase-c/quotes", { method: "POST", body: JSON.stringify(payload) }),
  checkEligibility: (quote_id) =>
    api(`/api/phase-c/quotes/${quote_id}/eligibility`, { method: "POST", body: "{}" }),
  rateQuote: (quote_id) =>
    api(`/api/phase-c/quotes/${quote_id}/rate`, { method: "POST", body: "{}" }),
  liveUpdateQuote: (quote_id, fields = {}, class_updates = []) =>
    api(`/api/phase-c/quotes/${quote_id}`, {
      method: "PATCH",
      body: JSON.stringify({ fields, class_updates }),
    }),
  searchClassCodes: (q, state_code, limit = 20) => {
    const qs = new URLSearchParams({ q, state_code: state_code || "", limit: String(limit) });
    return api(`/api/phase-c/class-codes?${qs.toString()}`);
  },
  selectForms: (quote_id, selected_optional_form_numbers, new_form_acknowledgments = []) =>
    api(`/api/phase-c/quotes/${quote_id}/select-forms`, {
      method: "POST",
      body: JSON.stringify({ selected_optional_form_numbers, new_form_acknowledgments }),
    }),
  getFormFields: (quote_id, scope_mode = "auto_surface") =>
    api(`/api/phase-c/quotes/${quote_id}/form-fields?scope_mode=${encodeURIComponent(scope_mode)}`),
  saveFormFields: (quote_id, form_data) =>
    api(`/api/phase-c/quotes/${quote_id}/form-fields`, {
      method: "POST",
      body: JSON.stringify({ form_data }),
    }),
  getDomainTable: (name) => api(`/api/phase-c/domain-table?name=${encodeURIComponent(name)}`),
  downloadWorksheet: (quote_id) =>
    rawFetch(`/api/phase-c/quotes/${quote_id}/worksheet.pdf`)
      .then(r => r.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `worksheet_${quote_id}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      }),
  downloadPolicyWorksheet: (policy_id) =>
    rawFetch(`/api/phase-c/policies/${policy_id}/worksheet.pdf`)
      .then(r => r.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `worksheet_${policy_id}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      }),
  bindQuote: (quote_id, actor = "system", selected_optional_forms = []) =>
    api(`/api/phase-c/quotes/${quote_id}/bind`, {
      method: "POST",
      body: JSON.stringify({ actor, selected_optional_forms }),
    }),
  listQuotes: (carrier_id) => {
    const qs = carrier_id ? `?carrier_id=${carrier_id}` : "";
    return api(`/api/phase-c/quotes${qs}`);
  },
  getQuote: (quote_id) => api(`/api/phase-c/quotes/${quote_id}`),
  listPolicies: (carrier_id) => {
    const qs = carrier_id ? `?carrier_id=${carrier_id}` : "";
    return api(`/api/phase-c/policies${qs}`);
  },
  getPolicy: (policy_id) => api(`/api/phase-c/policies/${policy_id}`),
  downloadAuditPackage: (policy_id) =>
    rawFetch(`/api/phase-c/policies/${policy_id}/audit-package`)
      .then(r => r.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `audit_${policy_id}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }),
  territoryLookup: (state_code, zip_code) =>
    api(`/api/phase-c/territory-lookup?state_code=${encodeURIComponent(state_code)}&zip_code=${encodeURIComponent(zip_code)}`),
  scheduleRatingSpec: (state_code, policy_effective_date, carrier_id = "ACME") => {
    const qs = new URLSearchParams({ state_code, policy_effective_date, carrier_id }).toString();
    return api(`/api/phase-c/schedule-rating-spec?${qs}`);
  },
  algorithmDag: (state_code, policy_effective_date, carrier_id = "ACME", lob = "GL") => {
    const qs = new URLSearchParams({ state_code, policy_effective_date, carrier_id, lob }).toString();
    return api(`/api/phase-c/algorithm-dag?${qs}`);
  },
  getCarrierAlgorithmModel: (carrier_id, state_code, edition_id) => {
    const qs = new URLSearchParams({ carrier_id, state_code, edition_id }).toString();
    return api(`/api/phase-c/carrier-algorithm-model?${qs}`);
  },
  saveCarrierAlgorithmModel: (payload) =>
    api(`/api/phase-c/carrier-algorithm-model`, { method: "POST", body: JSON.stringify(payload) }),
};

export const phaseD = {
  metrics: () => api("/api/phase-d/metrics"),
  circulars: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ""))
    ).toString();
    return api(`/api/phase-d/circulars${qs ? "?" + qs : ""}`);
  },
  getCircular: (id) => api(`/api/phase-d/circulars/${encodeURIComponent(id)}`),
  createCircular: (payload) =>
    api("/api/phase-d/circulars", { method: "POST", body: JSON.stringify(payload) }),
  updateDecision: (id, payload) =>
    api(`/api/phase-d/circulars/${encodeURIComponent(id)}/decision`, {
      method: "PATCH", body: JSON.stringify(payload),
    }),
  signoff: (id, payload) =>
    api(`/api/phase-d/circulars/${encodeURIComponent(id)}/approvals`, {
      method: "POST", body: JSON.stringify(payload),
    }),
  uploadPdf: async (id, file) => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await rawFetch(`/api/phase-d/circulars/${encodeURIComponent(id)}/pdf`, {
      method: "POST", body: fd,
    });
    if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
    return res.json();
  },
  parsePdf: async (file) => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await rawFetch(`/api/phase-d/circulars/parse`, {
      method: "POST", body: fd,
    });
    if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
    return res.json();
  },
  intakePdf: async (file) => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await rawFetch(`/api/phase-d/circulars/intake`, {
      method: "POST", body: fd,
    });
    const body = await res.text();
    if (!res.ok) {
      let err;
      try {
        const parsed = JSON.parse(body);
        err = new Error(typeof parsed.detail === "string" ? parsed.detail : parsed.detail?.message || body);
        err.status = res.status;
        err.detail = parsed.detail;
      } catch {
        err = new Error(`API ${res.status}: ${body}`);
        err.status = res.status;
      }
      throw err;
    }
    return JSON.parse(body);
  },
  parseAndFill: async (id, file) => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await rawFetch(`/api/phase-d/circulars/${encodeURIComponent(id)}/parse-fill`, {
      method: "POST", body: fd,
    });
    if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
    return res.json();
  },
  updatePasTask: (taskId, payload) =>
    api(`/api/phase-d/pas-tasks/${taskId}`, { method: "PATCH", body: JSON.stringify(payload) }),
  ercAdoptions: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ""))
    ).toString();
    return api(`/api/phase-d/erc-adoptions${qs ? "?" + qs : ""}`);
  },
  getErcAdoption: (editionId) =>
    api(`/api/phase-d/erc-adoptions/${encodeURIComponent(editionId)}`),
  activateErc: (editionId, payload) =>
    api(`/api/phase-d/erc-adoptions/${encodeURIComponent(editionId)}/activate`, {
      method: "POST", body: JSON.stringify(payload),
    }),
  bulkActivateErc: (edition_ids, signer, opts = {}) =>
    api(`/api/phase-d/erc-adoptions/bulk-activate`, {
      method: "POST",
      body: JSON.stringify({
        edition_ids,
        signer,
        super_admin: true,
        acknowledge_stale: !!opts.acknowledge_stale,
        force: !!opts.force,
        notes: opts.notes || null,
      }),
    }),
  reconcileLinks: (circularId, allow_activated = false) =>
    api(`/api/phase-d/circulars/${encodeURIComponent(circularId)}/reconcile-links`, {
      method: "POST", body: JSON.stringify({ allow_activated }),
    }),
  backfillErcCircularManifest: (folder_path, recursive = true) =>
    api(`/api/phase-d/erc-circular-manifest/backfill`, {
      method: "POST", body: JSON.stringify({ folder_path, recursive }),
    }),
};

export const carriers = {
  list: () => api("/api/carriers"),
  get: (carrier_id) => api(`/api/carriers/${encodeURIComponent(carrier_id)}`),
  cwBases: (lob = "GL") => api(`/api/carriers/_wizard/cw-bases?lob=${lob}`),
  statesForCw: (cw_project_reference, lob = "GL") =>
    api(`/api/carriers/_wizard/states-for-cw?cw_project_reference=${encodeURIComponent(cw_project_reference)}&lob=${lob}`),
  activate: (payload) =>
    api("/api/carriers/activate", { method: "POST", body: JSON.stringify(payload) }),
  events: (carrier_id, limit = 50) =>
    api(`/api/carriers/${encodeURIComponent(carrier_id)}/events?limit=${limit}`),
  // RS-4.12 Phase 2 — per-(carrier × state) filing-track edition overrides.
  filingTrackOverrides: (carrier_id, state_code) =>
    api(`/api/carriers/${encodeURIComponent(carrier_id)}/states/${encodeURIComponent(state_code)}/filing-track-overrides`),
  setFilingTrackOverrides: (carrier_id, state_code, payload) =>
    api(`/api/carriers/${encodeURIComponent(carrier_id)}/states/${encodeURIComponent(state_code)}/filing-track-overrides`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
};

export const isoPermissions = {
  get: (carrier_id) =>
    api(`/api/iso-permissions/${encodeURIComponent(carrier_id)}`),
  save: (carrier_id, payload) =>
    api(`/api/iso-permissions/${encodeURIComponent(carrier_id)}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  downloadAgreementUrl: (carrier_id) =>
    `${BASE}/api/iso-permissions/${encodeURIComponent(carrier_id)}/agreement`,
};

export const phaseA = {
  sampleFolders: () => api("/api/phase-a/sample-folders"),
  runPipeline: (folder_path) =>
    api("/api/phase-a/run-pipeline", {
      method: "POST",
      body: JSON.stringify({ folder_path }),
    }),
  scanIngestRoot: (folder_path) =>
    api("/api/phase-a/scan-ingest-root", {
      method: "POST",
      body: JSON.stringify({ folder_path }),
    }),
  massIngest: (folder_path, skip_already_loaded = true) =>
    api("/api/phase-a/mass-ingest", {
      method: "POST",
      body: JSON.stringify({ folder_path, skip_already_loaded }),
    }),
  massIngestStream: async (folder_path, skip_already_loaded = true, onEvent, signal) => {
    const res = await rawFetch(`/api/phase-a/mass-ingest-stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder_path, skip_already_loaded }),
      signal,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API ${res.status}: ${text}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop();
      for (const chunk of parts) {
        const line = chunk.trim();
        if (line.startsWith("data: ")) {
          try { onEvent(JSON.parse(line.slice(6))); } catch {}
        }
      }
    }
  },
  deliveries: () => api("/api/phase-a/deliveries"),
  editions: () => api("/api/phase-a/editions"),
  loadLog: (delivery_id) => api(`/api/phase-a/load-log/${delivery_id}`),
  stc: (delivery_id) => api(`/api/phase-a/stc/${delivery_id}`),
  contentFreshness: () => api("/api/phase-a/content-freshness"),
  cwDependency: () => api("/api/phase-a/cw-dependency"),
};

export const dataBrowser = {
  states: () => api("/api/data/states"),
  ercCitations: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ""))
    ).toString();
    return api(`/api/data/erc-citations${qs ? "?" + qs : ""}`);
  },
  ercCitationsSummary: () => api("/api/data/erc-citations/summary"),
  editions: (state_code) => {
    const qs = state_code ? `?state_code=${encodeURIComponent(state_code)}` : "";
    return api(`/api/data/editions${qs}`);
  },
  deliveries: (state_code) => {
    const qs = state_code ? `?state_code=${encodeURIComponent(state_code)}` : "";
    return api(`/api/data/deliveries${qs}`);
  },
  lossCosts: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ""))
    ).toString();
    return api(`/api/data/loss-costs${qs ? "?" + qs : ""}`);
  },
  lossCostTableNames: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ""))
    ).toString();
    return api(`/api/data/loss-costs/table-names${qs ? "?" + qs : ""}`);
  },
  factors: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ""))
    ).toString();
    return api(`/api/data/factors${qs ? "?" + qs : ""}`);
  },
  factorTableNames: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ""))
    ).toString();
    return api(`/api/data/factors/table-names${qs ? "?" + qs : ""}`);
  },
  ilta: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ""))
    ).toString();
    return api(`/api/data/ilta${qs ? "?" + qs : ""}`);
  },
  territory: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ""))
    ).toString();
    return api(`/api/data/territory${qs ? "?" + qs : ""}`);
  },
  forms: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ""))
    ).toString();
    return api(`/api/data/forms${qs ? "?" + qs : ""}`);
  },
  formsList: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ""))
    ).toString();
    return api(`/api/data/forms-list${qs ? "?" + qs : ""}`);
  },
  quotes: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ""))
    ).toString();
    return api(`/api/data/quotes${qs ? "?" + qs : ""}`);
  },
  policies: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ""))
    ).toString();
    return api(`/api/data/policies${qs ? "?" + qs : ""}`);
  },
  ercHierarchy: () => api("/api/data/erc-hierarchy"),
  validationResults: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ""))
    ).toString();
    return api(`/api/data/validation-results${qs ? "?" + qs : ""}`);
  },
  ratingAlgorithmTablePresence: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ""))
    ).toString();
    return api(`/api/data/rating-algorithm/table-presence${qs ? "?" + qs : ""}`);
  },
};
