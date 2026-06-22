import { useMemo } from "react";

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtDollars(n) {
  if (n == null || typeof n !== "number") return "—";
  return "$" + Math.round(n).toLocaleString("en-US");
}

function fmtFactor(n) {
  if (n == null) return "—";
  return typeof n === "number" ? n.toFixed(2) : String(n);
}

function fmtRate(n) {
  if (n == null) return "—";
  return typeof n === "number" ? n.toFixed(4) : String(n);
}

function fmtDateTime(s) {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  const p = n => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}

// ── Lookup key display names ── null = suppress from key-inputs column ────────

const KEY_DISPLAY = {
  StateCode: "State",
  ClassCodeCGLProds: "Class",
  ClassCode: "Class",
  PremOpsTerr: "Terr",
  ProdsCompldOpsTerr: "Terr",
  Territory: "Terr",
  ilta: "ILTA",
  ilta_na: null,
  EachOccurrenceLimit: "Limit",
  GeneralAggregateLimit: "Agg",
  bureau_lc: "Bureau LC",
  lcm: "LCM",
  rated_lc: null,
  exposure: "Exposure",
  exposure_unit: null,
  exposure_units: null,
  ilf: "ILF",
  state_code: "State",
  class_code: "Class",
  PremOpsDed: "Deductible",
  ProdsCompldOpsDed: "Deductible",
  factor: null,
  elp_rate: "ELP",
  mp_factor: null,
};

function fmtLookupVal(v) {
  if (typeof v !== "number") return String(v ?? "");
  if (v === 0) return "0";
  if (Math.abs(v) >= 10000) return "$" + Math.round(v).toLocaleString("en-US");
  if (Math.abs(v) < 1) return v.toFixed(4);
  return v.toFixed(2);
}

function formatLookupKeys(lookup_keys, isBase) {
  if (!lookup_keys || typeof lookup_keys !== "object") return "—";

  if (isBase) {
    const { rated_lc, exposure, exposure_unit, ilf } = lookup_keys;
    const parts = [];
    if (rated_lc != null) parts.push(`LC ${fmtRate(rated_lc)}`);
    if (exposure != null) parts.push(`× $${Number(exposure).toLocaleString("en-US")}`);
    if (exposure_unit != null) parts.push(`÷ ${Number(exposure_unit).toLocaleString("en-US")}`);
    if (ilf != null) parts.push(`× ILF ${fmtFactor(ilf)}`);
    return parts.join(" ") || "—";
  }

  const parts = Object.entries(lookup_keys)
    .filter(([k]) => KEY_DISPLAY[k] !== null && KEY_DISPLAY[k] !== undefined)
    .map(([k, v]) => {
      if (v == null || v === "") return null;
      const label = KEY_DISPLAY[k] ?? k;
      return `${label} ${fmtLookupVal(v)}`;
    })
    .filter(Boolean);

  if (parts.length === 0) {
    // No known keys — show raw as fallback
    return Object.entries(lookup_keys)
      .slice(0, 3)
      .map(([k, v]) => `${k} ${v}`)
      .join(" · ") || "—";
  }
  return parts.join(" · ");
}

// ── Step result formatting ────────────────────────────────────────────────────

function isBasePremiumStep(step) {
  return step.step_name?.toLowerCase().includes("base premium");
}

function isDollarResult(step) {
  if (isBasePremiumStep(step)) return true;
  const col = step.result_col || "";
  return col === "base_premium" || col === "ded_credit" || col.includes("premium");
}

function formatResult(step) {
  const v = step.result_value;
  if (isDollarResult(step)) return fmtDollars(typeof v === "number" ? v : Number(v));
  if (typeof v === "string") return v;
  const col = step.result_col || "";
  if (col === "Rate" || col === "rated_lc") return fmtRate(v);
  return fmtFactor(v);
}

// ── Derive policy detail fields by scanning rating trace ──────────────────────

function deriveDetails(audit) {
  const trace = audit.rating_trace || [];
  let state = null, classCode = null, exposure = null, limits = null, quoteId = null;
  for (const step of trace) {
    const lk = step.lookup_keys || {};
    if (!state) state = lk.StateCode || lk.state_code || null;
    if (!classCode) classCode = lk.ClassCodeCGLProds || lk.ClassCode || lk.class_code || null;
    if (!exposure && lk.exposure != null) exposure = Number(lk.exposure);
    if (!limits) limits = lk.EachOccurrenceLimit || null;
    if (!quoteId && step.quote_id) quoteId = step.quote_id;
    if (state && classCode && exposure != null && limits && quoteId) break;
  }
  return { state, classCode, exposure, limits, quoteId };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Tile({ label, value }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="text-[10px] font-medium uppercase tracking-wide text-gray-400 mb-0.5">{label}</div>
      <div className="font-mono text-sm text-gray-800 truncate">{value || "—"}</div>
    </div>
  );
}

