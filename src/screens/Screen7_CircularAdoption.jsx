import { useState, useEffect, useCallback } from "react";
import { phaseD } from "../api/client";
import { Panel } from "../components/Panel";
import { Badge } from "../components/Badge";

const DECISION_BADGE = {
  pending:           { label: "Pending",          variant: "PENDING" },
  under_review:      { label: "Under Review",     variant: "IN_PROGRESS" },
  approved:          { label: "Approved",         variant: "ACTIVE" },
  adopted_with_mods: { label: "Adopted w/ Mods",  variant: "ACTIVE" },
  deferred:          { label: "Deferred",         variant: "WARN" },
  rejected:          { label: "Rejected",         variant: "BLOCKED" },
};

const APPROVAL_BADGE = {
  Pending:      { variant: "PENDING" },
  Signed:       { variant: "ACTIVE" },
  "Pre-approved": { variant: "ACTIVE" },
  Rejected:     { variant: "BLOCKED" },
};

const ERC_STATUS_BADGE = {
  pending_signoff: { label: "Pending Sign-off", variant: "PENDING" },
  activated:       { label: "Activated",        variant: "ACTIVE" },
  blocked:         { label: "Blocked",          variant: "BLOCKED" },
};

const ROLES_6 = ["Product", "Actuarial", "Forms Counsel", "Compliance", "PAS Owner", "Executive"];

