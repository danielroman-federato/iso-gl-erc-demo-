import { useState, useEffect, useMemo, useCallback } from "react";
import { isoPermissions } from "../api/client";
import { Panel } from "../components/Panel";
import { Badge } from "../components/Badge";

// Per-carrier ISO Permissions: master CLM agreement + the LOB × Service ×
// Jurisdiction matrix that gates ISO-sourced content. Independent of
// carrier_state_scope (the DOI license layer).

function agreementStatus(agreement) {
  if (!agreement) return { variant: "WARN", label: "AGREEMENT MISSING" };
  if (!agreement.agreement_in_place) {
    return { variant: "FAIL", label: "AGREEMENT NOT IN PLACE" };
  }
  if (agreement.expiration_date) {
    const today = new Date().toISOString().slice(0, 10);
    if (agreement.expiration_date < today) {
      return { variant: "FAIL", label: "AGREEMENT EXPIRED" };
    }
  }
  if (!agreement.has_agreement) {
    return { variant: "WARN", label: "AGREEMENT FILE MISSING" };
  }
  return { variant: "ACTIVE", label: "AGREEMENT ACTIVE" };
}

function StatCard({ label, value, hint }) {
  return (
    <div className="rounded-lg border bg-white px-4 py-3" style={{ borderColor: "#E8E5E2" }}>
      <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">{label}</div>
      <div className="text-2xl font-semibold text-gray-800 mt-0.5">{value}</div>
      {hint && <div className="text-[11px] text-gray-500 mt-0.5">{hint}</div>}
    </div>
  );
}

