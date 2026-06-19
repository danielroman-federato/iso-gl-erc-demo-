import { useState, useEffect, useCallback, Fragment } from "react";
import { phaseB } from "../api/client";
import { Badge } from "../components/Badge";
import { Panel } from "../components/Panel";

const TYPE_BADGE = {
  LCM: "LCM",
  schedule_rating_mod: "SCHEDULE MOD",
  eligibility_restriction: "ELIGIBILITY",
  eligibility_expansion: "ELIGIBILITY",
  algorithm_override: "ALGORITHM",
  tier_rating_factor: "TIER",
  flat_fee: "FLAT FEE",
};

const STATUS_VARIANT = {
  ACTIVE: "ACTIVE",
  PENDING_APPROVAL: "PENDING",
  APPROVED: "PENDING",
  PENDING_EFFECTIVE: "PENDING",
  BLOCKED: "BLOCKED",
  CLOSED: "INFO",
};

const INPUT = "bg-white border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500";
const INPUT_SM = "bg-white border border-gray-300 rounded px-2 py-1 text-xs text-gray-900 focus:outline-none focus:border-blue-500";
const CELL = "text-xs rounded px-2 py-1 font-mono focus:outline-none focus:border-blue-400 border bg-white border-gray-200";
const CELL_ERR = "text-xs rounded px-2 py-1 font-mono focus:outline-none border border-red-400 bg-red-50";
const APPROVAL_SELECT = "text-xs border border-gray-200 rounded px-1.5 py-1 bg-white focus:outline-none";

const SUBLINE_OPTIONS = ["PremOps", "ProdsCompldOps", "OwnersContractors", "Liquor"];

function daysSince(isoDate) {
  if (!isoDate) return "—";
  return Math.floor((new Date() - new Date(isoDate)) / 86400000);
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs text-gray-500 font-medium mb-1">{label}</label>
      {children}
    </div>
  );
}

function SublineCheckboxes({ selected, onChange, compact = false }) {
  return (
    <div className={`flex ${compact ? "flex-col gap-0.5" : "flex-wrap gap-2"}`}>
      {SUBLINE_OPTIONS.map(sl => (
        <label key={sl} className="flex items-center gap-1 cursor-pointer text-xs">
          <input type="checkbox" checked={selected?.includes(sl) ?? false}
            onChange={e => {
              const next = e.target.checked ? [...(selected || []), sl] : (selected || []).filter(s => s !== sl);
              onChange(next);
            }} className="accent-blue-600" />
          <span className="text-gray-700">{sl}</span>
        </label>
      ))}
    </div>
  );
}

// ── Tier Matrix Builder ───────────────────────────────────────────────────────

const DEFAULT_TIER = {
  variable_1: { name: "years_in_business", bands: [{ min: 0, max: 2, label: "0-2" }, { min: 3, max: 5, label: "3-5" }, { min: 6, max: null, label: "6+" }] },
  variable_2: { name: "total_claims", bands: [{ min: 0, max: 0, label: "0" }, { min: 1, max: 2, label: "1-2" }, { min: 3, max: null, label: "3+" }] },
  tier_table: { "0-2|0": 1.35, "0-2|1-2": 1.55, "0-2|3+": 1.75, "3-5|0": 1.10, "3-5|1-2": 1.25, "3-5|3+": 1.45, "6+|0": 1.00, "6+|1-2": 1.15, "6+|3+": 1.30 },
  applies_to_sublines: ["PremOps", "ProdsCompldOps"],
};

