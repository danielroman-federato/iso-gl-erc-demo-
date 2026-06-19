import { useState, useEffect, useRef } from "react";
import { phaseA, phaseD } from "../api/client";

function MassIngestPanel() {
  const [folderPath, setFolderPath] = useState("");
  const [scanning, setScanning] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [scan, setScan] = useState(null);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(null);
  const [currentProcessing, setCurrentProcessing] = useState("");
  const [streamRows, setStreamRows] = useState([]);
  const abortRef = useRef(null);

  async function handleScan() {
    if (!folderPath.trim()) return;
    setScanning(true);
    setError(null);
    setScan(null);
    setStreamRows([]);
    setProgress(null);
    try {
      const r = await phaseA.scanIngestRoot(folderPath.trim());
      setScan(r);
    } catch (e) {
      setError(e.message);
    } finally {
      setScanning(false);
    }
  }

  async function handleIngest(skipLoaded) {
    if (!folderPath.trim()) return;
    setIngesting(true);
    setError(null);
    setStreamRows([]);
    setProgress(null);
    setCurrentProcessing("");
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await phaseA.massIngestStream(
        folderPath.trim(),
        skipLoaded,
        (evt) => {
          if (evt.type === "start") {
            setProgress({ current: 0, total: evt.total });
          } else if (evt.type === "processing") {
            setProgress(p => ({ ...p, current: evt.index - 1 }));
            setCurrentProcessing(evt.delivery_id || evt.name);
          } else if (evt.type === "result") {
            setProgress(p => ({ ...p, current: evt.index }));
            setStreamRows(rows => [...rows, evt]);
          } else if (evt.type === "done") {
            setProgress(p => ({ ...p, current: evt.total }));
            setCurrentProcessing("");
          }
        },
        controller.signal
      );
    } catch (e) {
      if (e.name !== "AbortError") setError(e.message);
    } finally {
      setIngesting(false);
      setCurrentProcessing("");
    }
  }

  function handleCancel() {
    abortRef.current?.abort();
  }

  const STATUS_CLS = {
    COMPLETE: "text-emerald-600 font-semibold",
    SKIPPED: "text-gray-400",
    BLOCKED: "text-red-600 font-semibold",
    VALIDATION_FAILED: "text-red-600 font-semibold",
    ERROR: "text-red-600 font-semibold",
  };

  const progressPct = progress
    ? Math.round((progress.current / Math.max(progress.total, 1)) * 100)
    : 0;

  return (
    <div className="space-y-3">
      <p className="text-gray-500 text-xs">
        Point to an ERC root folder — either a folder of ZIPs, a folder of extracted delivery
        folders, or the ISO jurisdiction layout (one sub-folder per state, each containing
        versioned deliveries). CW and state editions can be mixed.
      </p>

      {/* Path input + Scan */}
      <div className="flex gap-2">
        <input
          value={folderPath}
          onChange={e => { setFolderPath(e.target.value); setScan(null); setStreamRows([]); setProgress(null); }}
          placeholder="C:\Projects\version_5_proof_of_concept\ERC"
          className="flex-1 bg-white border border-gray-300 rounded px-3 py-2 text-gray-900 text-sm font-mono focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
        <button
          onClick={handleScan}
          disabled={scanning || ingesting || !folderPath.trim()}
          className="bg-gray-700 hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2 rounded text-sm font-medium transition-colors whitespace-nowrap"
        >
          {scanning ? "Scanning…" : "Scan"}
        </button>
      </div>

      {error && (
        <div className="text-red-700 text-xs bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>
      )}

      {/* Scan preview — hide once ingest has started */}
      {scan && !ingesting && streamRows.length === 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-4 text-xs">
            <span className="text-gray-500">{scan.total_found} deliveries found</span>
            <span className="text-emerald-600 font-semibold">{scan.new_count} new</span>
            <span className="text-gray-400">{scan.already_loaded_count} already loaded</span>
          </div>

          <div className="overflow-auto max-h-64 rounded border border-gray-200">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
                <tr>
                  {["State", "Delivery", "Type", "Status"].map(h => (
                    <th key={h} className="px-3 py-2 text-gray-500 text-left font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {scan.items.map((item, i) => (
                  <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-1 text-gray-500">{item.state_folder || "—"}</td>
                    <td className="px-3 py-1 font-mono text-gray-800">
                      {item.delivery_id || <span className="text-red-400">Unrecognized: {item.name}</span>}
                    </td>
                    <td className="px-3 py-1">
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                        item.type === "zip" ? "bg-purple-50 text-purple-700" : "bg-blue-50 text-blue-700"
                      }`}>{item.type}</span>
                    </td>
                    <td className="px-3 py-1">
                      {item.already_loaded
                        ? <span className="text-gray-400 text-[10px]">already loaded</span>
                        : <span className="text-emerald-600 text-[10px] font-semibold">new</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-2">
            {scan.new_count > 0 && (
              <button
                onClick={() => handleIngest(true)}
                disabled={ingesting}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2 rounded text-sm font-semibold transition-colors"
              >
                {`Ingest ${scan.new_count} New`}
              </button>
            )}
            {scan.total_found > 0 && (
              <button
                onClick={() => handleIngest(false)}
                disabled={ingesting}
                className="bg-gray-100 hover:bg-gray-200 disabled:opacity-40 border border-gray-300 text-gray-700 px-4 py-2 rounded text-sm font-medium transition-colors"
              >
                {`Re-ingest All ${scan.total_found}`}
              </button>
            )}
            {scan.new_count === 0 && (
              <span className="text-gray-400 text-sm self-center">All deliveries already loaded.</span>
            )}
          </div>
        </div>
      )}

      {/* Live progress bar */}
      {progress && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">
              {progress.current} / {progress.total} processed
              {currentProcessing && (
                <span className="ml-2 text-gray-400 font-mono">{currentProcessing}</span>
              )}
            </span>
            {ingesting && (
              <button
                onClick={handleCancel}
                className="text-red-600 hover:text-red-800 font-medium"
              >
                Cancel
              </button>
            )}
          </div>
          <div className="w-full bg-gray-200 rounded-full h-1.5">
            <div
              className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Live results table */}
      {streamRows.length > 0 && (
        <div className="space-y-2">
          {!ingesting && (
            <div className="flex items-center gap-4 text-xs">
              <span className="text-gray-500">{streamRows.length} processed</span>
              <span className="text-emerald-600 font-semibold">
                {streamRows.filter(r => r.status === "COMPLETE").length} completed
              </span>
              <span className="text-gray-400">
                {streamRows.filter(r => r.status === "SKIPPED").length} skipped
              </span>
              {streamRows.filter(r => r.status === "ERROR").length > 0 && (
                <span className="text-red-600 font-semibold">
                  {streamRows.filter(r => r.status === "ERROR").length} errors
                </span>
              )}
            </div>
          )}
          <div className="overflow-auto max-h-64 rounded border border-gray-200">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
                <tr>
                  {["State", "Delivery ID", "Type", "Status", "Records", "STC"].map(h => (
                    <th key={h} className="px-3 py-2 text-gray-500 text-left font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {streamRows.map((r, i) => (
                  <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-1 text-gray-500">{r.state_folder || "—"}</td>
                    <td className="px-3 py-1 font-mono text-gray-700">{r.delivery_id || "—"}</td>
                    <td className="px-3 py-1">
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                        r.src_type === "zip" ? "bg-purple-50 text-purple-700" : "bg-blue-50 text-blue-700"
                      }`}>{r.src_type}</span>
                    </td>
                    <td className={`px-3 py-1 ${STATUS_CLS[r.status] || "text-gray-500"}`}>
                      {r.status}{r.error ? ` — ${r.error}` : ""}
                    </td>
                    <td className="px-3 py-1 text-gray-400">
                      {r.records
                        ? Object.values(r.records).reduce((a, b) => a + b, 0).toLocaleString()
                        : "—"}
                    </td>
                    <td className="px-3 py-1">
                      {r.stc_approved != null
                        ? <span className={r.stc_approved ? "text-emerald-600 font-semibold" : "text-red-600"}>
                            {r.stc_approved ? "PASS" : "FAIL"}
                          </span>
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
import { Badge } from "../components/Badge";
import { Panel } from "../components/Panel";

function PipelinePanel({ result, loading }) {
  if (loading) return <p className="text-gray-500 text-sm animate-pulse">Running pipeline...</p>;
  if (!result) return <p className="text-gray-400 text-sm">No pipeline run yet.</p>;

  const ev = result.ui_events?.pipeline;
  const stage = result.stage;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Badge
          label={ev?.status || (stage === "complete" ? "COMPLETE" : "BLOCKED")}
          variant={ev?.status || (stage === "complete" ? "COMPLETE" : "BLOCKED")}
        />
        <span className="text-gray-800 font-mono text-sm">{ev?.delivery_id || result.delivery_id}</span>
      </div>
      <div className="text-gray-700 text-sm">{ev?.display_label}</div>
      {ev?.blocker_summary && (
        <div className="text-red-700 text-xs bg-red-50 border border-red-200 rounded px-3 py-2">
          {ev.blocker_summary}
        </div>
      )}
      {ev?.warning_count > 0 && (
        <div className="text-amber-600 text-xs">{ev.warning_count} warning(s)</div>
      )}
      {stage === "complete" && result.parse_summary && (
        <div className="grid grid-cols-2 gap-2 mt-2">
          {Object.entries(result.parse_summary).map(([k, v]) => (
            <div key={k} className="bg-gray-50 border border-gray-100 rounded px-3 py-2">
              <div className="text-gray-500 text-xs">{k.replace(/_/g, " ")}</div>
              <div className="text-gray-900 font-mono text-lg font-semibold">{v.toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ValidationPanel({ result }) {
  if (!result?.ui_events?.validation) return null;
  const ev = result.ui_events.validation;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Badge label={ev.overall_result} variant={ev.overall_result} />
        <span className="text-gray-700 text-sm">
          {ev.approved_for_load ? "Approved for load" : "Load blocked"}
        </span>
      </div>
      <div className="space-y-1">
        {ev.check_summary?.map((c) => (
          <div key={c.check_id} className="flex items-start gap-2 text-xs">
            <Badge label={c.result} variant={c.result} />
            <span className="text-gray-700">{c.label}</span>
            {c.detail && <span className="text-gray-400 ml-1 truncate max-w-xs" title={c.detail}>— {c.detail}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function LoadPanel({ result }) {
  if (!result?.load?.load_events) return null;
  const events = result.load.load_events;
  return (
    <div className="space-y-1">
      {events.map((ev) => (
        <div key={ev.batch} className="flex items-center gap-3 text-xs">
          <span className="text-gray-400 font-mono w-4">{ev.batch}</span>
          <div className="flex-1 bg-gray-200 rounded h-1.5">
            <div
              className="bg-emerald-500 h-1.5 rounded"
              style={{ width: `${(ev.batches_complete / ev.total_batches) * 100}%` }}
            />
          </div>
          <span className="text-gray-700 w-48 truncate">{ev.batch_label}</span>
          <span className="text-gray-500 font-mono w-16 text-right">{ev.records_written.toLocaleString()}</span>
        </div>
      ))}
      <div className="pt-2 text-gray-800 text-sm font-semibold">
        Total: {result.load?.total_records?.toLocaleString()} records
      </div>
    </div>
  );
}

function EditionPanel({ result }) {
  if (!result?.edition) return null;
  const ev = result.edition.ui_edition_event;
  const inv = result.edition.inventory;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Badge label={ev.status} variant={ev.status} />
        <span className="text-gray-800 font-mono text-sm">{result.edition.edition_id}</span>
      </div>
      <div className="text-gray-700 text-sm">{ev.display_label} · v{ev.version}</div>
      {ev.cw_warning && (
        <div className="text-amber-700 text-xs bg-amber-50 border border-amber-200 rounded px-3 py-2">
          {ev.cw_warning}
        </div>
      )}
      <div className="grid grid-cols-3 gap-2">
        <Stat label="RTC Classes" value={ev.refer_to_company_classes} />
        <Stat label="N/A ILTA Classes" value={ev.na_ilta_classes} />
        <Stat label="Coexisting" value={ev.coexisting_count} />
      </div>
    </div>
  );
}

function STCPanel({ result }) {
  const [expanded, setExpanded] = useState(false);
  if (!result?.stc?.stc_results) return null;
  const stc = result.stc.stc_results[0];
  if (!stc) return null;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Badge
          label={stc.approved_for_production ? "PASS" : "FAIL"}
          variant={stc.approved_for_production ? "PASS" : "FAIL"}
        />
        <span className="text-gray-700 text-sm">{stc.status_label}</span>
      </div>
      <div className="flex gap-4 text-xs text-gray-500">
        <span>{stc.lookup_count} lookups</span>
        <span>{stc.null_results} nulls</span>
        <span>{stc.stc_file}</span>
      </div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-blue-600 hover:text-blue-800 underline"
      >
        {expanded ? "Collapse" : "Expand"} lookup trace
      </button>
      {expanded && (
        <div className="overflow-auto max-h-64 rounded bg-gray-50 border border-gray-200 p-3 text-xs font-mono space-y-1">
          {stc.trace?.map((s) => (
            <div key={s.step_id} className={`flex gap-2 ${s.result_is_null ? "text-red-600" : "text-gray-700"}`}>
              <span className="text-gray-400 w-20 shrink-0">{s.step_id}</span>
              <span className="text-gray-500 w-48 truncate shrink-0">{s.step_name}</span>
              <span className={s.result_is_null ? "text-red-600" : "text-emerald-600"}>
                {s.result_is_null ? "NULL" : s.result_value}
              </span>
              <span className="text-gray-400">{s.result_col_name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="bg-gray-50 border border-gray-100 rounded px-3 py-2 text-center">
      <div className="text-gray-500 text-xs">{label}</div>
      <div className="text-gray-900 font-mono text-xl font-semibold">{value ?? "—"}</div>
    </div>
  );
}

function ContentFreshnessPanel({ data }) {
  if (!data) return <p className="text-gray-400 text-sm">Loading…</p>;
  return (
    <div className="space-y-3">
      {data.stale_editions?.length > 0 && (
        <div className="text-amber-700 text-xs bg-amber-50 border border-amber-200 rounded px-3 py-2">
          {data.stale_editions.map(e => (
            <div key={e.edition_id}>{e.edition_id} — {e.age_days} days since load</div>
          ))}
        </div>
      )}
      {data.zip_update_recommended && (
        <div className="text-amber-600 text-xs">ZIP crosswalk update recommended (edition &gt;270 days old)</div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Active Editions" value={data.active_editions?.length} />
        <Stat label="Territory Records" value={data.territory_summary?.total?.toLocaleString()} />
      </div>
      {data.active_editions?.length > 0 && (
        <div className="space-y-1 text-xs">
          {data.active_editions.map(e => (
            <div key={e.edition_id} className="flex items-center gap-2 text-gray-500">
              <span className="font-mono text-gray-700">{e.edition_id}</span>
              <Badge label={e.load_status} variant={e.load_status === "ACTIVE" ? "PASS" : "WARN"} />
              <span className="text-gray-400">{e.effective_date}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CWDependencyPanel({ data }) {
  if (!data) return <p className="text-gray-400 text-sm">Loading…</p>;
  const stateEditions = data.filter(e => e.state_code !== "CW" && e.cw_edition_id);
  const cwEditions = data.filter(e => e.state_code === "CW");
  return (
    <div className="space-y-3">
      {cwEditions.length > 0 && (
        <div className="text-xs">
          <div className="text-gray-500 mb-1">CW Base Editions Loaded</div>
          {cwEditions.map(e => (
            <div key={e.edition_id} className="flex items-center gap-2 text-gray-700">
              <span className="font-mono">{e.edition_id}</span>
              <Badge label={e.load_status} variant={e.load_status === "ACTIVE" ? "PASS" : "WARN"} />
            </div>
          ))}
        </div>
      )}
      {stateEditions.length > 0 && (
        <div className="text-xs space-y-1">
          <div className="text-gray-500 mb-1">State Edition → CW Dependency</div>
          {stateEditions.map(e => (
            <div key={e.edition_id} className="flex items-center gap-2">
              <span className="font-mono text-gray-700 w-36 shrink-0">{e.edition_id}</span>
              <span className="text-gray-400">→</span>
              <span className="font-mono text-gray-500">{e.cw_edition_id}</span>
              <Badge
                label={e.cw_loaded === "ACTIVE" ? "OK" : e.cw_loaded || "MISSING"}
                variant={e.cw_loaded === "ACTIVE" ? "PASS" : "FAIL"}
              />
            </div>
          ))}
        </div>
      )}
      {stateEditions.length === 0 && cwEditions.length === 0 && (
        <p className="text-gray-400 text-sm">No editions with CW dependencies loaded yet.</p>
      )}
    </div>
  );
}

export default function Screen1_OpsDashboard() {
  const [folders, setFolders] = useState([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [freshness, setFreshness] = useState(null);
  const [cwDep, setCwDep] = useState(null);
  const [pendingAdoptions, setPendingAdoptions] = useState([]);

  useEffect(() => {
    phaseA.sampleFolders().then(setFolders).catch(() => {});
    phaseA.contentFreshness().then(setFreshness).catch(() => {});
    phaseA.cwDependency().then(setCwDep).catch(() => {});
    phaseD.ercAdoptions({ status: "pending_signoff", limit: 50 })
      .then(setPendingAdoptions).catch(() => {});
  }, []);

  async function handleRun() {
    if (!selected) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await phaseA.runPipeline(selected);
      setResult(r);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 text-gray-900">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <h1 className="text-xl font-semibold text-gray-900">ISO GL ERC 2.0 — Ops Dashboard</h1>
          <Badge label="SCREEN 1" variant="INFO" />
        </div>
        <p className="text-gray-500 text-sm">Phase A · Ingest &amp; Inventory Pipeline</p>
      </div>

      {pendingAdoptions.length > 0 && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-amber-800 font-semibold text-sm">
                {pendingAdoptions.length} ERC delivery{pendingAdoptions.length === 1 ? "" : " ies"} pending Compliance sign-off
              </div>
              <div className="text-amber-700 text-xs mt-0.5">
                Editions ingested by Phase A are invisible to the rating engine until activated. Go to Phase D → Circular Adoption to sign off.
              </div>
            </div>
            <div className="text-xs text-amber-600 font-mono">
              {pendingAdoptions.slice(0, 3).map(a => a.edition_id).join(" · ")}
              {pendingAdoptions.length > 3 && <span> · +{pendingAdoptions.length - 3} more</span>}
            </div>
          </div>
        </div>
      )}

      <Panel title="Run Pipeline" className="mb-6">
        <div className="flex items-center gap-3">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="bg-white border border-gray-300 rounded px-3 py-2 text-gray-900 text-sm flex-1 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          >
            <option value="">Select delivery folder…</option>
            {folders.map((f) => (
              <option key={f.path} value={f.path}>{f.name}</option>
            ))}
          </select>
          <button
            onClick={handleRun}
            disabled={!selected || loading}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2 rounded text-sm font-medium transition-colors"
          >
            {loading ? "Running…" : "Run A-0 → A-9"}
          </button>
        </div>
        {error && (
          <div className="mt-3 text-red-700 text-sm bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </div>
        )}
      </Panel>

      <Panel title="Mass Ingest" className="mb-6">
        <MassIngestPanel />
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <Panel title="Content Freshness — Editions &amp; ZIP">
          <ContentFreshnessPanel data={freshness} />
        </Panel>
        <Panel title="CW Dependency Tracker">
          <CWDependencyPanel data={cwDep} />
        </Panel>
      </div>

      {(result || loading) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Panel title="Pipeline Status">
            <PipelinePanel result={result} loading={loading} />
          </Panel>
          <Panel title="Edition Registry">
            <EditionPanel result={result} />
          </Panel>
          <Panel title="Validation Results — A-6">
            <ValidationPanel result={result} />
          </Panel>
          <Panel title="STC Runtime Validation — A-9">
            <STCPanel result={result} />
          </Panel>
          <Panel title="Load Progress — A-7" className="lg:col-span-2">
            <LoadPanel result={result} />
          </Panel>
        </div>
      )}
    </div>
  );
}
