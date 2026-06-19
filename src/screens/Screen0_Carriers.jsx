import { useState, useEffect, useCallback } from "react";
import { carriers } from "../api/client";
import { Panel } from "../components/Panel";
import { Badge } from "../components/Badge";

const STATE_BADGE = {
  ACTIVE:   { variant: "ACTIVE" },
  INTENT:   { variant: "PENDING" },
  SUSPENDED:{ variant: "WARN" },
  DROPPED:  { variant: "BLOCKED" },
};

const IMPL_BADGE = {
  ACTIVE:   { variant: "ACTIVE" },
  DRAFT:    { variant: "PENDING" },
  SUSPENDED:{ variant: "WARN" },
  RETIRED:  { variant: "BLOCKED" },
};

const ONBOARDING_BADGE = {
  new:        { label: "Onboarded",      variant: "ACTIVE" },
  legacy:     { label: "Legacy",         variant: "WARN" },
  in_progress:{ label: "In Progress",    variant: "IN_PROGRESS" },
  retrofit:   { label: "Retrofit",       variant: "INFO" },
};

// ── Carriers list ────────────────────────────────────────────────────────────

function CarriersList({ onSelect, onNewCarrier, onRetrofit, refreshKey }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    carriers.list()
      .then(setRows)
      .finally(() => setLoading(false));
  }, [refreshKey]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">All Carriers</h2>
          <p className="text-gray-500 text-xs mt-0.5">Workspace selector · scopes every downstream phase to the chosen carrier's CW + state set.</p>
        </div>
        <button onClick={onNewCarrier}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded text-sm font-semibold">
          + New Carrier
        </button>
      </div>

      <Panel title="Carriers">
        {loading ? (
          <div className="text-gray-400 text-xs italic py-4">Loading…</div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 text-left border-b border-gray-200">
                <th className="py-2 pr-3 font-semibold">Carrier</th>
                <th className="py-2 pr-3 font-semibold">NAIC</th>
                <th className="py-2 pr-3 font-semibold">Primary State</th>
                <th className="py-2 pr-3 font-semibold">Onboarding</th>
                <th className="py-2 pr-3 font-semibold">Status</th>
                <th className="py-2 pr-3 font-semibold text-right">CW Bases</th>
                <th className="py-2 pr-3 font-semibold text-right">States</th>
                <th className="py-2 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(c => {
                const onbBadge = ONBOARDING_BADGE[c.onboarding_status] || { label: c.onboarding_status || "—", variant: "INFO" };
                const implBadge = IMPL_BADGE[c.impl_status] || { variant: "INFO" };
                const isLegacy = c.onboarding_status === "legacy";
                return (
                  <tr key={c.carrier_id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2 pr-3">
                      <div className="font-semibold text-gray-800">{c.carrier_name}</div>
                      <div className="text-[10px] text-gray-400 font-mono">{c.carrier_id}</div>
                    </td>
                    <td className="py-2 pr-3 text-gray-500">{c.naic_code || "—"}</td>
                    <td className="py-2 pr-3 text-gray-500">{c.primary_state || "—"}</td>
                    <td className="py-2 pr-3"><Badge label={onbBadge.label} variant={onbBadge.variant} /></td>
                    <td className="py-2 pr-3"><Badge label={c.impl_status || "—"} variant={implBadge.variant} /></td>
                    <td className="py-2 pr-3 text-right font-mono">{c.cw_count || 0}</td>
                    <td className="py-2 pr-3 text-right font-mono">{c.state_count || 0}</td>
                    <td className="py-2">
                      {isLegacy ? (
                        <button onClick={() => onRetrofit(c)}
                          className="text-amber-700 hover:text-amber-900 underline">Complete scope</button>
                      ) : (
                        <button onClick={() => onSelect(c.carrier_id)}
                          className="text-blue-600 hover:text-blue-800 underline">Open</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}

// ── Onboarding Wizard (5 steps) ──────────────────────────────────────────────

function Wizard({ initialCarrier, onCancel, onComplete }) {
  const [step, setStep] = useState(1);
  const [identity, setIdentity] = useState({
    carrier_id: initialCarrier?.carrier_id || "",
    carrier_name: initialCarrier?.carrier_name || "",
    naic_code: "",
    primary_state: "",
    iso_terms_version: "CLM-2026.1",
    iso_terms_acknowledged: false,
  });
  const [lob, setLob] = useState("GL");
  const [cwCatalog, setCwCatalog] = useState([]);
  // Multi-CW: list of { cw_project_reference, auto_roll_forward, states: [...] }
  const [cwGroups, setCwGroups] = useState([]);
  const [pickingCwId, setPickingCwId] = useState("");
  // Map of cw_project_reference -> states available under that CW (cached)
  const [statesByCw, setStatesByCw] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState(null);

  // Load CW catalog when entering step 3
  useEffect(() => {
    if (step === 3 && cwCatalog.length === 0) {
      carriers.cwBases(lob).then(setCwCatalog).catch(e => setErr(e.message));
    }
  }, [step]);

  // Lazily load states-per-CW when needed in step 4
  useEffect(() => {
    if (step === 4) {
      cwGroups.forEach(g => {
        if (!statesByCw[g.cw_project_reference]) {
          carriers.statesForCw(g.cw_project_reference, lob).then(s => {
            setStatesByCw(prev => ({ ...prev, [g.cw_project_reference]: s }));
          }).catch(e => setErr(e.message));
        }
      });
    }
  }, [step, cwGroups.length]);

  function addCwGroup() {
    if (!pickingCwId) return;
    if (cwGroups.find(g => g.cw_project_reference === pickingCwId)) return;
    setCwGroups(prev => [...prev, {
      cw_project_reference: pickingCwId,
      auto_roll_forward: false,
      states: [],
    }]);
    setPickingCwId("");
  }

  function removeCwGroup(cw_ref) {
    setCwGroups(prev => prev.filter(g => g.cw_project_reference !== cw_ref));
  }

  function toggleAutoRollForward(cw_ref) {
    setCwGroups(prev => prev.map(g =>
      g.cw_project_reference === cw_ref
        ? { ...g, auto_roll_forward: !g.auto_roll_forward }
        : g
    ));
  }

  function addStateToGroup(cw_ref, s) {
    setCwGroups(prev => prev.map(g => {
      if (g.cw_project_reference !== cw_ref) return g;
      if (g.states.find(x => x.edition_id === s.edition_id)) return g;
      return { ...g, states: [...g.states, { ...s, doi_license_ref: "", auto_track_edition: true }] };
    }));
  }

  function removeStateFromGroup(cw_ref, edition_id) {
    setCwGroups(prev => prev.map(g =>
      g.cw_project_reference === cw_ref
        ? { ...g, states: g.states.filter(s => s.edition_id !== edition_id) }
        : g
    ));
  }

  function updateStateInGroup(cw_ref, edition_id, patch) {
    setCwGroups(prev => prev.map(g =>
      g.cw_project_reference === cw_ref
        ? { ...g, states: g.states.map(s => s.edition_id === edition_id ? { ...s, ...patch } : s) }
        : g
    ));
  }

  // Across-group state-code uniqueness: a state code can only be activated
  // under ONE CW within this onboarding flow. (Real-world transition between
  // CWs happens later via Phase D, not at onboard time.)
  const activatedStateCodesAcross = new Set(
    cwGroups.flatMap(g => g.states.map(s => s.state_code))
  );

  async function activate() {
    setSubmitting(true); setErr(null);
    try {
      const r = await carriers.activate({
        carrier_id: identity.carrier_id,
        carrier_name: identity.carrier_name,
        naic_code: identity.naic_code || null,
        primary_state: identity.primary_state || null,
        lob,
        iso_terms_version: identity.iso_terms_version,
        iso_terms_acknowledged: identity.iso_terms_acknowledged,
        actor_user: "demo_user",
        cw_subscriptions: cwGroups.map(g => ({
          cw_project_reference: g.cw_project_reference,
          auto_roll_forward: g.auto_roll_forward,
          forms_only: false,
          states: g.states.map(s => ({
            edition_id: s.edition_id,
            doi_license_ref: s.doi_license_ref || null,
            doi_license_status: s.doi_license_ref ? "admitted" : "non-admitted",
            auto_track_edition: !!s.auto_track_edition,
          })),
        })),
      });
      onComplete(r);
    } catch (e) {
      setErr(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  const STEPS = ["Identity", "LOB", "CW Bases", "State Activation", "Review & Activate"];
  const totalStates = cwGroups.reduce((n, g) => n + g.states.length, 0);

  function canAdvance() {
    if (step === 1) return identity.carrier_id && identity.carrier_name && identity.iso_terms_acknowledged;
    if (step === 2) return !!lob;
    if (step === 3) return cwGroups.length > 0;
    if (step === 4) return totalStates > 0 && cwGroups.every(g => g.states.length > 0);
    return true;
  }

  // CWs not yet added (for the picker in step 3)
  const availableCwsForPicker = cwCatalog.filter(cw =>
    !cwGroups.find(g => g.cw_project_reference === cw.cw_project_reference)
  );

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Progress rail */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-200">
          {STEPS.map((label, i) => {
            const n = i + 1;
            const isActive = step === n;
            const isPast = step > n;
            return (
              <div key={label} className="flex items-center">
                <div className={`flex items-center gap-1.5 text-xs font-medium ${
                  isActive ? "text-blue-700" : isPast ? "text-emerald-700" : "text-gray-400"
                }`}>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    isActive ? "bg-blue-100 text-blue-700" :
                    isPast ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-400"
                  }`}>{isPast ? "✓" : n}</span>
                  {label}
                </div>
                {n < STEPS.length && <span className="mx-2 text-gray-300">›</span>}
              </div>
            );
          })}
          <button onClick={onCancel} className="ml-auto text-gray-400 hover:text-gray-700 text-xs">Cancel</button>
        </div>

        {/* Step content */}
        <div className="flex-1 overflow-y-auto p-5">
          {err && (
            <div className="mb-3 bg-red-50 border border-red-200 text-red-700 rounded px-3 py-2 text-xs">{err}</div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-900">Step 1 — Carrier Identity</h3>
              <p className="text-xs text-gray-500">Establish the carrier record and capture acknowledgment of the ISO master CLM redistribution terms. The acknowledgment hash anchors the audit trail.</p>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-gray-500 mb-0.5">Carrier ID</label>
                  <input value={identity.carrier_id}
                    onChange={e => setIdentity({ ...identity, carrier_id: e.target.value.toUpperCase() })}
                    placeholder="e.g. ACME-GL"
                    disabled={!!initialCarrier}
                    className="w-full bg-white border border-gray-300 rounded px-2 py-1.5 text-sm font-mono disabled:bg-gray-50" />
                </div>
                <div>
                  <label className="block text-gray-500 mb-0.5">Carrier Name</label>
                  <input value={identity.carrier_name}
                    onChange={e => setIdentity({ ...identity, carrier_name: e.target.value })}
                    placeholder="Carrier display name"
                    className="w-full bg-white border border-gray-300 rounded px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-gray-500 mb-0.5">NAIC Code (optional)</label>
                  <input value={identity.naic_code}
                    onChange={e => setIdentity({ ...identity, naic_code: e.target.value })}
                    placeholder="e.g. 12345"
                    className="w-full bg-white border border-gray-300 rounded px-2 py-1.5 text-sm font-mono" />
                </div>
                <div>
                  <label className="block text-gray-500 mb-0.5">Primary State of Domicile (optional)</label>
                  <input value={identity.primary_state}
                    onChange={e => setIdentity({ ...identity, primary_state: e.target.value.toUpperCase() })}
                    maxLength={2} placeholder="AL"
                    className="w-full bg-white border border-gray-300 rounded px-2 py-1.5 text-sm font-mono uppercase" />
                </div>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded p-3 text-xs">
                <div className="font-semibold text-blue-900 mb-1">ISO Master CLM License (version {identity.iso_terms_version})</div>
                <p className="text-blue-800 mb-2">By acknowledging, the carrier confirms compliance with ISO redistribution terms. Acknowledgment is hashed and persisted as part of the activation audit trail.</p>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={identity.iso_terms_acknowledged}
                    onChange={e => setIdentity({ ...identity, iso_terms_acknowledged: e.target.checked })}
                    className="accent-blue-600" />
                  <span className="font-semibold text-blue-900">I acknowledge the ISO master CLM redistribution terms.</span>
                </label>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-900">Step 2 — Line of Business</h3>
              <p className="text-xs text-gray-500">Each LOB is a separate implementation. Only GL is available in this PoC.</p>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { id: "GL", label: "General Liability", enabled: true },
                  { id: "CA", label: "Commercial Auto", enabled: false },
                  { id: "BOP", label: "Business Owners Policy", enabled: false },
                  { id: "CP", label: "Commercial Property", enabled: false },
                  { id: "CYBER", label: "Cyber", enabled: false },
                  { id: "PROF", label: "Professional Liability", enabled: false },
                ].map(o => (
                  <button key={o.id}
                    disabled={!o.enabled}
                    onClick={() => setLob(o.id)}
                    className={`p-3 rounded border text-left transition-colors ${
                      lob === o.id ? "border-blue-500 bg-blue-50 text-blue-900" :
                      o.enabled ? "border-gray-200 hover:border-blue-300 text-gray-700" :
                      "border-gray-100 text-gray-300 cursor-not-allowed bg-gray-50"
                    }`}>
                    <div className="font-mono font-bold">{o.id}</div>
                    <div className="text-xs">{o.label}</div>
                    {!o.enabled && <div className="text-[10px] mt-1 italic">Coming soon</div>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-900">Step 3 — Countrywide (CW) Bases</h3>
              <p className="text-xs text-gray-500">
                A carrier may subscribe to multiple CW bases simultaneously — common when states transition between CW cycles on different DOI timelines. Each CW you add becomes its own subscription with its own state-activation set in Step 4. State editions are mathematically deltas on their parent CW (CLM Rule 25).
              </p>

              {/* Added CWs */}
              {cwGroups.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs text-gray-500 font-semibold">Added ({cwGroups.length})</div>
                  {cwGroups.map(g => {
                    const meta = cwCatalog.find(cw => cw.cw_project_reference === g.cw_project_reference);
                    return (
                      <div key={g.cw_project_reference} className="bg-emerald-50 border border-emerald-200 rounded p-3 flex items-center justify-between">
                        <div>
                          <div className="font-mono font-semibold text-sm text-emerald-900">{g.cw_project_reference}</div>
                          {meta && <div className="text-[10px] text-emerald-700">{meta.state_edition_count} state editions · {meta.earliest_effective} → {meta.latest_effective}</div>}
                          <label className="inline-flex items-center gap-1.5 mt-1 text-[11px] text-emerald-800 cursor-pointer">
                            <input type="checkbox" checked={g.auto_roll_forward}
                              onChange={() => toggleAutoRollForward(g.cw_project_reference)}
                              className="accent-blue-600" />
                            Auto-propose state-scope upgrades on new CW cycles (Compliance still signs off per state via Phase D)
                          </label>
                        </div>
                        <button onClick={() => removeCwGroup(g.cw_project_reference)}
                          className="text-red-600 hover:text-red-800 text-xs">Remove</button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Picker */}
              <div className="bg-gray-50 border border-gray-200 rounded p-3 space-y-2">
                <div className="text-xs text-gray-600 font-semibold">+ Add CW Base</div>
                {cwCatalog.length === 0 ? (
                  <div className="text-gray-400 text-xs italic">Loading available CW bases…</div>
                ) : availableCwsForPicker.length === 0 ? (
                  <div className="text-gray-500 text-xs italic">All available CW bases have been added.</div>
                ) : (
                  <div className="flex items-center gap-2">
                    <select value={pickingCwId} onChange={e => setPickingCwId(e.target.value)}
                      className="flex-1 bg-white border border-gray-300 rounded px-2 py-1.5 text-sm font-mono">
                      <option value="">— Select a CW base —</option>
                      {availableCwsForPicker.map(cw => (
                        <option key={cw.cw_project_reference} value={cw.cw_project_reference}>
                          {cw.cw_project_reference} · {cw.state_edition_count} states · through {cw.latest_effective}
                        </option>
                      ))}
                    </select>
                    <button onClick={addCwGroup} disabled={!pickingCwId}
                      className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white px-3 py-1.5 rounded text-xs font-semibold">
                      + Add
                    </button>
                  </div>
                )}
              </div>

              {cwGroups.length === 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded p-2 text-[11px] text-amber-800">
                  Add at least one CW base to continue. Typical: one current-cycle CW. Multi-CW: when transitioning some states to a newer cycle while others stay on the prior cycle.
                </div>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-900">Step 4 — State Activation</h3>
              <p className="text-xs text-gray-500">
                <span className="font-mono">{lob}</span> · {cwGroups.length} CW base{cwGroups.length === 1 ? "" : "s"} · Activate states under each CW. Each state code can be activated under only ONE CW in this onboarding flow (cross-CW transition happens later via Phase D adoption). States without a DOI license reference are persisted as INTENT (subscribed but not quotable until a license is captured).
              </p>

              <div className="space-y-4">
                {cwGroups.map(g => {
                  const allForThisCw = statesByCw[g.cw_project_reference] || [];
                  const activatedHere = g.states;
                  // Available = under this CW AND not yet activated under ANY CW (across-group uniqueness)
                  const avail = allForThisCw.filter(s =>
                    !activatedHere.find(a => a.edition_id === s.edition_id) &&
                    !activatedStateCodesAcross.has(s.state_code)
                  );

                  return (
                    <div key={g.cw_project_reference} className="border border-gray-200 rounded">
                      <div className="bg-gray-50 px-3 py-2 border-b border-gray-200 flex items-center justify-between">
                        <div>
                          <span className="font-mono font-semibold text-sm text-gray-800">{g.cw_project_reference}</span>
                          <span className="text-[11px] text-gray-500 ml-2">{activatedHere.length} state{activatedHere.length === 1 ? "" : "s"} activated</span>
                        </div>
                        {g.auto_roll_forward && <Badge label="auto-roll-forward" variant="INFO" />}
                      </div>
                      <div className="grid grid-cols-2 gap-3 p-3 text-xs">
                        <div className="bg-gray-50 border border-gray-200 rounded p-2 max-h-72 overflow-y-auto">
                          <div className="text-gray-600 font-semibold mb-1">Available ({avail.length})</div>
                          {allForThisCw.length === 0 && (
                            <div className="text-gray-400 italic">Loading states…</div>
                          )}
                          {avail.map(s => (
                            <div key={s.edition_id} className="flex items-center justify-between py-1 px-1 hover:bg-white rounded">
                              <span className="font-mono">
                                <span className="font-bold">{s.state_code}</span>
                                <span className="text-gray-400"> · v{s.version} · {s.effective_date}</span>
                              </span>
                              <button onClick={() => addStateToGroup(g.cw_project_reference, s)}
                                className="text-blue-600 hover:text-blue-800 text-xs">+ Add</button>
                            </div>
                          ))}
                          {avail.length === 0 && allForThisCw.length > 0 && (
                            <div className="text-gray-400 italic text-[11px]">
                              {activatedStateCodesAcross.size > 0
                                ? "No states remaining — others may be activated under another CW."
                                : "All states under this CW are activated."}
                            </div>
                          )}
                        </div>
                        <div className="bg-emerald-50 border border-emerald-200 rounded p-2 max-h-72 overflow-y-auto">
                          <div className="text-emerald-800 font-semibold mb-1">Activated ({activatedHere.length})</div>
                          {activatedHere.map(s => (
                            <div key={s.edition_id} className="bg-white border border-emerald-100 rounded p-2 mb-1.5">
                              <div className="flex items-center justify-between">
                                <span className="font-mono">
                                  <span className="font-bold">{s.state_code}</span>
                                  <span className="text-gray-400"> · {s.edition_id}</span>
                                </span>
                                <button onClick={() => removeStateFromGroup(g.cw_project_reference, s.edition_id)}
                                  className="text-red-600 hover:text-red-800 text-xs">Remove</button>
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                <input value={s.doi_license_ref}
                                  onChange={e => updateStateInGroup(g.cw_project_reference, s.edition_id, { doi_license_ref: e.target.value })}
                                  placeholder="DOI license ref (optional)"
                                  className="flex-1 bg-white border border-gray-300 rounded px-2 py-1 text-[11px] font-mono" />
                                <label className="inline-flex items-center gap-1 text-[10px] text-gray-600">
                                  <input type="checkbox" checked={s.auto_track_edition}
                                    onChange={e => updateStateInGroup(g.cw_project_reference, s.edition_id, { auto_track_edition: e.target.checked })}
                                    className="accent-blue-600" />
                                  auto-track
                                </label>
                              </div>
                            </div>
                          ))}
                          {activatedHere.length === 0 && (
                            <div className="text-emerald-700 italic text-[11px]">Add states from the left to activate them under this CW.</div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-900">Step 5 — Review & Activate</h3>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-gray-50 border border-gray-200 rounded p-3">
                  <div className="text-gray-500 font-semibold mb-1">Carrier</div>
                  <div className="font-mono">{identity.carrier_id}</div>
                  <div className="font-semibold">{identity.carrier_name}</div>
                  <div className="text-gray-500 mt-1">NAIC: {identity.naic_code || "—"} · State: {identity.primary_state || "—"}</div>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded p-3">
                  <div className="text-gray-500 font-semibold mb-1">Implementation</div>
                  <div>LOB: <span className="font-mono">{lob}</span></div>
                  <div>CW Bases: <span className="font-mono font-semibold">{cwGroups.length}</span></div>
                  <div>States: <span className="font-mono font-semibold">{totalStates}</span> total</div>
                  <div>ISO terms acknowledged: <span className="font-mono">{identity.iso_terms_acknowledged ? "yes" : "no"}</span></div>
                </div>
              </div>

              {cwGroups.map(g => (
                <div key={g.cw_project_reference} className="bg-emerald-50 border border-emerald-200 rounded p-3 text-xs">
                  <div className="text-emerald-900 font-semibold mb-2 flex items-center gap-2">
                    <span className="font-mono">{g.cw_project_reference}</span>
                    <span className="text-emerald-700 font-normal">— {g.states.length} state{g.states.length === 1 ? "" : "s"}</span>
                    {g.auto_roll_forward && <Badge label="auto-roll-forward" variant="INFO" />}
                  </div>
                  <table className="w-full">
                    <thead><tr className="text-emerald-700 text-left">
                      <th className="py-1 pr-2 font-semibold">State</th>
                      <th className="py-1 pr-2 font-semibold">Edition</th>
                      <th className="py-1 pr-2 font-semibold">DOI License</th>
                      <th className="py-1 pr-2 font-semibold">Auto-track</th>
                      <th className="py-1 font-semibold">Activation Status</th>
                    </tr></thead>
                    <tbody>
                      {g.states.map(s => (
                        <tr key={s.edition_id} className="border-t border-emerald-100">
                          <td className="py-1 pr-2 font-mono font-bold">{s.state_code}</td>
                          <td className="py-1 pr-2 font-mono">{s.edition_id}</td>
                          <td className="py-1 pr-2 font-mono">{s.doi_license_ref || "—"}</td>
                          <td className="py-1 pr-2">{s.auto_track_edition ? "yes" : "no"}</td>
                          <td className="py-1">
                            {s.doi_license_ref ? <Badge label="ACTIVE" variant="ACTIVE" /> : <Badge label="INTENT" variant="PENDING" />}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}

              <div className="bg-blue-50 border border-blue-200 rounded p-3 text-xs text-blue-900">
                <span className="font-semibold">On activate:</span> Writes carrier_implementation + {cwGroups.length} CW subscription{cwGroups.length === 1 ? "" : "s"} + {totalStates} state scope{totalStates === 1 ? "" : "s"} + DOI authority rows + a hash-chained scope event with per-mutation snapshot. The hash anchors the regulator-reproducibility audit trail.
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-5 py-3 border-t border-gray-200">
          {step > 1 && (
            <button onClick={() => setStep(step - 1)} disabled={submitting}
              className="px-4 py-1.5 rounded border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-semibold">
              Back
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
            {step < STEPS.length && (
              <button onClick={() => setStep(step + 1)} disabled={!canAdvance()}
                className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-semibold">
                Continue
              </button>
            )}
            {step === STEPS.length && (
              <button onClick={activate} disabled={submitting || totalStates === 0}
                className="px-5 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-sm font-semibold">
                {submitting ? "Activating…" : "Activate Carrier"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Carrier Implementation Dashboard ─────────────────────────────────────────

function Dashboard({ carrierId, onBack, onRefresh }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  const load = useCallback(() => {
    setErr(null);
    carriers.get(carrierId).then(setData).catch(e => setErr(e.message));
  }, [carrierId]);

  useEffect(() => { load(); }, [load]);

  if (err) return (
    <div className="space-y-3">
      <button onClick={onBack} className="text-blue-600 hover:text-blue-800 underline text-sm">← Back</button>
      <div className="text-red-600 text-xs bg-red-50 border border-red-200 rounded px-3 py-2">{err}</div>
    </div>
  );
  if (!data) return <div className="text-gray-400 text-sm">Loading…</div>;

  const { carrier, implementation, cw_groups, doi, summary } = data;
  const implBadge = IMPL_BADGE[implementation?.status] || { variant: "INFO" };
  const onbBadge = ONBOARDING_BADGE[implementation?.onboarding_status] || { label: implementation?.onboarding_status || "—", variant: "INFO" };

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-blue-600 hover:text-blue-800 underline text-sm">← All carriers</button>

      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-gray-500 text-xs">{carrier.carrier_id}</span>
              <Badge label={implementation?.status || "—"} variant={implBadge.variant} />
              <Badge label={onbBadge.label} variant={onbBadge.variant} />
              <Badge label={implementation?.lob || "—"} variant="INFO" />
            </div>
            <h2 className="text-base font-semibold text-gray-900">{carrier.carrier_name}</h2>
            <div className="text-xs text-gray-500 mt-1">
              NAIC: <span className="text-gray-700">{implementation?.naic_code || "—"}</span> · Domicile: <span className="text-gray-700">{implementation?.primary_state || "—"}</span> · Activated: <span className="text-gray-700">{implementation?.activated_at?.slice(0, 19).replace("T", " ") || "—"}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-5 gap-2">
        {[
          ["CW Bases",      summary.cw_count,     "INFO"],
          ["States in scope", summary.state_count, "ACTIVE"],
          ["Active",        summary.active_states, "ACTIVE"],
          ["Intent",        summary.intent_states, "PENDING"],
          ["DOI Missing",   summary.doi_missing,  summary.doi_missing > 0 ? "WARN" : "ACTIVE"],
        ].map(([label, val, variant]) => (
          <div key={label} className="bg-white border border-gray-200 rounded px-3 py-2">
            <div className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</div>
            <div className="font-mono text-xl font-semibold text-gray-900">{val ?? 0}</div>
          </div>
        ))}
      </div>

      {summary.intent_states > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded px-3 py-2 text-xs text-amber-800">
          <span className="font-semibold">{summary.intent_states} state(s) in INTENT status</span> — add a DOI license reference to promote them to ACTIVE quotable status.
        </div>
      )}

      {/* Per-CW groups (Coverage Matrix-style) */}
      {cw_groups.length === 0 ? (
        <Panel title="Coverage scope">
          <p className="text-xs text-gray-400 italic">No CW subscriptions yet. Use the wizard to onboard.</p>
        </Panel>
      ) : cw_groups.map(g => (
        <Panel key={g.sub_id} title={g.cw_project_reference}>
          <div className="flex items-center gap-2 text-[11px] text-gray-500 mb-2">
            <span>Status: <span className="text-gray-800 font-semibold">{g.status}</span></span>
            {g.auto_roll_forward ? <Badge label="auto-roll-forward" variant="INFO" /> : null}
            {g.forms_only ? <Badge label="forms-only" variant="WARN" /> : null}
            <span className="ml-auto">Subscribed: <span className="text-gray-700">{g.subscribed_at?.slice(0, 19).replace("T", " ")}</span></span>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 text-left border-b border-gray-200">
                <th className="py-1 pr-3 font-semibold">State</th>
                <th className="py-1 pr-3 font-semibold">Edition</th>
                <th className="py-1 pr-3 font-semibold">Effective</th>
                <th className="py-1 pr-3 font-semibold">DOI License</th>
                <th className="py-1 pr-3 font-semibold">Auto-track</th>
                <th className="py-1 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {g.states.map(s => {
                const b = STATE_BADGE[s.status] || { variant: "INFO" };
                return (
                  <tr key={s.scope_id} className="border-b border-gray-100">
                    <td className="py-1.5 pr-3 font-mono font-bold">{s.state_code}</td>
                    <td className="py-1.5 pr-3 font-mono text-gray-700">{s.edition_id}</td>
                    <td className="py-1.5 pr-3 text-gray-500">{s.effective_date || "—"}</td>
                    <td className="py-1.5 pr-3 font-mono text-gray-700">{s.doi_license_ref || <span className="text-amber-600">none</span>}</td>
                    <td className="py-1.5 pr-3">{s.auto_track_edition ? "✓" : ""}</td>
                    <td className="py-1.5"><Badge label={s.status} variant={b.variant} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      ))}
    </div>
  );
}

// ── Screen root ──────────────────────────────────────────────────────────────

export default function Screen0_Carriers({ initialCarrierId, onCarrierActivated, onClearInitial }) {
  const [mode, setMode] = useState("list");  // list | wizard | dashboard
  const [selectedCarrier, setSelectedCarrier] = useState(null);
  const [retrofitting, setRetrofitting] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [toast, setToast] = useState(null);

  // If parent passed an initialCarrierId (from the header switcher), jump
  // straight to that carrier's dashboard. Clearing the prop afterwards lets
  // the user navigate freely (e.g., back to list).
  useEffect(() => {
    if (initialCarrierId) {
      setSelectedCarrier(initialCarrierId);
      setMode("dashboard");
      onClearInitial?.();
    }
  }, [initialCarrierId]);

  function showToast(msg, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  function handleWizardComplete(result) {
    showToast(`Activated ${result.carrier_id} (${result.state_count} states)`);
    setMode("dashboard");
    setSelectedCarrier(result.carrier_id);
    setRefreshKey(k => k + 1);
    onCarrierActivated?.(result.carrier_id);
  }

  return (
    <div className="p-6 text-gray-900 relative">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded shadow-lg text-sm font-medium
          ${toast.ok ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}>
          {toast.msg}
        </div>
      )}

      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-2 h-2 rounded-full bg-blue-500" />
          <h1 className="text-xl font-semibold text-gray-900">Carriers</h1>
          <Badge label="SCREEN 0" variant="INFO" />
          <Badge label="RS-4" variant="INFO" />
        </div>
        <p className="text-gray-500 text-sm">
          Carrier Implementation Workspace · onboarding wizard + scope dashboard · scopes every downstream phase
        </p>
      </div>

      {mode === "list" && (
        <CarriersList
          refreshKey={refreshKey}
          onSelect={(cid) => { setSelectedCarrier(cid); setMode("dashboard"); }}
          onNewCarrier={() => { setRetrofitting(null); setMode("wizard"); }}
          onRetrofit={(c) => { setRetrofitting(c); setMode("wizard"); }}
        />
      )}

      {mode === "wizard" && (
        <Wizard
          initialCarrier={retrofitting}
          onCancel={() => setMode("list")}
          onComplete={handleWizardComplete}
        />
      )}

      {mode === "dashboard" && selectedCarrier && (
        <Dashboard
          carrierId={selectedCarrier}
          onBack={() => { setMode("list"); setRefreshKey(k => k + 1); }}
        />
      )}
    </div>
  );
}