function EmptyState({ carriers, onPick }) {
  const list = carriers || [];
  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-gray-800">ISO Permissions</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Pick a carrier to manage its master CLM agreement and per-jurisdiction ISO redistribution rights.
        </p>
      </div>
      <Panel title={`Carriers (${list.length})`}>
        {list.length === 0 ? (
          <div className="text-xs text-gray-400 py-6 text-center italic">
            No carriers yet. Use the Carriers screen to onboard one.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {list.map((c) => (
              <button
                key={c.carrier_id}
                onClick={() => onPick(c.carrier_id)}
                className="text-left rounded border bg-white hover:bg-gray-50 px-3 py-2.5 transition-colors"
                style={{ borderColor: "#E8E5E2" }}
              >
                <div className="text-sm font-semibold text-gray-800">{c.carrier_name}</div>
                <div className="text-[10px] text-gray-500 font-mono mt-0.5">
                  {c.carrier_id}
                  {c.impl_status ? ` · ${c.impl_status}` : ""}
                  {typeof c.state_count === "number" ? ` · ${c.state_count} states` : ""}
                </div>
              </button>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

export default function Screen9_IsoPermissions({ currentCarrierId, carriers, onPickCarrier }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  // Working draft, isolated from server state until save.
  const [draftMatrix, setDraftMatrix] = useState({});   // key = "LOB|SVC|JUR" → bool
  const [draftAgreement, setDraftAgreement] = useState(null);
  const [dirty, setDirty] = useState(false);

  // Slice selectors.
  const [selectedLob, setSelectedLob] = useState("GL");
  const [selectedService, setSelectedService] = useState("FO");

  // Local file upload state.
  const [pendingFile, setPendingFile] = useState(null);   // { name, type, base64 }

  const cellKey = (lob, svc, jur) => `${lob}|${svc}|${jur}`;

  const loadData = useCallback(async () => {
    if (!currentCarrierId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await isoPermissions.get(currentCarrierId);
      setData(res);
      const m = {};
      for (const cell of res.matrix) {
        m[cellKey(cell.lob_code, cell.service_code, cell.jurisdiction_code)] = cell.enabled;
      }
      setDraftMatrix(m);
      setDraftAgreement({ ...res.agreement });
      setPendingFile(null);
      setDirty(false);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }, [currentCarrierId]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Derived ──────────────────────────────────────────────────────────────

  const status = useMemo(() => agreementStatus(draftAgreement), [draftAgreement]);

  // Stats for the current (LOB, Service) slice.
  const sliceStats = useMemo(() => {
    if (!data) return { enabled: 0, total: 0 };
    const total = data.jurisdictions.length;
    let enabled = 0;
    for (const j of data.jurisdictions) {
      if (draftMatrix[cellKey(selectedLob, selectedService, j.code)]) enabled++;
    }
    return { enabled, total };
  }, [data, draftMatrix, selectedLob, selectedService]);

  // Cross-slice rollups.
  const rollups = useMemo(() => {
    if (!data) return { lobsActive: 0, servicesActive: 0, totalCells: 0, enabledCells: 0 };
    let enabledCells = 0;
    const enabledLobs = new Set();
    const enabledServices = new Set();
    for (const k of Object.keys(draftMatrix)) {
      if (draftMatrix[k]) {
        enabledCells++;
        const [lob, svc] = k.split("|");
        enabledLobs.add(lob);
        enabledServices.add(svc);
      }
    }
    return {
      lobsActive: enabledLobs.size,
      servicesActive: enabledServices.size,
      enabledCells,
      totalCells: Object.keys(draftMatrix).length,
    };
  }, [data, draftMatrix]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const toggleCell = (jurCode) => {
    const k = cellKey(selectedLob, selectedService, jurCode);
    setDraftMatrix((m) => ({ ...m, [k]: !m[k] }));
    setDirty(true);
  };

  const setSlice = (enabled) => {
    setDraftMatrix((m) => {
      const next = { ...m };
      for (const j of data.jurisdictions) {
        next[cellKey(selectedLob, selectedService, j.code)] = enabled;
      }
      return next;
    });
    setDirty(true);
  };

  const updateAgreement = (patch) => {
    setDraftAgreement((a) => ({ ...a, ...patch }));
    setDirty(true);
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const base64 = btoa(binary);
    setPendingFile({ name: file.name, type: file.type || "application/octet-stream", base64 });
    setDirty(true);
  };

  const save = async () => {
    if (!data || !draftAgreement) return;
    setSaving(true);
    setError(null);
    try {
      // Build matrix delta (only changed cells to keep payload small).
      const changedMatrix = [];
      for (const cell of data.matrix) {
        const k = cellKey(cell.lob_code, cell.service_code, cell.jurisdiction_code);
        const draftVal = !!draftMatrix[k];
        if (draftVal !== cell.enabled) {
          changedMatrix.push({
            lob_code: cell.lob_code,
            service_code: cell.service_code,
            jurisdiction_code: cell.jurisdiction_code,
            enabled: draftVal,
          });
        }
      }

      const agreementPayload = {
        agreement_in_place: draftAgreement.agreement_in_place,
        as_of_date: draftAgreement.as_of_date || null,
        expiration_date: draftAgreement.expiration_date || null,
      };
      if (pendingFile) {
        agreementPayload.agreement_filename = pendingFile.name;
        agreementPayload.agreement_content_type = pendingFile.type;
        agreementPayload.agreement_content_base64 = pendingFile.base64;
      }

      const res = await isoPermissions.save(currentCarrierId, {
        matrix: changedMatrix,
        agreement: agreementPayload,
      });
      setData(res);
      const m = {};
      for (const cell of res.matrix) {
        m[cellKey(cell.lob_code, cell.service_code, cell.jurisdiction_code)] = cell.enabled;
      }
      setDraftMatrix(m);
      setDraftAgreement({ ...res.agreement });
      setPendingFile(null);
      setDirty(false);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setSaving(false);
    }
  };

  if (!currentCarrierId) return <EmptyState carriers={carriers} onPick={onPickCarrier} />;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">ISO Permissions</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Master CLM agreement + per-(LOB, service, jurisdiction) permission matrix for this carrier.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge label={status.label} variant={status.variant} />
          <button
            onClick={save}
            disabled={!dirty || saving}
            className="px-3 py-1.5 rounded text-xs font-semibold text-white disabled:opacity-40"
            style={{ backgroundColor: dirty ? "#0a8a64" : "#9CA3AF" }}
          >
            {saving ? "Saving…" : dirty ? "Save changes" : "No changes"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 text-red-700 text-xs px-3 py-2">
          {error}
        </div>
      )}

      {loading || !data || !draftAgreement ? (
        <Panel><div className="text-xs text-gray-400 py-8 text-center">Loading…</div></Panel>
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-4 gap-3">
            <StatCard label="LOBs with rights" value={rollups.lobsActive} hint={`of ${data.lobs.length}`} />
            <StatCard label="Services with rights" value={rollups.servicesActive} hint={`of ${data.services.length}`} />
            <StatCard
              label="Cells enabled"
              value={rollups.enabledCells.toLocaleString()}
              hint={`of ${rollups.totalCells.toLocaleString()} total`}
            />
            <StatCard
              label={`${selectedLob} · ${selectedService} jurisdictions`}
              value={sliceStats.enabled}
              hint={`of ${sliceStats.total} in this slice`}
            />
          </div>

          {/* Agreement panel */}
          <Panel title="Master ISO Agreement">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
                  Agreement in place
                </label>
                <div className="mt-1.5">
                  <button
                    onClick={() => updateAgreement({ agreement_in_place: !draftAgreement.agreement_in_place })}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded border text-xs font-medium"
                    style={{
                      borderColor: draftAgreement.agreement_in_place ? "#0a8a64" : "#E8E5E2",
                      backgroundColor: draftAgreement.agreement_in_place ? "rgba(32,223,166,0.10)" : "#FFFFFF",
                      color: draftAgreement.agreement_in_place ? "#0a6b50" : "#6B6660",
                    }}
                  >
                    <span
                      className="inline-block w-3 h-3 rounded-full"
                      style={{ backgroundColor: draftAgreement.agreement_in_place ? "#0a8a64" : "#D6D2CD" }}
                    />
                    {draftAgreement.agreement_in_place ? "In place" : "Not in place"}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
                  As-of date
                </label>
                <input
                  type="date"
                  value={draftAgreement.as_of_date || ""}
                  onChange={(e) => updateAgreement({ as_of_date: e.target.value })}
                  className="mt-1.5 w-full px-2 py-1.5 text-xs rounded border bg-white font-medium"
                  style={{ borderColor: "#E8E5E2", color: "#1F2937" }}
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
                  Expiration date
                </label>
                <input
                  type="date"
                  value={draftAgreement.expiration_date || ""}
                  onChange={(e) => updateAgreement({ expiration_date: e.target.value })}
                  className="mt-1.5 w-full px-2 py-1.5 text-xs rounded border bg-white font-medium"
                  style={{ borderColor: "#E8E5E2", color: "#1F2937" }}
                />
              </div>
            </div>

            <div className="mt-4 pt-3 border-t" style={{ borderColor: "#F0EDEA" }}>
              <label className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
                Agreement file
              </label>
              <div className="mt-1.5 flex items-center gap-3 flex-wrap">
                <label
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded border text-xs font-medium cursor-pointer hover:bg-gray-50"
                  style={{ borderColor: "#E8E5E2", color: "#4B4640" }}
                >
                  <input type="file" className="hidden" onChange={handleFileChange} />
                  Upload…
                </label>
                {pendingFile ? (
                  <span className="text-xs text-gray-700">
                    <span className="font-medium">{pendingFile.name}</span>
                    <span className="text-gray-400 ml-1">(staged — will upload on save)</span>
                  </span>
                ) : draftAgreement.has_agreement ? (
                  <>
                    <span className="text-xs text-gray-700 font-medium">
                      {draftAgreement.agreement_filename || "Agreement on file"}
                    </span>
                    <a
                      href={isoPermissions.downloadAgreementUrl(currentCarrierId)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-blue-700 hover:underline"
                    >
                      Download
                    </a>
                  </>
                ) : (
                  <span className="text-xs text-gray-400 italic">No file uploaded yet.</span>
                )}
              </div>
            </div>
          </Panel>

          {/* Matrix panel */}
          <Panel title="Permission matrix">
            <div className="flex items-end gap-3 flex-wrap">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">LOB</label>
                <select
                  value={selectedLob}
                  onChange={(e) => setSelectedLob(e.target.value)}
                  className="mt-1.5 px-2 py-1.5 text-xs rounded border bg-white font-medium"
                  style={{ borderColor: "#E8E5E2", minWidth: 280, color: "#1F2937" }}
                >
                  {data.lobs.map((l) => (
                    <option key={l.code} value={l.code} style={{ color: "#1F2937" }}>{l.code} — {l.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Service</label>
                <select
                  value={selectedService}
                  onChange={(e) => setSelectedService(e.target.value)}
                  className="mt-1.5 px-2 py-1.5 text-xs rounded border bg-white font-medium"
                  style={{ borderColor: "#E8E5E2", minWidth: 160, color: "#1F2937" }}
                >
                  {data.services.map((s) => (
                    <option key={s.code} value={s.code} style={{ color: "#1F2937" }}>{s.code} — {s.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <button
                  onClick={() => setSlice(true)}
                  className="px-2.5 py-1 rounded border text-xs font-medium hover:bg-gray-50"
                  style={{ borderColor: "#E8E5E2", color: "#4B4640" }}
                >
                  Select all
                </button>
                <button
                  onClick={() => setSlice(false)}
                  className="px-2.5 py-1 rounded border text-xs font-medium hover:bg-gray-50"
                  style={{ borderColor: "#E8E5E2", color: "#4B4640" }}
                >
                  Clear all
                </button>
              </div>
            </div>

            {(() => {
              const lobLabel = data.lobs.find(l => l.code === selectedLob)?.label || selectedLob;
              const svcLabel = data.services.find(s => s.code === selectedService)?.label || selectedService;
              return (
                <div
                  className="mt-4 rounded px-3 py-2 flex items-center justify-between"
                  style={{ backgroundColor: "#F4F1ED", border: "1px solid #E8E5E2" }}
                >
                  <div className="text-xs" style={{ color: "#1F2937" }}>
                    <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mr-2">
                      Now showing
                    </span>
                    <span className="font-mono font-semibold">{selectedLob}</span>
                    <span className="text-gray-500"> · </span>
                    <span>{lobLabel}</span>
                    <span className="text-gray-400 mx-2">×</span>
                    <span className="font-mono font-semibold">{selectedService}</span>
                    <span className="text-gray-500"> · </span>
                    <span>{svcLabel}</span>
                  </div>
                  <div className="text-xs font-mono" style={{ color: "#0a6b50" }}>
                    {sliceStats.enabled} / {sliceStats.total} enabled
                  </div>
                </div>
              );
            })()}

            <div className="mt-3 grid grid-cols-6 gap-1.5">
              {data.jurisdictions.map((j) => {
                const enabled = !!draftMatrix[cellKey(selectedLob, selectedService, j.code)];
                return (
                  <button
                    key={j.code}
                    onClick={() => toggleCell(j.code)}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded border text-xs text-left transition-colors"
                    style={{
                      borderColor: enabled ? "#0a8a64" : "#E8E5E2",
                      backgroundColor: enabled ? "rgba(32,223,166,0.10)" : "#FFFFFF",
                      color: enabled ? "#0a6b50" : "#6B6660",
                    }}
                    title={j.label}
                  >
                    <span
                      className="inline-block w-3.5 h-3.5 rounded border flex items-center justify-center"
                      style={{
                        borderColor: enabled ? "#0a8a64" : "#C9C5BF",
                        backgroundColor: enabled ? "#0a8a64" : "#FFFFFF",
                      }}
                    >
                      {enabled && (
                        <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                          <path d="M1.5 4.5L3.5 6.5L7.5 2" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                    <span className="font-mono">{j.code}</span>
                  </button>
                );
              })}
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
