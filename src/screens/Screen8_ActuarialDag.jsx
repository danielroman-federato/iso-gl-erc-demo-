import { useState, useEffect, useMemo } from "react";
import { phaseC, phaseB } from "../api/client";
import { Badge } from "../components/Badge";
import { Panel } from "../components/Panel";

// Screen 8 — Actuarial DAG (RS-2 Sprint 2.6 read-only + RS-5 light editor).
// Read mode renders the canonical step list with overlay state. Edit mode
// adds per-row controls (enabled toggle, rounding dropdown, insert-verb
// button between adjacent non-locked steps) and a Save flow. Editing is
// scoped to a (paper-company × edition × state) overlay row in the
// carrier_algorithm_model table.

const STATE_CODES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
];

const VERB_LABEL = {
  multiply_by: "× multiply",
  replace: "= replace",
  add_to: "+ add",
  insert_before: "↑ insert before",
  insert_after: "↓ insert after",
  disabled: "⊘ disabled",
  round_to: "≈ round",
};

const ROUNDING_OPTIONS = [
  { value: "", label: "(default)" },
  { value: "none", label: "none" },
  { value: "half-up-3dp", label: "half-up 3dp (rate)" },
  { value: "half-up-whole", label: "half-up whole (premium)" },
];

// ──────────────────────────────────────────────────────────────────────────