function TierMatrixBuilder({ config, onChange }) {
  const v1Bands = config.variable_1?.bands || [];
  const v2Bands = config.variable_2?.bands || [];

  function setCell(v1Label, v2Label, val) {
    onChange({ ...config, tier_table: { ...config.tier_table, [`${v1Label}|${v2Label}`]: parseFloat(val) || 0 } });
  }

  function addBand(varKey) {
    const current = config[varKey]?.bands || [];
    const newBand = { min: 0, max: null, label: `Band ${current.length + 1}` };
    const updated = { ...config, [varKey]: { ...config[varKey], bands: [...current, newBand] } };
    const newTable = { ...updated.tier_table };
    const otherBands = varKey === "variable_1" ? v2Bands : v1Bands;
    otherBands.forEach(ob => {
      const key = varKey === "variable_1" ? `${newBand.label}|${ob.label}` : `${ob.label}|${newBand.label}`;
      newTable[key] = 1.00;
    });
    onChange({ ...updated, tier_table: newTable });
  }

  function removeBand(varKey, idx) {
    const current = config[varKey]?.bands || [];
    if (current.length <= 1) return;
    const removed = current[idx];
    const newBands = current.filter((_, i) => i !== idx);
    const newTable = { ...config.tier_table };
    Object.keys(newTable).forEach(k => {
      if (k.startsWith(`${removed.label}|`) || k.endsWith(`|${removed.label}`)) delete newTable[k];
    });
    onChange({ ...config, [varKey]: { ...config[varKey], bands: newBands }, tier_table: newTable });
  }

  function setBandLabel(varKey, idx, label) {
    const oldLabel = config[varKey].bands[idx].label;
    const newBands = config[varKey].bands.map((b, i) => i === idx ? { ...b, label } : b);
    const newTable = {};
    Object.entries(config.tier_table).forEach(([k, v]) => {
      let newKey = k;
      if (varKey === "variable_1" && k.startsWith(`${oldLabel}|`)) newKey = `${label}|${k.split("|")[1]}`;
      if (varKey === "variable_2" && k.endsWith(`|${oldLabel}`)) newKey = `${k.split("|")[0]}|${label}`;
      newTable[newKey] = v;
    });
    onChange({ ...config, [varKey]: { ...config[varKey], bands: newBands }, tier_table: newTable });
  }

  return (
    <div className="space-y-3">
      {["variable_1", "variable_2"].map(varKey => (
        <div key={varKey} className="bg-gray-50 border border-gray-200 rounded p-3">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-xs font-semibold text-gray-500 uppercase w-20">{varKey === "variable_1" ? "Variable 1" : "Variable 2"}</span>
            <input className={`${INPUT_SM} flex-1`} value={config[varKey]?.name || ""} placeholder="variable name"
              onChange={e => onChange({ ...config, [varKey]: { ...config[varKey], name: e.target.value } })} />
          </div>
          <div className="flex flex-wrap gap-2">
            {(config[varKey]?.bands || []).map((band, bi) => (
              <div key={bi} className="flex items-center gap-1 bg-white border border-gray-200 rounded px-2 py-1">
                <input className="w-14 text-xs bg-transparent focus:outline-none text-gray-700"
                  value={band.label} onChange={e => setBandLabel(varKey, bi, e.target.value)} />
                <button onClick={() => removeBand(varKey, bi)} className="text-gray-300 hover:text-red-500 text-xs ml-1">×</button>
              </div>
            ))}
            <button onClick={() => addBand(varKey)}
              className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 border border-dashed border-blue-300 rounded">+ Band</button>
          </div>
        </div>
      ))}
      <div className="overflow-x-auto">
        <table className="text-xs border-collapse">
          <thead>
            <tr>
              <th className="px-2 py-1 text-gray-500 text-left font-medium w-24">
                {config.variable_1?.name || "Var 1"} ↓ / {config.variable_2?.name || "Var 2"} →
              </th>
              {v2Bands.map(b2 => (
                <th key={b2.label} className="px-2 py-1 text-gray-500 font-medium text-center w-20">{b2.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {v1Bands.map(b1 => (
              <tr key={b1.label}>
                <td className="px-2 py-1 font-medium text-gray-600 bg-gray-50">{b1.label}</td>
                {v2Bands.map(b2 => {
                  const key = `${b1.label}|${b2.label}`;
                  return (
                    <td key={b2.label} className="px-1 py-1">
                      <input type="number" step="0.01" min="0"
                        value={config.tier_table?.[key] ?? ""}
                        onChange={e => setCell(b1.label, b2.label, e.target.value)}
                        className="w-20 text-xs bg-white border border-gray-200 rounded px-2 py-1 text-center focus:outline-none focus:border-blue-400 font-mono" />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function SaveResultBanner({ result, onDismiss }) {
  if (!result) return null;
  const isErr = result.error || (result.errors?.length > 0 && !result.saved?.length);
  return (
    <div className={`rounded-lg border px-4 py-3 text-xs space-y-1 ${isErr ? "bg-red-50 border-red-200 text-red-700" : "bg-emerald-50 border-emerald-200 text-emerald-800"}`}>
      {result.error && <div className="font-semibold">Save error: {result.error}</div>}
      {result.saved?.length > 0 && (
        <div>
          <span className="font-semibold">Saved {result.saved.length} state(s): </span>
          <span className="font-mono">{result.saved.map(s => s.state_code).join(", ")}</span>
        </div>
      )}
      {result.errors?.length > 0 && (
        <div className="text-red-700">
          <div className="font-semibold">Errors:</div>
          {result.errors.map((e, i) => <div key={i}>{e.state_code}: {e.error}</div>)}
        </div>
      )}
      <button onClick={onDismiss} className="text-[10px] underline opacity-60 hover:opacity-100 block">Dismiss</button>
    </div>
  );
}

function MatrixFooter({ saving, dirtyCount, allValid, onSave, onReset, saveResult, onDismiss, saveLabel }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 flex-wrap">
        <button onClick={onSave} disabled={saving || !dirtyCount || !allValid}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2 rounded text-sm font-medium">
          {saving ? "Saving…" : (saveLabel || `Save Changes (${dirtyCount})`)}
        </button>
        {dirtyCount > 0 && onReset && (
          <button onClick={onReset} className="text-xs text-gray-500 hover:text-gray-700 underline">Reset</button>
        )}
        {!allValid && dirtyCount > 0 && (
          <span className="text-red-500 text-xs">Fix validation errors before saving</span>
        )}
      </div>
      <SaveResultBanner result={saveResult} onDismiss={onDismiss} />
    </div>
  );
}

function ApprovalSelect({ value, onChange }) {
  return (
    <select value={value ?? "approved"} onChange={e => onChange(e.target.value)} className={APPROVAL_SELECT}>
      <option value="approved">approved</option>
      <option value="pending">pending</option>
      <option value="not_required">not_required</option>
    </select>
  );
}

function DevStatusCell({ dev }) {
  if (!dev) return <span className="text-gray-400 italic text-xs">—</span>;
  return <Badge label={dev.status} variant={STATUS_VARIANT[dev.status] || "INFO"} />;
}

// CW-level master toggle. Toggle switch + status label + explicit
// Enable-all / Disable-all actions so the affordance is unmistakable.
// One backend call flips every (carrier, cw, deviation_type) row in the
// scope; per-state audit-log rows record provenance.
function CwMasterToggle({ matrixData, carrierId, cwEdition, deviationType, accessor, onSaved }) {
  const [pending, setPending] = useState(false);
  const states = (matrixData?.states || [])
    .map(s => accessor(s))
    .filter(Boolean);
  if (states.length === 0) return null;
  const enabledCount = states.filter(d => d.enabled !== false).length;
  const total = states.length;
  const allOn = enabledCount === total;
  const allOff = enabledCount === 0;
  const mixed = !allOn && !allOff;

  async function setAll(next) {
    setPending(true);
    try {
      const cwRef = cwEdition?.edition_id?.replace(/-/g, " ") || cwEdition?.cw_project_reference;
      await phaseB.cwToggleEnabled(carrierId, cwRef, deviationType, next);
      onSaved?.();
    } catch (e) {
      console.error("CW toggle failed:", e);
    } finally {
      setPending(false);
    }
  }

  // Big toggle: click flips to the opposite of all-on. From mixed, clicking
  // moves to all-on (consistent with "click the switch to turn it on").
  const switchOn = allOn;
  async function flipSwitch() {
    await setAll(!switchOn);
  }

  return (
    <div className={`inline-flex items-center gap-3 px-3 py-2 rounded-lg border bg-white shadow-sm
      ${mixed ? "border-amber-200" : allOn ? "border-emerald-200" : "border-gray-200"}
      ${pending ? "opacity-60" : ""}`}>
      <div className="text-right">
        <div className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">
          All states · {deviationType}
        </div>
        <div className={`text-xs font-semibold ${allOn ? "text-emerald-700" : allOff ? "text-gray-600" : "text-amber-700"}`}>
          {allOn ? `All ${total} ON` : allOff ? `All ${total} OFF` : `${enabledCount}/${total} ON · mixed`}
        </div>
      </div>
      <button onClick={flipSwitch} disabled={pending}
        title={allOn ? `Click to disable all ${total} states` : `Click to enable all ${total} states`}
        className={`relative inline-flex items-center w-14 h-7 rounded-full transition-colors cursor-pointer
          ${allOn ? "bg-emerald-500"
            : mixed ? "bg-gradient-to-r from-emerald-400 via-amber-300 to-gray-300"
            : "bg-gray-300"}`}>
        <span className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform
          ${allOn ? "translate-x-7" : mixed ? "translate-x-4" : "translate-x-0.5"}`} />
      </button>
      <div className="flex flex-col gap-1">
        <button onClick={() => setAll(true)} disabled={pending || allOn}
          className="text-[10px] font-semibold px-2 py-0.5 rounded border border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-30 disabled:cursor-not-allowed">
          Enable all
        </button>
        <button onClick={() => setAll(false)} disabled={pending || allOff}
          className="text-[10px] font-semibold px-2 py-0.5 rounded border border-red-300 text-red-700 bg-red-50 hover:bg-red-100 disabled:opacity-30 disabled:cursor-not-allowed">
          Disable all
        </button>
      </div>
    </div>
  );
}

// Reusable enabled-toggle cell — flips the master on/off switch for any
// deviation row regardless of type. Optimistic UI; on error reverts.
function EnabledToggle({ dev, onChanged }) {
  const [pending, setPending] = useState(false);
  const [localEnabled, setLocalEnabled] = useState(dev?.enabled !== false);
  useEffect(() => { setLocalEnabled(dev?.enabled !== false); }, [dev?.enabled]);
  if (!dev) return <span className="text-gray-400 italic text-xs">—</span>;

  async function flip() {
    const next = !localEnabled;
    setLocalEnabled(next);
    setPending(true);
    try {
      await phaseB.toggleEnabled(dev.deviation_id, next);
      onChanged?.();
    } catch (e) {
      setLocalEnabled(!next);  // revert
      console.error("toggle failed:", e);
    } finally {
      setPending(false);
    }
  }

  return (
    <button onClick={flip} disabled={pending}
      title={localEnabled
        ? "Click to disable — rating engine will skip this deviation"
        : "Click to enable — rating engine will resume applying this deviation"}
      className={`relative inline-flex items-center w-9 h-5 rounded-full transition-colors
        ${pending ? "opacity-60" : ""}
        ${localEnabled ? "bg-emerald-500" : "bg-gray-300"}`}>
      <span className={`absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform
        ${localEnabled ? "translate-x-4" : "translate-x-0"}`} />
    </button>
  );
}

function DirtyDot({ dirty }) {
  return dirty ? <span className="inline-block w-2 h-2 rounded-full bg-yellow-400" title="Unsaved changes" /> : null;
}

// ── LCM Tab ───────────────────────────────────────────────────────────────────

function LcmTab({ matrixData, carrierId, cwEdition, onSaved }) {
  const [editValues, setEditValues] = useState({});
  const [dirtyRows, setDirtyRows] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkLcm, setBulkLcm] = useState("");
  const [bulkSublines, setBulkSublines] = useState(["PremOps", "ProdsCompldOps"]);

  useEffect(() => {
    const ev = {};
    for (const row of matrixData.states) {
      ev[row.state_code] = {
        lcm_value: row.lcm?.lcm_value != null ? String(row.lcm.lcm_value) : "",
        scope_sublines: row.lcm?.scope_sublines ?? ["PremOps", "ProdsCompldOps"],
        filing_reference: row.lcm?.filing_reference ?? "",
        state_approval_status: row.lcm?.state_approval_status ?? "approved",
      };
    }
    setEditValues(ev);
    setDirtyRows(new Set());
    setSaveResult(null);
  }, [matrixData]);

  function markDirty(sc, field, value) {
    setEditValues(ev => ({ ...ev, [sc]: { ...ev[sc], [field]: value } }));
    setDirtyRows(dr => new Set([...dr, sc]));
  }

  function validateRow(sc) {
    const ev = editValues[sc] || {};
    if (!ev.lcm_value && ev.lcm_value !== 0) return [];
    const lcm = parseFloat(ev.lcm_value);
    const errs = [];
    if (isNaN(lcm) || lcm < 0.5 || lcm > 3.0) errs.push("LCM must be 0.5–3.0");
    if (!ev.scope_sublines?.length) errs.push("Select at least one subline");
    return errs;
  }

  const dirtyWithValues = [...dirtyRows].filter(sc => {
    const ev = editValues[sc];
    return ev?.lcm_value !== "" && ev?.lcm_value != null;
  });
  const allValid = dirtyWithValues.every(sc => validateRow(sc).length === 0);

  function rebuildEdits() {
    const ev = {};
    for (const row of matrixData.states) {
      ev[row.state_code] = {
        lcm_value: row.lcm?.lcm_value != null ? String(row.lcm.lcm_value) : "",
        scope_sublines: row.lcm?.scope_sublines ?? ["PremOps", "ProdsCompldOps"],
        filing_reference: row.lcm?.filing_reference ?? "",
        state_approval_status: row.lcm?.state_approval_status ?? "approved",
      };
    }
    return ev;
  }

  async function handleSave() {
    if (!allValid || !dirtyWithValues.length) return;
    setSaving(true); setSaveResult(null);
    try {
      const rows = dirtyWithValues.map(sc => {
        const row = matrixData.states.find(s => s.state_code === sc);
        const ev = editValues[sc];
        return {
          state_code: sc,
          bureau_edition: row.edition_id,
          lcm_value: parseFloat(ev.lcm_value),
          scope_sublines: ev.scope_sublines,
          filing_reference: ev.filing_reference || null,
          state_approval_status: ev.state_approval_status,
          approval_date: ev.state_approval_status === "approved" ? new Date().toISOString().slice(0, 10) : null,
          effective_date: cwEdition.effective_date,
          deviation_id: row.lcm?.deviation_id || null,
        };
      });
      const result = await phaseB.batchSaveDeviation({ carrier_id: carrierId, deviation_type: "LCM", rows });
      setSaveResult(result);
      setDirtyRows(new Set());
      if (result.saved?.length > 0) onSaved?.();
    } catch (err) {
      setSaveResult({ error: err.message });
    } finally {
      setSaving(false);
    }
  }

  function applyBulk(onlyEmpty) {
    if (!bulkLcm) return;
    const updates = {};
    for (const row of matrixData.states) {
      if (onlyEmpty && row.lcm !== null) continue;
      updates[row.state_code] = {
        lcm_value: String(bulkLcm),
        scope_sublines: [...bulkSublines],
        filing_reference: editValues[row.state_code]?.filing_reference ?? "",
        state_approval_status: editValues[row.state_code]?.state_approval_status ?? "approved",
      };
    }
    if (!Object.keys(updates).length) return;
    setEditValues(ev => ({ ...ev, ...updates }));
    setDirtyRows(dr => new Set([...dr, ...Object.keys(updates)]));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <CwMasterToggle matrixData={matrixData} carrierId={carrierId} cwEdition={cwEdition}
          deviationType="LCM" accessor={s => s.lcm} onSaved={onSaved} />
      </div>
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <button onClick={() => setBulkOpen(b => !b)}
          className="w-full flex items-center justify-between px-4 py-2 bg-gray-50 text-xs font-medium text-gray-600 hover:bg-gray-100">
          <span>Fill All States</span>
          <span className="text-gray-400">{bulkOpen ? "▲" : "▼"}</span>
        </button>
        {bulkOpen && (
          <div className="px-4 py-3 flex items-end gap-4 flex-wrap">
            <Field label="LCM Value">
              <input type="number" step="0.0001" min="0.5" max="3.0" value={bulkLcm}
                onChange={e => setBulkLcm(e.target.value)} placeholder="e.g. 1.1500" className={`${INPUT_SM} w-28`} />
            </Field>
            <Field label="Sublines">
              <SublineCheckboxes selected={bulkSublines} onChange={setBulkSublines} />
            </Field>
            <div className="flex gap-2 pb-0.5">
              <button onClick={() => applyBulk(true)}
                className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 px-3 py-1.5 rounded">Apply to Empty</button>
              <button onClick={() => applyBulk(false)}
                className="text-xs bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 px-3 py-1.5 rounded">Apply to All</button>
            </div>
          </div>
        )}
      </div>

      <div className="overflow-auto max-h-[60vh] border border-gray-200 rounded-lg">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 bg-white z-10">
            <tr className="border-b-2 border-gray-200">
              <th className="text-left py-2 pl-3 pr-2 font-semibold text-gray-500 w-12">State</th>
              <th className="text-left py-2 pr-2 font-semibold text-gray-500 w-44">Edition</th>
              <th className="text-left py-2 pr-2 font-semibold text-gray-500 w-10">Ver</th>
              <th className="text-left py-2 pr-2 font-semibold text-gray-500 w-28">LCM Value</th>
              <th className="text-left py-2 pr-2 font-semibold text-gray-500 w-60">Sublines</th>
              <th className="text-left py-2 pr-2 font-semibold text-gray-500 w-32">Filing Ref</th>
              <th className="text-left py-2 pr-2 font-semibold text-gray-500 w-28">Approval</th>
              <th className="text-left py-2 pr-2 font-semibold text-gray-500 w-24">Status</th>
              <th className="text-left py-2 pr-2 font-semibold text-gray-500 w-16">On/Off</th>
              <th className="w-4"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {matrixData.states.map(row => {
              const ev = editValues[row.state_code] || {};
              const isDirty = dirtyRows.has(row.state_code);
              const errs = isDirty ? validateRow(row.state_code) : [];
              return (
                <tr key={row.state_code} className={isDirty ? "bg-yellow-50/40" : "hover:bg-gray-50"}>
                  <td className="py-1 pl-3 pr-2 font-mono font-semibold text-gray-800">{row.state_code}</td>
                  <td className="py-1 pr-2 text-gray-400 font-mono text-[10px]">{row.edition_id}</td>
                  <td className="py-1 pr-2 text-gray-500">V{row.edition_version}</td>
                  <td className="py-1 pr-2">
                    <input type="number" step="0.0001" min="0.5" max="3.0"
                      value={ev.lcm_value ?? ""} placeholder="1.0000"
                      onChange={e => markDirty(row.state_code, "lcm_value", e.target.value)}
                      className={`w-24 ${errs.length ? CELL_ERR : CELL}`}
                      title={errs.length ? errs.join("; ") : undefined} />
                  </td>
                  <td className="py-1 pr-2">
                    <SublineCheckboxes compact selected={ev.scope_sublines}
                      onChange={v => markDirty(row.state_code, "scope_sublines", v)} />
                  </td>
                  <td className="py-1 pr-2">
                    <input value={ev.filing_reference ?? ""} placeholder="ref #"
                      onChange={e => markDirty(row.state_code, "filing_reference", e.target.value)}
                      className="w-28 text-xs border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:border-blue-400" />
                  </td>
                  <td className="py-1 pr-2">
                    <ApprovalSelect value={ev.state_approval_status} onChange={v => markDirty(row.state_code, "state_approval_status", v)} />
                  </td>
                  <td className="py-1 pr-2"><DevStatusCell dev={row.lcm} /></td>
                  <td className="py-1 pr-2"><EnabledToggle dev={row.lcm} onChanged={onSaved} /></td>
                  <td className="py-1 pr-2 text-center"><DirtyDot dirty={isDirty} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <MatrixFooter saving={saving} dirtyCount={dirtyWithValues.length} allValid={allValid}
        onSave={handleSave} onReset={() => { setEditValues(rebuildEdits()); setDirtyRows(new Set()); }}
        saveResult={saveResult} onDismiss={() => setSaveResult(null)} />
    </div>
  );
}

// ── Flat Fee Tab ──────────────────────────────────────────────────────────────

function FlatFeeTab({ matrixData, carrierId, cwEdition, onSaved }) {
  const [editValues, setEditValues] = useState({});
  const [dirtyRows, setDirtyRows] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkFormCode, setBulkFormCode] = useState("");
  const [bulkFormName, setBulkFormName] = useState("");
  const [bulkFeeAmount, setBulkFeeAmount] = useState("");
  const [bulkFeeBasis, setBulkFeeBasis] = useState("per_policy");

  useEffect(() => {
    const ev = {};
    for (const row of matrixData.states) {
      ev[row.state_code] = {
        form_code: row.flat_fee?.form_code ?? "",
        form_name: row.flat_fee?.form_name ?? "",
        fee_amount: row.flat_fee?.fee_amount != null ? String(row.flat_fee.fee_amount) : "",
        fee_basis: row.flat_fee?.fee_basis ?? "per_policy",
        filing_reference: row.flat_fee?.filing_reference ?? "",
        state_approval_status: row.flat_fee?.state_approval_status ?? "approved",
      };
    }
    setEditValues(ev);
    setDirtyRows(new Set());
    setSaveResult(null);
  }, [matrixData]);

  function markDirty(sc, field, value) {
    setEditValues(ev => ({ ...ev, [sc]: { ...ev[sc], [field]: value } }));
    setDirtyRows(dr => new Set([...dr, sc]));
  }

  function validateRow(sc) {
    const ev = editValues[sc] || {};
    if (!ev.form_code && !ev.fee_amount) return [];
    const errs = [];
    if (!ev.form_code) errs.push("Form code required");
    if (!ev.form_name) errs.push("Form name required");
    const amt = parseFloat(ev.fee_amount);
    if (isNaN(amt) || amt <= 0) errs.push("Fee amount must be > 0");
    return errs;
  }

  const dirtyWithValues = [...dirtyRows].filter(sc => editValues[sc]?.form_code && editValues[sc]?.fee_amount);
  const allValid = dirtyWithValues.every(sc => validateRow(sc).length === 0);

  function applyBulkFee(onlyEmpty) {
    if (!bulkFormCode || !bulkFeeAmount) return;
    const updates = {};
    for (const row of matrixData.states) {
      if (onlyEmpty && row.flat_fee !== null) continue;
      updates[row.state_code] = {
        form_code: bulkFormCode,
        form_name: bulkFormName,
        fee_amount: String(bulkFeeAmount),
        fee_basis: bulkFeeBasis,
        filing_reference: editValues[row.state_code]?.filing_reference ?? "",
        state_approval_status: editValues[row.state_code]?.state_approval_status ?? "approved",
      };
    }
    if (!Object.keys(updates).length) return;
    setEditValues(ev => ({ ...ev, ...updates }));
    setDirtyRows(dr => new Set([...dr, ...Object.keys(updates)]));
  }

  async function handleSave() {
    if (!allValid || !dirtyWithValues.length) return;
    setSaving(true); setSaveResult(null);
    try {
      const rows = dirtyWithValues.map(sc => {
        const row = matrixData.states.find(s => s.state_code === sc);
        const ev = editValues[sc];
        return {
          state_code: sc,
          bureau_edition: row.edition_id,
          form_code: ev.form_code,
          form_name: ev.form_name,
          fee_amount: parseFloat(ev.fee_amount),
          fee_basis: ev.fee_basis,
          filing_reference: ev.filing_reference || null,
          state_approval_status: ev.state_approval_status,
          approval_date: ev.state_approval_status === "approved" ? new Date().toISOString().slice(0, 10) : null,
          effective_date: cwEdition.effective_date,
          deviation_id: row.flat_fee?.deviation_id || null,
        };
      });
      const result = await phaseB.batchSaveDeviation({ carrier_id: carrierId, deviation_type: "flat_fee", rows });
      setSaveResult(result);
      setDirtyRows(new Set());
    } catch (err) {
      setSaveResult({ error: err.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <CwMasterToggle matrixData={matrixData} carrierId={carrierId} cwEdition={cwEdition}
          deviationType="flat_fee" accessor={s => s.flat_fee} onSaved={onSaved} />
      </div>
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <button onClick={() => setBulkOpen(b => !b)}
          className="w-full flex items-center justify-between px-4 py-2 bg-gray-50 text-xs font-medium text-gray-600 hover:bg-gray-100">
          <span>Fill All States</span>
          <span className="text-gray-400">{bulkOpen ? "▲" : "▼"}</span>
        </button>
        {bulkOpen && (
          <div className="px-4 py-3 flex items-end gap-3 flex-wrap">
            <Field label="Form Code">
              <input value={bulkFormCode} onChange={e => setBulkFormCode(e.target.value)}
                placeholder="GL-XXX-001" className={`${INPUT_SM} w-28`} />
            </Field>
            <Field label="Form Name">
              <input value={bulkFormName} onChange={e => setBulkFormName(e.target.value)}
                placeholder="Coverage Enhancement" className={`${INPUT_SM} w-48`} />
            </Field>
            <Field label="Fee $">
              <input type="number" min="0" step="0.01" value={bulkFeeAmount}
                onChange={e => setBulkFeeAmount(e.target.value)} placeholder="0.00" className={`${INPUT_SM} w-24`} />
            </Field>
            <Field label="Basis">
              <select value={bulkFeeBasis} onChange={e => setBulkFeeBasis(e.target.value)} className={`${INPUT_SM}`}>
                <option value="per_policy">per policy</option>
                <option value="per_occurrence">per location</option>
              </select>
            </Field>
            <div className="flex gap-2 pb-0.5">
              <button onClick={() => applyBulkFee(true)}
                className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 px-3 py-1.5 rounded">Apply to Empty</button>
              <button onClick={() => applyBulkFee(false)}
                className="text-xs bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 px-3 py-1.5 rounded">Apply to All</button>
            </div>
          </div>
        )}
      </div>

      <div className="overflow-auto max-h-[60vh] border border-gray-200 rounded-lg">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 bg-white z-10">
            <tr className="border-b-2 border-gray-200">
              <th className="text-left py-2 pl-3 pr-2 font-semibold text-gray-500 w-12">State</th>
              <th className="text-left py-2 pr-2 font-semibold text-gray-500 w-20">Ver</th>
              <th className="text-left py-2 pr-2 font-semibold text-gray-500 w-28">Form Code</th>
              <th className="text-left py-2 pr-2 font-semibold text-gray-500">Form Name</th>
              <th className="text-left py-2 pr-2 font-semibold text-gray-500 w-20">Fee $</th>
              <th className="text-left py-2 pr-2 font-semibold text-gray-500 w-28">Basis</th>
              <th className="text-left py-2 pr-2 font-semibold text-gray-500 w-28">Filing Ref</th>
              <th className="text-left py-2 pr-2 font-semibold text-gray-500 w-28">Approval</th>
              <th className="text-left py-2 pr-2 font-semibold text-gray-500 w-24">Status</th>
              <th className="text-left py-2 pr-2 font-semibold text-gray-500 w-16">On/Off</th>
              <th className="w-4"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {matrixData.states.map(row => {
              const ev = editValues[row.state_code] || {};
              const isDirty = dirtyRows.has(row.state_code);
              const errs = isDirty ? validateRow(row.state_code) : [];
              const hasErr = errs.length > 0;
              return (
                <tr key={row.state_code} className={isDirty ? "bg-yellow-50/40" : "hover:bg-gray-50"}>
                  <td className="py-1 pl-3 pr-2 font-mono font-semibold text-gray-800">{row.state_code}</td>
                  <td className="py-1 pr-2 text-gray-500">V{row.edition_version}</td>
                  <td className="py-1 pr-2">
                    <input value={ev.form_code ?? ""} placeholder="GL-XXX-001"
                      onChange={e => markDirty(row.state_code, "form_code", e.target.value)}
                      className={`w-28 ${hasErr ? CELL_ERR : CELL}`}
                      title={hasErr ? errs.join("; ") : undefined} />
                  </td>
                  <td className="py-1 pr-2">
                    <input value={ev.form_name ?? ""} placeholder="Coverage Enhancement"
                      onChange={e => markDirty(row.state_code, "form_name", e.target.value)}
                      className={`w-48 ${CELL}`} />
                  </td>
                  <td className="py-1 pr-2">
                    <input type="number" min="0" step="0.01" value={ev.fee_amount ?? ""} placeholder="0.00"
                      onChange={e => markDirty(row.state_code, "fee_amount", e.target.value)}
                      className={`w-20 ${hasErr && ev.form_code && !ev.fee_amount ? CELL_ERR : CELL}`} />
                  </td>
                  <td className="py-1 pr-2">
                    <select value={ev.fee_basis ?? "per_policy"}
                      onChange={e => markDirty(row.state_code, "fee_basis", e.target.value)}
                      className={APPROVAL_SELECT}>
                      <option value="per_policy">per policy</option>
                      <option value="per_occurrence">per location</option>
                    </select>
                  </td>
                  <td className="py-1 pr-2">
                    <input value={ev.filing_reference ?? ""} placeholder="ref #"
                      onChange={e => markDirty(row.state_code, "filing_reference", e.target.value)}
                      className="w-24 text-xs border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:border-blue-400" />
                  </td>
                  <td className="py-1 pr-2">
                    <ApprovalSelect value={ev.state_approval_status} onChange={v => markDirty(row.state_code, "state_approval_status", v)} />
                  </td>
                  <td className="py-1 pr-2"><DevStatusCell dev={row.flat_fee} /></td>
                  <td className="py-1 pr-2"><EnabledToggle dev={row.flat_fee} onChanged={onSaved} /></td>
                  <td className="py-1 pr-2 text-center"><DirtyDot dirty={isDirty} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <MatrixFooter saving={saving} dirtyCount={dirtyWithValues.length} allValid={allValid}
        onSave={handleSave} saveResult={saveResult} onDismiss={() => setSaveResult(null)} />
    </div>
  );
}

// ── Schedule Mod Tab ──────────────────────────────────────────────────────────

function ScheduleModTab({ matrixData, carrierId, cwEdition, onSaved }) {
  const [editValues, setEditValues] = useState({});
  const [dirtyRows, setDirtyRows] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkCredit, setBulkCredit] = useState("");
  const [bulkDebit, setBulkDebit] = useState("");

  // Set of state codes whose per-category bounds editor is expanded inline.
  // Multiple states may be open simultaneously.
  const [expandedRows, setExpandedRows] = useState(() => new Set());

  // 6 ISO Rule 26.A categories — declared here for the matrix expansion.
  // Default seed when a state's category_bounds is empty: 5% credit / 5% debit
  // per category. User can edit per cell from there.
  const RULE26_CATEGORIES = [
    ["MANAGEMENT", "Management"],
    ["LOCATION", "Location"],
    ["PREMISES", "Premises"],
    ["EQUIPMENT", "Equipment"],
    ["CLASSIFICATION_PECULIARITIES", "Class Peculiarities"],
    ["EMPLOYEES", "Employees"],
    ["COOPERATION", "Cooperation"],
  ];
  const DEFAULT_CATEGORY_BOUND = { max_credit_pct: 5, max_debit_pct: 5 };
  function seedDefaultCategoryBounds() {
    const seed = {};
    for (const [code] of RULE26_CATEGORIES) {
      seed[code] = { ...DEFAULT_CATEGORY_BOUND };
    }
    return seed;
  }

  function toggleRowExpanded(sc) {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(sc)) {
        next.delete(sc);
        return next;
      }
      next.add(sc);
      // Seed default per-category bounds when opening for the first time.
      setEditValues(ev => {
        const cur = ev[sc] || {};
        if (cur.category_bounds && Object.keys(cur.category_bounds).length > 0) {
          return ev;
        }
        return {
          ...ev,
          [sc]: { ...cur, category_bounds: seedDefaultCategoryBounds() },
        };
      });
      setDirtyRows(dr => new Set([...dr, sc]));
      return next;
    });
  }

  useEffect(() => {
    const ev = {};
    for (const row of matrixData.states) {
      ev[row.state_code] = {
        max_credit_pct: row.schedule_mod?.max_credit_pct != null ? String(row.schedule_mod.max_credit_pct) : "",
        max_debit_pct: row.schedule_mod?.max_debit_pct != null ? String(row.schedule_mod.max_debit_pct) : "",
        filing_reference: row.schedule_mod?.filing_reference ?? "",
        state_approval_status: row.schedule_mod?.state_approval_status ?? "approved",
        category_bounds: row.schedule_mod?.category_bounds || {},
      };
    }
    setEditValues(ev);
    setDirtyRows(new Set());
    setSaveResult(null);
  }, [matrixData]);

  function setCategoryBound(sc, code, field, value) {
    setEditValues(ev => {
      const cur = ev[sc] || {};
      const cb = { ...(cur.category_bounds || {}) };
      cb[code] = { ...(cb[code] || {}), [field]: value };
      return { ...ev, [sc]: { ...cur, category_bounds: cb } };
    });
    setDirtyRows(dr => new Set([...dr, sc]));
  }

  function clearCategoryBounds(sc) {
    setEditValues(ev => ({ ...ev, [sc]: { ...(ev[sc] || {}), category_bounds: {} } }));
    setDirtyRows(dr => new Set([...dr, sc]));
  }

  function markDirty(sc, field, value) {
    setEditValues(ev => ({ ...ev, [sc]: { ...ev[sc], [field]: value } }));
    setDirtyRows(dr => new Set([...dr, sc]));
  }

  function validateRow(sc) {
    const ev = editValues[sc] || {};
    if (!ev.max_credit_pct && !ev.max_debit_pct) return [];
    const errs = [];
    const credit = parseFloat(ev.max_credit_pct);
    const debit = parseFloat(ev.max_debit_pct);
    if (ev.max_credit_pct && (isNaN(credit) || credit < 0 || credit > 25)) errs.push("Max credit must be 0-25");
    if (ev.max_debit_pct && (isNaN(debit) || debit < 0 || debit > 25)) errs.push("Max debit must be 0-25");
    return errs;
  }

  const dirtyWithValues = [...dirtyRows].filter(sc => {
    const ev = editValues[sc];
    return ev?.max_credit_pct || ev?.max_debit_pct;
  });
  const allValid = dirtyWithValues.every(sc => validateRow(sc).length === 0);

  function applyBulkSched(onlyEmpty) {
    if (!bulkCredit && !bulkDebit) return;
    const updates = {};
    for (const row of matrixData.states) {
      if (onlyEmpty && row.schedule_mod !== null) continue;
      updates[row.state_code] = {
        max_credit_pct: bulkCredit,
        max_debit_pct: bulkDebit,
        filing_reference: editValues[row.state_code]?.filing_reference ?? "",
        state_approval_status: editValues[row.state_code]?.state_approval_status ?? "approved",
      };
    }
    if (!Object.keys(updates).length) return;
    setEditValues(ev => ({ ...ev, ...updates }));
    setDirtyRows(dr => new Set([...dr, ...Object.keys(updates)]));
  }

  async function handleSave() {
    if (!allValid || !dirtyWithValues.length) return;
    setSaving(true); setSaveResult(null);
    try {
      const rows = dirtyWithValues.map(sc => {
        const row = matrixData.states.find(s => s.state_code === sc);
        const ev = editValues[sc];
        // Strip empty per-category caps so the backend stores only meaningful entries
        const cbIn = ev.category_bounds || {};
        const cbOut = {};
        for (const [code, vals] of Object.entries(cbIn)) {
          const c = parseFloat(vals?.max_credit_pct);
          const d = parseFloat(vals?.max_debit_pct);
          if (!isNaN(c) || !isNaN(d)) {
            cbOut[code] = {
              max_credit_pct: isNaN(c) ? 0 : c,
              max_debit_pct: isNaN(d) ? 0 : d,
            };
          }
        }
        return {
          state_code: sc,
          bureau_edition: row.edition_id,
          max_credit_pct: parseFloat(ev.max_credit_pct) || 0,
          max_debit_pct: parseFloat(ev.max_debit_pct) || 0,
          filing_reference: ev.filing_reference || null,
          state_approval_status: ev.state_approval_status,
          approval_date: ev.state_approval_status === "approved" ? new Date().toISOString().slice(0, 10) : null,
          effective_date: cwEdition.effective_date,
          deviation_id: row.schedule_mod?.deviation_id || null,
          category_bounds: cbOut,
        };
      });
      const result = await phaseB.batchSaveDeviation({ carrier_id: carrierId, deviation_type: "schedule_rating_mod", rows });
      setSaveResult(result);
      setDirtyRows(new Set());
    } catch (err) {
      setSaveResult({ error: err.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <CwMasterToggle matrixData={matrixData} carrierId={carrierId} cwEdition={cwEdition}
          deviationType="schedule_rating_mod" accessor={s => s.schedule_mod} onSaved={onSaved} />
      </div>
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <button onClick={() => setBulkOpen(b => !b)}
          className="w-full flex items-center justify-between px-4 py-2 bg-gray-50 text-xs font-medium text-gray-600 hover:bg-gray-100">
          <span>Fill All States</span>
          <span className="text-gray-400">{bulkOpen ? "▲" : "▼"}</span>
        </button>
        {bulkOpen && (
          <div className="px-4 py-3 flex items-end gap-3 flex-wrap">
            <Field label="Max Credit %">
              <input type="number" min="0" max="25" step="0.5" value={bulkCredit}
                onChange={e => setBulkCredit(e.target.value)} placeholder="25" className={`${INPUT_SM} w-24`} />
            </Field>
            <Field label="Max Debit %">
              <input type="number" min="0" max="25" step="0.5" value={bulkDebit}
                onChange={e => setBulkDebit(e.target.value)} placeholder="25" className={`${INPUT_SM} w-24`} />
            </Field>
            <div className="flex gap-2 pb-0.5">
              <button onClick={() => applyBulkSched(true)}
                className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 px-3 py-1.5 rounded">Apply to Empty</button>
              <button onClick={() => applyBulkSched(false)}
                className="text-xs bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 px-3 py-1.5 rounded">Apply to All</button>
            </div>
          </div>
        )}
      </div>

      <div className="overflow-auto max-h-[60vh] border border-gray-200 rounded-lg">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 bg-white z-10">
            <tr className="border-b-2 border-gray-200">
              <th className="w-6"></th>
              <th className="text-left py-2 pl-1 pr-2 font-semibold text-gray-500 w-12">State</th>
              <th className="text-left py-2 pr-2 font-semibold text-gray-500 w-44">Edition</th>
              <th className="text-left py-2 pr-2 font-semibold text-gray-500 w-10">Ver</th>
              <th className="text-left py-2 pr-2 font-semibold text-gray-500 w-28">Max Credit %</th>
              <th className="text-left py-2 pr-2 font-semibold text-gray-500 w-28">Max Debit %</th>
              <th className="text-left py-2 pr-2 font-semibold text-gray-500 w-32">Filing Ref</th>
              <th className="text-left py-2 pr-2 font-semibold text-gray-500 w-28">Approval</th>
              <th className="text-left py-2 pr-2 font-semibold text-gray-500 w-24">Status</th>
              <th className="text-left py-2 pr-2 font-semibold text-gray-500 w-16">On/Off</th>
              <th className="w-4"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {matrixData.states.map(row => {
              const ev = editValues[row.state_code] || {};
              const isDirty = dirtyRows.has(row.state_code);
              const errs = isDirty ? validateRow(row.state_code) : [];
              const hasErr = errs.length > 0;
              const isExpanded = expandedRows.has(row.state_code);
              const cb = ev.category_bounds || {};
              return (
                <Fragment key={row.state_code}>
                  <tr className={isDirty ? "bg-yellow-50/40" : "hover:bg-gray-50"}>
                    <td className="py-1 pl-2 pr-0 text-center align-middle">
                      <button onClick={() => toggleRowExpanded(row.state_code)}
                        title={isExpanded ? "Hide per-category caps" : "Show per-category caps (defaults 5/5 per category)"}
                        className="text-gray-400 hover:text-gray-700 inline-flex items-center justify-center w-4 h-4">
                        <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2"
                          className={`transition-transform ${isExpanded ? "rotate-90" : ""}`}>
                          <path d="M3 2 L7 5 L3 8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    </td>
                    <td className="py-1 pl-1 pr-2 font-mono font-semibold text-gray-800">{row.state_code}</td>
                    <td className="py-1 pr-2 text-gray-400 font-mono text-[10px]">{row.edition_id}</td>
                    <td className="py-1 pr-2 text-gray-500">V{row.edition_version}</td>
                    <td className="py-1 pr-2">
                      <input type="number" min="0" max="25" step="0.5" value={ev.max_credit_pct ?? ""} placeholder="25"
                        onChange={e => markDirty(row.state_code, "max_credit_pct", e.target.value)}
                        className={`w-20 ${hasErr ? CELL_ERR : CELL}`}
                        title={hasErr ? errs.join("; ") : undefined} />
                    </td>
                    <td className="py-1 pr-2">
                      <input type="number" min="0" max="25" step="0.5" value={ev.max_debit_pct ?? ""} placeholder="25"
                        onChange={e => markDirty(row.state_code, "max_debit_pct", e.target.value)}
                        className={`w-20 ${hasErr ? CELL_ERR : CELL}`} />
                    </td>
                    <td className="py-1 pr-2">
                      <input value={ev.filing_reference ?? ""} placeholder="ref #"
                        onChange={e => markDirty(row.state_code, "filing_reference", e.target.value)}
                        className="w-28 text-xs border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:border-blue-400" />
                    </td>
                    <td className="py-1 pr-2">
                      <ApprovalSelect value={ev.state_approval_status} onChange={v => markDirty(row.state_code, "state_approval_status", v)} />
                    </td>
                    <td className="py-1 pr-2"><DevStatusCell dev={row.schedule_mod} /></td>
                    <td className="py-1 pr-2"><EnabledToggle dev={row.schedule_mod} onChanged={onSaved} /></td>
                    <td className="py-1 pr-2 text-center">
                      <DirtyDot dirty={isDirty} />
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="bg-blue-50/40">
                      <td></td>
                      <td colSpan={10} className="px-2 py-2">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="text-[11px] font-semibold text-blue-900">
                            {row.state_code} per-category caps · defaults seeded at 5%/5%
                          </div>
                          <button onClick={() => clearCategoryBounds(row.state_code)}
                            className="text-[10px] text-blue-700 underline hover:text-blue-900">
                            Clear all (revert to aggregate-only)
                          </button>
                        </div>
                        <table className="w-full text-[11px]">
                          <thead><tr className="text-gray-500 border-b border-blue-100">
                            <th className="text-left pr-2 font-semibold w-44 py-1">Category</th>
                            <th className="text-left pr-2 font-semibold w-28 py-1">Max Credit %</th>
                            <th className="text-left pr-2 font-semibold w-28 py-1">Max Debit %</th>
                          </tr></thead>
                          <tbody>
                            {RULE26_CATEGORIES.map(([code, label]) => (
                              <tr key={code} className="border-b border-blue-100 last:border-b-0">
                                <td className="pr-2 py-1 text-gray-700">{label}</td>
                                <td className="pr-2 py-1">
                                  <input type="number" min="0" max="25" step="0.5"
                                    value={cb[code]?.max_credit_pct ?? ""}
                                    placeholder="(aggregate)"
                                    onChange={e => setCategoryBound(row.state_code, code, "max_credit_pct", e.target.value)}
                                    className="w-24 text-xs border border-gray-200 rounded px-1.5 py-0.5 bg-white focus:outline-none focus:border-blue-400" />
                                </td>
                                <td className="pr-2 py-1">
                                  <input type="number" min="0" max="25" step="0.5"
                                    value={cb[code]?.max_debit_pct ?? ""}
                                    placeholder="(aggregate)"
                                    onChange={e => setCategoryBound(row.state_code, code, "max_debit_pct", e.target.value)}
                                    className="w-24 text-xs border border-gray-200 rounded px-1.5 py-0.5 bg-white focus:outline-none focus:border-blue-400" />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <MatrixFooter saving={saving} dirtyCount={dirtyWithValues.length} allValid={allValid}
        onSave={handleSave} saveResult={saveResult} onDismiss={() => setSaveResult(null)} />
    </div>
  );
}

// ── Tier Factor Tab ───────────────────────────────────────────────────────────

// Per-state on/off toggle row for a tier program. Each state in the program's
// selectedStates that already has a tier_factor deviation gets an inline pill
// with the EnabledToggle. States without a saved deviation show as muted —
// nothing to toggle until the program is saved.
function TierProgramToggles({ matrixData, selectedStates }) {
  if (!selectedStates || selectedStates.length === 0) return null;
  const devByState = {};
  for (const row of matrixData.states || []) {
    if (row.tier_factor?.deviation_id) {
      devByState[row.state_code] = row.tier_factor;
    }
  }
  const hasAny = selectedStates.some(sc => devByState[sc]);
  if (!hasAny) return null;
  return (
    <div className="pt-2 border-t border-gray-100">
      <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
        Toggle per state · skips the rating engine without re-saving the program
      </div>
      <div className="flex flex-wrap gap-2">
        {selectedStates.map(sc => {
          const dev = devByState[sc];
          if (!dev) return (
            <span key={sc} className="px-2 py-1 rounded border border-dashed border-gray-200 text-[11px] text-gray-400">
              {sc} — save program to enable toggle
            </span>
          );
          return (
            <div key={sc} className="inline-flex items-center gap-2 px-2 py-1 rounded border border-gray-200 bg-white">
              <span className="font-mono text-[11px] text-gray-700">{sc}</span>
              <EnabledToggle dev={dev} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TierFactorTab({ matrixData, carrierId, cwEdition, onSaved }) {
  const [programs, setPrograms] = useState([]);
  const [expanded, setExpanded] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState(null);
  const [isDirty, setIsDirty] = useState(false);

  function makeProgram(num) {
    return {
      id: String(Date.now() + Math.random()),
      name: `Program ${num}`,
      tierConfig: { ...DEFAULT_TIER },
      selectedStates: [],
      filingRef: "",
      approvalStatus: "approved",
      // New programs default to PremOps only — matches the seeded behavior
      // and preserves bureau-correctness (most carriers file tier on PremOps
      // only since Products tier is rare).
      appliesToSublines: ["PremOps"],
    };
  }

  useEffect(() => {
    const groups = {};
    for (const row of matrixData.states) {
      if (!row.tier_factor) continue;
      // Group by tier_config AND applies_to_sublines so two programs with
      // the same table but different subline scopes don't collapse together.
      const subs = row.tier_factor.tier_config?.applies_to_sublines
        || row.tier_factor.applies_to_sublines
        || ["PremOps"];  // back-compat: existing rows without this field default to PremOps
      const key = JSON.stringify({ tc: row.tier_factor.tier_config, s: [...subs].sort() });
      if (!groups[key]) {
        groups[key] = {
          id: String(Math.random()),
          name: "",
          tierConfig: row.tier_factor.tier_config,
          selectedStates: [],
          filingRef: row.tier_factor.filing_reference || "",
          approvalStatus: row.tier_factor.state_approval_status || "approved",
          appliesToSublines: subs,
        };
      }
      groups[key].selectedStates.push(row.state_code);
    }
    let progs = Object.values(groups).map((p, i) => ({ ...p, name: `Program ${i + 1}` }));
    if (progs.length === 0) progs = [makeProgram(1)];
    setPrograms(progs);
    const exp = {};
    progs.forEach(p => { exp[p.id] = true; });
    setExpanded(exp);
    setIsDirty(false);
    setSaveResult(null);
  }, [matrixData]);

  function updateProgram(id, patch) {
    setPrograms(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p));
    setIsDirty(true);
  }

  function addProgram() {
    const p = makeProgram(programs.length + 1);
    setPrograms(prev => [...prev, p]);
    setExpanded(ex => ({ ...ex, [p.id]: true }));
    setIsDirty(true);
  }

  function removeProgram(id) {
    setPrograms(prev => prev.filter(p => p.id !== id));
    setIsDirty(true);
  }

  function toggleState(programId, stateCode) {
    setPrograms(prev => prev.map(p => {
      if (p.id !== programId) return p;
      const next = p.selectedStates.includes(stateCode)
        ? p.selectedStates.filter(s => s !== stateCode)
        : [...p.selectedStates, stateCode];
      return { ...p, selectedStates: next };
    }));
    setIsDirty(true);
  }

  const allStates = matrixData.states.map(r => r.state_code);

  function applyToEmpty(progId) {
    const prog = programs.find(p => p.id === progId);
    const assignedElsewhere = new Set(
      programs.filter(p => p.id !== progId).flatMap(p => p.selectedStates)
    );
    const unassigned = allStates.filter(s =>
      !assignedElsewhere.has(s) && !matrixData.states.find(r => r.state_code === s)?.tier_factor
    );
    updateProgram(progId, { selectedStates: [...new Set([...prog.selectedStates, ...unassigned])] });
  }

  function applyToAll(progId) {
    const assignedElsewhere = new Set(
      programs.filter(p => p.id !== progId).flatMap(p => p.selectedStates)
    );
    updateProgram(progId, { selectedStates: allStates.filter(s => !assignedElsewhere.has(s)) });
  }

  const existingDevMap = {};
  for (const row of matrixData.states) {
    if (row.tier_factor?.deviation_id) existingDevMap[row.state_code] = row.tier_factor.deviation_id;
  }

  const allSelected = programs.flatMap(p => p.selectedStates);
  const overlapping = allSelected.filter((s, i) => allSelected.indexOf(s) !== i);
  const totalSelected = allSelected.length;

  async function handleSave() {
    if (!totalSelected) return;
    setSaving(true); setSaveResult(null);
    try {
      const rows = [];
      for (const prog of programs) {
        for (const sc of prog.selectedStates) {
          const row = matrixData.states.find(s => s.state_code === sc);
          rows.push({
            state_code: sc,
            bureau_edition: row.edition_id,
            // Embed applies_to_sublines into tier_config so the existing
            // batch-save endpoint stores it inside algorithm_override_json
            // without needing a new column. c1_input reads from this same
            // JSON path when resolving the override.
            tier_config: {
              ...prog.tierConfig,
              applies_to_sublines: prog.appliesToSublines && prog.appliesToSublines.length > 0
                ? prog.appliesToSublines
                : ["PremOps"],
            },
            filing_reference: prog.filingRef || null,
            state_approval_status: prog.approvalStatus,
            approval_date: prog.approvalStatus === "approved" ? new Date().toISOString().slice(0, 10) : null,
            effective_date: cwEdition.effective_date,
            deviation_id: existingDevMap[sc] || null,
          });
        }
      }
      const result = await phaseB.batchSaveDeviation({ carrier_id: carrierId, deviation_type: "tier_rating_factor", rows });
      setSaveResult(result);
      setIsDirty(false);
    } catch (err) {
      setSaveResult({ error: err.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <CwMasterToggle matrixData={matrixData} carrierId={carrierId} cwEdition={cwEdition}
          deviationType="tier_rating_factor" accessor={s => s.tier_factor} onSaved={onSaved} />
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">
          Define one or more tier programs with different factor tables. Each program applies to its assigned states.
        </p>
        <button onClick={addProgram}
          className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded font-medium shrink-0 ml-4">
          + Add Tier Program
        </button>
      </div>

      {overlapping.length > 0 && (
        <div className="text-amber-700 text-xs bg-amber-50 border border-amber-200 rounded px-3 py-2">
          States assigned to multiple programs: {[...new Set(overlapping)].join(", ")} — the most recent save wins per state
        </div>
      )}

      <div className="space-y-3">
        {programs.map((prog, pi) => {
          const isOpen = expanded[prog.id] ?? true;
          const assignedElsewhere = new Set(
            programs.filter(p => p.id !== prog.id).flatMap(p => p.selectedStates)
          );
          return (
            <div key={prog.id} className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <button onClick={() => setExpanded(ex => ({ ...ex, [prog.id]: !isOpen }))}
                    className="text-gray-400 text-xs w-4">{isOpen ? "▼" : "▶"}</button>
                  <input value={prog.name}
                    onChange={e => updateProgram(prog.id, { name: e.target.value })}
                    className="text-sm font-semibold text-gray-800 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-400 focus:outline-none px-1 w-40" />
                  <span className="text-xs text-gray-400">{prog.selectedStates.length} state(s) assigned</span>
                </div>
                {programs.length > 1 && (
                  <button onClick={() => removeProgram(prog.id)}
                    className="text-gray-400 hover:text-red-500 text-sm font-bold px-1">×</button>
                )}
              </div>

              {isOpen && (
                <div className="px-4 py-4 space-y-4">
                  <TierMatrixBuilder config={prog.tierConfig}
                    onChange={cfg => updateProgram(prog.id, { tierConfig: cfg })} />

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">State Assignment</span>
                      <div className="flex gap-2">
                        <button onClick={() => applyToEmpty(prog.id)}
                          className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 px-2 py-1 rounded">
                          Apply to Empty
                        </button>
                        <button onClick={() => applyToAll(prog.id)}
                          className="text-xs bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 px-2 py-1 rounded">
                          Apply to All
                        </button>
                        <button onClick={() => updateProgram(prog.id, { selectedStates: [] })}
                          className="text-xs text-gray-400 hover:text-gray-600 underline">Clear</button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {allStates.map(sc => {
                        const checked = prog.selectedStates.includes(sc);
                        const inOther = !checked && assignedElsewhere.has(sc);
                        return (
                          <label key={sc}
                            className={`flex items-center gap-1 px-2 py-0.5 rounded border text-xs cursor-pointer select-none
                              ${checked ? "bg-blue-50 border-blue-300 text-blue-700" :
                                inOther ? "bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed" :
                                "bg-white border-gray-200 text-gray-600 hover:border-blue-200"}`}>
                            <input type="checkbox" checked={checked}
                              onChange={() => toggleState(prog.id, sc)}
                              className="accent-blue-600" />
                            {sc}
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex items-end gap-3 pt-2 border-t border-gray-100">
                    <Field label="Filing Ref">
                      <input value={prog.filingRef} placeholder="ref #"
                        onChange={e => updateProgram(prog.id, { filingRef: e.target.value })}
                        className={`${INPUT_SM} w-32`} />
                    </Field>
                    <Field label="Approval">
                      <ApprovalSelect value={prog.approvalStatus}
                        onChange={v => updateProgram(prog.id, { approvalStatus: v })} />
                    </Field>
                    <Field label="Applies To">
                      <div className="flex items-center gap-3 pb-1.5"
                        title="Default is PremOps only — Products tier is rare in filed programs.">
                        {[
                          { code: "PremOps", label: "PremOps" },
                          { code: "ProdsCompldOps", label: "Products/Comp Ops" },
                        ].map(({ code, label }) => {
                          const current = prog.appliesToSublines || ["PremOps"];
                          const checked = current.includes(code);
                          return (
                            <label key={code}
                              className={`flex items-center gap-1.5 text-xs cursor-pointer select-none
                                ${checked ? "text-blue-700 font-semibold" : "text-gray-600"}`}>
                              <input type="checkbox" checked={checked}
                                onChange={() => {
                                  const next = checked
                                    ? current.filter(s => s !== code)
                                    : [...current, code];
                                  if (next.length === 0) return;
                                  updateProgram(prog.id, { appliesToSublines: next });
                                }}
                                className="accent-blue-600" />
                              {label}
                            </label>
                          );
                        })}
                      </div>
                    </Field>
                  </div>

                  <TierProgramToggles
                    matrixData={matrixData}
                    selectedStates={prog.selectedStates} />

                </div>
              )}
            </div>
          );
        })}
      </div>

      <MatrixFooter saving={saving} dirtyCount={totalSelected} allValid={true}
        onSave={handleSave} saveResult={saveResult} onDismiss={() => setSaveResult(null)}
        saveLabel={totalSelected > 0
          ? `Save ${totalSelected} State(s) across ${programs.length} Program(s)`
          : `Save (assign states to programs first)`} />
    </div>
  );
}

// ── Deviation Matrix Editor (unified) ─────────────────────────────────────────

const TABS = ["LCM", "Flat Fee", "Schedule Mod", "Tier Factor"];

function DeviationMatrixEditor({ carriers = [], onCarrierAdded }) {
  const [carrierId, setCarrierId] = useState("");
  const [cwEditionsList, setCwEditionsList] = useState([]);
  const [selectedCw, setSelectedCw] = useState("");
  const [matrixData, setMatrixData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [activeTab, setActiveTab] = useState("LCM");
  const [addCarrierOpen, setAddCarrierOpen] = useState(false);
  const [newCarrierId, setNewCarrierId] = useState("");
  const [newCarrierName, setNewCarrierName] = useState("");
  const [addCarrierErr, setAddCarrierErr] = useState(null);

  useEffect(() => {
    if (carriers.length > 0 && !carrierId) setCarrierId(carriers[0].carrier_id);
  }, [carriers]);

  useEffect(() => {
    phaseB.cwEditions().then(eds => {
      setCwEditionsList(eds);
      if (eds.length > 0) setSelectedCw(eds[0].edition_id);
    }).catch(() => {});
  }, []);

  async function loadMatrix() {
    if (!selectedCw || !carrierId) return;
    setLoading(true); setLoadError(null);
    try {
      const data = await phaseB.deviationMatrix(selectedCw, carrierId);
      setMatrixData(data);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddCarrier() {
    if (!newCarrierId.trim() || !newCarrierName.trim()) return;
    setAddCarrierErr(null);
    try {
      await phaseB.createCarrier({ carrier_id: newCarrierId.trim(), carrier_name: newCarrierName.trim() });
      setNewCarrierId(""); setNewCarrierName(""); setAddCarrierOpen(false);
      onCarrierAdded?.();
    } catch (err) {
      setAddCarrierErr(err.message);
    }
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex items-end gap-3 flex-wrap">
        <Field label="Paper Company">
          {carriers.length > 0 ? (
            <select value={carrierId} onChange={e => setCarrierId(e.target.value)} className={`${INPUT} w-56`}>
              {carriers.map(c => (
                <option key={c.carrier_id} value={c.carrier_id}>{c.carrier_id} — {c.carrier_name}</option>
              ))}
            </select>
          ) : (
            <input value={carrierId} onChange={e => setCarrierId(e.target.value)}
              className={`${INPUT} w-40`} placeholder="Paper Company ID" />
          )}
        </Field>
        <button onClick={() => setAddCarrierOpen(o => !o)}
          className="mb-0.5 text-xs text-blue-600 hover:text-blue-800 underline self-end">
          {addCarrierOpen ? "Cancel" : "+ New Paper Company"}
        </button>
        <Field label="CW Base">
          <select value={selectedCw} onChange={e => setSelectedCw(e.target.value)} className={`${INPUT} w-80`}>
            {cwEditionsList.map(ed => (
              <option key={ed.edition_id} value={ed.edition_id}>
                {ed.effective_date} (V{ed.version}) — {ed.edition_id}
              </option>
            ))}
          </select>
        </Field>
        <button onClick={loadMatrix} disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white px-4 py-1.5 rounded text-sm font-medium">
          {loading ? "Loading…" : "Load Matrix"}
        </button>
      </div>

      {addCarrierOpen && (
        <div className="flex items-end gap-3 flex-wrap bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
          <Field label="Paper Company ID">
            <input value={newCarrierId} onChange={e => setNewCarrierId(e.target.value)}
              placeholder="e.g. ATLAS-GL" className={`${INPUT_SM} w-32`} />
          </Field>
          <Field label="Paper Company Name">
            <input value={newCarrierName} onChange={e => setNewCarrierName(e.target.value)}
              placeholder="e.g. Atlas General Liability" className={`${INPUT_SM} w-56`} />
          </Field>
          <button onClick={handleAddCarrier}
            disabled={!newCarrierId.trim() || !newCarrierName.trim()}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white px-4 py-1.5 rounded text-sm font-medium">
            Add Paper Company
          </button>
          {addCarrierErr && <span className="text-red-600 text-xs">{addCarrierErr}</span>}
        </div>
      )}

      {loadError && (
        <div className="text-red-600 text-xs bg-red-50 border border-red-200 rounded px-3 py-2">{loadError}</div>
      )}

      {matrixData && (
        <>
          <div className="flex border-b border-gray-200">
            {TABS.map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors
                  ${activeTab === tab ? "border-blue-500 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
                {tab}
              </button>
            ))}
          </div>
          {activeTab === "LCM" && <LcmTab matrixData={matrixData} carrierId={carrierId} cwEdition={matrixData.cw_edition} onSaved={loadMatrix} />}
          {activeTab === "Flat Fee" && <FlatFeeTab matrixData={matrixData} carrierId={carrierId} cwEdition={matrixData.cw_edition} onSaved={loadMatrix} />}
          {activeTab === "Schedule Mod" && <ScheduleModTab matrixData={matrixData} carrierId={carrierId} cwEdition={matrixData.cw_edition} onSaved={loadMatrix} />}
          {activeTab === "Tier Factor" && <TierFactorTab matrixData={matrixData} carrierId={carrierId} cwEdition={matrixData.cw_edition} onSaved={loadMatrix} />}
        </>
      )}
    </div>
  );
}

// ── Read-only panels ──────────────────────────────────────────────────────────

function DeviationRegister({ deviations, onAction, loading }) {
  if (loading) return <p className="text-gray-500 text-sm animate-pulse">Loading…</p>;
  if (!deviations.length) return <p className="text-gray-400 text-sm">No deviations defined yet.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-gray-500 text-left border-b border-gray-200">
            <th className="pb-2 pr-3 font-semibold">ID</th>
            <th className="pb-2 pr-3 font-semibold">Type</th>
            <th className="pb-2 pr-3 font-semibold">State</th>
            <th className="pb-2 pr-3 font-semibold">Filing Ref</th>
            <th className="pb-2 pr-3 font-semibold">Linked Circular</th>
            <th className="pb-2 pr-3 font-semibold">Status</th>
            <th className="pb-2 pr-3 font-semibold">Effective</th>
            <th className="pb-2 font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {deviations.map(d => (
            <tr key={d.deviation_id} className="hover:bg-gray-50">
              <td className="py-2 pr-3 font-mono text-gray-700">{d.deviation_id}</td>
              <td className="py-2 pr-3">
                <Badge label={TYPE_BADGE[d.deviation_type] || d.deviation_type}
                  variant={d.deviation_type === "LCM" ? "ACTIVE" : d.deviation_type === "tier_rating_factor" ? "WARN" : "INFO"} />
              </td>
              <td className="py-2 pr-3 text-gray-700">{d.state_code}</td>
              <td className="py-2 pr-3 text-gray-500">{d.filing_reference || "—"}</td>
              <td className="py-2 pr-3 text-gray-500 font-mono text-[11px]">{d.circular_id || "—"}</td>
              <td className="py-2 pr-3">
                <Badge label={d.status} variant={STATUS_VARIANT[d.status] || "INFO"} />
              </td>
              <td className="py-2 pr-3 text-gray-500">{d.effective_date}</td>
              <td className="py-2">
                <div className="flex gap-2 flex-wrap">
                  {d.status !== "ACTIVE" && d.status !== "CLOSED" && (
                    <button onClick={() => onAction("activate", d.deviation_id)}
                      className="text-blue-600 hover:text-blue-800 underline">Activate</button>
                  )}
                  {d.status === "PENDING_APPROVAL" && (
                    <button onClick={() => onAction("approve", d.deviation_id)}
                      className="text-green-600 hover:text-green-800 underline">Mark Approved</button>
                  )}
                  {d.status !== "CLOSED" && (
                    <button onClick={() => onAction("close", d.deviation_id)}
                      className="text-red-600 hover:text-red-800 underline">Close</button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ApprovalTracker({ deviations, onApprove }) {
  const pending = deviations.filter(d => d.status === "PENDING_APPROVAL" || d.status === "APPROVED");
  if (!pending.length) return <p className="text-gray-400 text-sm">No deviations pending approval.</p>;

  return (
    <div className="space-y-2">
      {pending.map(d => (
        <div key={d.deviation_id}
          className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded px-3 py-2">
          <div>
            <div className="text-amber-700 text-xs font-mono font-semibold">{d.deviation_id}</div>
            <div className="text-gray-500 text-xs mt-0.5">
              Filed: {d.created_at?.slice(0, 10)} · {daysSince(d.created_at)} days pending
              {d.filing_reference && ` · Ref: ${d.filing_reference}`}
            </div>
          </div>
          <button onClick={() => onApprove(d.deviation_id)}
            className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded ml-4">
            Mark Approved
          </button>
        </div>
      ))}
    </div>
  );
}

function CoverageMatrix({ matrix }) {
  if (!matrix) return <p className="text-gray-400 text-sm">Loading…</p>;
  const { summary, rows } = matrix;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-5 gap-2">
        {[
          ["States", summary.total_states_with_content],
          ["Rating Ready", summary.rating_ready],
          ["CW Missing", summary.cw_dependency_missing],
          ["Pending Devs", summary.pending_deviations],
          ["Bureau Only", summary.bureau_rates_only],
        ].map(([label, val]) => (
          <div key={label} className="bg-gray-50 border border-gray-100 rounded px-3 py-2 text-center">
            <div className="text-gray-500 text-xs">{label}</div>
            <div className="text-gray-900 font-mono text-xl font-semibold">{val}</div>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 text-left border-b border-gray-200">
              <th className="pb-2 pr-3 font-semibold">State</th>
              <th className="pb-2 pr-3 font-semibold">Edition</th>
              <th className="pb-2 pr-3 font-semibold">LCM</th>
              <th className="pb-2 pr-3 font-semibold">Schedule Mod</th>
              <th className="pb-2 pr-3 font-semibold">Restrictions</th>
              <th className="pb-2 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.state_code} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-2 pr-3 text-gray-800">{r.state_label}</td>
                <td className="py-2 pr-3 text-gray-500 font-mono">{r.edition_label}</td>
                <td className="py-2 pr-3 text-gray-700">{r.lcm}</td>
                <td className="py-2 pr-3 text-gray-500">{r.schedule_mod}</td>
                <td className="py-2 pr-3 text-gray-500">{r.restrictions}</td>
                <td className="py-2">
                  <Badge label={r.status_badge}
                    variant={r.status_badge === "LIVE" ? "ACTIVE" :
                             r.status_badge === "BUREAU ONLY" ? "INFO" :
                             r.status_badge === "CW MISSING" ? "WARN" : "PENDING"} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AuditLog({ entries }) {
  if (!entries.length) return <p className="text-gray-400 text-sm">No audit entries yet.</p>;
  return (
    <div className="space-y-1 max-h-48 overflow-y-auto">
      {entries.map(e => (
        <div key={e.id} className="flex gap-3 text-xs">
          <span className="text-gray-400 shrink-0 font-mono">{e.created_at?.slice(0, 19).replace("T", " ")}</span>
          <span className="text-gray-500 shrink-0">{e.actor}</span>
          <Badge label={e.action} variant={
            e.action === "deviation_activated" ? "ACTIVE" :
            e.action === "deviation_blocked" ? "BLOCKED" :
            e.action === "approval_received" ? "PASS" : "INFO"
          } />
          <span className="text-gray-700 truncate">{e.note}</span>
        </div>
      ))}
    </div>
  );
}

// ── Screen root ───────────────────────────────────────────────────────────────

export default function Screen2_DeviationManager() {
  const [deviations, setDeviations] = useState([]);
  const [matrix, setMatrix] = useState(null);
  const [auditEntries, setAuditEntries] = useState([]);
  const [carriers, setCarriers] = useState([]);
  const [toast, setToast] = useState(null);

  const refresh = useCallback(async () => {
    const [devs, mat, audit, cars] = await Promise.all([
      phaseB.deviations(),
      phaseB.coverageMatrix(),
      phaseB.auditLog(),
      phaseB.carriers(),
    ]);
    setDeviations(devs);
    setMatrix(mat.ui_coverage_matrix);
    setAuditEntries(audit);
    setCarriers(cars);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  function showToast(msg, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  async function handleAction(action, devId) {
    try {
      if (action === "activate") {
        const r = await phaseB.activate(devId);
        showToast(r.ui_activation_event?.toast_message || "Done", r.activated);
      } else if (action === "approve") {
        const today = new Date().toISOString().slice(0, 10);
        await phaseB.approve(devId, today);
        showToast("Marked approved — ready to activate");
      } else if (action === "close") {
        await phaseB.close(devId);
        showToast("Deviation closed", false);
      }
      await refresh();
    } catch (err) {
      showToast(err.message, false);
    }
  }

  return (
    <div className="p-6 text-gray-900 relative">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded shadow-lg text-sm font-medium transition-all
          ${toast.ok ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}>
          {toast.msg}
        </div>
      )}

      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-2 h-2 rounded-full bg-blue-500" />
          <h1 className="text-xl font-semibold text-gray-900">Deviation Manager</h1>
          <Badge label="SCREEN 2" variant="INFO" />
        </div>
        <p className="text-gray-500 text-sm">Phase B · Paper Company Deviations</p>
      </div>

      <Panel title="Deviation Matrix Editor" className="mb-6">
        <DeviationMatrixEditor carriers={carriers} onCarrierAdded={refresh} />
      </Panel>

      <div className="grid grid-cols-1 gap-4">
        <Panel title="Deviation Register">
          <DeviationRegister deviations={deviations} onAction={handleAction} loading={false} />
        </Panel>
        <Panel title="Approval Tracker">
          <ApprovalTracker deviations={deviations} onApprove={d => handleAction("approve", d)} />
        </Panel>
        <Panel title="Coverage Matrix — B-3">
          <CoverageMatrix matrix={matrix} />
        </Panel>
        <Panel title="Deviation Audit Log">
          <AuditLog entries={auditEntries} />
        </Panel>
      </div>
    </div>
  );
}
