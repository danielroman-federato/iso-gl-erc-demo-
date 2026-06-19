import { useState, useEffect, useRef } from "react";
import { phaseC, phaseB } from "../api/client";
import { Badge } from "../components/Badge";
import { Panel } from "../components/Panel";

// Fallback enum when the bureau spec hasn't loaded yet (initial render, no
// state/date chosen). Live behavior pulls the category list from the
// /schedule-rating-spec endpoint, which honors state overrides + CW fallback.
// Order matches the firing order of SetScheduleRatingModificationRatesandFactors
// in GeneralLiabilityRules.Rule.xml.
export const SCHEDULE_RATING_CATEGORIES = [
  { code: "LOCATION_EXPOSURE_INSIDE_PREMISES", label: "Location — Exposure inside premises" },
  { code: "LOCATION_EXPOSURE_OUTSIDE_PREMISES", label: "Location — Exposure outside premises" },
  { code: "PREMISES", label: "Premises — Condition and care" },
  { code: "EQUIPMENT", label: "Equipment — Type, condition, care" },
  { code: "CLASSIFICATION", label: "Classification — Peculiarities" },
  { code: "EMPLOYEES", label: "Employees" },
  { code: "COOPERATION_MEDICAL_FACILITIES", label: "Cooperation — Medical Facilities" },
  { code: "COOPERATION_SAFETY_PROGRAM", label: "Cooperation — Safety Program" },
];

// Derive aggregate from sum-of-categories. Returns rounded to 2 decimals.
export function sumScheduleCategories(cats) {
  return Math.round((cats || []).reduce((s, c) => s + (parseFloat(c.applied_pct) || 0), 0) * 100) / 100;
}

// Backwards-compat: the legacy 6-category list used MANAGEMENT (not in
// bureau) + collapsed Location/Cooperation. Re-map on read so old quotes
// keep rendering. MANAGEMENT entries get silently dropped.
const LEGACY_CATEGORY_REMAP = {
  MANAGEMENT: null,
  LOCATION: "LOCATION_EXPOSURE_INSIDE_PREMISES",
  CLASSIFICATION_PECULIARITIES: "CLASSIFICATION",
  COOPERATION: "COOPERATION_MEDICAL_FACILITIES",
};

export function canonicalizeCategoryCode(raw) {
  const code = (raw || "").toUpperCase().replace(/ /g, "_");
  if (code in LEGACY_CATEGORY_REMAP) return LEGACY_CATEGORY_REMAP[code];
  return code;
}

