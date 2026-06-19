import { useState, useEffect, useRef } from "react";
import { phaseC } from "../api/client";
import { Badge } from "../components/Badge";
import { Panel } from "../components/Panel";
import { SCHEDULE_RATING_CATEGORIES, sumScheduleCategories } from "./Screen3_QuoteEntry";

function currency(n) {
  return typeof n === "number" ? `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—";
}

function StepRow({ step }) {
  const isLcm = step.step_id?.includes("-2");
  return (
    <div className={`flex items-baseline gap-3 text-xs py-0.5 ${isLcm ? "text-amber-600" : "text-gray-700"}`}>
      <span className="text-gray-400 font-mono w-10 shrink-0">{step.step_id}</span>
      <span className="text-gray-500 w-48 shrink-0">{step.step_name}</span>
      <span className="font-mono">{step.result_value ?? "—"}</span>
      {step.source && step.source !== "bureau_base" && (
        <Badge label="Paper Co. Dev" variant="WARN" />
      )}
    </div>
  );
}

// ── Diff banner — F5.5: surface what changed after a state/date/lever switch ──
function DiffBanner({ prev, curr, onDismiss }) {
  if (!prev || !curr) return null;
  const prevForms = new Set(((prev.form_determination?.mandatory_forms || []).concat(
    prev.form_determination?.attached_conditional_forms || [],
    prev.form_determination?.selected_optional_forms || []
  )).map(f => f.form_number).filter(Boolean));
  const currForms = new Set(((curr.form_determination?.mandatory_forms || []).concat(
    curr.form_determination?.attached_conditional_forms || [],
    curr.form_determination?.selected_optional_forms || []
  )).map(f => f.form_number).filter(Boolean));
  const added = [...currForms].filter(f => !prevForms.has(f));
  const removed = [...prevForms].filter(f => !currForms.has(f));

  const editionChanged = prev.edition_id && curr.edition_id && prev.edition_id !== curr.edition_id;
  const prevTotal = prev.quote?.premium_summary?.total_premium ?? 0;
  const currTotal = curr.quote?.premium_summary?.total_premium ?? 0;
  const delta = currTotal - prevTotal;

  // Deviation diff (active_deviation_ids on the deviation_indicator)
  const prevDevs = new Set((prev.quote?.deviation_indicator?.other_deviations || []));
  const currDevs = new Set((curr.quote?.deviation_indicator?.other_deviations || []));
  const devsActivated = [...currDevs].filter(d => !prevDevs.has(d));
  const devsDeactivated = [...prevDevs].filter(d => !currDevs.has(d));

  if (!editionChanged && added.length === 0 && removed.length === 0 &&
      devsActivated.length === 0 && devsDeactivated.length === 0 && Math.abs(delta) < 0.01) {
    return null;
  }

  return (
    <div className="mb-4 bg-blue-50 border border-blue-200 rounded shadow-sm">
      <div className="px-4 py-2 border-b border-blue-200 flex items-baseline justify-between">
        <span className="font-semibold text-blue-900 text-sm">
          ⟳ Inputs changed — here's what differs vs the previous rating
        </span>
        <button onClick={onDismiss} className="text-blue-600 hover:text-blue-900 text-xs">dismiss</button>
      </div>
      <div className="px-4 py-2 text-xs space-y-1">
        {editionChanged && (
          <div className="flex gap-2">
            <span className="font-semibold text-blue-700 w-24 shrink-0">EDITION</span>
            <span className="font-mono text-gray-500">{prev.edition_id || "—"}</span>
            <span className="text-blue-600">→</span>
            <span className="font-mono text-blue-900">{curr.edition_id}</span>
          </div>
        )}
        {Math.abs(delta) >= 0.01 && (
          <div className="flex gap-2">
            <span className="font-semibold text-blue-700 w-24 shrink-0">PREMIUM</span>
            <span className="font-mono">${prevTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            <span className="text-blue-600">→</span>
            <span className="font-mono">${currTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            <span className={`font-semibold ${delta >= 0 ? "text-amber-700" : "text-emerald-700"}`}>
              ({delta >= 0 ? "+" : ""}${delta.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
            </span>
          </div>
        )}
        {added.length > 0 && (
          <div className="flex gap-2">
            <span className="font-semibold text-emerald-700 w-24 shrink-0">+ ATTACH</span>
            <span className="text-emerald-800">{added.length} form(s): <span className="font-mono">{added.slice(0, 6).join(", ")}{added.length > 6 ? "..." : ""}</span></span>
          </div>
        )}
        {removed.length > 0 && (
          <div className="flex gap-2">
            <span className="font-semibold text-amber-700 w-24 shrink-0">− DROP</span>
            <span className="text-amber-800">{removed.length} form(s): <span className="font-mono">{removed.slice(0, 6).join(", ")}{removed.length > 6 ? "..." : ""}</span></span>
          </div>
        )}
        {devsActivated.length > 0 && (
          <div className="flex gap-2">
            <span className="font-semibold text-purple-700 w-24 shrink-0">+ DEVIATION</span>
            <span className="text-purple-800 font-mono">{devsActivated.join(", ")}</span>
          </div>
        )}
        {devsDeactivated.length > 0 && (
          <div className="flex gap-2">
            <span className="font-semibold text-gray-600 w-24 shrink-0">− DEVIATION</span>
            <span className="text-gray-700 font-mono">{devsDeactivated.join(", ")}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Live Levers panel — F5.1 inline editors with debounced re-rate ────────────
const LIMITS = [
  "100,000 CSL", "300,000 CSL", "500,000 CSL", "1,000,000 CSL",
  "2,000,000 CSL", "3,000,000 CSL", "5,000,000 CSL",
];
const AGGS = [
  "300,000 CSL", "600,000 CSL", "1,000,000 CSL", "2,000,000 CSL",
  "4,000,000 CSL", "5,000,000 CSL", "10,000,000 CSL",
];
const DEDS = ["No Deductible", "$250", "$500", "$1,000", "$2,500", "$5,000", "$10,000"];
const BASES = ["CSL", "BI", "PD"];
const STATE_CODES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY",
];

// Aggregate input + expander for the 6 ISO Rule 26 categories. Compact
// because it lives in the Live Levers grid alongside limits + deductibles.
// Justification narrative per non-zero category appears below the grid when
// expanded — UW fills these at review time, not while typing the quote.
function ScheduleModLeverInline({ vals, setVals, onLiveUpdate, spec }) {
  const [open, setOpen] = useState(false);
  const cats = vals.schedule_mod_categories || [];
  const categoriesActive = cats.some(c => (parseFloat(c.applied_pct) || 0) !== 0);
  const derivedAggregate = categoriesActive ? sumScheduleCategories(cats) : null;

  // Bureau categories when spec present (8 rows), else fallback to the
  // exported static enum (also 8 rows post-Rule-26 fix).
  const bureauCategories = (spec?.categories?.length || 0) > 0 ? spec.categories : null;
  const renderCategories = bureauCategories
    ? bureauCategories.map(c => ({ code: c.code, label: c.label, domain_values: c.domain_values, max_credit_pct: c.max_credit_pct, max_debit_pct: c.max_debit_pct }))
    : SCHEDULE_RATING_CATEGORIES.map(c => ({ code: c.code, label: c.label, domain_values: null, max_credit_pct: 25, max_debit_pct: 25 }));
  const aggMaxCredit = spec?.aggregate?.max_credit_pct ?? 25;
  const aggMaxDebit = spec?.aggregate?.max_debit_pct ?? 25;

  function setCategoryPct(code, raw) {
    const pct = raw === "" || raw === "-" ? raw : parseFloat(raw);
    const existing = cats.find(c => c.category_code === code);
    const next = renderCategories.map(({ code: c }) => {
      const ex = cats.find(x => x.category_code === c);
      if (c === code) return { ...(ex || {}), category_code: c, applied_pct: pct };
      return ex || null;
    }).filter(Boolean);
    const filtered = next.filter(c => (parseFloat(c.applied_pct) || 0) !== 0 || c.justification_narrative);
    const sum = sumScheduleCategories(filtered);
    setVals(v => ({
      ...v,
      schedule_mod_categories: filtered,
      schedule_mod_pct: filtered.length > 0 ? sum : v.schedule_mod_pct,
      schedule_mod_applies: sum !== 0 ? "Yes" : "No",
    }));
    onLiveUpdate({
      fields: {
        schedule_mod_applies: sum !== 0 ? "Yes" : "No",
        schedule_mod_pct: filtered.length > 0 ? sum : (parseFloat(vals.schedule_mod_pct) || 0),
      },
      schedule_category_updates: [{
        category_code: code,
        applied_pct: pct === "" || pct === "-" ? 0 : pct,
        justification_narrative: existing?.justification_narrative || null,
      }],
    });
  }

  function setCategoryJustification(code, narrative) {
    const existing = cats.find(c => c.category_code === code) || { category_code: code, applied_pct: 0 };
    const next = renderCategories.map(({ code: c }) => {
      const ex = cats.find(x => x.category_code === c);
      if (c === code) return { ...existing, justification_narrative: narrative };
      return ex || null;
    }).filter(Boolean);
    const filtered = next.filter(c => (parseFloat(c.applied_pct) || 0) !== 0 || c.justification_narrative);
    setVals(v => ({ ...v, schedule_mod_categories: filtered }));
    onLiveUpdate({
      schedule_category_updates: [{
        category_code: code,
        applied_pct: parseFloat(existing.applied_pct) || 0,
        justification_narrative: narrative || null,
      }],
    });
  }

  return (
    <div>
      <label className="block text-gray-500 mb-0.5">
        Schedule Mod %
        {categoriesActive && <span className="ml-1 text-[10px] text-gray-400">(derived)</span>}
      </label>
      <div className="flex items-center gap-1">
        <input type="number" step="1" min={-aggMaxCredit} max={aggMaxDebit}
          className={`flex-1 bg-white border border-gray-300 rounded px-2 py-1 ${categoriesActive ? "bg-gray-50 text-gray-600" : ""}`}
          readOnly={categoriesActive}
          value={categoriesActive ? derivedAggregate : vals.schedule_mod_pct}
          onChange={e => {
            const pct = parseFloat(e.target.value) || 0;
            setVals(v => ({ ...v, schedule_mod_pct: pct, schedule_mod_applies: pct === 0 ? "No" : "Yes" }));
            onLiveUpdate({ fields: { schedule_mod_applies: pct === 0 ? "No" : "Yes", schedule_mod_pct: pct } });
          }} />
        <button type="button" onClick={() => setOpen(v => !v)}
          title={`Break out by ISO Rule 26 category (${renderCategories.length} categories)`}
          className={`px-1.5 py-1 rounded border text-[10px] font-semibold ${open || categoriesActive ? "bg-blue-50 border-blue-200 text-blue-700" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}>
          {open ? "−" : `${renderCategories.length}×`}
        </button>
      </div>
      {open && (
        <div className="absolute mt-1 right-3 z-10 w-[560px] bg-white border border-gray-300 rounded shadow-lg p-3">
          <div className="text-[10px] text-gray-500 italic mb-2">
            ISO Rule 26.B — categories sum to aggregate ({-aggMaxCredit}% to +{aggMaxDebit}% per bureau).
            {spec?.iso_rule_reference && <span className="ml-1">{spec.iso_rule_reference}</span>}
          </div>
          <div className="grid grid-cols-2 gap-2 mb-2">
            {renderCategories.map(({ code, label, domain_values, max_credit_pct, max_debit_pct }) => {
              const cat = cats.find(c => c.category_code === code);
              const useDropdown = Array.isArray(domain_values) && domain_values.length > 0;
              return (
                <div key={code}>
                  <label className="block text-[10px] text-gray-500 mb-0.5">
                    {label} <span className="text-gray-400">±{max_credit_pct}%</span>
                  </label>
                  {useDropdown ? (
                    <select
                      className="w-full bg-white border border-gray-300 rounded px-2 py-1 text-xs"
                      value={cat?.applied_pct ?? 0}
                      onChange={e => setCategoryPct(code, e.target.value)}>
                      {domain_values.map(v => (
                        <option key={v} value={v}>{v > 0 ? `+${v}` : v}%</option>
                      ))}
                    </select>
                  ) : (
                    <input type="number" step="1" min={-max_credit_pct} max={max_debit_pct}
                      className="w-full bg-white border border-gray-300 rounded px-2 py-1 text-xs"
                      value={cat ? cat.applied_pct : ""}
                      placeholder="0"
                      onChange={e => setCategoryPct(code, e.target.value)} />
                  )}
                </div>
              );
            })}
          </div>
          {cats.filter(c => (parseFloat(c.applied_pct) || 0) !== 0).length > 0 && (
            <div className="border-t border-gray-100 pt-2">
              <div className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide mb-1">
                Justification (compliance-defensible)
              </div>
              <div className="space-y-1.5">
                {cats.filter(c => (parseFloat(c.applied_pct) || 0) !== 0).map(c => {
                  const label = SCHEDULE_RATING_CATEGORIES.find(x => x.code === c.category_code)?.label || c.category_code;
                  const pct = parseFloat(c.applied_pct) || 0;
                  const sign = pct > 0 ? "+" : "";
                  return (
                    <div key={c.category_code}>
                      <label className="block text-[10px] text-gray-500 mb-0.5">
                        {label} <span className="font-mono">{sign}{pct}%</span>
                      </label>
                      <textarea rows={2}
                        className="w-full bg-white border border-gray-300 rounded px-2 py-1 text-xs"
                        placeholder="UW reasoning — DOI examiner reads this"
                        value={c.justification_narrative || ""}
                        onChange={e => setCategoryJustification(c.category_code, e.target.value)} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LiveLeversPanel({ result, reRating, onLiveUpdate, spec }) {
  const quote = result?.quote;
  const rating = result?.rating;
  // Pull the current limits / mod / first-class deductible from the latest rate response.
  // After a PATCH, result is replaced so these stay in sync.
  const occ = quote?.normalized_input?.each_occurrence_limit;  // may be null if not surfaced
  // We'll show what the rate response carried, falling back to current rating input
  const firstCls = rating?.classifications?.[0];
  const firstSub = firstCls?.sublines?.PremOps ?? firstCls?.sublines?.ProdsCompldOps;

  // Use local state to render fast UI, then push debounced
  const initial = {
    state_code: "AL",
    policy_effective_date: "2026-01-01",
    each_occurrence_limit: "1,000,000 CSL",
    general_aggregate_limit: "2,000,000 CSL",
    schedule_mod_applies: "No",
    schedule_mod_pct: 0,
    // ISO Rule 26 — per-category modifications. Each row: {category_code, applied_pct, justification_narrative?}
    schedule_mod_categories: [],
    premops_deductible: "No Deductible",
    premops_deductible_basis: "CSL",
  };
  const [vals, setVals] = useState(initial);
  // Populate from rating step trace where possible
  useEffect(() => {
    if (!rating) return;
    const po1 = (firstCls?.step_trace || []).find(s => s.step_id === "PO-1");
    const pl0 = (firstCls?.step_trace || []).find(s => s.step_id === "PL-0");
    const po4 = (firstCls?.step_trace || []).find(s => s.step_id === "PO-4");
    const next = { ...vals };
    if (po1?.lookup_keys?.StateCode) next.state_code = po1.lookup_keys.StateCode;
    if (quote?.policy_expiration_date) {
      // policy_effective_date = expiration - 365d (best-effort recovery)
      // simpler: pull from any step's edition context if present
    }
    if (po4?.lookup_keys?.EachOccurrenceLimit) next.each_occurrence_limit = po4.lookup_keys.EachOccurrenceLimit;
    if (po4?.lookup_keys?.GeneralAggregateLimit) next.general_aggregate_limit = po4.lookup_keys.GeneralAggregateLimit;
    const po6 = (firstCls?.step_trace || []).find(s => s.step_id === "PO-6");
    if (po6?.lookup_keys?.PremOpsDed) next.premops_deductible = po6.lookup_keys.PremOpsDed;
    if (po6?.lookup_keys?.basis) next.premops_deductible_basis = po6.lookup_keys.basis;
    const adj = (quote?.premium_summary?.adjustments || []).find(a => /Schedule/i.test(a.label));
    if (adj) {
      next.schedule_mod_applies = "Yes";
      const m = adj.label.match(/([-+]?\d+(\.\d+)?)/);
      if (m) next.schedule_mod_pct = parseFloat(m[1]);
    }
    setVals(next);
  }, [result]);  // eslint-disable-line react-hooks/exhaustive-deps

  function update(field, value, isClass = false) {
    setVals(v => ({ ...v, [field]: value }));
    if (isClass) {
      onLiveUpdate({
        class_updates: [{ location_index: 0, classification_index: 0, key: field, value }],
      });
    } else {
      onLiveUpdate({ fields: { [field]: value } });
    }
  }

  const totalPremium = quote?.premium_summary?.total_premium;

  return (
    <Panel title="Live Rating Levers" className="mb-4">
      <div className="flex items-baseline justify-between mb-2 gap-3">
        <div className="text-[11px] text-gray-500">
          Edit a lever; premium updates in ~350ms without leaving this screen. No round-trip to Screen 3.
        </div>
        <div className="flex items-baseline gap-3">
          {reRating && <span className="text-xs text-blue-600 animate-pulse">re-rating…</span>}
          <span className="font-mono text-emerald-700 text-lg font-bold">
            {typeof totalPremium === "number"
              ? `$${totalPremium.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : "—"}
          </span>
        </div>
      </div>
      <div className="grid grid-cols-6 gap-2 text-xs">
        <div className="col-span-1">
          <label className="block text-gray-500 mb-0.5">State</label>
          <select className="w-full bg-white border border-gray-300 rounded px-2 py-1"
            value={vals.state_code}
            onChange={e => update("state_code", e.target.value)}>
            {STATE_CODES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label className="block text-gray-500 mb-0.5">Effective Date</label>
          <input type="date" className="w-full bg-white border border-gray-300 rounded px-2 py-1"
            value={vals.policy_effective_date}
            onChange={e => update("policy_effective_date", e.target.value)} />
        </div>
        <div className="col-span-3"></div>
        <div className="col-span-2">
          <label className="block text-gray-500 mb-0.5">Each Occurrence Limit</label>
          <select className="w-full bg-white border border-gray-300 rounded px-2 py-1"
            value={vals.each_occurrence_limit}
            onChange={e => update("each_occurrence_limit", e.target.value)}>
            {LIMITS.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label className="block text-gray-500 mb-0.5">General Aggregate</label>
          <select className="w-full bg-white border border-gray-300 rounded px-2 py-1"
            value={vals.general_aggregate_limit}
            onChange={e => update("general_aggregate_limit", e.target.value)}>
            {AGGS.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div className="col-span-2 relative">
          <ScheduleModLeverInline vals={vals} setVals={setVals} onLiveUpdate={onLiveUpdate} spec={spec} />
        </div>
        <div className="col-span-3">
          <label className="block text-gray-500 mb-0.5">PremOps Deductible (Class 1)</label>
          <select className="w-full bg-white border border-gray-300 rounded px-2 py-1"
            value={vals.premops_deductible}
            onChange={e => update("premops_deductible", e.target.value, true)}>
            {DEDS.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div className="col-span-3">
          <label className="block text-gray-500 mb-0.5">Deductible Basis</label>
          <select className="w-full bg-white border border-gray-300 rounded px-2 py-1"
            value={vals.premops_deductible_basis}
            disabled={vals.premops_deductible === "No Deductible"}
            onChange={e => update("premops_deductible_basis", e.target.value, true)}>
            {BASES.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
      </div>
    </Panel>
  );
}

// ── Premium Breakout panel ─────────────────────────────────────────────────────
function PremiumBreakoutPanel({ rating, quote }) {
  if (!rating || !quote) return null;
  const summary = quote.premium_summary || {};
  const bySub = summary.by_subline || {};
  const adjustments = summary.adjustments || [];
  const flatFees = quote.flat_fees_applied || [];
  const subtotal = summary.subtotal ?? Object.values(bySub).reduce((s, v) => s + v, 0);
  const total = summary.total_premium ?? 0;

  // Build subline-level steps from each classification's trace
  const sublineSteps = {};
  for (const cls of rating.classifications || []) {
    for (const [sub, data] of Object.entries(cls.sublines || {})) {
      if (!sublineSteps[sub]) sublineSteps[sub] = [];
      sublineSteps[sub].push({
        class_code: cls.class_code,
        bureau_lc: data.bureau_loss_cost,
        lcm: data.lcm,
        rated_lc: data.rated_loss_cost,
        ilta: data.ilta,
        ilf: data.ilf,
        ded_factor: data.ded_factor || 0,
        adjusted_ilf: data.adjusted_ilf ?? data.ilf,
        exposure: data.exposure,
        exposure_unit: data.exposure_unit,
        base_premium_at_ilf: data.base_premium_at_ilf,
        base_premium: data.base_premium,
        ded_credit: data.ded_credit,
        elp_premium: data.elp_premium,
        med_pay_premium: data.med_pay_premium,
        pkg: data.modifiers?.package,
        final: data.final_premium,
      });
    }
  }

  return (
    <Panel title="Premium Breakout — every dollar mapped to ERC source" className="mb-4">
      <div className="text-xs space-y-4">
        {Object.entries(sublineSteps).map(([sub, rows]) => (
          <div key={sub}>
            <div className="text-gray-600 font-semibold mb-1 uppercase tracking-wide">{sub}</div>
            <div className="border border-gray-200 rounded overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="text-left px-2 py-1">Class</th>
                    <th className="text-right px-2 py-1" title="Bureau Loss Cost from ERC">Bureau LC</th>
                    <th className="text-right px-2 py-1" title="Paper Company LCM (deviation)">× LCM</th>
                    <th className="text-right px-2 py-1" title="ILTA × ILF for selected limits">× ILF</th>
                    <th className="text-right px-2 py-1" title="Adjusted ILF = ILF − deductible factor (CLM Rule 15)">Adj ILF</th>
                    <th className="text-right px-2 py-1">Exposure</th>
                    <th className="text-right px-2 py-1">Base $</th>
                    <th className="text-right px-2 py-1" title="Display: base_at_ILF − base_at_adjusted_ILF">Ded Credit</th>
                    <th className="text-right px-2 py-1">× Pkg</th>
                    <th className="text-right px-2 py-1 font-semibold">Final</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-t border-gray-100">
                      <td className="px-2 py-1 font-mono text-blue-600">{r.class_code}</td>
                      <td className="px-2 py-1 text-right font-mono">{r.bureau_lc}</td>
                      <td className="px-2 py-1 text-right font-mono text-amber-600">{r.lcm}</td>
                      <td className="px-2 py-1 text-right font-mono">{r.ilta}/{r.ilf}</td>
                      <td className="px-2 py-1 text-right font-mono text-blue-600" title={r.ded_factor > 0 ? `${r.ilf} − ${r.ded_factor} = ${r.adjusted_ilf}` : "no deductible"}>
                        {r.ded_factor > 0 ? r.adjusted_ilf : "—"}
                      </td>
                      <td className="px-2 py-1 text-right font-mono text-gray-500">
                        {r.exposure?.toLocaleString()}/{r.exposure_unit}
                      </td>
                      <td className="px-2 py-1 text-right font-mono">{currency(r.base_premium)}</td>
                      <td className="px-2 py-1 text-right font-mono text-blue-600">
                        {r.ded_credit > 0 ? `-${currency(r.ded_credit)}` : "—"}
                      </td>
                      <td className="px-2 py-1 text-right font-mono">×{r.pkg ?? 1}</td>
                      <td className="px-2 py-1 text-right font-mono text-emerald-600 font-semibold">
                        {currency(r.final)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}

        <div className="border-t border-gray-200 pt-2">
          <div className="grid grid-cols-2 gap-1">
            {Object.entries(bySub).map(([k, v]) => (
              <div key={k} className="flex justify-between text-gray-700">
                <span className="text-gray-500">{k} subtotal</span>
                <span className="font-mono">{currency(v)}</span>
              </div>
            ))}
            <div className="flex justify-between text-gray-700 font-semibold col-span-2 pt-1 border-t border-gray-100">
              <span>Subtotal</span><span className="font-mono">{currency(subtotal)}</span>
            </div>
            {adjustments.map((a, i) => (
              <div key={i} className="flex justify-between text-amber-700">
                <span>{a.label}</span>
                <span className="font-mono">{currency(a.amount)}</span>
              </div>
            ))}
            {flatFees.map((f, i) => (
              <div key={i} className="flex justify-between text-emerald-700">
                <span>{f.form_code} — {f.form_name} ({f.fee_basis})</span>
                <span className="font-mono">{currency(f.applied_amount)}</span>
              </div>
            ))}
            <div className="flex justify-between text-emerald-700 font-bold text-sm col-span-2 pt-1 border-t border-gray-200">
              <span>Total Premium</span><span className="font-mono">{currency(total)}</span>
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}

// ── Defensible Narrative card ──────────────────────────────────────────────────
function NarrativePanel({ rating, quote, determination }) {
  const [copied, setCopied] = useState(false);
  if (!rating || !quote) return null;

  const lines = [];
  const summary = quote.premium_summary || {};
  lines.push(`Quote: ${quote.quote_id ?? ""}  |  Total Premium: ${currency(summary.total_premium)}`);
  lines.push(`Edition: ${quote.edition_id ?? quote.edition_label ?? ""}`);
  lines.push("");
  for (const cls of rating.classifications || []) {
    lines.push(`Class ${cls.class_code}${cls.class_description ? " — " + cls.class_description : ""}: ${currency(cls.classification_total)}`);
    for (const [sub, d] of Object.entries(cls.sublines || {})) {
      const parts = [];
      parts.push(`bureau LC ${d.bureau_loss_cost}`);
      if (d.lcm !== 1.0) parts.push(`× carrier LCM ${d.lcm}`);
      if (d.ded_factor && d.ded_factor > 0) {
        parts.push(`× Adjusted ILF (Rule 15: ${d.ilf} − ${d.ded_factor} = ${d.adjusted_ilf}, ILTA ${d.ilta})`);
      } else {
        parts.push(`× ILF ${d.ilf} (ILTA ${d.ilta})`);
      }
      parts.push(`× exposure ${d.exposure?.toLocaleString()}/${d.exposure_unit}`);
      if (d.modifiers?.package && d.modifiers.package !== 1) parts.push(`× pkg mod ${d.modifiers.package}`);
      lines.push(`  ${sub}: ${parts.join(" ")} = ${currency(d.final_premium)}`);
    }
  }
  const adjustments = summary.adjustments || [];
  if (adjustments.length) {
    lines.push("");
    lines.push("Adjustments:");
    for (const a of adjustments) lines.push(`  ${a.label}: ${currency(a.amount)}`);
  }
  if (determination?.summary) {
    lines.push("");
    const s = determination.summary;
    lines.push(`Forms: ${s.attached_conditional_count} conditional attached, ${s.eligible_optional_count} optional eligible, ${s.not_attached_conditional_count} conditional evaluated and not attached.`);
  }
  const selectedAI = (determination?.selected_optional_forms || []).filter(f => f.condition_detail?.rule_16);
  if (selectedAI.length) {
    lines.push("");
    lines.push(`Additional Insureds (Rule 16) — ${selectedAI.length} scheduled:`);
    for (const f of selectedAI) {
      for (const ai of (f.condition_detail?.ai_schedule || [])) {
        const tag = ai.charge_category === "refer" ? " [REFER]" : "";
        lines.push(`  ${f.form_number}: ${ai.name}${tag}`);
      }
    }
  }
  const text = lines.join("\n");

  function onCopy() {
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Panel title="Defensible Premium Narrative — paste into broker email" className="mb-4">
      <pre className="bg-gray-50 border border-gray-200 rounded p-3 text-xs text-gray-700 font-mono whitespace-pre-wrap overflow-x-auto">{text}</pre>
      <button onClick={onCopy}
        className="mt-2 bg-gray-100 hover:bg-gray-200 border border-gray-300 text-gray-700 px-3 py-1 rounded text-xs font-medium">
        {copied ? "✓ Copied" : "Copy to clipboard"}
      </button>
    </Panel>
  );
}

function FormRow({ f, sourceBadge = true }) {
  const detail = f.condition_detail;
  const reason = detail?.source === "table_name"
    ? `${detail.clauses?.[0]?.signal} → ${detail.clauses?.[0]?.expected}`
    : detail?.source === "parsed"
      ? (f.condition_raw || "").slice(0, 60)
      : detail?.source === "empty"
        ? "default-attach (no condition)"
        : "";
  return (
    <div className="flex items-baseline gap-2 text-xs py-0.5">
      <span className="font-mono text-gray-500 w-32 shrink-0">{f.form_number || "—"}</span>
      <span className="text-gray-700 flex-1 truncate" title={f.form_name}>{f.form_name}</span>
      {reason && <span className="text-gray-400 truncate max-w-xs" title={reason}>{reason}</span>}
      {sourceBadge && f.source === "cw" && (
        <span className="text-[10px] text-gray-400 font-mono uppercase">CW</span>
      )}
    </div>
  );
}

function FormSelectionPanel({
  determination, selectedOptional, newFormAcks, formsConfirmed, confirming,
  onToggleOptional, onToggleAck, onConfirm,
}) {
  const [showNotAttached, setShowNotAttached] = useState(false);
  const mandatory = determination.mandatory_forms || [];
  const attachedConditional = determination.attached_conditional_forms || [];
  const notAttachedConditional = determination.not_attached_conditional_forms || [];
  const optional = determination.eligible_optional_forms || [];
  const selectedOptionalForms = determination.selected_optional_forms || [];
  const scheduledAIs = selectedOptionalForms.filter(f => f.condition_detail?.rule_16);
  const otherSelected = selectedOptionalForms.filter(f => !f.condition_detail?.rule_16);
  const newForms = determination.new_forms_requiring_confirmation || [];
  const allNewAcked = newForms.every(f => newFormAcks.includes(f.form_number));

  return (
    <Panel title="Form Selection" className="mb-4">
      <div className="space-y-4 text-xs">
        {(mandatory.length + attachedConditional.length) > 0 && (
          <div>
            <div className="text-emerald-700 mb-1 font-semibold">
              Mandatory &amp; Conditional ({mandatory.length + attachedConditional.length})
            </div>
            {mandatory.map((f, i) => <FormRow key={`m${i}`} f={f} />)}
            {attachedConditional.map((f, i) => <FormRow key={`c${i}`} f={f} />)}
          </div>
        )}

        {notAttachedConditional.length > 0 && (
          <div>
            <button onClick={() => setShowNotAttached(s => !s)}
              className="text-gray-500 hover:text-gray-700 mb-1 font-medium">
              {showNotAttached ? "▼" : "▶"} Evaluated &amp; not attached ({notAttachedConditional.length})
            </button>
            {showNotAttached && (
              <div className="pl-4 opacity-70">
                {notAttachedConditional.map((f, i) => <FormRow key={`na${i}`} f={f} />)}
              </div>
            )}
          </div>
        )}

        {scheduledAIs.length > 0 && (
          <div className="bg-teal-50 border border-teal-200 rounded p-2">
            <div className="text-teal-800 mb-1 font-semibold">
              Scheduled Additional Insureds (Rule 16) — {scheduledAIs.length} form(s)
            </div>
            <div className="text-teal-700 text-[11px] mb-1">
              Added on Screen 3. These remain attached to the policy.
            </div>
            {scheduledAIs.map((f, i) => {
              const schedule = f.condition_detail?.ai_schedule || [];
              return (
                <div key={i} className="py-1 border-t border-teal-100 first:border-t-0">
                  <div className="flex items-baseline gap-2 text-teal-900">
                    <span className="font-mono text-teal-700 w-32 shrink-0">{f.form_number}</span>
                    <span className="truncate font-medium" title={f.form_name}>{f.form_name}</span>
                  </div>
                  {schedule.map((ai, j) => (
                    <div key={j} className="ml-32 text-[11px] text-teal-800">
                      • <span className="font-medium">{ai.name}</span>
                      {ai.address && <span className="text-teal-600"> — {ai.address}</span>}
                      {ai.charge_category === "refer" && (
                        <span className="ml-1 text-amber-700 font-semibold">[REFER — Rule 16.B]</span>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {otherSelected.length > 0 && (
          <div>
            <div className="text-gray-500 mb-1 font-medium">Selected Optional ({otherSelected.length})</div>
            {otherSelected.map((f, i) => (
              <div key={i} className="flex items-baseline gap-2 text-gray-700 py-0.5">
                <span className="font-mono text-gray-500 w-32 shrink-0">{f.form_number || "—"}</span>
                <span className="truncate" title={f.form_name}>{f.form_name}</span>
              </div>
            ))}
          </div>
        )}

        {optional.length > 0 && (
          <div>
            <div className="text-gray-500 mb-1 font-medium">Optional ({optional.length}) — select to include</div>
            <div className="max-h-64 overflow-auto border border-gray-100 rounded p-2 bg-gray-50">
              {optional.map((f, i) => (
                <label key={i} className="flex items-baseline gap-2 text-gray-700 cursor-pointer py-0.5 hover:bg-white px-1 rounded">
                  <input
                    type="checkbox"
                    checked={selectedOptional.includes(f.form_number)}
                    onChange={() => onToggleOptional(f.form_number)}
                    className="accent-blue-600 mt-1"
                    disabled={formsConfirmed}
                  />
                  <span className="font-mono text-gray-500 w-32 shrink-0">{f.form_number || "—"}</span>
                  <span className="truncate" title={f.form_name}>{f.form_name}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {newForms.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded p-2">
            <div className="text-amber-700 mb-1 font-semibold">New forms requiring carrier-template confirmation ({newForms.length})</div>
            {newForms.map((f, i) => (
              <label key={i} className="flex items-baseline gap-2 text-amber-800 cursor-pointer py-0.5">
                <input
                  type="checkbox"
                  checked={newFormAcks.includes(f.form_number)}
                  onChange={() => onToggleAck(f.form_number)}
                  className="accent-amber-600 mt-1"
                  disabled={formsConfirmed}
                />
                <span className="font-mono w-32 shrink-0">{f.form_number}</span>
                <span>I confirm carrier template is available for {f.form_name}</span>
              </label>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
          {formsConfirmed ? (
            <span className="text-emerald-700 text-xs font-semibold">✓ Forms confirmed — proceed to bind</span>
          ) : (
            <button
              onClick={onConfirm}
              disabled={confirming || !allNewAcked}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-1.5 rounded text-xs font-semibold"
            >
              {confirming ? "Confirming…" : "Confirm Forms & Proceed to Bind"}
            </button>
          )}
          {!allNewAcked && !formsConfirmed && (
            <span className="text-amber-700 text-xs">All new-form carrier templates must be acknowledged first</span>
          )}
        </div>
      </div>
    </Panel>
  );
}

const ATTACH_REASON_BADGES = {
  MANDATORY_BASE:      { label: "Mandatory",        color: "bg-gray-200 text-gray-700" },
  COVERAGE_TRIGGERED:  { label: "Coverage-triggered", color: "bg-blue-100 text-blue-700" },
  UW_SCHEDULED:        { label: "UW-scheduled",     color: "bg-emerald-100 text-emerald-700" },
  OPTIONAL_SELECTED:   { label: "Optional",         color: "bg-emerald-100 text-emerald-700" },
  STATE_AMENDATORY:    { label: "State amendatory", color: "bg-amber-100 text-amber-700" },
  DEVIATION_TRIGGERED: { label: "Deviation",        color: "bg-purple-100 text-purple-700" },
};

const SURFACE_TRIGGER_HINTS = {
  uw_scope:          "You added this form (Rule 16 schedule or optional selection)",
  unfilled_required: "Auto-surfaced — has a policy-required field that isn't filled yet",
  scope_all:         "Showing all attached forms (override mode)",
  reason_filter:     "Filtered to this attach reason",
};

function AttachReasonBadge({ reason }) {
  const b = ATTACH_REASON_BADGES[reason];
  if (!b) return null;
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${b.color}`}>{b.label}</span>;
}

function FormFieldsPanel({ quoteId, onSaved }) {
  const [scopeMode, setScopeMode] = useState("auto_surface");
  const [data, setData] = useState(null);
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);
  const [missing, setMissing] = useState([]);
  const [error, setError] = useState(null);
  const [hiddenExpanded, setHiddenExpanded] = useState(false);

  useEffect(() => {
    phaseC.getFormFields(quoteId, scopeMode)
      .then(r => { setData(r); setValues(prev => ({ ...(r.current_values || {}), ...prev })); })
      .catch(e => setError(e.message));
  }, [quoteId, scopeMode]);

  if (error) return <Panel title="Form Data"><div className="text-red-600 text-xs">{error}</div></Panel>;
  if (!data) return <Panel title="Form Data"><div className="text-gray-400 text-xs">Loading…</div></Panel>;

  const groups = [...(data.quote_required_fields || []), ...(data.policy_only_fields || [])];
  const hiddenForms = data.hidden_forms || [];
  const hiddenFieldCount = data.hidden_field_count || 0;

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const r = await phaseC.saveFormFields(quoteId, values);
      setMissing(r.missing_required || []);
      onSaved?.(r.missing_required?.length === 0);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const headerSubtitle = scopeMode === "all"
    ? `${groups.length} forms · showing all attached`
    : scopeMode === "uw_scope"
    ? `${groups.length} forms · only forms you added (${hiddenFieldCount} other fields hidden)`
    : `${groups.length} forms · UW-scheduled + auto-surfaced (${hiddenFieldCount} other fields hidden)`;

  return (
    <Panel title="Form Data" className="mb-4">
      <div className="flex items-center justify-between mb-3 text-xs">
        <div className="text-gray-500">{headerSubtitle}</div>
        <div className="flex items-center gap-2">
          <span className="text-gray-400">Scope:</span>
          {[
            { id: "uw_scope",     label: "Only my forms" },
            { id: "auto_surface", label: "Auto-surface" },
            { id: "all",          label: "Show all" },
          ].map(opt => (
            <button key={opt.id} onClick={() => setScopeMode(opt.id)}
              className={`px-2 py-0.5 rounded text-[11px] font-medium border ${
                scopeMode === opt.id
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
              }`}>{opt.label}</button>
          ))}
        </div>
      </div>

      <div className="space-y-4 text-xs">
        {groups.length === 0 ? (
          <div className="text-gray-400 text-xs italic">
            No form fields require UW input under this scope. Switch to "Show all" to inspect every attached form.
          </div>
        ) : groups.map((g, gi) => (
          <div key={gi}>
            <div className="flex items-center gap-2 mb-2">
              <span className="font-mono text-gray-500">{g.form_number || "—"}</span>
              <span className="text-gray-700 font-semibold">{g.form_name}</span>
              <AttachReasonBadge reason={g.attach_reason} />
              {g.surface_trigger && SURFACE_TRIGGER_HINTS[g.surface_trigger] && (
                <span className="text-[10px] text-gray-400 italic" title={SURFACE_TRIGGER_HINTS[g.surface_trigger]}>
                  · {g.surface_trigger === "unfilled_required" ? "needs your input" : ""}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {g.fields.map((f, fi) => (
                <div key={fi}>
                  <label className="block text-xs text-gray-500 mb-0.5" title={f.help_text}>
                    {f.label} {f.required && <span className="text-red-500">*</span>}
                  </label>
                  {(f.field_type === "SELECT" || f.domain_table_name === "DomainYesNo") ? (
                    <select className="w-full bg-white border border-gray-300 rounded px-2 py-1 text-sm"
                      value={values[f.column_name] || ""}
                      onChange={e => setValues(v => ({ ...v, [f.column_name]: e.target.value }))}>
                      <option value="">—</option>
                      <option>Yes</option><option>No</option>
                    </select>
                  ) : f.field_type === "DATE" ? (
                    <input type="date" className="w-full bg-white border border-gray-300 rounded px-2 py-1 text-sm"
                      value={values[f.column_name] || ""}
                      onChange={e => setValues(v => ({ ...v, [f.column_name]: e.target.value }))} />
                  ) : f.field_type === "NUMBER" ? (
                    <input type="number" className="w-full bg-white border border-gray-300 rounded px-2 py-1 text-sm"
                      value={values[f.column_name] || ""}
                      onChange={e => setValues(v => ({ ...v, [f.column_name]: e.target.value }))} />
                  ) : (
                    <input className="w-full bg-white border border-gray-300 rounded px-2 py-1 text-sm"
                      value={values[f.column_name] || ""}
                      onChange={e => setValues(v => ({ ...v, [f.column_name]: e.target.value }))} />
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        {hiddenForms.length > 0 && (
          <div className="border-t border-gray-200 pt-3">
            <button onClick={() => setHiddenExpanded(x => !x)}
              className="text-[11px] text-gray-500 hover:text-gray-700 font-medium">
              {hiddenExpanded ? "▼" : "▶"} {hiddenForms.length} other form{hiddenForms.length === 1 ? "" : "s"} auto-populated ({hiddenFieldCount} fields)
            </button>
            {hiddenExpanded && (
              <div className="mt-2 max-h-48 overflow-y-auto bg-gray-50 border border-gray-200 rounded px-3 py-2 space-y-1">
                {hiddenForms.map((h, i) => (
                  <div key={i} className="flex items-center gap-2 text-[11px]">
                    <span className="font-mono text-gray-500 w-24 truncate">{h.form_number || "—"}</span>
                    <span className="text-gray-700 flex-1 truncate">{h.form_name}</span>
                    <AttachReasonBadge reason={h.attach_reason} />
                    <span className="text-gray-400 tabular-nums">{h.field_count}f</span>
                    {h.required_field_count > 0 && (
                      <span className="text-amber-600 tabular-nums" title="policy-required fields">
                        {h.required_field_count}!
                      </span>
                    )}
                  </div>
                ))}
                <div className="text-[10px] text-gray-400 italic pt-1">
                  Hidden fields still validate at bind and are persisted to the audit package.
                </div>
              </div>
            )}
          </div>
        )}

        {missing.length > 0 && (
          <div className="text-red-600 text-xs bg-red-50 border border-red-200 rounded px-2 py-2 space-y-1">
            <div className="font-semibold">Missing required fields ({missing.length}):</div>
            {missing.slice(0, 6).map((m, i) => (
              <div key={i} className="flex items-center gap-2 text-[11px]">
                <span className="font-mono text-red-500 w-20 truncate">{m.form_number || "—"}</span>
                <span className="truncate">{m.label}</span>
                {m.attach_reason && <AttachReasonBadge reason={m.attach_reason} />}
              </div>
            ))}
            {missing.length > 6 && (
              <div className="text-[10px] italic">…and {missing.length - 6} more. Switch to "Show all" to review.</div>
            )}
          </div>
        )}
        <button onClick={handleSave} disabled={saving}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white px-4 py-1.5 rounded text-xs font-semibold">
          {saving ? "Saving…" : "Save Form Data"}
        </button>
      </div>
    </Panel>
  );
}

function ClassificationCard({ cls }) {
  const [expanded, setExpanded] = useState(false);
  const [traceOpen, setTraceOpen] = useState(false);

  return (
    <div className="border border-gray-200 rounded overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 text-left transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="font-mono text-gray-800 text-sm font-semibold">{cls.class_code}</span>
          {cls.class_description && (
            <span className="text-gray-500 text-xs">{cls.class_description}</span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span className="font-mono text-emerald-600 font-semibold">{currency(cls.classification_total)}</span>
          <span className="text-gray-400 text-xs">{expanded ? "▲" : "▼"}</span>
        </div>
      </button>

      {expanded && (
        <div className="px-4 py-3 bg-white space-y-4 border-t border-gray-100">
          {Object.entries(cls.sublines || {}).map(([subline, data]) => {
            const prefix = subline === "PremOps" ? "PO" : "PR";
            const tierStep = cls.step_trace?.find(s => s.step_id === `${prefix}-2B`);
            return (
              <div key={subline}>
                <div className="text-xs text-gray-500 font-semibold mb-2 uppercase tracking-wide">{subline}</div>
                <div className="grid grid-cols-4 gap-2 text-xs mb-2">
                  <div className="bg-gray-50 border border-gray-100 rounded p-2">
                    <div className="text-gray-500">Bureau LC</div>
                    <div className="font-mono text-gray-800">{data.bureau_loss_cost}</div>
                  </div>
                  {data.lcm !== 1.0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded p-2">
                      <div className="text-amber-600 font-medium">LCM</div>
                      <div className="font-mono text-amber-700">×{data.lcm} = {data.rated_loss_cost}</div>
                    </div>
                  )}
                  {tierStep && (
                    <div className="bg-amber-50 border border-amber-200 rounded p-2">
                      <div className="text-amber-600 font-medium">Tier Factor</div>
                      <div className="font-mono text-amber-700 text-[10px]">
                        {tierStep.lookup_keys?.v1_band} yrs / {tierStep.lookup_keys?.v2_band} claims → {tierStep.result_value}×
                      </div>
                    </div>
                  )}
                  <div className="bg-gray-50 border border-gray-100 rounded p-2">
                    <div className="text-gray-500">ILTA → ILF</div>
                    <div className="font-mono text-gray-800">{data.ilta} → {data.ilf}</div>
                  </div>
                  <div className="bg-gray-50 border border-gray-100 rounded p-2">
                    <div className="text-gray-500">Exposure</div>
                    <div className="font-mono text-gray-800">
                      {data.exposure?.toLocaleString()} / {data.exposure_unit}
                    </div>
                  </div>
                </div>
                <div className="flex items-center flex-wrap gap-4 text-xs border-t border-gray-100 pt-2">
                  <div>
                    <span className="text-gray-500">Base: </span>
                    <span className="font-mono text-gray-700">{currency(data.base_premium)}</span>
                  </div>
                  {data.ded_credit > 0 && (
                    <div>
                      <span className="text-gray-500">Ded credit: </span>
                      <span className="font-mono text-blue-600">-{currency(data.ded_credit)}</span>
                    </div>
                  )}
                  {data.elp_rate > 0 && (
                    <div>
                      <span className="text-gray-500">ELP: </span>
                      <span className="font-mono text-gray-700">{currency(data.elp_premium)}</span>
                    </div>
                  )}
                  {data.med_pay_premium > 0 && (
                    <div>
                      <span className="text-gray-500">Med Pay: </span>
                      <span className="font-mono text-gray-700">{currency(data.med_pay_premium)}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-gray-500">Pkg mod: </span>
                    <span className="font-mono text-gray-700">×{data.modifiers?.package}</span>
                  </div>
                  <div className="ml-auto">
                    <span className="text-gray-500">Final: </span>
                    <span className="font-mono text-emerald-600 font-semibold">{currency(data.final_premium)}</span>
                  </div>
                </div>
              </div>
            );
          })}

          {cls.step_trace?.length > 0 && (
            <div>
              <button onClick={() => setTraceOpen(t => !t)}
                className="text-xs text-blue-600 hover:text-blue-800 underline">
                {traceOpen ? "Collapse" : "Expand"} lookup trace ({cls.step_trace.length} steps)
              </button>
              {traceOpen && (
                <div className="mt-2 bg-gray-50 border border-gray-200 rounded p-3 space-y-0.5 max-h-64 overflow-auto">
                  {cls.step_trace.map((s, i) => <StepRow key={i} step={s} />)}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Screen4_RatingWorkbench({ quoteId, onBound }) {
  const [result, setResult] = useState(null);
  const [prevResult, setPrevResult] = useState(null);  // F5.5 diff source
  const [diffDismissed, setDiffDismissed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reRating, setReRating] = useState(false);
  const [reRateError, setReRateError] = useState(null);
  const [binding, setBinding] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [formsConfirmed, setFormsConfirmed] = useState(false);
  const [error, setError] = useState(null);
  const [selectedOptional, setSelectedOptional] = useState([]);
  const [newFormAcks, setNewFormAcks] = useState([]);
  const [scheduleRatingSpec, setScheduleRatingSpec] = useState(null);

  useEffect(() => {
    if (!quoteId) return;
    setLoading(true);
    setSelectedOptional([]);
    setNewFormAcks([]);
    setFormsConfirmed(false);
    phaseC.rateQuote(quoteId)
      .then(setResult)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [quoteId]);

  // Re-fetch the Rule 26 spec when the underlying state or effective date
  // changes (e.g. user retrigers state via Live Levers). Errors silently
  // fall the lever back to the static category enum.
  useEffect(() => {
    const stateCode = result?.rating?.classifications?.[0]?.step_trace?.find(s => s.step_id === "PO-1")?.lookup_keys?.StateCode;
    const effDate = result?.quote?.policy_effective_date;
    if (!stateCode || !effDate) return;
    phaseC.scheduleRatingSpec(stateCode, effDate, "ACME")
      .then(setScheduleRatingSpec)
      .catch(() => setScheduleRatingSpec(null));
  }, [result]);

  // F5.1 — Live debounced re-rate. Caller passes a partial update {fields, class_updates}
  // and gets a new rate response in ~150ms. Debounce prevents thrashing on rapid edits.
  const reRateTimer = useRef(null);
  function liveUpdate(update) {
    if (!quoteId) return;
    if (reRateTimer.current) clearTimeout(reRateTimer.current);
    setReRating(true);
    reRateTimer.current = setTimeout(async () => {
      try {
        // Snapshot the current result BEFORE swapping so DiffBanner can compare.
        setPrevResult(result);
        setDiffDismissed(false);
        const r = await phaseC.liveUpdateQuote(quoteId, update.fields, update.class_updates);
        setResult(r);
        if (formsConfirmed) setFormsConfirmed(false);
        setReRateError(null);
      } catch (e) {
        setReRateError(e.message);
      } finally {
        setReRating(false);
      }
    }, 350);
  }

  function toggleOptional(formNumber) {
    setSelectedOptional(prev =>
      prev.includes(formNumber) ? prev.filter(f => f !== formNumber) : [...prev, formNumber]
    );
  }

  function toggleAck(formNumber) {
    setNewFormAcks(prev =>
      prev.includes(formNumber) ? prev.filter(f => f !== formNumber) : [...prev, formNumber]
    );
  }

  async function handleConfirmForms() {
    setConfirming(true);
    setError(null);
    try {
      await phaseC.selectForms(quoteId, selectedOptional, newFormAcks);
      setFormsConfirmed(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setConfirming(false);
    }
  }

  async function handleBind() {
    setBinding(true);
    try {
      const r = await phaseC.bindQuote(quoteId, "system", selectedOptional);
      onBound?.(r);
    } catch (e) {
      setError(e.message);
    } finally {
      setBinding(false);
    }
  }

  const rating = result?.rating;
  const quote = result?.quote;
  const summary = quote?.premium_summary;

  return (
    <div className="p-6 text-gray-900">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-2 h-2 rounded-full bg-purple-500" />
          <h1 className="text-xl font-semibold text-gray-900">Rating Workbench</h1>
          <Badge label="SCREEN 4" variant="INFO" />
          {quoteId && <span className="text-gray-400 font-mono text-xs">{quoteId}</span>}
        </div>
        <p className="text-gray-500 text-sm">Phase C · Classification Rating &amp; Premium Assembly</p>
      </div>

      {loading && <p className="text-gray-500 text-sm animate-pulse">Running rating engine…</p>}
      {error && (
        <div className="text-red-700 text-sm bg-red-50 border border-red-200 rounded px-3 py-2 mb-4">{error}</div>
      )}

      {result && !loading && (
        <LiveLeversPanel result={result} reRating={reRating} onLiveUpdate={liveUpdate} spec={scheduleRatingSpec} />
      )}

      {!diffDismissed && (
        <DiffBanner prev={prevResult} curr={result} onDismiss={() => setDiffDismissed(true)} />
      )}

      {reRateError && (
        <div className="mb-4 text-red-700 text-xs bg-red-50 border border-red-200 rounded px-3 py-2">
          Re-rate error: {reRateError}
        </div>
      )}

      {summary && (
        <div className="mb-4 grid grid-cols-4 gap-3">
          {Object.entries(summary.by_subline).map(([k, v]) => (
            <div key={k} className="bg-white border border-gray-200 rounded px-4 py-3 text-center shadow-sm">
              <div className="text-gray-500 text-xs">{k}</div>
              <div className="font-mono text-gray-900 text-lg font-semibold">{currency(v)}</div>
            </div>
          ))}
          {summary.adjustments?.map((a, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded px-4 py-3 text-center shadow-sm">
              <div className="text-gray-500 text-xs">{a.label}</div>
              <div className="font-mono text-amber-600 text-lg font-semibold">{currency(a.amount)}</div>
            </div>
          ))}
          <div className="bg-emerald-50 border border-emerald-200 rounded px-4 py-3 text-center shadow-sm">
            <div className="text-emerald-600 text-xs font-medium">Total Premium</div>
            <div className="font-mono text-emerald-700 text-2xl font-bold">{currency(summary.total_premium)}</div>
          </div>
        </div>
      )}

      {quote?.flat_fees_applied?.length > 0 && (
        <Panel title="Proprietary Form Fees" className="mb-4">
          <div className="space-y-1 text-xs">
            {quote.flat_fees_applied.map((fee, i) => (
              <div key={i} className="flex items-center justify-between py-1 border-b border-gray-100 last:border-0">
                <div>
                  <span className="font-mono text-green-700 font-semibold mr-2">{fee.form_code}</span>
                  <span className="text-gray-600">{fee.form_name}</span>
                  <span className="ml-2 text-gray-400">({fee.fee_basis})</span>
                </div>
                <span className="font-mono text-green-700 font-semibold">{currency(fee.applied_amount)}</span>
              </div>
            ))}
            <div className="flex justify-between pt-1 font-semibold text-green-700">
              <span>Paper Company Enhancements Total</span>
              <span className="font-mono">{currency(quote.flat_fees_applied.reduce((s, f) => s + (f.applied_amount || 0), 0))}</span>
            </div>
          </div>
        </Panel>
      )}

      {rating?.classifications?.length > 0 && (
        <Panel title="Classification Rating Breakdown" className="mb-4">
          <div className="space-y-2">
            {rating.classifications.map(cls => (
              <ClassificationCard key={cls.classification_id} cls={cls} />
            ))}
          </div>
        </Panel>
      )}

      {rating?.classifications?.length > 0 && (
        <PremiumBreakoutPanel rating={rating} quote={quote} />
      )}

      {rating?.classifications?.length > 0 && (
        <NarrativePanel rating={rating} quote={quote} determination={result?.form_determination} />
      )}

      {result?.form_determination && (
        <FormSelectionPanel
          determination={result.form_determination}
          selectedOptional={selectedOptional}
          newFormAcks={newFormAcks}
          formsConfirmed={formsConfirmed}
          confirming={confirming}
          onToggleOptional={toggleOptional}
          onToggleAck={toggleAck}
          onConfirm={handleConfirmForms}
        />
      )}

      {formsConfirmed && quoteId && <FormFieldsPanel quoteId={quoteId} />}

      {quote?.uw_referral?.required && (
        <div className="mb-4 text-amber-700 text-sm bg-amber-50 border border-amber-200 rounded px-4 py-3">
          <div className="font-semibold mb-1">UW Referral Required</div>
          <ul className="list-disc list-inside text-xs space-y-0.5">
            {quote.uw_referral.reasons.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}

      {result && !loading && (
        <div className="flex gap-3 items-center">
          <button
            onClick={handleBind}
            disabled={binding || quote?.uw_referral?.required || (!!result.form_determination && !formsConfirmed)}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-6 py-2 rounded text-sm font-semibold"
          >
            {binding ? "Binding…" : "Bind & Issue →"}
          </button>
          <button
            onClick={() => phaseC.downloadWorksheet(quoteId)}
            className="bg-white hover:bg-gray-100 border border-gray-300 text-gray-700 px-4 py-2 rounded text-sm font-medium"
            title="Download the Rating Worksheet PDF — works pre-bind so you can defend the indication before commit"
          >
            Download Worksheet (PDF)
          </button>
          {quote?.uw_referral?.required && (
            <span className="text-amber-600 text-xs self-center">UW approval required before bind</span>
          )}
          {!!result.form_determination && !formsConfirmed && !quote?.uw_referral?.required && (
            <span className="text-gray-500 text-xs self-center">Confirm forms in the panel above first</span>
          )}
        </div>
      )}
    </div>
  );
}