function currency(n) {
  if (n == null) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function pct(n) {
  if (n == null) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

// ── List view ────────────────────────────────────────────────────────────────

function CircularListRow({ c, onSelect }) {
  const dec = DECISION_BADGE[c.decision_status] || { label: c.decision_status, variant: "INFO" };
  return (
    <tr className="hover:bg-gray-50 cursor-pointer" onClick={() => onSelect(c.circular_id)}>
      <td className="py-2 pr-3 font-mono text-gray-700 text-xs">{c.circular_id}</td>
      <td className="py-2 pr-3 text-gray-800 text-xs">{c.title}</td>
      <td className="py-2 pr-3 text-gray-500 text-xs">{c.lob}</td>
      <td className="py-2 pr-3 text-gray-500 text-xs">{c.circular_type}</td>
      <td className="py-2 pr-3 text-gray-500 text-xs">{(c.states || []).join(", ")}</td>
      <td className="py-2 pr-3"><Badge label={dec.label} variant={dec.variant} /></td>
      <td className="py-2 pr-3 text-gray-500 text-xs">{c.owner || "—"}</td>
      <td className="py-2 pr-3 text-gray-500 text-xs">{c.target_date || "—"}</td>
    </tr>
  );
}

function CircularList({ onSelect, refreshKey, onRefresh }) {
  const [circulars, setCirculars] = useState([]);
  const [metrics, setMetrics] = useState({});
  const [pendingAdoptions, setPendingAdoptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterDecision, setFilterDecision] = useState("");
  const [filterState, setFilterState] = useState("");
  const [filterFilingRef, setFilterFilingRef] = useState("");
  const [intaking, setIntaking] = useState(false);
  const [intakeErr, setIntakeErr] = useState(null);
  const [intakeInfo, setIntakeInfo] = useState(null);
  const [queueExpanded, setQueueExpanded] = useState(false);
  const [superAdmin, setSuperAdmin] = useState(() => {
    try { return localStorage.getItem("erc.super_admin") === "1"; } catch { return false; }
  });
  const [bulkSelected, setBulkSelected] = useState(() => new Set());
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkReport, setBulkReport] = useState(null);
  const [forceMode, setForceMode] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(() => {
    try { return parseInt(localStorage.getItem("erc.circular_page_size") || "25", 10); }
    catch { return 25; }
  });

  function toggleSuperAdmin() {
    setSuperAdmin(v => {
      const next = !v;
      try { localStorage.setItem("erc.super_admin", next ? "1" : "0"); } catch {}
      if (!next) setBulkSelected(new Set());
      return next;
    });
  }

  function toggleRow(editionId) {
    setBulkSelected(prev => {
      const next = new Set(prev);
      if (next.has(editionId)) next.delete(editionId);
      else next.add(editionId);
      return next;
    });
  }

  function toggleAll() {
    setBulkSelected(prev => {
      if (prev.size === pendingAdoptions.length) return new Set();
      return new Set(pendingAdoptions.map(a => a.edition_id));
    });
  }

  async function runBulkActivate() {
    if (bulkSelected.size === 0) return;
    if (forceMode) {
      const ok = window.confirm(
        `FORCE-activate ${bulkSelected.size} edition(s)?\n\n` +
        `This bypasses every compliance gate (surprise stubs, unapproved circulars, ` +
        `blocked status, divergence). Each activation will be tagged 'Bulk-FORCE-activated' ` +
        `in audit notes with the list of bypassed gates per edition. The bind-time hash ` +
        `chain stays valid because we still snapshot whatever links exist.`
      );
      if (!ok) return;
    }
    const promptLabel = forceMode
      ? `FORCE-activate ${bulkSelected.size} edition(s) — enter your name`
      : `Bulk-activate ${bulkSelected.size} edition(s) as Compliance — enter your name`;
    const signer = window.prompt(promptLabel);
    if (!signer) return;
    setBulkRunning(true); setBulkReport(null);
    try {
      const r = await phaseD.bulkActivateErc([...bulkSelected], signer, { force: forceMode });
      setBulkReport(r);
      setBulkSelected(new Set());
      onRefresh?.();
    } catch (e) {
      setBulkReport({ error: e.message });
    } finally {
      setBulkRunning(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    setPage(0);
    Promise.all([
      phaseD.circulars({
        decision_status: filterDecision,
        state_code: filterState,
        filing_reference: filterFilingRef,
      }),
      phaseD.metrics(),
      phaseD.ercAdoptions({ status: "pending_signoff", limit: 500 }),
    ]).then(([list, m, queue]) => {
      setCirculars(list);
      setMetrics(m);
      setPendingAdoptions(queue);
    }).finally(() => setLoading(false));
  }, [filterDecision, filterState, filterFilingRef, refreshKey]);

  // Reset to page 0 whenever the search text or page size changes; persist size
  useEffect(() => { setPage(0); }, [search]);
  useEffect(() => {
    try { localStorage.setItem("erc.circular_page_size", String(pageSize)); } catch {}
    setPage(0);
  }, [pageSize]);

  async function handleIntake(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setIntaking(true); setIntakeErr(null); setIntakeInfo(null);
    try {
      const r = await phaseD.intakePdf(f);
      setIntakeInfo({
        circular_id: r.circular_id,
        title: r.parsed?.title,
        states: r.parsed?.states,
        type: r.parsed?.circular_type,
      });
      onRefresh?.();
      // Auto-navigate to the new circular's detail after a brief pause so the
      // user sees the success banner.
      setTimeout(() => onSelect(r.circular_id), 1200);
    } catch (err) {
      // 409 → circular already exists; 422 → no ID extracted. Both carry
      // structured detail with the parse preview.
      let msg = err.message;
      let preview = null;
      if (err.detail && typeof err.detail === "object") {
        msg = err.detail.message || msg;
        preview = err.detail.parsed;
      }
      setIntakeErr({ message: msg, preview, existingId: err.detail?.circular_id });
    } finally {
      setIntaking(false);
      // Reset the file input so re-selecting the same file re-fires the event
      e.target.value = "";
    }
  }

  const filtered = circulars.filter(c => {
    if (!search) return true;
    const s = search.toLowerCase();
    return c.circular_id.toLowerCase().includes(s) || (c.title || "").toLowerCase().includes(s);
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pageStart = safePage * pageSize;
  const pageRows = filtered.slice(pageStart, pageStart + pageSize);
  const pageEnd = pageStart + pageRows.length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-5 gap-2">
        {[
          ["Pending",          metrics.circulars_pending,                                                          "PENDING"],
          ["Under Review",     metrics.circulars_under_review,                                                     "IN_PROGRESS"],
          ["Approved",         (metrics.circulars_approved || 0) + (metrics.circulars_adopted_with_mods || 0),     "ACTIVE"],
          ["ERC Pending",      metrics.erc_adoption_pending_signoff,                                               "PENDING"],
          ["Surprise Stubs",   metrics.circulars_surprise_pending,                                                 (metrics.circulars_surprise_pending || 0) > 0 ? "BLOCKED" : "INFO"],
        ].map(([label, val, variant]) => (
          <div key={label} className="bg-white border border-gray-200 rounded px-3 py-2 flex items-center justify-between"
            title={label === "Surprise Stubs"
              ? "Circulars auto-created by ingestion because an ERC delivery cited a circular the carrier hadn't registered. These block activation of every edition citing them until a filing-team member completes the record and runs the 6-role approval."
              : undefined}>
            <div>
              <div className="text-gray-500 text-xs">{label}</div>
              <div className="text-gray-900 font-mono text-xl font-semibold">{val ?? 0}</div>
            </div>
            <Badge label="" variant={variant} />
          </div>
        ))}
      </div>

      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <label className="block text-xs text-gray-500 mb-0.5">Search</label>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="circular id or title"
            className="bg-white border border-gray-300 rounded px-3 py-1.5 text-sm w-64" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-0.5">Decision</label>
          <select value={filterDecision} onChange={e => setFilterDecision(e.target.value)}
            className="bg-white border border-gray-300 rounded px-2 py-1.5 text-sm">
            <option value="">All</option>
            {Object.entries(DECISION_BADGE).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-0.5">State</label>
          <input value={filterState} onChange={e => setFilterState(e.target.value.toUpperCase())}
            placeholder="e.g. AL" maxLength={2}
            className="bg-white border border-gray-300 rounded px-2 py-1.5 text-sm w-16 uppercase font-mono" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-0.5" title="SERFF filing reference from ERC manifest evidence">Filing ref</label>
          <input value={filterFilingRef} onChange={e => setFilterFilingRef(e.target.value)}
            placeholder="e.g. GL-2024-OFR24"
            className="bg-white border border-gray-300 rounded px-2 py-1.5 text-sm w-40 font-mono" />
        </div>
        <div className="ml-auto">
          <label className={`inline-flex items-center gap-2 cursor-pointer rounded px-3 py-1.5 text-sm font-semibold transition-colors
            ${intaking ? "bg-gray-300 text-gray-500 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700 text-white"}`}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 3v8M5 6l3-3 3 3M3 13h10" />
            </svg>
            {intaking ? "Parsing…" : "Upload Circular PDF"}
            <input type="file" accept="application/pdf" onChange={handleIntake}
              disabled={intaking} className="hidden" />
          </label>
        </div>
      </div>

      {intakeInfo && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-xs">
          <div className="text-emerald-800 font-semibold">
            ✓ Created <span className="font-mono">{intakeInfo.circular_id}</span> from PDF
          </div>
          <div className="text-emerald-700 mt-0.5">
            {intakeInfo.title && <span className="block">Title: {intakeInfo.title}</span>}
            {intakeInfo.type && <span>Type: {intakeInfo.type}</span>}
            {intakeInfo.states?.length > 0 && <span> · States: {intakeInfo.states.join(", ")}</span>}
          </div>
          <div className="text-emerald-700 mt-1 italic">Opening detail…</div>
        </div>
      )}

      {intakeErr && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs">
          <div className="text-amber-800 font-semibold mb-1">Could not auto-create circular from PDF</div>
          <div className="text-amber-700 mb-1">{intakeErr.message}</div>
          {intakeErr.existingId && (
            <button onClick={() => { setIntakeErr(null); onSelect(intakeErr.existingId); }}
              className="mt-1 text-blue-600 hover:text-blue-800 underline">
              Open existing {intakeErr.existingId} →
            </button>
          )}
          {intakeErr.preview && (
            <details className="mt-2">
              <summary className="cursor-pointer text-amber-800 font-medium text-[11px]">Parse preview ({(intakeErr.preview.sections_found || []).length} sections found)</summary>
              <div className="mt-1 pl-3 text-[11px] text-amber-700 space-y-0.5">
                {intakeErr.preview.circular_id && <div>circular_id: <span className="font-mono">{intakeErr.preview.circular_id}</span></div>}
                {intakeErr.preview.title && <div>title: {intakeErr.preview.title}</div>}
                {intakeErr.preview.lob && <div>lob: {intakeErr.preview.lob}</div>}
                {intakeErr.preview.circular_type && <div>type: {intakeErr.preview.circular_type}</div>}
                {intakeErr.preview.states?.length > 0 && <div>states: {intakeErr.preview.states.join(", ")}</div>}
                {intakeErr.preview.bureau_effective && <div>bureau_effective: {intakeErr.preview.bureau_effective}</div>}
              </div>
            </details>
          )}
          <button onClick={() => setIntakeErr(null)} className="mt-2 text-amber-600 hover:text-amber-800 underline text-[11px]">
            Dismiss
          </button>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded">
        <table className="w-full text-xs">
          <thead className="bg-gray-50">
            <tr className="text-gray-500 text-left border-b border-gray-200">
              <th className="py-2 pl-3 pr-3 font-semibold">Circular ID</th>
              <th className="py-2 pr-3 font-semibold">Title</th>
              <th className="py-2 pr-3 font-semibold">LOB</th>
              <th className="py-2 pr-3 font-semibold">Type</th>
              <th className="py-2 pr-3 font-semibold">States</th>
              <th className="py-2 pr-3 font-semibold">Decision</th>
              <th className="py-2 pr-3 font-semibold">Owner</th>
              <th className="py-2 pr-3 font-semibold">Target Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && <tr><td colSpan={8} className="py-8 text-center text-gray-400 text-xs">Loading…</td></tr>}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={8} className="py-8 text-center text-gray-400 text-xs">No circulars match.</td></tr>
            )}
            {pageRows.map(c => <CircularListRow key={c.circular_id} c={c} onSelect={onSelect} />)}
          </tbody>
        </table>
        {filtered.length > 0 && (
          <div className="px-3 py-2 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
            <div className="flex items-center gap-2">
              <span>Rows per page</span>
              <select value={pageSize} onChange={e => setPageSize(parseInt(e.target.value, 10))}
                className="bg-white border border-gray-300 rounded px-1.5 py-0.5 text-xs">
                {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span>
                {pageStart + 1}–{pageEnd} of {filtered.length}
              </span>
              <button onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={safePage === 0}
                className="px-2 py-0.5 rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-30">
                ← Prev
              </button>
              <span className="font-mono">{safePage + 1} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={safePage >= totalPages - 1}
                className="px-2 py-0.5 rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-30">
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

      {pendingAdoptions.length > 0 && (
        <div className="bg-white border border-gray-200 rounded">
          <div className="px-3 py-2 flex items-center justify-between border-b border-gray-100">
            <button onClick={() => setQueueExpanded(v => !v)}
              className="flex items-center gap-2 text-left">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2"
                className={`text-gray-500 transition-transform ${queueExpanded ? "rotate-90" : ""}`}>
                <path d="M3 2 L7 5 L3 8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="text-xs font-semibold text-gray-700">
                ERC Adoption Queue · {pendingAdoptions.length} pending sign-off
              </span>
            </button>
            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold cursor-pointer select-none"
                title="When enabled, you can bulk-activate selected editions in one signed action. Intended for compliance leads with the super-admin role.">
                <input type="checkbox" checked={superAdmin} onChange={toggleSuperAdmin}
                  className="accent-red-600" />
                <span className={superAdmin ? "text-red-700" : "text-gray-500"}>Super-admin mode</span>
              </label>
              {!queueExpanded && (
                <span className="text-[10px] text-gray-400 italic">click ▸ to expand</span>
              )}
            </div>
          </div>
          {queueExpanded && (
            <>
              {superAdmin && (
                <div className={`px-3 py-2 border-b flex items-center justify-between gap-3 ${forceMode ? "bg-orange-100 border-orange-300" : "bg-red-50 border-red-200"}`}>
                  <div className={`text-[11px] flex-1 ${forceMode ? "text-orange-900" : "text-red-800"}`}>
                    Super-admin: {bulkSelected.size} of {pendingAdoptions.length} selected.{" "}
                    {forceMode ? (
                      <span className="font-semibold">
                        FORCE MODE — every compliance gate (surprise stub / unapproved circular / blocked / divergence) will be bypassed. Activations are tagged in audit notes with the list of overrides.
                      </span>
                    ) : (
                      <span>Bulk activate runs the same compliance gate per row — rows that fail the gate are skipped, never partial-state.</span>
                    )}
                  </div>
                  <label className="inline-flex items-center gap-1 text-[11px] font-semibold cursor-pointer select-none whitespace-nowrap"
                    title="When on, bypasses every compliance gate. Use only when you understand the audit implications.">
                    <input type="checkbox" checked={forceMode} onChange={() => setForceMode(v => !v)}
                      className="accent-orange-600" />
                    <span className={forceMode ? "text-orange-900" : "text-gray-600"}>Force (bypass gates)</span>
                  </label>
                  <button onClick={runBulkActivate}
                    disabled={bulkRunning || bulkSelected.size === 0}
                    className={`disabled:opacity-30 text-white px-3 py-1 rounded text-xs font-semibold whitespace-nowrap ${forceMode ? "bg-orange-600 hover:bg-orange-700" : "bg-red-600 hover:bg-red-700"}`}>
                    {bulkRunning ? "Activating…" : (forceMode ? `FORCE activate ${bulkSelected.size}` : `Activate ${bulkSelected.size} selected`)}
                  </button>
                </div>
              )}
              {bulkReport && (
                <div className={`px-3 py-2 border-b text-[11px] ${bulkReport.error ? "bg-red-50 border-red-200 text-red-800" : "bg-blue-50 border-blue-200 text-blue-900"}`}>
                  {bulkReport.error ? (
                    <span>Bulk activation error: {bulkReport.error}</span>
                  ) : (
                    <div>
                      <div className="font-semibold mb-0.5">
                        Bulk activation complete · {bulkReport.submitted} submitted
                      </div>
                      <div className="font-mono">
                        {Object.entries(bulkReport.counts || {}).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                      </div>
                      {(bulkReport.results || []).filter(r => r.status === "skipped" || r.status === "error").slice(0, 6).map(r => (
                        <div key={r.edition_id} className="font-mono text-[10px]">
                          ⚠ {r.edition_id}: {r.reason}{r.unapproved ? ` (${r.unapproved.join(", ")})` : ""}
                        </div>
                      ))}
                      {(bulkReport.results || []).filter(r => r.bypassed_gates).slice(0, 6).map(r => (
                        <div key={`bp-${r.edition_id}`} className="font-mono text-[10px] text-orange-700">
                          ◆ {r.edition_id}: bypassed {r.bypassed_gates.length} gate(s) — {r.bypassed_gates.join("; ")}
                        </div>
                      ))}
                      <button onClick={() => setBulkReport(null)} className="mt-1 underline">Dismiss</button>
                    </div>
                  )}
                </div>
              )}
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr className="text-gray-500 text-left border-b border-gray-200">
                    {superAdmin && (
                      <th className="py-1.5 pl-3 pr-2 font-semibold w-8">
                        <input type="checkbox"
                          checked={bulkSelected.size === pendingAdoptions.length && pendingAdoptions.length > 0}
                          ref={el => { if (el) el.indeterminate = bulkSelected.size > 0 && bulkSelected.size < pendingAdoptions.length; }}
                          onChange={toggleAll}
                          className="accent-red-600" />
                      </th>
                    )}
                    <th className="py-1.5 pl-3 pr-3 font-semibold">Edition</th>
                    <th className="py-1.5 pr-3 font-semibold">State</th>
                    <th className="py-1.5 pr-3 font-semibold">Effective</th>
                    <th className="py-1.5 pr-3 font-semibold">Mode</th>
                    <th className="py-1.5 pr-3 font-semibold">Cited Circulars</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {pendingAdoptions.map(a => (
                    <tr key={a.edition_id} className={`align-top ${bulkSelected.has(a.edition_id) ? "bg-red-50" : ""}`}>
                      {superAdmin && (
                        <td className="py-1.5 pl-3 pr-2">
                          <input type="checkbox"
                            checked={bulkSelected.has(a.edition_id)}
                            onChange={() => toggleRow(a.edition_id)}
                            className="accent-red-600" />
                        </td>
                      )}
                      <td className="py-1.5 pl-3 pr-3 font-mono text-gray-700">{a.edition_id}</td>
                      <td className="py-1.5 pr-3 text-gray-500">{a.state_code}</td>
                      <td className="py-1.5 pr-3 text-gray-500">{a.effective_date}</td>
                      <td className="py-1.5 pr-3 text-gray-500">
                        {a.signoff_mode}
                        {a.surprise_circular_flag ? <span className="ml-1 text-red-600 font-semibold" title="ERC manifest cited a circular not pre-registered by the carrier. Activation blocked until the stub is resolved.">⚠ surprise</span> : null}
                      </td>
                      <td className="py-1.5 pr-3">
                        <div className="flex flex-wrap gap-1">
                          {(a.linked_circulars || []).length === 0 && (
                            <span className="text-gray-400 italic">none linked</span>
                          )}
                          {(a.linked_circulars || []).map(c => (
                            <button key={c.circular_id} onClick={() => onSelect(c.circular_id)}
                              title={c.title}
                              className={`px-1.5 py-0.5 rounded font-mono text-[10px] border hover:bg-gray-50
                                ${c.decision_status === "approved" || c.decision_status === "adopted_with_mods"
                                  ? "border-emerald-200 text-emerald-700"
                                  : c.decision_status === "rejected"
                                    ? "border-red-200 text-red-700"
                                    : "border-amber-200 text-amber-700"}`}>
                              {c.circular_id}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Overview tab (the coverpage) ─────────────────────────────────────────────

const PAS_STATUS_BADGE = {
  Queued:        { variant: "PENDING" },
  "In Progress": { variant: "IN_PROGRESS" },
  Done:          { variant: "ACTIVE" },
  Blocked:       { variant: "BLOCKED" },
  Draft:         { variant: "INFO" },
};

function OverviewTab({ circular, onSaved }) {
  const [parsing, setParsing] = useState(false);
  const [parseResult, setParseResult] = useState(null);
  const [err, setErr] = useState(null);
  const fileInputRef = (typeof window !== "undefined") ? null : null; // placeholder

  async function handleParse(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setParsing(true); setErr(null); setParseResult(null);
    try {
      const r = await phaseD.parseAndFill(circular.circular_id, f);
      setParseResult(r);
      onSaved?.();
    } catch (ex) { setErr(ex.message); }
    finally { setParsing(false); }
  }

  const cards = [
    ["Key Message",                circular.key_message || circular.summary || `${circular.title} requires review for adoption position, implementation scope, and state handling.`],
    ["ISO Action",                 circular.iso_action || "ISO circular issued; carrier must determine adoption position and implementation timing."],
    ["Insurance Department Action", circular.department_action || (circular.filing_need === "Required" ? `Department filing required in ${(circular.states || []).join(", ") || "scoped states"}.` : "No department action identified.")],
    ["Effective Date",             circular.bureau_effective || "Carrier selected"],
    ["Company Action",             circular.company_action || circular.next_action || circular.recommendation || "Review, decide adoption position, and assign implementation owner."],
    ["Rating Software Impact",     circular.rating_software_impact || "No direct rating software update flagged in coverpage."],
  ];

  return (
    <div className="space-y-4">
      {err && <div className="text-red-600 text-xs bg-red-50 border border-red-200 rounded px-3 py-2">{err}</div>}

      {/* Coverpage header */}
      <Panel title="Coverpage">
        <div className="space-y-3 text-xs">
          <h3 className="text-base font-semibold text-gray-900">{circular.title}</h3>
          <div className="grid grid-cols-3 gap-3">
            {[
              ["LOB", circular.lob],
              ["Type", circular.circular_type],
              ["ISO Effective", circular.bureau_effective || "Carrier selected"],
              ["Filing Need", circular.filing_need || "TBD"],
              ["Recommendation", circular.recommendation || "—"],
              ["Owner", circular.owner || "—"],
            ].map(([k, v]) => (
              <div key={k}>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{k}</div>
                <div className="text-sm text-gray-800 font-semibold">{v || "—"}</div>
              </div>
            ))}
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-1">States</div>
            <div className="flex flex-wrap gap-1">
              {(circular.states || []).length === 0 && <span className="text-gray-400">—</span>}
              {(circular.states || []).map(s => (
                <span key={s} className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 text-xs font-mono font-semibold">{s}</span>
              ))}
            </div>
          </div>
          {circular.carrier_action_required ? (
            <div className="bg-amber-50 border border-amber-200 rounded px-3 py-2 text-amber-800 text-xs">
              <span className="font-semibold">Carrier action required.</span> ISO did not file — carrier must decide, file independently, and select effective date.
            </div>
          ) : null}
        </div>
      </Panel>

      {/* 6 summary cards */}
      <div className="grid grid-cols-3 gap-3">
        {cards.map(([label, value]) => (
          <div key={label} className="bg-white border border-gray-200 rounded-lg p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">{label}</div>
            <div className="text-xs text-gray-800 leading-relaxed">{value}</div>
          </div>
        ))}
      </div>

      {/* Parse PDF affordance */}
      <Panel title="Parse circular PDF">
        <div className="space-y-2 text-xs">
          <p className="text-gray-600">
            Upload the source PDF — the parser extracts ISO sections (Key Message, ISO Action, Effective Date, Company Action, Rating Software Impact)
            plus circular ID, title, LOB, type, states, and filing need. Non-empty parsed fields overwrite the current values.
          </p>
          <div className="flex items-center gap-3">
            <input type="file" accept="application/pdf" onChange={handleParse}
              disabled={parsing}
              className="text-xs file:mr-3 file:rounded file:border file:border-gray-300 file:bg-white file:px-3 file:py-1 file:text-xs file:font-semibold file:text-gray-700 hover:file:bg-gray-50" />
            {parsing && <span className="text-gray-400 text-xs italic">Parsing…</span>}
            {circular.pdf_uri && !parsing && (
              <span className="text-emerald-600 text-xs">
                ✓ PDF on file: <span className="font-mono">{circular.pdf_uri}</span>
              </span>
            )}
          </div>
          {parseResult && (
            <div className="bg-emerald-50 border border-emerald-200 rounded px-3 py-2 text-emerald-800">
              <div className="font-semibold mb-0.5">Parsed and applied {parseResult.fields_applied?.length || 0} fields</div>
              <div className="text-[11px]">
                Sections found: <span className="font-mono">{(parseResult.parsed?.sections_found || []).join(", ")}</span>
              </div>
              <div className="text-[11px]">
                Updated fields: <span className="font-mono">{(parseResult.fields_applied || []).join(", ")}</span>
              </div>
            </div>
          )}
        </div>
      </Panel>

      {/* Change Set */}
      {(circular.changes || []).length > 0 && (
        <Panel title="Change Set">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 text-left border-b border-gray-200">
                <th className="py-1 pr-3 font-semibold">Type</th>
                <th className="py-1 pr-3 font-semibold">ISO Baseline</th>
                <th className="py-1 pr-3 font-semibold">Affected Content</th>
                <th className="py-1 pr-3 font-semibold">Effective Handling</th>
                <th className="py-1 font-semibold">State</th>
              </tr>
            </thead>
            <tbody>
              {circular.changes.map(ch => (
                <tr key={ch.id} className="border-b border-gray-100">
                  <td className="py-1.5 pr-3 font-semibold text-gray-800">{ch.change_type}</td>
                  <td className="py-1.5 pr-3 font-mono text-gray-700">{ch.iso_baseline || "—"}</td>
                  <td className="py-1.5 pr-3 text-gray-700">{ch.affected_content || "—"}</td>
                  <td className="py-1.5 pr-3 text-gray-500">{ch.effective_handling || "—"}</td>
                  <td className="py-1.5"><Badge label={ch.promotion_state} variant={PAS_STATUS_BADGE[ch.promotion_state]?.variant || "INFO"} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      {/* PAS Implementation Actions */}
      {(circular.pas_tasks || []).length > 0 && (
        <Panel title="Implementation Actions (PAS)">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 text-left border-b border-gray-200">
                <th className="py-1 pr-3 font-semibold w-24">Status</th>
                <th className="py-1 pr-3 font-semibold w-40">Component</th>
                <th className="py-1 pr-3 font-semibold">Change</th>
                <th className="py-1 pr-3 font-semibold w-28">Owner</th>
                <th className="py-1 font-semibold w-28">Target</th>
              </tr>
            </thead>
            <tbody>
              {circular.pas_tasks.map(t => {
                const b = PAS_STATUS_BADGE[t.status] || { variant: "INFO" };
                return (
                  <tr key={t.id} className="border-b border-gray-100">
                    <td className="py-1.5 pr-3"><Badge label={t.status} variant={b.variant} /></td>
                    <td className="py-1.5 pr-3 font-semibold text-gray-800">{t.component}</td>
                    <td className="py-1.5 pr-3 text-gray-700">{t.change_desc}</td>
                    <td className="py-1.5 pr-3 text-gray-500">{t.owner || "—"}</td>
                    <td className="py-1.5 text-gray-500">{t.target_date || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      )}

      {circular.explanation_of_changes && (
        <Panel title="Explanation of Changes">
          <p className="text-xs text-gray-700 whitespace-pre-line leading-relaxed">{circular.explanation_of_changes}</p>
        </Panel>
      )}
    </div>
  );
}


// ── Prioritized Insights tab (derived from circular data) ────────────────────

const PRIORITY_BADGE = {
  High:   { variant: "BLOCKED" },
  Medium: { variant: "WARN" },
  Low:    { variant: "ACTIVE" },
};

function PrioritizedInsightsTab({ circular }) {
  const type = circular.circular_type || "";
  const statesLabel = (circular.states || []).length ? (circular.states || []).join(", ") : "selected states";
  const ri = circular.rate_impact || {};
  const pmf = circular.pmf_impact || [];

  const rateInsight = type.includes("Rate")
    ? `Rate adoption should be reviewed against the in-force book for ${statesLabel}. Prioritize renewal timing, class groups with adverse movement, and any accounts that could trigger conditional notice handling.`
    : "No rate change is expected from this circular. Keep rating configuration unchanged unless later review identifies a dependent rule or filing instruction.";
  const formsInsight = type.includes("Forms")
    ? "Forms review should compare ISO language against current proprietary endorsements, especially exclusions, additional insured wording, and any broadened coverage language that could conflict with the newer ISO edition."
    : "No form language adoption is expected from this circular. Existing form set can remain unchanged unless a downstream filing package references a dependent form.";
  const rulesInsight = type.includes("Rules")
    ? "Rules impact is expected. Validate eligibility, effective-date handling, state exceptions, and PAS configuration before marking this circular ready for adoption."
    : "No underwriting or PAS rule change is expected. Monitor implementation tasks for any indirect dependencies.";
  const complianceInsight = circular.filing_need === "Required"
    ? `Compliance review is required before deployment. Confirm filing basis, approved effective dates, and whether carrier action is needed in ${statesLabel}.`
    : circular.carrier_action_required
      ? "Carrier action is required even if a formal filing is not marked required. Document adoption position and effective-date handling before deployment."
      : "Compliance impact appears limited. Keep the circular in monitoring status and retain evidence for audit.";

  const insights = [
    {
      id: "rates",
      category: "Rates",
      priority: type.includes("Rate") ? "High" : "Low",
      source: "Actuarial",
      headline: type.includes("Rate")
        ? (ri.written_premium_pct != null ? `Statewide written premium ${ri.written_premium_pct > 0 ? "+" : ""}${ri.written_premium_pct}%; ${(ri.policies_impacted || 0).toLocaleString()} policies impacted`
                                          : "Rate revision — magnitude under review")
        : "No rate impact",
      impact: rateInsight,
      action: type.includes("Rate") ? "Run book impact test and validate rater configuration." : "Confirm no dependent rating table update is required.",
      owner: "Actuarial",
    },
    {
      id: "forms",
      category: "Forms",
      priority: type.includes("Forms") ? "High" : "Medium",
      source: "Forms Counsel",
      headline: type.includes("Forms") ? "ISO form text revised — proprietary overlay must be reviewed" : "No form language change",
      impact: formsInsight,
      action: type.includes("Forms") ? "Compare ISO form language and identify proprietary forms affected." : "Confirm no dependent proprietary endorsement update is required.",
      owner: "Forms Counsel",
    },
    {
      id: "rules",
      category: "Rules",
      priority: type.includes("Rules") ? "High" : "Medium",
      source: "Product",
      headline: type.includes("Rules") ? "Rule/rating-mechanics change — validate eligibility and effective-date handling" : "No rules change",
      impact: rulesInsight,
      action: type.includes("Rules") ? "Validate eligibility, state exception, and effective-date rules." : "Monitor PAS tasks for indirect rules dependencies.",
      owner: "Product",
    },
    {
      id: "compliance",
      category: "Compliance",
      priority: circular.filing_need === "Required" ? "High" : circular.carrier_action_required ? "Medium" : "Low",
      source: "Compliance",
      headline: circular.filing_need === "Required" ? "Filing required — DOI review on critical path" :
                circular.carrier_action_required ? "Carrier action required — file independently" :
                "Compliance impact limited — monitor for evidence",
      impact: complianceInsight,
      action: circular.filing_need === "Required" ? "Confirm filing posture and approved effective dates." : "Record adoption evidence and monitor state handling.",
      owner: "Compliance",
    },
  ];

  const priorityRank = { High: 0, Medium: 1, Low: 2 };
  const sorted = [...insights].sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority]);
  const [reviewed, setReviewed] = useState({});
  const reviewedCount = Object.values(reviewed).filter(Boolean).length;

  return (
    <div className="space-y-4">
      <Panel title={`Prioritized Insights Review Queue · ${reviewedCount}/${insights.length} reviewed`}>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 text-left border-b border-gray-200">
              <th className="py-1 pr-3 font-semibold w-24">Reviewed</th>
              <th className="py-1 pr-3 font-semibold w-24">Category</th>
              <th className="py-1 pr-3 font-semibold w-20">Priority</th>
              <th className="py-1 pr-3 font-semibold">Insight</th>
              <th className="py-1 pr-3 font-semibold">Recommended Action</th>
              <th className="py-1 font-semibold w-28">Owner</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(row => {
              const isReviewed = reviewed[row.id];
              const badge = PRIORITY_BADGE[row.priority] || { variant: "INFO" };
              return (
                <tr key={row.id} className={`border-b border-gray-100 ${isReviewed ? "opacity-60" : ""}`}>
                  <td className="py-2 pr-3">
                    <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold cursor-pointer">
                      <input type="checkbox" checked={Boolean(isReviewed)}
                        onChange={() => setReviewed(s => ({ ...s, [row.id]: !s[row.id] }))}
                        className="accent-blue-600" />
                      {isReviewed ? "Reviewed" : "Open"}
                    </label>
                  </td>
                  <td className="py-2 pr-3 font-semibold text-gray-800">{row.category}</td>
                  <td className="py-2 pr-3"><Badge label={row.priority} variant={badge.variant} /></td>
                  <td className="py-2 pr-3">
                    <div className="font-semibold text-gray-800">{row.headline}</div>
                    <div className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">{row.impact}</div>
                    <div className="text-[10px] text-gray-400 mt-1">Source: {row.source}</div>
                  </td>
                  <td className="py-2 pr-3 text-gray-700">{row.action}</td>
                  <td className="py-2 text-gray-500">{row.owner}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>

      {/* Detail mini-cards */}
      <div className="grid grid-cols-2 gap-3">
        {/* Rates card */}
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-800">Rates</h3>
            <Badge label={ri.written_premium_pct != null ? "Review" : "No Impact"}
              variant={ri.written_premium_pct != null ? "WARN" : "INFO"} />
          </div>
          {ri.written_premium_pct != null ? (
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-gray-50 border border-gray-100 rounded p-2">
                <div className="text-gray-500 text-[10px] uppercase">Book change</div>
                <div className="font-mono text-sm text-gray-800">{ri.written_premium_pct > 0 ? "+" : ""}{ri.written_premium_pct}%</div>
              </div>
              <div className="bg-gray-50 border border-gray-100 rounded p-2">
                <div className="text-gray-500 text-[10px] uppercase">Premium delta</div>
                <div className="font-mono text-sm text-gray-800">{ri.written_premium_delta ? `+$${(ri.written_premium_delta/1e6).toFixed(2)}M` : "—"}</div>
              </div>
              <div className="bg-gray-50 border border-gray-100 rounded p-2">
                <div className="text-gray-500 text-[10px] uppercase">Policies impacted</div>
                <div className="font-mono text-sm text-gray-800">{(ri.policies_impacted || 0).toLocaleString()}</div>
              </div>
              <div className="bg-gray-50 border border-gray-100 rounded p-2">
                <div className="text-gray-500 text-[10px] uppercase">Conditional notices</div>
                <div className="font-mono text-sm text-gray-800">{ri.conditional_notices || 0}</div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-400 italic">No rate impact data available for this circular.</p>
          )}
        </div>

        {/* PMF / class group card */}
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <h3 className="text-sm font-semibold text-gray-800 mb-2">Class group / PMF impact</h3>
          {(ri.class_groups || []).length > 0 ? (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 text-left border-b border-gray-200">
                  <th className="py-1 pr-2">Group</th>
                  <th className="py-1 pr-2 text-right">Δ</th>
                  <th className="py-1">Signal</th>
                </tr>
              </thead>
              <tbody>
                {ri.class_groups.map(g => (
                  <tr key={g.group}>
                    <td className="py-1 pr-2 text-gray-700">{g.group}</td>
                    <td className="py-1 pr-2 text-right font-mono">{g.change_pct > 0 ? "+" : ""}{g.change_pct}%</td>
                    <td className="py-1"><Badge label={g.signal} variant={
                      g.signal === "High" ? "BLOCKED" : g.signal === "Medium" ? "WARN" : "ACTIVE"
                    } /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : pmf.length > 0 ? (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 text-left border-b border-gray-200">
                  <th className="py-1 pr-2">Group</th>
                  <th className="py-1 pr-2 text-right">PMF</th>
                  <th className="py-1 text-right">Δ%</th>
                </tr>
              </thead>
              <tbody>
                {pmf.map(p => (
                  <tr key={p.class_group}>
                    <td className="py-1 pr-2 text-gray-700">{p.class_group}</td>
                    <td className="py-1 pr-2 text-right font-mono">{p.proposed_pmf?.toFixed(3)}</td>
                    <td className="py-1 text-right font-mono">{p.change_pct > 0 ? "+" : ""}{p.change_pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-xs text-gray-400 italic">No class-group or PMF detail available.</p>
          )}
        </div>
      </div>
    </div>
  );
}


// ── Detail view ──────────────────────────────────────────────────────────────

function DecisionTab({ circular, onSaved }) {
  const [draft, setDraft] = useState({
    decision_status: circular.decision_status,
    recommendation: circular.recommendation || "",
    blocker: circular.blocker || "",
    next_action: circular.next_action || "",
    target_date: circular.target_date || "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  async function save() {
    setSaving(true); setErr(null);
    try {
      await phaseD.updateDecision(circular.circular_id, draft);
      onSaved?.();
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  }

  async function sign(role, status) {
    const signer = window.prompt(`Sign-off as ${role} — enter your name`);
    if (!signer) return;
    setErr(null);
    try {
      await phaseD.signoff(circular.circular_id, { role, signer, status });
      onSaved?.();
    } catch (e) { setErr(e.message); }
  }

  const ri = circular.rate_impact || {};
  const pmf = circular.pmf_impact || [];

  return (
    <div className="space-y-4">
      {err && <div className="text-red-600 text-xs bg-red-50 border border-red-200 rounded px-3 py-2">{err}</div>}

      <Panel title="Decision">
        <div className="space-y-3 text-xs">
          <div className="flex items-center gap-3">
            <label className="text-gray-500 w-32">Decision status</label>
            <select value={draft.decision_status}
              onChange={e => setDraft({ ...draft, decision_status: e.target.value })}
              className="bg-white border border-gray-300 rounded px-2 py-1 text-sm">
              {Object.entries(DECISION_BADGE).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-gray-500 mb-0.5">Recommendation</label>
            <textarea rows={3} value={draft.recommendation}
              onChange={e => setDraft({ ...draft, recommendation: e.target.value })}
              className="w-full bg-white border border-gray-300 rounded px-2 py-1 text-sm" />
            <div className="text-[10px] text-amber-600 mt-0.5">
              Editing this text after sign-offs invalidates them — signers will need to re-sign.
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-gray-500 mb-0.5">Blocker</label>
              <input value={draft.blocker}
                onChange={e => setDraft({ ...draft, blocker: e.target.value })}
                className="w-full bg-white border border-gray-300 rounded px-2 py-1 text-sm" />
            </div>
            <div>
              <label className="block text-gray-500 mb-0.5">Next action</label>
              <input value={draft.next_action}
                onChange={e => setDraft({ ...draft, next_action: e.target.value })}
                className="w-full bg-white border border-gray-300 rounded px-2 py-1 text-sm" />
            </div>
            <div>
              <label className="block text-gray-500 mb-0.5">Target date</label>
              <input type="date" value={draft.target_date}
                onChange={e => setDraft({ ...draft, target_date: e.target.value })}
                className="w-full bg-white border border-gray-300 rounded px-2 py-1 text-sm" />
            </div>
          </div>
          <button onClick={save} disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white px-4 py-1.5 rounded text-xs font-semibold">
            {saving ? "Saving…" : "Save Decision"}
          </button>
        </div>
      </Panel>

      <Panel title="Approval Matrix (6 roles)">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 text-left border-b border-gray-200">
              <th className="py-1 pr-3 font-semibold">Role</th>
              <th className="py-1 pr-3 font-semibold">Signer</th>
              <th className="py-1 pr-3 font-semibold">Status</th>
              <th className="py-1 pr-3 font-semibold">Signed at</th>
              <th className="py-1 pr-3 font-semibold">Signoff hash</th>
              <th className="py-1 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {ROLES_6.map(role => {
              const a = (circular.approvals || []).find(x => x.role === role) ||
                        { role, status: "Pending", signer: null, signed_at: null };
              const badge = APPROVAL_BADGE[a.status] || { variant: "INFO" };
              return (
                <tr key={role} className="border-b border-gray-100">
                  <td className="py-2 pr-3 text-gray-800">{role}</td>
                  <td className="py-2 pr-3 text-gray-500">{a.signer || "—"}</td>
                  <td className="py-2 pr-3"><Badge label={a.status} variant={badge.variant} /></td>
                  <td className="py-2 pr-3 text-gray-500">{a.signed_at?.slice(0, 19).replace("T", " ") || "—"}</td>
                  <td className="py-2 pr-3 text-gray-400 font-mono text-[10px]">
                    {a.signoff_sha256 ? a.signoff_sha256.slice(0, 10) + "…" : "—"}
                  </td>
                  <td className="py-2">
                    {a.status !== "Signed" && (
                      <button onClick={() => sign(role, "Signed")}
                        className="text-blue-600 hover:text-blue-800 underline mr-3">Sign</button>
                    )}
                    {a.status === "Signed" && (
                      <button onClick={() => sign(role, "Pending")}
                        className="text-gray-500 hover:text-gray-700 underline">Revoke</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>

      {ri && Object.keys(ri).length > 0 && (
        <Panel title="Rate Impact">
          <div className="grid grid-cols-4 gap-3 text-xs">
            {ri.written_premium_pct != null && (
              <div className="bg-gray-50 border border-gray-100 rounded p-2">
                <div className="text-gray-500">Written premium %</div>
                <div className="font-mono text-sm text-gray-800">{pct(ri.written_premium_pct)}</div>
              </div>
            )}
            {ri.written_premium_delta != null && (
              <div className="bg-gray-50 border border-gray-100 rounded p-2">
                <div className="text-gray-500">Premium delta</div>
                <div className="font-mono text-sm text-gray-800">{currency(ri.written_premium_delta)}</div>
              </div>
            )}
            {ri.policies_impacted != null && (
              <div className="bg-gray-50 border border-gray-100 rounded p-2">
                <div className="text-gray-500">Policies impacted</div>
                <div className="font-mono text-sm text-gray-800">{ri.policies_impacted.toLocaleString()}</div>
              </div>
            )}
            {ri.avg_account_change != null && (
              <div className="bg-gray-50 border border-gray-100 rounded p-2">
                <div className="text-gray-500">Avg account Δ</div>
                <div className="font-mono text-sm text-gray-800">{currency(ri.avg_account_change)}</div>
              </div>
            )}
          </div>
          {ri.class_groups && (
            <div className="mt-3">
              <div className="text-gray-500 text-xs font-semibold mb-1">By class group</div>
              <table className="w-full text-xs">
                <thead><tr className="text-gray-500 border-b border-gray-200">
                  <th className="py-1 pr-3 text-left">Group</th>
                  <th className="py-1 pr-3 text-right">Change</th>
                  <th className="py-1 pr-3 text-right">Policies</th>
                  <th className="py-1 pr-3 text-left">Signal</th>
                </tr></thead>
                <tbody>
                  {ri.class_groups.map(g => (
                    <tr key={g.group} className="border-b border-gray-100">
                      <td className="py-1 pr-3 text-gray-700">{g.group}</td>
                      <td className="py-1 pr-3 text-right font-mono">{pct(g.change_pct)}</td>
                      <td className="py-1 pr-3 text-right font-mono text-gray-500">{g.policies?.toLocaleString()}</td>
                      <td className="py-1 pr-3"><Badge label={g.signal} variant={
                        g.signal === "High" ? "BLOCKED" :
                        g.signal === "Medium" ? "WARN" : "ACTIVE"
                      } /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      {pmf && pmf.length > 0 && (
        <Panel title="PMF Impact">
          <table className="w-full text-xs">
            <thead><tr className="text-gray-500 border-b border-gray-200">
              <th className="py-1 pr-3 text-left">Class group</th>
              <th className="py-1 pr-3 text-right">Current</th>
              <th className="py-1 pr-3 text-right">Proposed</th>
              <th className="py-1 pr-3 text-right">Δ</th>
              <th className="py-1 pr-3 text-right">Policies</th>
            </tr></thead>
            <tbody>
              {pmf.map(p => (
                <tr key={p.class_group} className="border-b border-gray-100">
                  <td className="py-1 pr-3 text-gray-700">{p.class_group}</td>
                  <td className="py-1 pr-3 text-right font-mono">{p.current_pmf?.toFixed(3)}</td>
                  <td className="py-1 pr-3 text-right font-mono">{p.proposed_pmf?.toFixed(3)}</td>
                  <td className="py-1 pr-3 text-right font-mono">{pct(p.change_pct)}</td>
                  <td className="py-1 pr-3 text-right font-mono text-gray-500">{p.policies_affected?.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  );
}

function ErcAdoptionTab({ circular, onRefresh }) {
  const editions = circular.linked_editions || [];
  const [activating, setActivating] = useState(null);
  const [err, setErr] = useState(null);
  const [reconciling, setReconciling] = useState(false);
  const [reconcileReport, setReconcileReport] = useState(null);

  async function reconcile(allowActivated = false) {
    setReconciling(true); setErr(null);
    if (!allowActivated) setReconcileReport(null);
    try {
      const r = await phaseD.reconcileLinks(circular.circular_id, allowActivated);
      setReconcileReport(r);
      if ((r.linked?.length || 0) + (r.linked_post_activation?.length || 0) > 0) onRefresh?.();
    } catch (e) { setErr(e.message); }
    finally { setReconciling(false); }
  }

  async function activate(editionId, requireAck = false) {
    const signer = window.prompt("Activate as Compliance — enter your name");
    if (!signer) return;
    setActivating(editionId); setErr(null);
    try {
      await phaseD.activateErc(editionId, {
        signer,
        acknowledge_stale: requireAck,
        notes: `Activated via Screen 7 for circular ${circular.circular_id}`,
      });
      onRefresh?.();
    } catch (e) {
      const msg = e.message || "";
      if (msg.includes("acknowledge_stale") && !requireAck) {
        if (window.confirm("Divergence check is unresolved (signoff >180 days before ERC). Acknowledge stale and proceed?")) {
          return activate(editionId, true);
        }
      } else {
        setErr(e.message);
      }
    } finally {
      setActivating(null);
    }
  }

  const reconcileBtn = (
    <div className="flex items-start justify-between gap-3 mb-3">
      <div className="text-[11px] text-gray-500 italic flex-1">
        Editions are invisible to the rating engine until Compliance activates them. One click, one human, one timestamp — the regulator-defensible narrative.
      </div>
      <button onClick={() => reconcile(false)} disabled={reconciling}
        title="Scan every ERC delivery for this circular ID and link any editions that cite it but were ingested before this circular was registered. Activated editions are refused to preserve audit immutability."
        className="bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-40 text-gray-700 px-3 py-1 rounded text-xs font-semibold whitespace-nowrap">
        {reconciling ? "Reconciling…" : "Reconcile Links"}
      </button>
    </div>
  );

  const reconcileReportBlock = reconcileReport && (
    <div className="bg-blue-50 border border-blue-200 rounded px-3 py-2 mb-3 text-[11px] text-blue-900">
      <div className="font-semibold mb-1">
        Reconciliation complete · found {reconcileReport.manifest_citations_found} manifest citation{reconcileReport.manifest_citations_found === 1 ? "" : "s"}
        {reconcileReport.editions_scanned_legacy != null && (
          <span className="font-normal text-blue-700"> (legacy circulars_json fallback scanned {reconcileReport.editions_scanned_legacy} editions)</span>
        )}
      </div>
      <div className="space-y-0.5">
        {(reconcileReport.linked?.length || 0) > 0 && (
          <div>
            <span className="font-semibold text-emerald-700">Newly linked: {reconcileReport.linked.length}</span>
            <span className="ml-1 font-mono text-emerald-700">
              ({reconcileReport.linked.map(e => `${e.state_code}/${e.effective_date}`).join(", ")})
            </span>
          </div>
        )}
        {(reconcileReport.linked_post_activation?.length || 0) > 0 && (
          <div>
            <span className="font-semibold text-purple-700">Post-activation linked: {reconcileReport.linked_post_activation.length}</span>
            <span className="ml-1 font-mono text-purple-700">
              ({reconcileReport.linked_post_activation.map(e => `${e.state_code}/${e.effective_date}`).join(", ")})
            </span>
            <div className="text-purple-800 font-normal mt-0.5">
              Recorded with link_basis='RECONCILED_POST_ACTIVATION'. The bind-time activation hash is unchanged — audit chain shows zero links at activation, plus these as post-hoc evidence.
            </div>
          </div>
        )}
        <div>Already linked: <span className="font-mono">{reconcileReport.already_linked?.length || 0}</span></div>
        {(reconcileReport.refused_activated?.length || 0) > 0 && (
          <div className="mt-2 bg-amber-50 border border-amber-200 rounded p-2">
            <div className="text-amber-800 font-semibold mb-0.5">
              ⚠ {reconcileReport.refused_activated.length} activated edition{reconcileReport.refused_activated.length === 1 ? " was" : "s were"} refused
            </div>
            <div className="text-amber-800 font-mono text-[10px] mb-1">
              {reconcileReport.refused_activated.slice(0, 8).map(e => e.edition_id).join(", ")}
              {reconcileReport.refused_activated.length > 8 ? ` +${reconcileReport.refused_activated.length - 8} more` : ""}
            </div>
            <div className="text-amber-800 mb-1.5">
              These were activated before this circular's manifest evidence existed (typically due to the namespace parser bug). The bind-time hash is unchanged either way. Linking them now records the historical truth as post-activation evidence — audit chain stays coherent.
            </div>
            <button
              onClick={() => reconcile(true)}
              disabled={reconciling}
              className="bg-amber-600 hover:bg-amber-700 disabled:opacity-40 text-white px-2.5 py-1 rounded text-[11px] font-semibold">
              {reconciling ? "Linking…" : `Link ${reconcileReport.refused_activated.length} as post-activation evidence`}
            </button>
          </div>
        )}
      </div>
      <button onClick={() => setReconcileReport(null)} className="mt-1 text-blue-600 hover:text-blue-800 underline">
        Dismiss
      </button>
    </div>
  );

  if (editions.length === 0) {
    return (
      <Panel title="ERC Adoption">
        {err && <div className="text-red-600 text-xs bg-red-50 border border-red-200 rounded px-3 py-2 mb-3">{err}</div>}
        {reconcileBtn}
        {reconcileReportBlock}
        <div className="text-gray-400 text-xs italic">
          No editions are linked to this circular yet. Phase A ingest auto-links when an ERC delivery cites this circular. If this circular was registered after the citing delivery was already ingested, click <strong>Reconcile Links</strong> above to backfill.
        </div>
      </Panel>
    );
  }

  return (
    <Panel title="ERC Adoption — Compliance Gate">
      {err && <div className="text-red-600 text-xs bg-red-50 border border-red-200 rounded px-3 py-2 mb-3">{err}</div>}
      {reconcileBtn}
      {reconcileReportBlock}
      <table className="w-full text-xs">
        <thead>
          <tr className="text-gray-500 text-left border-b border-gray-200">
            <th className="py-1 pr-3 font-semibold">Edition</th>
            <th className="py-1 pr-3 font-semibold">State</th>
            <th className="py-1 pr-3 font-semibold">Effective</th>
            <th className="py-1 pr-3 font-semibold">Manifest Evidence</th>
            <th className="py-1 pr-3 font-semibold">Adoption</th>
            <th className="py-1 pr-3 font-semibold">Mode</th>
            <th className="py-1 pr-3 font-semibold">Activated at</th>
            <th className="py-1 font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody>
          {editions.map(e => {
            const badge = ERC_STATUS_BADGE[e.adoption_status] || { label: e.adoption_status, variant: "INFO" };
            const types = e.circular_types || [];
            const refs = e.filing_references || [];
            const manifestEff = e.manifest_effective_date;
            const editionEff = e.effective_date;
            const driftWarn = manifestEff && circular.bureau_effective && manifestEff !== circular.bureau_effective;
            return (
              <tr key={e.edition_id} className="border-b border-gray-100 align-top">
                <td className="py-1.5 pr-3 font-mono text-gray-700">{e.edition_id}</td>
                <td className="py-1.5 pr-3 text-gray-500">{e.state_code}</td>
                <td className="py-1.5 pr-3 text-gray-500">{editionEff}</td>
                <td className="py-1.5 pr-3">
                  {types.length === 0 && refs.length === 0 && !manifestEff ? (
                    <span className="text-gray-400 italic">no manifest evidence</span>
                  ) : (
                    <div className="space-y-1">
                      {types.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {types.map(t => (
                            <span key={t}
                              title={`Type: ${t}`}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border
                                ${t === "FORMS" ? "border-blue-200 text-blue-700 bg-blue-50"
                                  : t === "RULES" ? "border-purple-200 text-purple-700 bg-purple-50"
                                  : t === "LOSS COSTS" || t === "RATES" ? "border-emerald-200 text-emerald-700 bg-emerald-50"
                                  : t === "STAT PLAN" ? "border-amber-200 text-amber-700 bg-amber-50"
                                  : "border-gray-200 text-gray-600 bg-gray-50"}`}>
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                      {refs.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {refs.map(r => (
                            <span key={r}
                              title="Filing reference (SERFF track)"
                              className="px-1.5 py-0.5 rounded font-mono text-[10px] border border-gray-300 text-gray-600 bg-white">
                              {r}
                            </span>
                          ))}
                        </div>
                      )}
                      {manifestEff && (
                        <div className={`text-[10px] ${driftWarn ? "text-amber-700 font-semibold" : "text-gray-500"}`}
                          title={driftWarn ? `Manifest says ${manifestEff}; circular header says ${circular.bureau_effective}. Divergence — confirm which is right.` : "Bureau effective date per manifest"}>
                          eff: {manifestEff}{driftWarn ? " ⚠" : ""}
                        </div>
                      )}
                    </div>
                  )}
                </td>
                <td className="py-1.5 pr-3"><Badge label={badge.label} variant={badge.variant} /></td>
                <td className="py-1.5 pr-3 text-gray-500">{e.signoff_mode}</td>
                <td className="py-1.5 pr-3 text-gray-500">
                  {e.activated_at?.slice(0, 19).replace("T", " ") || "—"}
                </td>
                <td className="py-1.5">
                  {e.adoption_status === "pending_signoff" && (
                    <button onClick={() => activate(e.edition_id)}
                      disabled={activating === e.edition_id}
                      className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white px-3 py-1 rounded text-xs font-semibold">
                      {activating === e.edition_id ? "Activating…" : "Activate"}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}

function CircularDetail({ circularId, onBack, refreshOuter }) {
  const [c, setC] = useState(null);
  const [tab, setTab] = useState("overview");
  const [err, setErr] = useState(null);

  const load = useCallback(() => {
    setErr(null);
    phaseD.getCircular(circularId)
      .then(setC)
      .catch(e => setErr(e.message));
  }, [circularId]);

  useEffect(() => { load(); }, [load]);

  function refresh() {
    load();
    refreshOuter?.();
  }

  if (err) return (
    <div className="space-y-3">
      <button onClick={onBack} className="text-blue-600 hover:text-blue-800 underline text-sm">← Back</button>
      <div className="text-red-600 text-xs bg-red-50 border border-red-200 rounded px-3 py-2">{err}</div>
    </div>
  );
  if (!c) return <div className="text-gray-400 text-sm">Loading…</div>;

  const dec = DECISION_BADGE[c.decision_status] || { label: c.decision_status, variant: "INFO" };

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-blue-600 hover:text-blue-800 underline text-sm">← Back to circulars</button>

      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-gray-500 text-xs">{c.circular_id}</span>
              <Badge label={dec.label} variant={dec.variant} />
              <Badge label={c.lob} variant="INFO" />
              <Badge label={c.circular_type} variant="INFO" />
            </div>
            <h2 className="text-base font-semibold text-gray-900">{c.title}</h2>
            <div className="text-xs text-gray-500 mt-1">
              <span className="mr-3">States: <span className="text-gray-700">{(c.states || []).join(", ")}</span></span>
              {c.bureau_effective && <span className="mr-3">Bureau effective: <span className="text-gray-700">{c.bureau_effective}</span></span>}
              {c.owner && <span>Owner: <span className="text-gray-700">{c.owner}</span></span>}
            </div>
          </div>
          <div className="text-right text-xs text-gray-500">
            <div>Linked editions: <span className="font-mono text-gray-800">{c.linked_editions?.length || 0}</span></div>
            <div>Linked deviations: <span className="font-mono text-gray-800">{c.linked_deviations?.length || 0}</span></div>
          </div>
        </div>
      </div>

      <div className="flex border-b border-gray-200">
        {[
          { id: "overview", label: "Overview" },
          { id: "insights", label: "Prioritized Insights" },
          { id: "decision", label: "Circular Decision" },
          { id: "adoption", label: "ERC Adoption" },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors
              ${tab === t.id ? "border-blue-500 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab circular={c} onSaved={refresh} />}
      {tab === "insights" && <PrioritizedInsightsTab circular={c} />}
      {tab === "decision" && <DecisionTab circular={c} onSaved={refresh} />}
      {tab === "adoption" && <ErcAdoptionTab circular={c} onRefresh={refresh} />}
    </div>
  );
}

// ── Screen root ──────────────────────────────────────────────────────────────

export default function Screen7_CircularAdoption() {
  const [selectedId, setSelectedId] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="p-6 text-gray-900">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-2 h-2 rounded-full bg-blue-500" />
          <h1 className="text-xl font-semibold text-gray-900">Circular Adoption</h1>
          <Badge label="SCREEN 7" variant="INFO" />
          <Badge label="PHASE D" variant="INFO" />
        </div>
        <p className="text-gray-500 text-sm">
          Filing-team sign-off on ISO circulars · Compliance gate for ERC adoption · cross-link to Phase A editions and Phase B deviations
        </p>
      </div>

      {selectedId ? (
        <CircularDetail
          circularId={selectedId}
          onBack={() => setSelectedId(null)}
          refreshOuter={() => setRefreshKey(k => k + 1)}
        />
      ) : (
        <CircularList
          onSelect={setSelectedId}
          refreshKey={refreshKey}
          onRefresh={() => setRefreshKey(k => k + 1)}
        />
      )}
    </div>
  );
}