// F5.2 — Class code autocomplete with eligibility preview.
// Replaces the free-text class_code input; surfaces PremOps/Prods/RTC badges
// and auto-populates the default premium basis on selection.
function ClassCodeAutocomplete({ value, stateCode, className, onPick }) {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const timerRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    function onClickAway(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, []);

  function fetchSuggestions(q) {
    if (!q || q.length < 1) { setResults([]); return; }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await phaseC.searchClassCodes(q, stateCode, 12);
        setResults(r.results || []);
        setError(null);
      } catch (e) {
        setError(e.message);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 200);
  }

  function pick(r) {
    onPick({
      class_code: r.class_code,
      description: r.description || r.class_group,
      class_group: r.class_group,
      // Per-subline ERC bases (preferred); default_basis kept for backward compat
      premops_basis: r.premops_basis ?? r.default_basis,
      prods_basis: r.prods_basis ?? r.default_basis,
      premops_basis_raw: r.premops_basis_raw,
      prods_basis_raw: r.prods_basis_raw,
      basis_source: r.basis_source,
      has_premops: r.has_premops,
      has_prods: r.has_prods,
      has_rtc: r.has_rtc,
    });
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        className={className}
        value={value || ""}
        placeholder="code or description (e.g. 10010 or 'restaurant')"
        onFocus={() => { if (value) fetchSuggestions(value); setOpen(true); }}
        onChange={e => {
          const v = e.target.value;
          onPick({ class_code: v });
          fetchSuggestions(v);
          setOpen(true);
        }}
      />
      {open && (results.length > 0 || loading || error) && (
        <div className="absolute z-20 mt-0.5 w-[28rem] bg-white border border-gray-300 rounded shadow-lg max-h-80 overflow-auto text-xs">
          {loading && <div className="px-2 py-1 text-gray-400">searching…</div>}
          {error && <div className="px-2 py-1 text-red-600">{error}</div>}
          {!loading && !error && results.length === 0 && (
            <div className="px-2 py-1 text-gray-400">no matches in {stateCode || "(no state)"} bureau base</div>
          )}
          {results.map(r => (
            <button key={r.class_code}
              onMouseDown={e => { e.preventDefault(); pick(r); }}
              className="w-full text-left px-2 py-1.5 hover:bg-blue-50 border-b border-gray-100 last:border-b-0">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-blue-700 w-12 shrink-0">{r.class_code}</span>
                <span className="text-gray-800 flex-1 leading-tight">{r.description || r.class_group || "(no description)"}</span>
                <div className="flex gap-1 shrink-0">
                  {r.has_premops && <span className="text-[10px] px-1 rounded bg-emerald-100 text-emerald-700">P/O</span>}
                  {r.has_prods && <span className="text-[10px] px-1 rounded bg-emerald-100 text-emerald-700">Prods</span>}
                  {r.has_rtc && <span className="text-[10px] px-1 rounded bg-amber-100 text-amber-700">RTC</span>}
                  {!r.in_state_bureau_base && <span className="text-[10px] px-1 rounded bg-red-100 text-red-700" title={`not in ${stateCode} bureau base`}>NOT IN STATE</span>}
                </div>
              </div>
              <div className="text-[10px] text-gray-400 ml-14">
                {r.class_group} · basis:&nbsp;
                <span className="text-gray-700 font-medium" title={r.premops_basis_raw ? `ERC raw: ${r.premops_basis_raw}` : ""}>
                  {r.premops_basis}
                  {r.prods_basis && r.prods_basis !== r.premops_basis ? ` (PremOps) / ${r.prods_basis} (Prods)` : ""}
                </span>
                {r.basis_source === "heuristic" && <span className="text-amber-600 ml-1">[heuristic]</span>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const SUBLINES = [
  "Premises/Operations and Products/Completed Operations",
  "Premises/Operations",
  "Products/Completed Operations",
];

const PREMIUM_BASES = ["Gross Sales", "Payroll", "Area", "Units", "Per Capita", "Other"];
const DEDUCTIBLE_OPTIONS = ["No Deductible", "$250", "$500", "$1,000", "$2,500", "$5,000", "$10,000"];
const DEDUCTIBLE_BASES = ["CSL", "BI", "PD"]; // CLM Rule 15 — Tables 1/2/3 P/O, A/B/C P/CO

// CLM Rule 16 — Additional Insured Endorsements
// no_charge: Rule 16.A;  refer: Rule 16.B (additional charge, refer to company)
const AI_FORMS = [
  // Rule 16.A — no additional charge
  { number: "CG 20 02", name: "Club Members", charge: "no_charge" },
  { number: "CG 20 05", name: "Controlling Interest", charge: "no_charge" },
  { number: "CG 20 07", name: "Engineers/Architects/Surveyors Engaged by Insured", charge: "no_charge" },
  { number: "CG 20 12", name: "State or Governmental Agency (Permits)", charge: "no_charge" },
  { number: "CG 20 18", name: "Mortgagee, Assignee or Receiver", charge: "no_charge" },
  { number: "CG 20 20", name: "Charitable Institutions", charge: "no_charge" },
  { number: "CG 20 22", name: "Church Members and Officers", charge: "no_charge" },
  { number: "CG 20 24", name: "Owners or Other Interests from Whom Land Has Been Leased", charge: "no_charge" },
  { number: "CG 20 27", name: "Co-Owners of Insured Premises", charge: "no_charge" },
  // Rule 16.B — refer to company
  { number: "CG 20 01", name: "Primary and Noncontributory", charge: "refer" },
  { number: "CG 20 10", name: "Owners/Lessees/Contractors (Scheduled, Ongoing Ops)", charge: "refer" },
  { number: "CG 20 11", name: "Managers or Lessors of Premises", charge: "refer" },
  { number: "CG 20 15", name: "Vendors (Scheduled)", charge: "refer" },
  { number: "CG 20 26", name: "Designated Person or Organization", charge: "refer" },
  { number: "CG 20 28", name: "Lessors of Leased Equipment (Scheduled)", charge: "refer" },
  { number: "CG 20 37", name: "Owners/Lessees/Contractors (Scheduled, Completed Ops)", charge: "refer" },
  { number: "CG 20 44", name: "Vendors (Automatic)", charge: "refer" },
];
const MED_PAY_LIMITS = ["5,000", "10,000", "25,000", "50,000", "100,000"];

const INP = "w-full bg-white border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500";
const INP_SM = "w-full bg-white border border-gray-300 rounded px-2 py-1 text-sm text-gray-900 focus:outline-none focus:border-blue-500";

function mkClassification() {
  return {
    class_code: "",
    class_description: "",
    premops_premium_basis: "Gross Sales",
    premops_exposure: "",
    prods_premium_basis: "Gross Sales",
    prods_exposure: "",
    premops_deductible: "No Deductible",
    premops_deductible_basis: "CSL",
    prods_deductible: "No Deductible",
    prods_deductible_basis: "CSL",
  };
}

function mkLocation() {
  return { zip_code: "", premops_territory: "001", prods_territory: "999", classifications: [mkClassification()] };
}

const ELIGIBILITY_VARIANT = {
  ELIGIBLE: "PASS", INELIGIBLE: "BLOCKED", REFER_TO_COMPANY: "WARN", CARRIER_RESTRICTED: "BLOCKED",
};

function Label({ children }) {
  return <label className="block text-xs text-gray-500 font-medium mb-1">{children}</label>;
}

function SectionTitle({ children }) {
  return <div className="text-xs text-gray-500 font-semibold mb-2 uppercase tracking-wide">{children}</div>;
}

// Reusable schedule-rating editor. Default surface is the aggregate Yes/No +
// signed %; a chevron expands into per-category rows sourced from the bureau
// ERC spec for the resolved state + effective date. Touching any category
// switches the aggregate to read-only (derived from sum) per ISO Rule 26.B.
//
// `spec` is the response from /api/phase-c/schedule-rating-spec. When null
// (no state/date chosen yet), the component falls back to the static enum.
export function ScheduleRatingBlock({ form, setForm, INP, Label, spec, compact = false }) {
  const cats = form.schedule_mod_categories || [];
  const [expanded, setExpanded] = useState(cats.some(c => c.applied_pct));
  const categoriesActive = cats.some(c => (parseFloat(c.applied_pct) || 0) !== 0);
  const derivedAggregate = categoriesActive ? sumScheduleCategories(cats) : null;

  const bureauCategories = (spec?.categories?.length || 0) > 0 ? spec.categories : null;
  // Render-time category list. When the bureau spec is loaded, render those;
  // otherwise fall back to the static enum so the panel still works pre-resolve.
  const renderCategories = bureauCategories
    ? bureauCategories.map(c => ({ code: c.code, label: c.label, domain_values: c.domain_values, max_credit_pct: c.max_credit_pct, max_debit_pct: c.max_debit_pct }))
    : SCHEDULE_RATING_CATEGORIES.map(c => ({ code: c.code, label: c.label, domain_values: null, max_credit_pct: 25, max_debit_pct: 25 }));

  const aggMaxCredit = spec?.aggregate?.max_credit_pct ?? 25;
  const aggMaxDebit = spec?.aggregate?.max_debit_pct ?? 25;

  function setCategoryPct(code, raw) {
    const pct = raw === "" || raw === "-" ? raw : parseFloat(raw);
    const next = renderCategories.map(({ code: c }) => {
      const existing = cats.find(x => x.category_code === c);
      if (c === code) return { ...(existing || {}), category_code: c, applied_pct: pct };
      return existing || null;
    }).filter(Boolean);
    const filtered = next.filter(c => (parseFloat(c.applied_pct) || 0) !== 0 || c.justification_narrative);
    const sum = sumScheduleCategories(filtered);
    setForm(f => ({
      ...f,
      schedule_mod_categories: filtered,
      schedule_mod_pct: filtered.length > 0 ? sum : f.schedule_mod_pct,
      schedule_mod_applies: filtered.length > 0
        ? (sum !== 0 ? "Yes" : "No")
        : f.schedule_mod_applies,
    }));
  }

  return (
    <div>
      <div className={compact ? "grid grid-cols-2 gap-2" : "grid grid-cols-2 gap-3"}>
        <div>
          <Label>Schedule Mod</Label>
          <select className={INP}
            value={form.schedule_mod_applies}
            disabled={categoriesActive}
            onChange={e => setForm(f => ({ ...f, schedule_mod_applies: e.target.value }))}>
            <option value="No">Not Applied</option>
            <option value="Yes">Applied</option>
          </select>
        </div>
        {form.schedule_mod_applies === "Yes" && (
          <div>
            <Label>Aggregate % {categoriesActive && <span className="text-[10px] text-gray-400 italic">(derived from categories)</span>}</Label>
            <input type="number" step="1" min={-aggMaxCredit} max={aggMaxDebit}
              className={`${INP} ${categoriesActive ? "bg-gray-50 text-gray-600" : ""}`}
              readOnly={categoriesActive}
              value={categoriesActive ? derivedAggregate : form.schedule_mod_pct}
              onChange={e => setForm(f => ({ ...f, schedule_mod_pct: e.target.value }))} />
          </div>
        )}
      </div>
      <button type="button"
        onClick={() => setExpanded(v => !v)}
        className="mt-2 text-[11px] text-blue-600 hover:text-blue-800 inline-flex items-center gap-1">
        <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2"
          className={`transition-transform ${expanded ? "rotate-90" : ""}`}>
          <path d="M3 2 L7 5 L3 8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {expanded ? "Hide category breakdown" : `Break out by category (ISO Rule 26 — ${renderCategories.length} categories)`}
      </button>
      {expanded && (
        <div className="mt-2 border border-gray-200 rounded p-2 bg-gray-50">
          <div className="text-[10px] text-gray-500 italic mb-2">
            Per-category modifications sum to the aggregate ({(-aggMaxCredit)}% to +{aggMaxDebit}% per ISO Rule 26.B).
            {spec?.iso_rule_reference && <span className="ml-1 text-gray-400">{spec.iso_rule_reference}</span>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {renderCategories.map(({ code, label, domain_values, max_credit_pct, max_debit_pct }) => {
              const cat = cats.find(c => c.category_code === code);
              const useDropdown = Array.isArray(domain_values) && domain_values.length > 0;
              return (
                <div key={code}>
                  <Label>
                    {label}
                    <span className="ml-1 text-[10px] text-gray-400">±{max_credit_pct}%</span>
                  </Label>
                  {useDropdown ? (
                    <select className={INP}
                      value={cat?.applied_pct ?? 0}
                      onChange={e => setCategoryPct(code, e.target.value)}>
                      {domain_values.map(v => (
                        <option key={v} value={v}>{v > 0 ? `+${v}` : v}%</option>
                      ))}
                    </select>
                  ) : (
                    <input type="number" step="1" min={-max_credit_pct} max={max_debit_pct}
                      className={INP}
                      value={cat ? cat.applied_pct : ""}
                      placeholder="0"
                      onChange={e => setCategoryPct(code, e.target.value)} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function FormPreviewPanel({ preview }) {
  if (!preview) return null;
  const total = (preview.required_forms?.length || 0) +
    (preview.attached_conditional_forms?.length || 0) +
    (preview.new_forms_requiring_confirmation?.length || 0);
  if (total === 0) return (
    <Panel title="Form Attachment Preview">
      <p className="text-gray-400 text-xs">No forms attach under current selections.</p>
    </Panel>
  );
  return (
    <Panel title="Form Attachment Preview">
      <div className="space-y-3 text-xs">
        {preview.required_forms?.length > 0 && (
          <div>
            <div className="text-gray-500 mb-1 font-medium">Required ({preview.required_forms.length})</div>
            {preview.required_forms.map((f, i) => (
              <div key={i} className="flex gap-2 text-gray-700">
                <span className="font-mono text-gray-400 w-28 shrink-0">{f.form_number}</span>
                <span className="truncate">{f.name}</span>
              </div>
            ))}
          </div>
        )}
        {preview.attached_conditional_forms?.length > 0 && (
          <div>
            <div className="text-gray-500 mb-1 font-medium">Conditional — attaches ({preview.attached_conditional_forms.length})</div>
            {preview.attached_conditional_forms.map((f, i) => (
              <div key={i} className="flex gap-2 text-gray-700">
                <span className="font-mono text-gray-400 w-28 shrink-0">{f.form_number}</span>
                <span className="truncate">{f.name}</span>
              </div>
            ))}
          </div>
        )}
        {preview.new_forms_requiring_confirmation?.length > 0 && (
          <div>
            <div className="text-amber-600 mb-1 font-medium">New forms — confirm templates ({preview.new_forms_requiring_confirmation.length})</div>
            {preview.new_forms_requiring_confirmation.map((f, i) => (
              <div key={i} className="flex gap-2 text-amber-700">
                <span className="font-mono w-28 shrink-0">{f.form_number}</span>
                <span className="truncate">{f.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}

export default function Screen3_QuoteEntry({ onRated }) {
  const [form, setForm] = useState({
    carrier_id: "DEMO-CARRIER",
    state_code: "AL",
    policy_effective_date: "2026-01-01",
    subline: "Premises/Operations and Products/Completed Operations",
    coverage_form: "Occurrence",
    claims_made_retro_date: "",
    each_occurrence_limit: "1,000,000 CSL",
    general_aggregate_limit: "2,000,000 CSL",
    terrorism_coverage: "No",
    package_mod_factor: 1.0,
    years_in_business: 0,
    total_claims: 0,
    med_pay_coverage: "No",
    med_pay_limit: "5,000",
    schedule_mod_applies: "No",
    schedule_mod_pct: 0,
    // ISO Rule 26 — per-category schedule rating. When any category has a
    // non-zero applied_pct, the aggregate above becomes derived (sum of
    // categories) and the UI swaps the aggregate input to read-only. Empty
    // here means legacy aggregate-only mode.
    schedule_mod_categories: [],
    condo_association: "No",
    bylaws_amended: "No",
    cyber_incident_liability: "No",
    loss_of_electronic_data: "No",
    prods_withdrawal_coverage: "No",
    locations: [mkLocation()],
    additional_insureds: [],
  });

  const [quoteResult, setQuoteResult] = useState(null);
  const [eligResult, setEligResult] = useState(null);
  const [loading, setLoading] = useState("");
  const [error, setError] = useState(null);
  const [tierDeviationActive, setTierDeviationActive] = useState(false);
  const [carriers, setCarriers] = useState([]);
  // Bureau Rule 26 spec for the current state + effective date. Drives the
  // category list + per-category caps + domain values in ScheduleRatingBlock.
  // Null until first resolve; falls back to the static enum in the meantime.
  const [scheduleRatingSpec, setScheduleRatingSpec] = useState(null);

  const includesPremOps = form.subline.includes("Premises");
  const includesProds = form.subline.includes("Products");

  useEffect(() => {
    phaseB.carriers()
      .then(cars => {
        setCarriers(cars);
        if (cars.length > 0) setForm(f => ({ ...f, carrier_id: cars[0].carrier_id }));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!form.state_code) return;
    phaseB.deviations({ state_code: form.state_code, status: "ACTIVE" })
      .then(devs => setTierDeviationActive(devs.some(d => d.deviation_type === "tier_rating_factor")))
      .catch(() => {});
  }, [form.state_code]);

  // Fetch the bureau Rule 26 spec whenever state, effective date, or carrier
  // changes. Spec carries the 8 categories + per-category caps + domain
  // values, all sourced from edition_registry.schedule_rating_caps_json with
  // CW fallback for state editions. Errors leave spec null (UI falls back).
  useEffect(() => {
    if (!form.state_code || !form.policy_effective_date) return;
    phaseC.scheduleRatingSpec(form.state_code, form.policy_effective_date, form.carrier_id || "ACME")
      .then(setScheduleRatingSpec)
      .catch(() => setScheduleRatingSpec(null));
  }, [form.state_code, form.policy_effective_date, form.carrier_id]);

  function setLoc(idx, patch) {
    const locs = form.locations.map((l, i) => i === idx ? { ...l, ...patch } : l);
    setForm(f => ({ ...f, locations: locs }));
  }

  function setCls(locIdx, clsIdx, patch) {
    const locs = form.locations.map((l, li) => {
      if (li !== locIdx) return l;
      const cls = l.classifications.map((c, ci) => ci === clsIdx ? { ...c, ...patch } : c);
      return { ...l, classifications: cls };
    });
    setForm(f => ({ ...f, locations: locs }));
  }

  function addLocation() {
    setForm(f => ({ ...f, locations: [...f.locations, mkLocation()] }));
  }

  function addClassification(locIdx) {
    const locs = form.locations.map((l, i) =>
      i === locIdx ? { ...l, classifications: [...l.classifications, mkClassification()] } : l
    );
    setForm(f => ({ ...f, locations: locs }));
  }

  async function handleZipLookup(locIdx, zip) {
    if (!zip || zip.length < 5 || !form.state_code) return;
    try {
      const r = await phaseC.territoryLookup(form.state_code, zip);
      if (r.found) setLoc(locIdx, { premops_territory: r.territory });
    } catch (_) {}
  }

  async function handleSubmit() {
    setLoading("quote");
    setError(null);
    setQuoteResult(null);
    setEligResult(null);
    try {
      const payload = {
        ...form,
        package_mod_factor: parseFloat(form.package_mod_factor) || 1.0,
        schedule_mod_pct: parseFloat(form.schedule_mod_pct) || 0,
        schedule_mod_categories: (form.schedule_mod_categories || [])
          .map(c => ({
            category_code: c.category_code,
            applied_pct: parseFloat(c.applied_pct) || 0,
            justification_code: c.justification_code || null,
            justification_narrative: c.justification_narrative || null,
          }))
          .filter(c => c.applied_pct !== 0 || c.justification_narrative),
        years_in_business: parseInt(form.years_in_business) || 0,
        total_claims: parseInt(form.total_claims) || 0,
        locations: form.locations.map(loc => ({
          ...loc,
          classifications: loc.classifications.map(cls => ({
            ...cls,
            premops_exposure: parseFloat(cls.premops_exposure) || 0,
            prods_exposure: parseFloat(cls.prods_exposure) || 0,
          })),
        })),
      };
      const r = await phaseC.createQuote(payload);
      setQuoteResult(r);
      if (r.edition_resolved) {
        setLoading("eligibility");
        const e = await phaseC.checkEligibility(r.quote_id);
        setEligResult(e);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading("");
    }
  }

  const canRate = eligResult?.overall_eligible && quoteResult?.quote_id;

  return (
    <div className="p-6 text-gray-900">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-2 h-2 rounded-full bg-blue-500" />
          <h1 className="text-xl font-semibold text-gray-900">GL Quote Entry</h1>
          <Badge label="SCREEN 3" variant="INFO" />
        </div>
        <p className="text-gray-500 text-sm">Phase C · Input Normalization &amp; Eligibility</p>
      </div>

      {quoteResult?.ui_quote_form_state && (
        <div className="mb-4 px-4 py-2 bg-white border border-gray-200 rounded shadow-sm flex items-center gap-6 text-xs">
          <Badge
            label={quoteResult.ui_quote_form_state.edition_indicator?.status}
            variant={quoteResult.ui_quote_form_state.edition_indicator?.status === "RESOLVED" ? "PASS" : "BLOCKED"}
          />
          <span className="text-gray-700">{quoteResult.ui_quote_form_state.edition_indicator?.label}</span>
          {quoteResult.ui_quote_form_state.deviation_indicator?.lcm_active && (
            <span className="text-amber-600">{quoteResult.ui_quote_form_state.deviation_indicator.lcm_summary}</span>
          )}
          <span className="text-gray-400 ml-auto font-mono">{quoteResult.quote_id}</span>
        </div>
      )}

      {/* F5.3 — Missing-data referral tray. Surface c1 warnings + errors prominently
          so silent zero defaults don't sneak through. */}
      {quoteResult && (quoteResult.warnings?.length > 0 || quoteResult.errors?.length > 0) && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded shadow-sm">
          <div className="px-4 py-2 border-b border-amber-200 flex items-baseline justify-between">
            <span className="font-semibold text-amber-800 text-sm">
              ⚠ Missing data — refer to company or fix before binding
            </span>
            <span className="text-amber-700 text-xs">
              {(quoteResult.errors?.length || 0)} error · {(quoteResult.warnings?.length || 0)} warning
            </span>
          </div>
          <div className="px-4 py-2 space-y-1 text-xs">
            {(quoteResult.errors || []).map((e, i) => (
              <div key={`e${i}`} className="flex gap-2">
                <span className="font-semibold text-red-700 shrink-0">ERROR</span>
                <span className="text-red-800">{e}</span>
              </div>
            ))}
            {(quoteResult.warnings || []).map((w, i) => (
              <div key={`w${i}`} className="flex gap-2">
                <span className="font-semibold text-amber-700 shrink-0">WARN</span>
                <span className="text-amber-800">{w}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Panel title="Policy">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Paper Company</Label>
                {carriers.length > 0 ? (
                  <select className={INP} value={form.carrier_id} onChange={e => setForm(f => ({ ...f, carrier_id: e.target.value }))}>
                    {carriers.map(c => (
                      <option key={c.carrier_id} value={c.carrier_id}>{c.carrier_id} — {c.carrier_name}</option>
                    ))}
                  </select>
                ) : (
                  <input className={INP} value={form.carrier_id} onChange={e => setForm(f => ({ ...f, carrier_id: e.target.value }))} />
                )}
              </div>
              <div><Label>State</Label>
                <input className={INP} value={form.state_code} onChange={e => setForm(f => ({ ...f, state_code: e.target.value.toUpperCase() }))} /></div>
              <div><Label>Policy Effective Date</Label>
                <input type="date" className={INP} value={form.policy_effective_date} onChange={e => setForm(f => ({ ...f, policy_effective_date: e.target.value }))} /></div>
              <div><Label>Subline</Label>
                <select className={INP} value={form.subline} onChange={e => setForm(f => ({ ...f, subline: e.target.value }))}>
                  {SUBLINES.map(s => <option key={s} value={s}>{s}</option>)}
                </select></div>
              <div className="col-span-2">
                <Label>Coverage Form</Label>
                <div className="flex gap-4 mt-1">
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input type="radio" name="coverage_form" value="Occurrence"
                      checked={form.coverage_form === "Occurrence"}
                      onChange={e => setForm(f => ({ ...f, coverage_form: e.target.value, claims_made_retro_date: "" }))} />
                    Occurrence (CG 00 01)
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input type="radio" name="coverage_form" value="Claims Made"
                      checked={form.coverage_form === "Claims Made"}
                      onChange={e => setForm(f => ({ ...f, coverage_form: e.target.value,
                        claims_made_retro_date: f.claims_made_retro_date || f.policy_effective_date }))} />
                    Claims Made (CG 00 02)
                  </label>
                </div>
                {form.coverage_form === "Claims Made" && (
                  <div className="mt-3 space-y-2">
                    <div>
                      <Label>Prior Acts Date (Retro Date)</Label>
                      <input type="date" className={INP}
                        value={form.claims_made_retro_date || ""}
                        onChange={e => setForm(f => ({ ...f, claims_made_retro_date: e.target.value }))} />
                    </div>
                    <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                      Claims Made coverage form selected. A Supplemental Extended Reporting Period (SERP) endorsement may attach based on edition rules.
                    </div>
                  </div>
                )}
              </div>
              <div><Label>Each Occurrence Limit</Label>
                <input className={INP} value={form.each_occurrence_limit} onChange={e => setForm(f => ({ ...f, each_occurrence_limit: e.target.value }))} /></div>
              <div><Label>General Aggregate Limit</Label>
                <input className={INP} value={form.general_aggregate_limit} onChange={e => setForm(f => ({ ...f, general_aggregate_limit: e.target.value }))} /></div>
              <div><Label>Terrorism Coverage</Label>
                <select className={INP} value={form.terrorism_coverage} onChange={e => setForm(f => ({ ...f, terrorism_coverage: e.target.value }))}>
                  <option>No</option><option>Yes</option>
                </select></div>
              <div><Label>Package Mod Factor</Label>
                <input type="number" step="0.01" className={INP} value={form.package_mod_factor} onChange={e => setForm(f => ({ ...f, package_mod_factor: e.target.value }))} /></div>
            </div>

            {tierDeviationActive && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <SectionTitle>Risk Characteristics</SectionTitle>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Years in Business</Label>
                    <input type="number" min="0" className={INP} value={form.years_in_business}
                      onChange={e => setForm(f => ({ ...f, years_in_business: e.target.value }))} /></div>
                  <div><Label>Total Claims (Last 3 Years)</Label>
                    <input type="number" min="0" className={INP} value={form.total_claims}
                      onChange={e => setForm(f => ({ ...f, total_claims: e.target.value }))} /></div>
                </div>
              </div>
            )}

            <div className="mt-3 pt-3 border-t border-gray-100">
              <SectionTitle>Medical Payments Coverage</SectionTitle>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Med Pay</Label>
                  <select className={INP} value={form.med_pay_coverage} onChange={e => setForm(f => ({ ...f, med_pay_coverage: e.target.value }))}>
                    <option value="No">Excluded</option><option value="Yes">Included</option>
                  </select></div>
                {form.med_pay_coverage === "Yes" && (
                  <div><Label>Med Pay Limit ($)</Label>
                    <select className={INP} value={form.med_pay_limit} onChange={e => setForm(f => ({ ...f, med_pay_limit: e.target.value }))}>
                      {MED_PAY_LIMITS.map(l => <option key={l} value={l}>{l}</option>)}
                    </select></div>
                )}
              </div>
            </div>

            <div className="mt-3 pt-3 border-t border-gray-100">
              <SectionTitle>Schedule Rating Modification</SectionTitle>
              <ScheduleRatingBlock form={form} setForm={setForm} INP={INP} Label={Label} spec={scheduleRatingSpec} />
            </div>

            {includesPremOps && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <SectionTitle>Condominium Association</SectionTitle>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Condominium Association?</Label>
                    <select className={INP} value={form.condo_association} onChange={e => setForm(f => ({ ...f, condo_association: e.target.value }))}>
                      <option value="No">No</option><option value="Yes">Yes</option>
                    </select></div>
                  {form.condo_association === "Yes" && (
                    <div><Label>Bylaws Created/Amended on or After Date?</Label>
                      <select className={INP} value={form.bylaws_amended} onChange={e => setForm(f => ({ ...f, bylaws_amended: e.target.value }))}>
                        <option value="No">No</option><option value="Yes">Yes</option>
                      </select></div>
                  )}
                </div>
                {form.condo_association === "Yes" && (
                  <p className="text-xs text-gray-400 mt-1">Form CG 01 27 11 85 attaches when class 62003 + both fields = Yes</p>
                )}
              </div>
            )}

            <div className="mt-3 pt-3 border-t border-gray-100">
              <SectionTitle>Cyber &amp; Electronic Data</SectionTitle>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Cyber Incident Liability Coverage</Label>
                  <select className={INP} value={form.cyber_incident_liability} onChange={e => setForm(f => ({ ...f, cyber_incident_liability: e.target.value }))}>
                    <option value="No">Not Applicable</option><option value="Yes">Applies</option>
                  </select></div>
                <div><Label>Loss of Electronic Data Coverage</Label>
                  <select className={INP} value={form.loss_of_electronic_data} onChange={e => setForm(f => ({ ...f, loss_of_electronic_data: e.target.value }))}>
                    <option value="No">Not Applicable</option><option value="Yes">Applies</option>
                  </select></div>
              </div>
            </div>

            {includesProds && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <SectionTitle>Products Withdrawal</SectionTitle>
                <div><Label>Products Withdrawal Coverage</Label>
                  <select className={INP} value={form.prods_withdrawal_coverage} onChange={e => setForm(f => ({ ...f, prods_withdrawal_coverage: e.target.value }))}>
                    <option value="No">Not Applicable</option><option value="Yes">Applies</option>
                  </select></div>
              </div>
            )}
          </Panel>

          {form.locations.map((loc, li) => (
            <Panel key={li} title={`Location ${li + 1}`}>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div><Label>ZIP Code (auto-fill territory)</Label>
                  <input className={INP} placeholder="e.g. 35004"
                    value={loc.zip_code || ""}
                    onChange={e => setLoc(li, { zip_code: e.target.value })}
                    onBlur={e => handleZipLookup(li, e.target.value)} /></div>
                <div><Label>PremOps Territory</Label>
                  <input className={INP} value={loc.premops_territory} onChange={e => setLoc(li, { premops_territory: e.target.value })} /></div>
                <div><Label>Prods Territory</Label>
                  <input className={INP} value={loc.prods_territory} onChange={e => setLoc(li, { prods_territory: e.target.value })} /></div>
              </div>

              <div className="space-y-3">
                {loc.classifications.map((cls, ci) => (
                  <div key={ci} className="bg-gray-50 rounded p-3 border border-gray-100">
                    <div className="text-xs text-gray-500 font-medium mb-2">Classification {ci + 1}</div>
                    <div className="grid grid-cols-2 gap-2">
                      <div><Label>Class Code</Label>
                        <ClassCodeAutocomplete
                          value={cls.class_code}
                          stateCode={form.state_code}
                          className={INP_SM}
                          onPick={(picked) => {
                            const patch = { class_code: picked.class_code };
                            if (picked.description) patch.class_description = picked.description;
                            else if (picked.class_group !== undefined) patch.class_description = picked.class_group;
                            // Use ERC per-subline basis when available; fall back to PremOps for both
                            if (picked.premops_basis !== undefined) {
                              patch.premops_premium_basis = picked.premops_basis;
                            }
                            if (picked.prods_basis !== undefined) {
                              patch.prods_premium_basis = picked.prods_basis;
                            }
                            setCls(li, ci, patch);
                          }}
                        /></div>
                      <div><Label>Description</Label>
                        <input className={INP_SM} value={cls.class_description} onChange={e => setCls(li, ci, { class_description: e.target.value })} /></div>
                      {includesPremOps && <>
                        <div><Label>PremOps Basis</Label>
                          <select className={INP_SM} value={cls.premops_premium_basis} onChange={e => setCls(li, ci, { premops_premium_basis: e.target.value })}>
                            {PREMIUM_BASES.map(b => <option key={b}>{b}</option>)}
                          </select></div>
                        <div><Label>PremOps Exposure</Label>
                          <input type="number" className={INP_SM} value={cls.premops_exposure} onChange={e => setCls(li, ci, { premops_exposure: e.target.value })} /></div>
                        <div><Label>PremOps Deductible</Label>
                          <select className={INP_SM} value={cls.premops_deductible} onChange={e => setCls(li, ci, { premops_deductible: e.target.value })}>
                            {DEDUCTIBLE_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                          </select></div>
                        <div><Label>PremOps Ded Basis</Label>
                          <select className={INP_SM} value={cls.premops_deductible_basis}
                            onChange={e => setCls(li, ci, { premops_deductible_basis: e.target.value })}
                            disabled={cls.premops_deductible === "No Deductible"}>
                            {DEDUCTIBLE_BASES.map(b => <option key={b} value={b}>{b}</option>)}
                          </select></div>
                      </>}
                      {includesProds && <>
                        <div><Label>Prods Basis</Label>
                          <select className={INP_SM} value={cls.prods_premium_basis} onChange={e => setCls(li, ci, { prods_premium_basis: e.target.value })}>
                            {PREMIUM_BASES.map(b => <option key={b}>{b}</option>)}
                          </select></div>
                        <div><Label>Prods Exposure</Label>
                          <input type="number" className={INP_SM} value={cls.prods_exposure} onChange={e => setCls(li, ci, { prods_exposure: e.target.value })} /></div>
                        <div><Label>Prods Deductible</Label>
                          <select className={INP_SM} value={cls.prods_deductible} onChange={e => setCls(li, ci, { prods_deductible: e.target.value })}>
                            {DEDUCTIBLE_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                          </select></div>
                        <div><Label>Prods Ded Basis</Label>
                          <select className={INP_SM} value={cls.prods_deductible_basis}
                            onChange={e => setCls(li, ci, { prods_deductible_basis: e.target.value })}
                            disabled={cls.prods_deductible === "No Deductible"}>
                            {DEDUCTIBLE_BASES.map(b => <option key={b} value={b}>{b}</option>)}
                          </select></div>
                      </>}
                    </div>
                  </div>
                ))}
                <button onClick={() => addClassification(li)}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium">+ Add Classification</button>
              </div>
            </Panel>
          ))}

          <button onClick={addLocation} className="text-xs text-blue-600 hover:text-blue-800 font-medium">+ Add Location</button>

          <Panel title={`Additional Insureds (Rule 16) — ${form.additional_insureds.length}`}>
            <div className="space-y-2 text-xs">
              {form.additional_insureds.length === 0 && (
                <div className="text-gray-400">No additional insureds scheduled. Click below to add one.</div>
              )}
              {form.additional_insureds.map((ai, idx) => {
                const formInfo = AI_FORMS.find(f => f.number === ai.form_number);
                const isRefer = formInfo?.charge === "refer";
                return (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-start bg-gray-50 border border-gray-100 rounded p-2">
                    <div className="col-span-4">
                      <Label>AI Form</Label>
                      <select className={INP_SM}
                        value={ai.form_number}
                        onChange={e => {
                          const sel = AI_FORMS.find(f => f.number === e.target.value);
                          setForm(f => ({
                            ...f,
                            additional_insureds: f.additional_insureds.map((x, i) =>
                              i === idx ? { ...x, form_number: e.target.value } : x),
                          }));
                        }}>
                        <option value="">— pick a form —</option>
                        <optgroup label="No additional charge (Rule 16.A)">
                          {AI_FORMS.filter(f => f.charge === "no_charge").map(f => (
                            <option key={f.number} value={f.number}>{f.number} — {f.name}</option>
                          ))}
                        </optgroup>
                        <optgroup label="Additional charge — refer to company (Rule 16.B)">
                          {AI_FORMS.filter(f => f.charge === "refer").map(f => (
                            <option key={f.number} value={f.number}>{f.number} — {f.name}</option>
                          ))}
                        </optgroup>
                      </select>
                      {isRefer && (
                        <div className="text-amber-700 mt-0.5 text-[10px]">Rule 16.B — refer to company for premium charge</div>
                      )}
                    </div>
                    <div className="col-span-4">
                      <Label>AI Name</Label>
                      <input className={INP_SM} placeholder="e.g. ACME Property Owners LLC"
                        value={ai.name}
                        onChange={e => setForm(f => ({
                          ...f,
                          additional_insureds: f.additional_insureds.map((x, i) =>
                            i === idx ? { ...x, name: e.target.value } : x),
                        }))} />
                    </div>
                    <div className="col-span-3">
                      <Label>Address</Label>
                      <input className={INP_SM} placeholder="optional"
                        value={ai.address}
                        onChange={e => setForm(f => ({
                          ...f,
                          additional_insureds: f.additional_insureds.map((x, i) =>
                            i === idx ? { ...x, address: e.target.value } : x),
                        }))} />
                    </div>
                    <div className="col-span-1 flex items-end justify-end pt-4">
                      <button
                        onClick={() => setForm(f => ({
                          ...f,
                          additional_insureds: f.additional_insureds.filter((_, i) => i !== idx),
                        }))}
                        className="text-red-500 hover:text-red-700 text-base leading-none"
                        title="Remove">×</button>
                    </div>
                  </div>
                );
              })}
              <button
                onClick={() => setForm(f => ({
                  ...f,
                  additional_insureds: [...f.additional_insureds, { form_number: "", name: "", address: "" }],
                }))}
                className="text-blue-600 hover:text-blue-800 font-medium">
                + Add Additional Insured
              </button>
            </div>
          </Panel>

          {error && (
            <div className="text-red-700 text-sm bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>
          )}

          <div className="flex gap-3">
            <button onClick={handleSubmit} disabled={!!loading}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white px-5 py-2 rounded text-sm font-medium">
              {loading === "quote" ? "Processing…" : loading === "eligibility" ? "Checking eligibility…" : "Check Eligibility"}
            </button>
            {canRate && (
              <button onClick={() => onRated?.(quoteResult.quote_id)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded text-sm font-medium">
                Calculate Premium →
              </button>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {eligResult && (
            <Panel title="Eligibility">
              <div className="space-y-2">
                {eligResult.classifications?.map(c => (
                  <div key={c.classification_id} className="flex items-start gap-2">
                    <Badge label={c.status} variant={ELIGIBILITY_VARIANT[c.status] || "INFO"} />
                    <div>
                      <div className="text-xs text-gray-700 font-mono">{c.class_code}</div>
                      {c.warnings?.map((w, i) => (
                        <div key={i} className="text-xs text-amber-600 mt-0.5">{w}</div>
                      ))}
                    </div>
                  </div>
                ))}
                {eligResult.overall_eligible && (
                  <div className="mt-2 text-xs text-emerald-600 font-medium">All classifications eligible — ready to rate</div>
                )}
              </div>
            </Panel>
          )}

          <FormPreviewPanel preview={eligResult?.form_preview} />

          {!eligResult && (
            <Panel title="Form Attachment Preview">
              <p className="text-gray-400 text-xs">Check eligibility to see form attachments.</p>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