const SUBLINE_LABELS = {
  PO: "Premises & Operations",
  PR: "Products & Completed Operations",
};

function StepBadge({ stepId, isDeviation }) {
  const prefix = stepId?.split("-")[0] || "";
  const colorCls = prefix === "PO"
    ? "bg-blue-100 text-blue-700"
    : prefix === "PR"
      ? "bg-green-100 text-green-700"
      : "bg-gray-100 text-gray-600";
  return (
    <span className="flex items-center gap-1 flex-wrap">
      <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-mono font-semibold ${colorCls}`}>
        {stepId}
      </span>
      {isDeviation && (
        <span className="inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-700">
          Carrier
        </span>
      )}
    </span>
  );
}

function SublineTable({ steps }) {
  return (
    <table className="w-full text-xs border-collapse">
      <thead>
        <tr className="bg-gray-50 border-b border-gray-200">
          <th className="text-left py-2 pl-3 pr-4 font-medium text-gray-500 w-24">Step</th>
          <th className="text-left py-2 pr-4 font-medium text-gray-500 w-52">Name</th>
          <th className="text-left py-2 pr-4 font-medium text-gray-500">Key Inputs</th>
          <th className="text-right py-2 pr-3 font-medium text-gray-500 w-32">Result</th>
        </tr>
      </thead>
      <tbody>
        {steps.map((step, i) => {
          const isBase = isBasePremiumStep(step);
          const isDev = step.source === "carrier_deviation";
          return (
            <tr
              key={i}
              className={`border-b border-gray-100 last:border-0 ${isBase ? "bg-blue-50/70" : ""}`}
            >
              <td className="py-1.5 pl-3 pr-4 align-top">
                <StepBadge stepId={step.step_id} isDeviation={isDev} />
              </td>
              <td className="py-1.5 pr-4 text-gray-700 align-top">{step.step_name || "—"}</td>
              <td className="py-1.5 pr-4 text-[11px] font-mono text-gray-500 align-top">
                {formatLookupKeys(step.lookup_keys, isBase)}
              </td>
              <td className="py-1.5 pr-3 text-right font-mono tabular-nums text-gray-800 align-top">
                {formatResult(step)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function RatingAuditCard({ audit }) {
  if (!audit) return null;

  const prov = audit.edition_provenance || {};
  const trace = audit.rating_trace || [];
  const premiumProof = audit.premium_proof || {};
  const deviations = audit.deviations_applied || [];

  const hasDuplicates = useMemo(() => {
    const seen = new Set();
    for (const s of trace) {
      const key = `${s.step_id}|${s.classification_id ?? ""}`;
      if (seen.has(key)) return true;
      seen.add(key);
    }
    return false;
  }, [trace]);

  const stepGroups = useMemo(() => {
    const groups = new Map();
    for (const step of trace) {
      const prefix = step.step_id?.split("-")[0] || "OTHER";
      if (!groups.has(prefix)) groups.set(prefix, []);
      groups.get(prefix).push(step);
    }
    return groups;
  }, [trace]);

  const details = useMemo(() => deriveDetails(audit), [audit]);

  return (
    <div className="space-y-5">

      {/* 1 ── Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-wide text-gray-400 mb-0.5">Policy ID</div>
          <div className="text-lg font-semibold text-gray-900 font-mono">{audit.policy_id}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-gray-400 mb-0.5">Audit generated</div>
          <div className="text-xs font-mono text-gray-500">{fmtDateTime(audit.audit_package_generated_at)}</div>
        </div>
      </div>

      {/* Duplicate step notice */}
      {hasDuplicates && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Duplicate rating steps detected in this audit package. This is a known engine issue and does not affect premium accuracy.
        </div>
      )}

      {/* 2 ── Policy details */}
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Policy Details</div>
        <div className="grid grid-cols-2 gap-2">
          <Tile label="Edition ID" value={prov.edition_id} />
          <Tile label="Effective Date" value={prov.effective_date || "—"} />
          <Tile label="State" value={details.state} />
          <Tile label="Class Code" value={details.classCode} />
          <Tile label="Exposure" value={details.exposure != null ? fmtDollars(details.exposure) : "—"} />
          <Tile label="Limits" value={details.limits} />
          <Tile label="Quote ID" value={details.quoteId} />
          <Tile label="CW Project" value={prov.cw_project} />
        </div>
      </div>

      {/* 2.5 ── RS-4.12 Phase 2 — Filing-track edition provenance.
                Shown only when bind used a split edition. Default (single
                edition) renders nothing so the typical audit stays compact. */}
      {prov.split_edition_bind && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Filing-Track Editions at Bind</div>
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-50 border border-purple-200 text-purple-800 text-[9px] font-semibold uppercase tracking-wide">
              Split
            </span>
          </div>
          <div className="rounded-lg border border-purple-200 bg-purple-50/40 p-3 text-xs space-y-2">
            <div className="text-[11px] text-purple-900">
              Rate, forms, and rules were filed on different SERFF cycles. Each axis below stamps which DOI-approved edition produced the values in that part of the audit.
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Tile label="Rate edition" value={prov.bound_rate_edition_id} />
              <Tile label="Forms edition" value={prov.bound_forms_edition_id} />
              <Tile label="Rules edition" value={prov.bound_rules_edition_id} />
            </div>
            <div className="text-[10px] text-purple-700">
              Bureau circulars below are the <em>union</em> of both editions' manifests — each circular's incorporated-into edition is preserved in the underlying ERC manifest.
            </div>
          </div>
        </div>
      )}

      {/* 3 ── Carrier deviations */}
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Carrier Deviations</div>
        {deviations.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs text-gray-500 italic">
            No deviations applied — bureau base rates used throughout.
          </div>
        ) : (
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left py-2 pl-3 pr-4 font-medium text-gray-500">Deviation ID</th>
                  <th className="text-left py-2 pr-4 font-medium text-gray-500">Element</th>
                  <th className="text-right py-2 pr-4 font-medium text-gray-500">Bureau Value</th>
                  <th className="text-right py-2 pr-4 font-medium text-gray-500">Carrier Value</th>
                  <th className="text-right py-2 pr-3 font-medium text-gray-500">Delta</th>
                </tr>
              </thead>
              <tbody>
                {deviations.map((d, i) => (
                  <tr key={i} className="border-b border-gray-100 last:border-0">
                    <td className="py-1.5 pl-3 pr-4 font-mono text-amber-700">{d.deviation_id}</td>
                    <td className="py-1.5 pr-4 text-gray-600">{d.sublines?.join(", ") || "—"}</td>
                    <td className="py-1.5 pr-4 text-right font-mono text-gray-500">—</td>
                    <td className="py-1.5 pr-4 text-right font-mono text-gray-600">{d.lcm_value ?? "—"}</td>
                    <td className="py-1.5 pr-3 text-right font-mono text-gray-500">—</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 4 & 5 ── Rating steps, one section per subline */}
      {[...stepGroups.entries()].map(([prefix, steps]) => (
        <div key={prefix}>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
            Rating Steps — {SUBLINE_LABELS[prefix] || prefix}
          </div>
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <SublineTable steps={steps} />
          </div>
        </div>
      ))}

      {/* 6 ── Premium summary */}
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Premium Summary</div>
        <div className="rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-xs">
            <tbody>
              {Object.entries(premiumProof.by_subline || {}).map(([k, v]) => (
                <tr key={k} className="border-b border-gray-100">
                  <td className="px-4 py-2 text-gray-600">{k}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums text-gray-800">{fmtDollars(v)}</td>
                </tr>
              ))}
              {(premiumProof.adjustments || []).length > 0
                ? premiumProof.adjustments.map((a, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="px-4 py-2 text-amber-600">{a.label}</td>
                      <td className="px-4 py-2 text-right font-mono tabular-nums text-amber-600">{fmtDollars(a.amount)}</td>
                    </tr>
                  ))
                : (
                    <tr className="border-b border-gray-100">
                      <td className="px-4 py-2 text-gray-400 italic">No adjustments</td>
                      <td className="px-4 py-2 text-right font-mono text-gray-400">—</td>
                    </tr>
                  )
              }
              <tr className="border-t-2 border-gray-300 bg-gray-50">
                <td className="px-4 py-3 font-semibold text-gray-800">Total Premium</td>
                <td className="px-4 py-3 text-right font-mono tabular-nums text-emerald-700 font-bold text-base">
                  {fmtDollars(premiumProof.final_premium)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