function InsertVerbModal({ open, onClose, onInsert, betweenLabel }) {
  const [verb, setVerb] = useState("multiply_by");
  const [factor, setFactor] = useState("");
  const [label, setLabel] = useState("");
  const [filingRef, setFilingRef] = useState("");
  if (!open) return null;
  function submit() {
    const f = parseFloat(factor);
    if (verb === "multiply_by" && (isNaN(f) || f <= 0)) return;
    onInsert({
      verb,
      factor: verb === "multiply_by" ? f : undefined,
      amount: verb === "add_to" ? f : undefined,
      label: label || null,
      serff_filing_ref: filingRef || null,
    });
    setVerb("multiply_by"); setFactor(""); setLabel(""); setFilingRef("");
  }
  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center"
      onClick={onClose}>
      <div className="bg-white rounded-lg shadow-2xl w-[480px] max-w-full p-5"
        onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-semibold mb-1 text-gray-900">Insert verb</h3>
        <div className="text-[11px] text-gray-500 mb-4">
          {betweenLabel} · constrained insertion only (no drag-and-drop)
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-0.5">Verb</label>
            <select value={verb} onChange={e => setVerb(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded px-2 py-1.5 text-sm">
              <option value="multiply_by">multiply_by (× scalar)</option>
              <option value="add_to" disabled>add_to (deferred to next sprint)</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-0.5">
              {verb === "multiply_by" ? "Factor" : "Amount"}
            </label>
            <input type="number" step="0.01" value={factor}
              onChange={e => setFactor(e.target.value)}
              placeholder={verb === "multiply_by" ? "e.g. 1.10" : "e.g. 25.00"}
              className="w-full bg-white border border-gray-300 rounded px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-0.5">Label (optional)</label>
            <input value={label} onChange={e => setLabel(e.target.value)}
              placeholder="Internal description"
              className="w-full bg-white border border-gray-300 rounded px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-0.5">SERFF filing ref (optional)</label>
            <input value={filingRef} onChange={e => setFilingRef(e.target.value)}
              placeholder="e.g. AL-2026-OVERLAY-001"
              className="w-full bg-white border border-gray-300 rounded px-2 py-1.5 text-sm font-mono" />
          </div>
        </div>
        <div className="text-[10px] text-amber-700 mt-3 bg-amber-50 border border-amber-200 rounded p-2">
          Bureau-correctness gates: cannot target bureau-immutable steps (PO-1, PO-2C, PO-3, PO-4, PO-5).
          Tier-before-LCM (PO-2/PR-2) is a market-conduct landmine — refused at save.
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose}
            className="px-3 py-1.5 rounded border border-gray-300 text-gray-700 text-sm hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={submit}
            disabled={!factor}
            className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-semibold">
            Insert
          </button>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────

function LaneRow({ row, lane, idx, locked, editMode, draft, onUpdate, onInsertBetween, totalRows }) {
  const overrides = row.overrides || [];
  const stepDraft = draft?.[row.step_id] || {};
  const enabledFromOverlay = stepDraft.enabled !== false;
  const rounding = stepDraft.rounding || "";
  const insertedVerbs = stepDraft.inserted_verbs || [];
  // Fix #3 — RS-2 Sprint 2 only wired PO-2B / PR-2B / PL-99 through the
  // override grammar. Other steps SAVE overlay entries but the engine
  // currently ignores them. Visible warning on inactive editable steps.
  const overlayLive = row.overlay_live;
  const hasDraftChanges =
    stepDraft.enabled === false ||
    (stepDraft.rounding && stepDraft.rounding !== "none") ||
    (stepDraft.inserted_verbs && stepDraft.inserted_verbs.length > 0);
  const showInactiveWarning = editMode && !locked && !overlayLive && hasDraftChanges;

  function toggleEnabled() {
    if (locked) return;
    onUpdate(row.step_id, { ...stepDraft, enabled: !enabledFromOverlay });
  }
  function setRounding(v) {
    if (!v) {
      const { rounding: _drop, ...rest } = stepDraft;
      onUpdate(row.step_id, rest);
    } else {
      onUpdate(row.step_id, { ...stepDraft, rounding: v });
    }
  }

  return (
    <>
      <div className={`px-3 py-2 border-b border-gray-100 ${locked ? "bg-gray-50" : ""} ${!enabledFromOverlay ? "opacity-60" : ""}`}>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-gray-600 w-16">{row.step_id}</span>
          <span className="text-sm text-gray-800 flex-1">{row.label}</span>
          {locked && (
            <span className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold"
              title="Bureau-immutable. Carrier overlays cannot replace, disable, or alter this step per CLM.">
              🔒 locked by bureau
            </span>
          )}
          {!locked && editMode && (
            overlayLive ? (
              <span className="text-[10px] uppercase tracking-wide text-emerald-700 font-semibold"
                title="Override grammar wired here — overlay entries WILL affect rating at this step.">
                ◉ live
              </span>
            ) : (
              <span className="text-[10px] uppercase tracking-wide text-amber-700 font-semibold"
                title="Overlay saves here but the engine doesn't read this step yet. Lands when RS-2 Sprints 3-5 finish porting LCM, schedule_mod, and flat_fee to the override grammar.">
                ⚠ stub
              </span>
            )
          )}
          {row.override_count > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-mono">
              {row.override_count}
            </span>
          )}
          {editMode && !locked && (
            <>
              <select value={rounding} onChange={e => setRounding(e.target.value)}
                className="text-[10px] bg-white border border-gray-300 rounded px-1 py-0.5"
                title="Per-step rounding (RS-5 light). Wired today at PO-2B / PR-2B / PL-99 — others surface as overlay metadata.">
                {ROUNDING_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <button onClick={toggleEnabled}
                title={enabledFromOverlay ? "Click to disable this step" : "Click to re-enable"}
                className={`relative inline-flex items-center w-9 h-5 rounded-full transition-colors
                  ${enabledFromOverlay ? "bg-emerald-500" : "bg-gray-300"}`}>
                <span className={`absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform
                  ${enabledFromOverlay ? "translate-x-4" : "translate-x-0"}`} />
              </button>
            </>
          )}
        </div>

        {(overrides.length > 0 || insertedVerbs.length > 0 || !enabledFromOverlay) && (
          <div className="mt-1.5 space-y-1">
            {overrides.filter(o => o.enabled !== false).map((o, i) => (
              <div key={i} className="text-[11px] flex items-center gap-2 pl-16">
                <span className="font-mono text-emerald-700 font-semibold">{VERB_LABEL[o.verb] || o.verb}</span>
                <span className="font-mono text-gray-600">{o.deviation_id}</span>
                {o.serff_filing_ref && (
                  <span title="SERFF filing reference"
                    className="font-mono text-[10px] bg-white border border-gray-300 rounded px-1.5 py-0.5 text-gray-700">
                    {o.serff_filing_ref}
                  </span>
                )}
                {o.source === "carrier_algorithm_overlay" && (
                  <span className="text-[10px] text-purple-700 font-semibold">from overlay</span>
                )}
              </div>
            ))}
            {insertedVerbs.map((v, i) => (
              <div key={`new-${i}`} className="text-[11px] flex items-center gap-2 pl-16">
                <span className="font-mono text-purple-700 font-semibold">
                  {VERB_LABEL[v.verb] || v.verb}{v.factor ? ` ${v.factor}` : ""}
                </span>
                {v.label && <span className="text-gray-600 italic">{v.label}</span>}
                {v.serff_filing_ref && (
                  <span className="font-mono text-[10px] bg-white border border-gray-300 rounded px-1.5 py-0.5 text-gray-700">
                    {v.serff_filing_ref}
                  </span>
                )}
                <span className="text-[10px] text-purple-700 font-semibold">unsaved · overlay</span>
                {editMode && (
                  <button onClick={() => {
                    const next = insertedVerbs.filter((_, j) => j !== i);
                    onUpdate(row.step_id, { ...stepDraft, inserted_verbs: next });
                  }} className="text-[10px] text-red-600 hover:text-red-800 underline">remove</button>
                )}
              </div>
            ))}
            {!enabledFromOverlay && (
              <div className="text-[11px] flex items-center gap-2 pl-16 text-amber-700">
                <span className="font-mono font-semibold">{VERB_LABEL.disabled}</span>
                <span className="italic">step skipped · bureau baseline passes through</span>
              </div>
            )}
          </div>
        )}
        {showInactiveWarning && (
          <div className="mt-1.5 pl-16">
            <div className="text-[10px] inline-flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded px-2 py-1 text-amber-800">
              <span>⚠</span>
              <span>
                Override grammar isn't wired at <span className="font-mono">{row.step_id}</span> yet.
                Edits save to the overlay but won't affect rating until RS-2 Sprints 3-5 ship.
                Currently live: <span className="font-mono">PO-2B</span>, <span className="font-mono">PR-2B</span>, <span className="font-mono">PL-99</span>.
              </span>
            </div>
          </div>
        )}
      </div>

      {editMode && idx < totalRows - 1 && !locked && (
        <div className="px-3 py-0.5 -my-px flex justify-center">
          <button onClick={() => onInsertBetween(row.step_id, idx)}
            className="text-[10px] text-blue-600 hover:text-blue-800 px-2 py-0.5 rounded border border-dashed border-blue-200 hover:border-blue-400 hover:bg-blue-50">
            + insert verb
          </button>
        </div>
      )}
    </>
  );
}

function Lane({ name, rows, editMode, draft, onUpdate, onInsertBetween }) {
  return (
    <div className="bg-white border border-gray-200 rounded">
      <div className="px-3 py-2 border-b border-gray-200 bg-gray-50">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600">
          {name} <span className="font-normal text-gray-400">({rows.length} steps)</span>
        </h3>
      </div>
      <div>
        {rows.map((r, i) => (
          <LaneRow key={r.step_id} row={r} lane={name} idx={i}
            locked={r.bureau_immutable} editMode={editMode}
            draft={draft} onUpdate={onUpdate}
            onInsertBetween={onInsertBetween}
            totalRows={rows.length} />
        ))}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────

export default function Screen8_ActuarialDag() {
  const [carriers, setCarriers] = useState([]);
  const [carrierId, setCarrierId] = useState("ACME");
  const [stateCode, setStateCode] = useState("AL");
  const [effectiveDate, setEffectiveDate] = useState("2026-01-01");
  const [dag, setDag] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState({});       // step_id → overlay entry
  const [serffRef, setSerffRef] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState(null);
  const [insertContext, setInsertContext] = useState(null);  // { stepId, idx, lane }

  useEffect(() => {
    phaseB.carriers().then(setCarriers).catch(() => {});
  }, []);

  function loadDag() {
    if (!carrierId || !stateCode || !effectiveDate) return;
    setLoading(true);
    setError(null);
    phaseC.algorithmDag(stateCode, effectiveDate, carrierId)
      .then(d => {
        setDag(d);
        // Seed draft from any existing overlay state surfaced on each row
        const seed = {};
        for (const lane of Object.values(d.lanes || {})) {
          for (const row of lane) {
            if (row.overlay) seed[row.step_id] = { ...row.overlay };
          }
        }
        setDraft(seed);
        setSerffRef(d.carrier_algorithm_model?.serff_filing_ref || "");
        setSaveResult(null);
      })
      .catch(e => { setDag(null); setError(e.message); })
      .finally(() => setLoading(false));
  }
  useEffect(loadDag, [carrierId, stateCode, effectiveDate]);

  // Track which steps differ from the loaded baseline so we can dirty-mark them
  const baselineStr = useMemo(() => {
    if (!dag) return "";
    const seed = {};
    for (const lane of Object.values(dag.lanes || {})) {
      for (const row of lane) {
        if (row.overlay) seed[row.step_id] = { ...row.overlay };
      }
    }
    return JSON.stringify(seed);
  }, [dag]);
  const draftStr = JSON.stringify(draft);
  const dirty = baselineStr !== draftStr;

  function updateStep(stepId, value) {
    setDraft(prev => {
      const next = { ...prev };
      const isEmpty =
        !value ||
        (value.enabled !== false &&
         !value.rounding &&
         (!value.inserted_verbs || value.inserted_verbs.length === 0));
      if (isEmpty) delete next[stepId];
      else next[stepId] = value;
      return next;
    });
  }

  function openInsertBetween(stepId, idx) {
    setInsertContext({ stepId, idx });
  }

  function handleInsert(verbPayload) {
    if (!insertContext) return;
    // Insert is attached to the step BEFORE the gap — when the engine
    // applies overrides at that step, the new verb runs after the step's
    // own math (or alongside any existing overrides).
    const stepId = insertContext.stepId;
    const existing = draft[stepId] || {};
    const insertedVerbs = [...(existing.inserted_verbs || []), verbPayload];
    updateStep(stepId, { ...existing, inserted_verbs: insertedVerbs });
    setInsertContext(null);
  }

  async function save() {
    if (!dag) return;
    setSaving(true);
    setSaveResult(null);
    try {
      const r = await phaseC.saveCarrierAlgorithmModel({
        carrier_id: dag.carrier_id,
        state_code: dag.state_code,
        edition_id: dag.edition_id,
        overlay_json: draft,
        serff_filing_ref: serffRef || null,
        notes: null,
        created_by: "ui_editor",
      });
      setSaveResult({ ok: true, model_id: r.model_id, version_hash: r.version_hash });
      loadDag();
    } catch (e) {
      let detail = e.message;
      try {
        const parsed = JSON.parse(e.message.split("API ")[1]?.split(": ").slice(1).join(": ") || "{}");
        detail = parsed.detail?.errors?.join("; ") || detail;
      } catch (_) {}
      setSaveResult({ ok: false, error: detail });
    } finally {
      setSaving(false);
    }
  }

  function discard() {
    if (!dag) return;
    const seed = {};
    for (const lane of Object.values(dag.lanes || {})) {
      for (const row of lane) {
        if (row.overlay) seed[row.step_id] = { ...row.overlay };
      }
    }
    setDraft(seed);
    setSerffRef(dag.carrier_algorithm_model?.serff_filing_ref || "");
    setSaveResult(null);
  }

  return (
    <div className="p-6 text-gray-900">
      <div className="mb-5">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-2 h-2 rounded-full bg-purple-500" />
          <h1 className="text-xl font-semibold text-gray-900">Actuarial DAG</h1>
          <Badge label="SCREEN 8" variant="INFO" />
          <Badge label={editMode ? "RS-5 LIGHT EDITOR" : "READ ONLY"} variant={editMode ? "WARN" : "INFO"} />
          {dag?.carrier_algorithm_model?.exists && (
            <Badge label={`overlay v${dag.carrier_algorithm_model.version_hash?.slice(0, 8)}`} variant="ACTIVE" />
          )}
          {dirty && editMode && <Badge label="unsaved" variant="BLOCKED" />}
        </div>
        <p className="text-gray-500 text-sm">
          Per (paper company × state × edition) view of the canonical rating algorithm.
          {editMode
            ? " Editing the carrier overlay — toggle steps, set rounding, insert verbs."
            : " Read-only — click 'Enter edit mode' to modify the overlay."}
        </p>
      </div>

      <div className="flex items-end gap-3 mb-5 flex-wrap">
        <div>
          <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-0.5">Paper Company</label>
          <select value={carrierId} onChange={e => setCarrierId(e.target.value)}
            className="bg-white border border-gray-300 rounded px-2 py-1 text-sm w-48">
            {(carriers || []).map(c => (
              <option key={c.carrier_id} value={c.carrier_id}>{c.carrier_name || c.carrier_id}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-0.5">State</label>
          <select value={stateCode} onChange={e => setStateCode(e.target.value)}
            className="bg-white border border-gray-300 rounded px-2 py-1 text-sm font-mono">
            {STATE_CODES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-0.5">Effective Date</label>
          <input type="date" value={effectiveDate} onChange={e => setEffectiveDate(e.target.value)}
            className="bg-white border border-gray-300 rounded px-2 py-1 text-sm" />
        </div>
        <div className="ml-auto flex items-center gap-2">
          {!editMode ? (
            <button onClick={() => setEditMode(true)}
              className="px-3 py-1.5 rounded bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold">
              Enter edit mode
            </button>
          ) : (
            <>
              <button onClick={() => { discard(); setEditMode(false); }}
                className="px-3 py-1.5 rounded border border-gray-300 text-gray-700 text-sm hover:bg-gray-50">
                Exit
              </button>
              <button onClick={discard} disabled={!dirty}
                className="px-3 py-1.5 rounded border border-gray-300 text-gray-700 text-sm hover:bg-gray-50 disabled:opacity-40">
                Discard
              </button>
              <button onClick={save} disabled={saving || !dirty}
                className="px-4 py-1.5 rounded bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white text-sm font-semibold">
                {saving ? "Saving…" : "Save overlay"}
              </button>
            </>
          )}
        </div>
        {dag && (
          <div className="basis-full text-[11px] text-gray-500 text-right">
            edition: <span className="font-mono text-gray-700">{dag.edition_id}</span>
            {" · "}model: <span className="font-mono text-gray-700">{dag.algorithm_model_version}</span>
            {" · "}active deviations: <span className="font-mono text-gray-700">{(dag.active_deviation_ids || []).length}</span>
          </div>
        )}
      </div>

      {editMode && (
        <div className="mb-4 bg-purple-50 border border-purple-200 rounded p-3 flex items-end gap-3 flex-wrap">
          <div className="flex-1">
            <label className="block text-[10px] uppercase tracking-wide text-purple-700 mb-0.5">SERFF filing reference (overlay-wide)</label>
            <input value={serffRef} onChange={e => setSerffRef(e.target.value)}
              placeholder="e.g. AL-2026-OVERLAY-001"
              className="w-full bg-white border border-purple-300 rounded px-2 py-1.5 text-sm font-mono" />
          </div>
          <div className="text-[11px] text-purple-800 max-w-md">
            Metadata only in RS-5 light. Full RS-5 enforces required-for-APPROVED with DRAFT→FILED→APPROVED workflow.
          </div>
        </div>
      )}

      {saveResult && (
        <div className={`mb-4 rounded p-3 text-sm ${saveResult.ok
          ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
          : "bg-red-50 border border-red-200 text-red-800"}`}>
          {saveResult.ok ? (
            <>✓ Saved overlay <span className="font-mono">{saveResult.model_id}</span>{" "}
              · hash <span className="font-mono">{saveResult.version_hash}</span>{" "}
              · next quote against this (paper-co × state × edition) picks it up
              <button onClick={() => setSaveResult(null)} className="ml-3 underline text-emerald-700">Dismiss</button></>
          ) : (
            <>✗ Save rejected: {saveResult.error}
              <button onClick={() => setSaveResult(null)} className="ml-3 underline text-red-700">Dismiss</button></>
          )}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded px-3 py-2 text-sm text-red-700 mb-4">{error}</div>
      )}

      {loading && <div className="text-gray-400 text-sm">Loading DAG…</div>}

      {dag && !loading && (
        <div className="space-y-4">
          <Panel title={`Canonical step list · ${dag.iso_rule_reference}`}>
            <div className="text-[11px] text-gray-500 italic mb-3">
              {editMode
                ? "Constrained-insertion picker only — no drag-and-drop. Bureau-immutable steps are locked."
                : dag._note}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Lane name="PremOps" rows={dag.lanes.PremOps}
                editMode={editMode} draft={draft} onUpdate={updateStep}
                onInsertBetween={openInsertBetween} />
              <Lane name="ProdsCompldOps" rows={dag.lanes.ProdsCompldOps}
                editMode={editMode} draft={draft} onUpdate={updateStep}
                onInsertBetween={openInsertBetween} />
              <Lane name="Policy" rows={dag.lanes.Policy}
                editMode={editMode} draft={draft} onUpdate={updateStep}
                onInsertBetween={openInsertBetween} />
            </div>
          </Panel>
          {!editMode && (
            <Panel title="Deferred to full RS-5 (Actuarial Management Workspace)">
              <ul className="text-xs text-gray-600 space-y-1 list-disc list-inside">
                <li>DRAFT → PENDING_FILING → FILED → APPROVED status workflow gated on SERFF filing ref + DOI evidence</li>
                <li>Bind-time gate refuses if (carrier × edition × state) model isn't APPROVED in-window</li>
                <li>Replay-safe: every bind stamps the model version hash + embeds the resolved model JSON in audit_package</li>
                <li>Per-state bulk save + clone-overlay workflows</li>
                <li>Editable filing-traceability with examiner correspondence upload</li>
              </ul>
            </Panel>
          )}
        </div>
      )}

      <InsertVerbModal
        open={!!insertContext}
        onClose={() => setInsertContext(null)}
        onInsert={handleInsert}
        betweenLabel={insertContext ? `Attached to step ${insertContext.stepId} (executes after step value computed)` : ""}
      />
    </div>
  );
}
