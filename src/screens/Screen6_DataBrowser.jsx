import { useState, useEffect, useCallback, useMemo } from "react";
import { dataBrowser, phaseD } from "../api/client";
import { Badge } from "../components/Badge";
import { Panel } from "../components/Panel";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";

const PAGE_SIZE = 100;

// ── Generic paginated data table ──────────────────────────────────────────────
function DataTable({ columns, rows, total, page, onPage, loading }) {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return (
    <div>
      <div className="flex items-center justify-between mb-2 text-xs text-gray-500">
        <span>{total.toLocaleString()} total rows</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onPage(page - 1)}
            disabled={page === 0}
            className="px-2 py-1 rounded border border-gray-200 bg-white disabled:opacity-30 hover:bg-gray-50 text-gray-700"
          >← Prev</button>
          <span>Page {page + 1} of {totalPages}</span>
          <button
            onClick={() => onPage(page + 1)}
            disabled={page >= totalPages - 1}
            className="px-2 py-1 rounded border border-gray-200 bg-white disabled:opacity-30 hover:bg-gray-50 text-gray-700"
          >Next →</button>
        </div>
      </div>
      <div className="overflow-x-auto rounded border border-gray-200">
        <table className="w-full text-xs text-left">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {columns.map(col => (
                <th key={col.key} className="px-3 py-2 text-gray-500 font-medium whitespace-nowrap">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={columns.length} className="px-3 py-6 text-gray-400 text-center">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={columns.length} className="px-3 py-6 text-gray-400 text-center">No results</td></tr>
            ) : rows.map((row, i) => (
              <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                {columns.map(col => (
                  <td key={col.key} className={`px-3 py-1.5 font-mono whitespace-nowrap ${col.className || "text-gray-700"}`}>
                    {col.render ? col.render(row[col.key], row) : (row[col.key] ?? "—")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Filter bar ─────────────────────────────────────────────────────────────────
function FilterBar({ states, editions, state, edition, onState, onEdition }) {
  return (
    <div className="flex items-center gap-3 mb-4 flex-wrap">
      <div className="flex items-center gap-2">
        <label className="text-gray-500 text-xs">State</label>
        <select
          value={state}
          onChange={e => { onState(e.target.value); onEdition(""); }}
          className="bg-white border border-gray-300 rounded px-2 py-1 text-sm text-gray-800 focus:outline-none focus:border-blue-500"
        >
          <option value="">All States</option>
          {states.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <label className="text-gray-500 text-xs">Edition</label>
        <select
          value={edition}
          onChange={e => onEdition(e.target.value)}
          className="bg-white border border-gray-300 rounded px-2 py-1 text-sm text-gray-800 focus:outline-none focus:border-blue-500"
        >
          <option value="">All Editions</option>
          {editions
            .filter(e => !state || e.state_code === state)
            .map(e => (
              <option key={e.edition_id} value={e.edition_id}>
                {e.edition_id} ({e.load_status})
              </option>
            ))}
        </select>
      </div>
    </div>
  );
}

// ── Loss Costs tab ────────────────────────────────────────────────────────────
function LossCostTab({ state, edition }) {
  const [data, setData] = useState({ total: 0, rows: [] });
  const [page, setPage] = useState(0);
  const [tableName, setTableName] = useState("");
  const [subline, setSubline] = useState("");
  const [classCode, setClassCode] = useState("");
  const [currentOnly, setCurrentOnly] = useState(true);
  const [tableNames, setTableNames] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    dataBrowser.lossCostTableNames({ state_code: state || undefined, edition_id: edition || undefined, current_only: currentOnly })
      .then(setTableNames).catch(() => {});
  }, [state, edition, currentOnly]);

  useEffect(() => { setPage(0); }, [state, edition, tableName, subline, classCode, currentOnly]);

  useEffect(() => {
    setLoading(true);
    dataBrowser.lossCosts({
      state_code: state || undefined,
      edition_id: edition || undefined,
      table_name: tableName || undefined,
      subline: subline || undefined,
      class_code: classCode || undefined,
      current_only: currentOnly,
      page, page_size: PAGE_SIZE,
    }).then(setData).catch(() => {}).finally(() => setLoading(false));
  }, [state, edition, tableName, subline, classCode, currentOnly, page]);

  const columns = [
    { key: "state_code", label: "State", className: "text-gray-800 font-semibold w-12" },
    { key: "table_name", label: "Table", className: "text-gray-700" },
    { key: "subline", label: "Subline", className: "text-gray-700" },
    { key: "loss_cost_variant", label: "Variant", className: "text-gray-500" },
    { key: "territory_value", label: "Territory" },
    { key: "class_code", label: "Class Code", className: "text-blue-600" },
    { key: "rate_field_name", label: "Rate Field", className: "text-gray-500" },
    { key: "rate", label: "Rate", className: "text-emerald-600 text-right" },
    { key: "is_current_version", label: "Current", render: v => v ? "✓" : "—", className: "text-gray-500 text-center" },
    { key: "version", label: "Ver", className: "text-gray-400" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap text-xs">
        <select value={tableName} onChange={e => setTableName(e.target.value)}
          className="bg-white border border-gray-300 rounded px-2 py-1 text-gray-800">
          <option value="">All Tables</option>
          {tableNames.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={subline} onChange={e => setSubline(e.target.value)}
          className="bg-white border border-gray-300 rounded px-2 py-1 text-gray-800">
          <option value="">All Sublines</option>
          {["PremOps", "ProdsCompldOps", "OwnersContractors", "Liquor", "Railroad", "ProductWithdrawal"].map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <input value={classCode} onChange={e => setClassCode(e.target.value)}
          placeholder="Class code…"
          className="bg-white border border-gray-300 rounded px-2 py-1 text-gray-800 w-28" />
        <label className="flex items-center gap-1 text-gray-700 ml-2">
          <input type="checkbox" checked={currentOnly}
            onChange={e => setCurrentOnly(e.target.checked)} className="accent-blue-600" />
          Current only
        </label>
      </div>
      <DataTable columns={columns} rows={data.rows} total={data.total}
        page={page} onPage={setPage} loading={loading} />
    </div>
  );
}

// ── Factors tab ───────────────────────────────────────────────────────────────
function FactorsTab({ state, edition }) {
  const [data, setData] = useState({ total: 0, rows: [] });
  const [page, setPage] = useState(0);
  const [tableName, setTableName] = useState("");
  const [factorGroup, setFactorGroup] = useState("");
  const [currentOnly, setCurrentOnly] = useState(true);
  const [tableNames, setTableNames] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    dataBrowser.factorTableNames({ state_code: state || undefined, edition_id: edition || undefined, current_only: currentOnly })
      .then(setTableNames).catch(() => {});
  }, [state, edition, currentOnly]);

  useEffect(() => { setPage(0); }, [state, edition, tableName, factorGroup, currentOnly]);

  useEffect(() => {
    setLoading(true);
    dataBrowser.factors({
      state_code: state || undefined,
      edition_id: edition || undefined,
      table_name: tableName || undefined,
      factor_group: factorGroup || undefined,
      current_only: currentOnly,
      page, page_size: PAGE_SIZE,
    }).then(setData).catch(() => {}).finally(() => setLoading(false));
  }, [state, edition, tableName, factorGroup, currentOnly, page]);

  const columns = [
    { key: "state_code", label: "State", className: "text-gray-800 font-semibold" },
    { key: "table_name", label: "Table", className: "text-gray-700" },
    { key: "factor_group", label: "Group", className: "text-gray-500" },
    { key: "subline", label: "Subline", className: "text-gray-500" },
    { key: "ilta_value", label: "ILTA", className: "text-blue-600" },
    { key: "limit_key_1_value", label: "Limit 1", className: "text-gray-700" },
    { key: "limit_key_2_value", label: "Limit 2", className: "text-gray-700" },
    { key: "class_code", label: "Class" },
    { key: "value_col_name", label: "Col", className: "text-gray-400" },
    { key: "value", label: "Value", className: "text-emerald-600" },
    { key: "is_na", label: "N/A", render: v => v ? "N/A" : "", className: "text-amber-600" },
    { key: "version", label: "Ver", className: "text-gray-400" },
  ];

  const groups = [...new Set(tableNames.map(t => t.factor_group))].filter(Boolean);

  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap text-xs">
        <select value={factorGroup} onChange={e => { setFactorGroup(e.target.value); setTableName(""); }}
          className="bg-white border border-gray-300 rounded px-2 py-1 text-gray-800">
          <option value="">All Groups</option>
          {groups.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        <select value={tableName} onChange={e => setTableName(e.target.value)}
          className="bg-white border border-gray-300 rounded px-2 py-1 text-gray-800">
          <option value="">All Tables</option>
          {tableNames
            .filter(t => !factorGroup || t.factor_group === factorGroup)
            .map(t => <option key={t.table_name} value={t.table_name}>{t.table_name}</option>)}
        </select>
        <label className="flex items-center gap-1 text-gray-700 ml-2">
          <input type="checkbox" checked={currentOnly}
            onChange={e => setCurrentOnly(e.target.checked)} className="accent-blue-600" />
          Current only
        </label>
      </div>
      <DataTable columns={columns} rows={data.rows} total={data.total}
        page={page} onPage={setPage} loading={loading} />
    </div>
  );
}

// ── ILTA tab ──────────────────────────────────────────────────────────────────
function ILTATab({ state, edition }) {
  const [data, setData] = useState({ total: 0, rows: [] });
  const [page, setPage] = useState(0);
  const [subline, setSubline] = useState("");
  const [classCode, setClassCode] = useState("");
  const [currentOnly, setCurrentOnly] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => { setPage(0); }, [state, edition, subline, classCode, currentOnly]);

  useEffect(() => {
    setLoading(true);
    dataBrowser.ilta({
      state_code: state || undefined,
      edition_id: edition || undefined,
      subline: subline || undefined,
      class_code: classCode || undefined,
      current_only: currentOnly,
      page, page_size: PAGE_SIZE,
    }).then(setData).catch(() => {}).finally(() => setLoading(false));
  }, [state, edition, subline, classCode, currentOnly, page]);

  const columns = [
    { key: "state_code", label: "State", className: "text-gray-800 font-semibold" },
    { key: "subline", label: "Subline", className: "text-gray-700" },
    { key: "class_code", label: "Class Code", className: "text-blue-600" },
    { key: "ilta_key_col_name", label: "ILTA Key Col", className: "text-gray-500" },
    { key: "assignment_raw", label: "Raw", className: "text-gray-700" },
    { key: "assignment_typed", label: "Typed", className: "text-emerald-600 font-semibold" },
    { key: "assignment_type", label: "Type", className: "text-gray-400" },
    { key: "is_na", label: "N/A", render: v => v ? "N/A" : "", className: "text-amber-600" },
    { key: "ilf_table_target", label: "ILF Target", className: "text-gray-500" },
    { key: "version", label: "Ver", className: "text-gray-400" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex gap-2 text-xs">
        <select value={subline} onChange={e => setSubline(e.target.value)}
          className="bg-white border border-gray-300 rounded px-2 py-1 text-gray-800">
          <option value="">All Sublines</option>
          <option value="PremOps">PremOps</option>
          <option value="ProdsCompldOps">ProdsCompldOps</option>
        </select>
        <input value={classCode} onChange={e => setClassCode(e.target.value)}
          placeholder="Class code…"
          className="bg-white border border-gray-300 rounded px-2 py-1 text-gray-800 w-28" />
        <label className="flex items-center gap-1 text-gray-700 ml-2">
          <input type="checkbox" checked={currentOnly}
            onChange={e => setCurrentOnly(e.target.checked)} className="accent-blue-600" />
          Current only
        </label>
      </div>
      <DataTable columns={columns} rows={data.rows} total={data.total}
        page={page} onPage={setPage} loading={loading} />
    </div>
  );
}

// ── Territory tab ─────────────────────────────────────────────────────────────
function TerritoryTab({ state, edition }) {
  const [data, setData] = useState({ total: 0, rows: [] });
  const [page, setPage] = useState(0);
  const [zip, setZip] = useState("");
  const [terrVal, setTerrVal] = useState("");
  const [currentOnly, setCurrentOnly] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => { setPage(0); }, [state, edition, zip, terrVal, currentOnly]);

  useEffect(() => {
    setLoading(true);
    dataBrowser.territory({
      state_code: state || undefined,
      edition_id: edition || undefined,
      zip_code: zip || undefined,
      territory_value: terrVal || undefined,
      current_only: currentOnly,
      page, page_size: PAGE_SIZE,
    }).then(setData).catch(() => {}).finally(() => setLoading(false));
  }, [state, edition, zip, terrVal, currentOnly, page]);

  const columns = [
    { key: "state_code", label: "State", className: "text-gray-800 font-semibold" },
    { key: "zip_code", label: "ZIP Code", className: "text-blue-600 font-mono" },
    { key: "territory_display", label: "Display", className: "text-gray-700" },
    { key: "territory_data_value", label: "Data Value", className: "text-emerald-600 font-semibold" },
    { key: "effective_date", label: "Effective", className: "text-gray-400" },
    { key: "version", label: "Ver", className: "text-gray-400" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex gap-2 text-xs">
        <input value={zip} onChange={e => setZip(e.target.value)}
          placeholder="ZIP code…"
          className="bg-white border border-gray-300 rounded px-2 py-1 text-gray-800 w-28" />
        <input value={terrVal} onChange={e => setTerrVal(e.target.value)}
          placeholder="Territory value…"
          className="bg-white border border-gray-300 rounded px-2 py-1 text-gray-800 w-32" />
        <label className="flex items-center gap-1 text-gray-700 ml-2">
          <input type="checkbox" checked={currentOnly}
            onChange={e => setCurrentOnly(e.target.checked)} className="accent-blue-600" />
          Current only
        </label>
      </div>
      <DataTable columns={columns} rows={data.rows} total={data.total}
        page={page} onPage={setPage} loading={loading} />
    </div>
  );
}

// ── Forms tab ─────────────────────────────────────────────────────────────────
function FormsTab({ state, edition }) {
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [formTab, setFormTab] = useState("forms");
  const [selectedModel, setSelectedModel] = useState(null);
  const [formSearch, setFormSearch] = useState("");
  const [formsPage, setFormsPage] = useState(0);

  useEffect(() => {
    setLoading(true);
    dataBrowser.forms({
      state_code: state || undefined,
      edition_id: edition || undefined,
    }).then(ms => {
      setModels(ms);
      setSelectedModel(ms[0] || null);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [state, edition]);

  if (loading) return <p className="text-gray-500 text-sm animate-pulse">Loading form model…</p>;
  if (!models.length) return <p className="text-gray-400 text-sm">No form models found for these filters.</p>;

  const model = selectedModel;

  const allForms = [
    ...(model?.form_model?.active_forms || []),
    ...(model?.form_model?.deleted_forms || []),
  ].filter(f => {
    const t = (f.type || "").toLowerCase();
    return t === "form" || t === "coverage";
  });

  const needle = formSearch.trim().toLowerCase();
  const filteredForms = needle
    ? allForms.filter(f =>
        [f.name, f.number, f.table_name, f.type, f.attachment_type, f.condition]
          .some(v => v && String(v).toLowerCase().includes(needle))
      )
    : allForms;

  const FORMS_PAGE_SIZE = 20;
  const formsTotalPages = Math.max(1, Math.ceil(filteredForms.length / FORMS_PAGE_SIZE));
  const formsPageClamped = Math.min(formsPage, formsTotalPages - 1);
  const pagedForms = filteredForms.slice(formsPageClamped * FORMS_PAGE_SIZE, (formsPageClamped + 1) * FORMS_PAGE_SIZE);

  return (
    <div className="space-y-4">
      {models.length > 1 && (
        <div className="flex gap-2 text-xs flex-wrap">
          {models.map(m => (
            <button key={m.delivery_id}
              onClick={() => setSelectedModel(m)}
              className={`px-3 py-1 rounded border ${selectedModel?.delivery_id === m.delivery_id
                ? "bg-blue-50 border-blue-500 text-blue-700"
                : "border-gray-200 text-gray-500 hover:text-gray-800"}`}>
              {m.delivery_id}
            </button>
          ))}
        </div>
      )}

      {model && (
        <>
          {/* Algorithm summary */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-gray-50 border border-gray-100 rounded p-3">
              <div className="text-gray-500 mb-1">CW Project Reference</div>
              <div className="font-mono text-gray-800">{model.algorithm_model?.cw_project_reference || "—"}</div>
            </div>
            <div className="bg-gray-50 border border-gray-100 rounded p-3">
              <div className="text-gray-500 mb-1">Orchestration Steps</div>
              <div className="font-mono text-gray-800 text-xs">
                {model.algorithm_model?.overall_rating?.orchestration_steps?.join(" → ") || "—"}
              </div>
            </div>
          </div>

          {/* Sub-tab nav */}
          <div className="flex gap-1 text-xs border-b border-gray-200 pb-0">
            {[
              ["forms", `Forms (${allForms.length})`],
              ["pages", `Form Pages (${(model.form_model?.active_forms?.length || 0) + (model.form_model?.deleted_forms?.length || 0)})`],
              ["fields", `Form Fields (${model.form_fields?.length || 0})`],
              ["inputs", `Ratebook Inputs (${model.rating_required_inputs?.length || 0})`],
              ["deleted", `Deleted Forms (${model.form_model?.deleted_forms?.length || 0})`],
              ["new", `New Forms (${model.form_model?.new_forms?.length || 0})`],
            ].map(([id, label]) => (
              <button key={id} onClick={() => setFormTab(id)}
                className={`px-3 py-1.5 rounded-t border-b-2 transition-colors ${formTab === id
                  ? "border-blue-500 text-blue-700 bg-blue-50"
                  : "border-transparent text-gray-400 hover:text-gray-700"}`}>
                {label}
              </button>
            ))}
          </div>

          {formTab === "forms" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-400">type: form · coverage</span>
                <div className="flex items-center gap-2">
                  <input
                    value={formSearch}
                    onChange={e => { setFormSearch(e.target.value); setFormsPage(0); }}
                    placeholder="Search name, number, table…"
                    className="bg-white border border-gray-300 rounded px-2.5 py-1 text-xs text-gray-800 w-52 focus:outline-none focus:border-blue-400"
                  />
                  {formsTotalPages > 1 && (
                    <div className="flex items-center gap-1 text-[10px] text-gray-500">
                      <button
                        onClick={() => setFormsPage(p => Math.max(0, p - 1))}
                        disabled={formsPageClamped === 0}
                        className="px-1.5 py-0.5 rounded border border-gray-200 bg-white disabled:opacity-30 hover:bg-gray-50"
                      >←</button>
                      <span className="font-mono px-1">{formsPageClamped + 1} / {formsTotalPages}</span>
                      <button
                        onClick={() => setFormsPage(p => Math.min(formsTotalPages - 1, p + 1))}
                        disabled={formsPageClamped >= formsTotalPages - 1}
                        className="px-1.5 py-0.5 rounded border border-gray-200 bg-white disabled:opacity-30 hover:bg-gray-50"
                      >→</button>
                    </div>
                  )}
                </div>
              </div>
              <div className="overflow-x-auto rounded border border-gray-200">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      {["Status", "Number", "Name", "Type", "Attachment", "Condition"].map(h => (
                        <th key={h} className="px-3 py-2 text-gray-500 text-left font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredForms.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-6 text-gray-400 text-center">
                          {needle ? "No forms match that search." : "No forms found."}
                        </td>
                      </tr>
                    ) : pagedForms.map((f, i) => (
                      <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-3 py-1.5">
                          <Badge
                            label={f.status === "N" ? "NEW" : f.status === "D" ? "DEL" : "ACT"}
                            variant={f.status === "N" ? "WARN" : f.status === "D" ? "FAIL" : "PASS"}
                          />
                        </td>
                        <td className="px-3 py-1.5 font-mono text-blue-600 whitespace-nowrap">{f.number || "—"}</td>
                        <td className="px-3 py-1.5 text-gray-800">{f.name}</td>
                        <td className="px-3 py-1.5">
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                            (f.type || "").toLowerCase() === "form"
                              ? "bg-blue-50 text-blue-700"
                              : "bg-purple-50 text-purple-700"
                          }`}>{f.type}</span>
                        </td>
                        <td className="px-3 py-1.5 text-gray-500">{f.attachment_type || "—"}</td>
                        <td className="px-3 py-1.5 text-gray-400 max-w-xs truncate" title={f.condition}>{f.condition || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {formTab === "pages" && (
            <div className="overflow-x-auto rounded border border-gray-200">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {["Status", "Table Name", "Name", "Number", "Type", "Attachment Type", "Condition", "Min", "Max"].map(h => (
                      <th key={h} className="px-3 py-2 text-gray-500 text-left font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(model.form_model?.active_forms || []).map((f, i) => (
                    <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-1.5">
                        <Badge
                          label={f.status === "N" ? "NEW" : f.status === "D" ? "DEL" : "ACT"}
                          variant={f.status === "N" ? "WARN" : f.status === "D" ? "FAIL" : "PASS"}
                        />
                      </td>
                      <td className="px-3 py-1.5 font-mono text-gray-700">{f.table_name}</td>
                      <td className="px-3 py-1.5 text-gray-800">{f.name}</td>
                      <td className="px-3 py-1.5 font-mono text-blue-600">{f.number || "—"}</td>
                      <td className="px-3 py-1.5 text-gray-500">{f.type}</td>
                      <td className="px-3 py-1.5 text-gray-500">{f.attachment_type}</td>
                      <td className="px-3 py-1.5 text-gray-400 max-w-xs truncate" title={f.condition}>{f.condition || "—"}</td>
                      <td className="px-3 py-1.5 text-gray-400">{f.min_occurs}</td>
                      <td className="px-3 py-1.5 text-gray-400">{f.max_occurs}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {formTab === "fields" && (
            <div className="overflow-x-auto rounded border border-gray-200">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {["Table", "Column", "Label", "Type", "Q.Req", "P.Req", "Default", "Domain Table", "Condition"].map(h => (
                      <th key={h} className="px-3 py-2 text-gray-500 text-left font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(model.form_fields || []).map((f, i) => (
                    <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-1.5 font-mono text-gray-500">{f.table_name}</td>
                      <td className="px-3 py-1.5 font-mono text-blue-600">{f.column_name}</td>
                      <td className="px-3 py-1.5 text-gray-800">{f.label}</td>
                      <td className="px-3 py-1.5 text-gray-500">{f.type}</td>
                      <td className="px-3 py-1.5 text-center">{f.quote_required === "Yes" ? <span className="text-emerald-600">✓</span> : "—"}</td>
                      <td className="px-3 py-1.5 text-center">{f.policy_required === "Yes" ? <span className="text-emerald-600">✓</span> : "—"}</td>
                      <td className="px-3 py-1.5 text-gray-400">{f.default || "—"}</td>
                      <td className="px-3 py-1.5 text-gray-500">{f.domain_table_name || "—"}</td>
                      <td className="px-3 py-1.5 text-gray-400 max-w-xs truncate" title={f.condition}>{f.condition || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {formTab === "inputs" && (
            <div className="overflow-x-auto rounded border border-gray-200">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {["Table", "Column", "Rating Required Condition", "Status"].map(h => (
                      <th key={h} className="px-3 py-2 text-gray-500 text-left font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(model.rating_required_inputs || []).map((r, i) => (
                    <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-1.5 font-mono text-gray-500">{r.table_name}</td>
                      <td className="px-3 py-1.5 font-mono text-blue-600">{r.column_name}</td>
                      <td className="px-3 py-1.5 text-gray-700">{r.rating_required_condition || "—"}</td>
                      <td className="px-3 py-1.5"><Badge label={r.status || "A"} variant={r.status === "D" ? "FAIL" : "PASS"} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {formTab === "deleted" && (
            <div className="space-y-1">
              {(model.form_model?.deleted_forms || []).length === 0
                ? <p className="text-gray-400 text-xs">No deleted forms.</p>
                : (model.form_model.deleted_forms.map((f, i) => (
                    <div key={i} className="bg-red-50 border border-red-200 rounded px-3 py-2 text-xs">
                      <span className="font-mono text-red-700">{f.table_name}</span>
                      <span className="text-gray-500 ml-2">{f.name}</span>
                      {f.number && <span className="font-mono text-gray-400 ml-2">{f.number}</span>}
                    </div>
                  )))}
            </div>
          )}

          {formTab === "new" && (
            <div className="space-y-1">
              {(model.form_model?.new_forms || []).length === 0
                ? <p className="text-gray-400 text-xs">No new forms.</p>
                : (model.form_model.new_forms.map((f, i) => (
                    <div key={i} className="bg-amber-50 border border-amber-200 rounded px-3 py-2 text-xs">
                      <span className="font-mono text-amber-700">{f.table_name}</span>
                      <span className="text-gray-500 ml-2">{f.name}</span>
                      {f.number && <span className="font-mono text-gray-400 ml-2">{f.number}</span>}
                      <span className="ml-2 text-amber-600">— confirm carrier template</span>
                    </div>
                  )))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Editions tab ──────────────────────────────────────────────────────────────
function EditionsTab({ state, edition }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    dataBrowser.editions(state || undefined)
      .then(data => setRows(edition ? data.filter(r => r.edition_id === edition) : data))
      .catch(() => {}).finally(() => setLoading(false));
  }, [state, edition]);

  const columns = [
    { key: "edition_id", label: "Edition ID", className: "text-gray-800 font-semibold" },
    { key: "state_code", label: "State", className: "text-gray-700" },
    { key: "effective_date", label: "Effective" },
    { key: "version", label: "Ver" },
    { key: "cw_project_reference", label: "CW Project", className: "text-gray-500" },
    { key: "load_status", label: "Status", render: v => <Badge label={v} variant={v === "ACTIVE" ? "PASS" : "WARN"} /> },
    { key: "is_current_version_for_date", label: "Current", render: v => v ? "✓" : "—", className: "text-center" },
    { key: "load_timestamp", label: "Loaded At", className: "text-gray-400" },
  ];

  if (loading) return <p className="text-gray-500 text-sm animate-pulse">Loading…</p>;
  return (
    <div className="overflow-x-auto rounded border border-gray-200">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            {columns.map(col => (
              <th key={col.key} className="px-3 py-2 text-gray-500 text-left font-medium whitespace-nowrap">{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0
            ? <tr><td colSpan={columns.length} className="px-3 py-6 text-gray-400 text-center">No results</td></tr>
            : rows.map((row, i) => (
              <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                {columns.map(col => (
                  <td key={col.key} className={`px-3 py-1.5 font-mono ${col.className || "text-gray-700"}`}>
                    {col.render ? col.render(row[col.key], row) : (row[col.key] ?? "—")}
                  </td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Quotes tab ────────────────────────────────────────────────────────────────
function QuotesTab({ state, edition }) {
  const [data, setData] = useState({ total: 0, rows: [] });
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => { setPage(0); }, [state, edition]);

  useEffect(() => {
    setLoading(true);
    dataBrowser.quotes({
      state_code: state || undefined,
      edition_id: edition || undefined,
      page, page_size: PAGE_SIZE,
    }).then(setData).catch(() => {}).finally(() => setLoading(false));
  }, [state, edition, page]);

  const columns = [
    { key: "quote_id", label: "Quote ID", className: "text-blue-600" },
    { key: "carrier_id", label: "Carrier", className: "text-gray-700" },
    { key: "state_code", label: "State" },
    { key: "edition_id", label: "Edition", className: "text-gray-500" },
    { key: "policy_effective_date", label: "Eff. Date" },
    { key: "status", label: "Status", render: v => <Badge label={v} variant={v === "BOUND" ? "PASS" : v === "QUOTED" ? "INFO" : "WARN"} /> },
    { key: "created_at", label: "Created", className: "text-gray-400" },
  ];

  return <DataTable columns={columns} rows={data.rows} total={data.total}
    page={page} onPage={setPage} loading={loading} />;
}

// ── Policies tab ──────────────────────────────────────────────────────────────
function PoliciesTab({ state, edition }) {
  const [data, setData] = useState({ total: 0, rows: [] });
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => { setPage(0); }, [state, edition]);

  useEffect(() => {
    setLoading(true);
    dataBrowser.policies({
      state_code: state || undefined,
      edition_id: edition || undefined,
      page, page_size: PAGE_SIZE,
    }).then(setData).catch(() => {}).finally(() => setLoading(false));
  }, [state, edition, page]);

  const columns = [
    { key: "policy_id", label: "Policy ID", className: "text-emerald-600" },
    { key: "quote_id", label: "Quote ID", className: "text-blue-600" },
    { key: "carrier_id", label: "Carrier" },
    { key: "state_code", label: "State" },
    { key: "bound_edition_id", label: "Edition", className: "text-gray-500" },
    { key: "bound_premium", label: "Premium", render: v => v != null ? `$${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "—", className: "text-emerald-600" },
    { key: "policy_effective_date", label: "Eff. Date" },
    { key: "policy_expiration_date", label: "Exp. Date" },
    { key: "status", label: "Status", render: v => <Badge label={v} variant="PASS" /> },
    { key: "bound_at", label: "Bound At", className: "text-gray-400" },
  ];

  return <DataTable columns={columns} rows={data.rows} total={data.total}
    page={page} onPage={setPage} loading={loading} />;
}

// ── Rating Algorithms tab ─────────────────────────────────────────────────────
function RatingAlgorithmsTab({ state, edition }) {
  const [presence, setPresence] = useState({});
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState({ premops: true, prods: true });

  useEffect(() => {
    setLoading(true);
    dataBrowser.ratingAlgorithmTablePresence({
      state_code: state || undefined,
      edition_id: edition || undefined,
    })
      .then(setPresence)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [state, edition]);

  function toggleExpanded(id) {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  }

  const TYPE_STYLES = {
    lookup:      { border: "border-blue-300",    bg: "bg-blue-50",    label: "text-blue-700",    badge: "bg-blue-100 text-blue-700" },
    calculation: { border: "border-purple-300",  bg: "bg-purple-50",  label: "text-purple-700",  badge: "bg-purple-100 text-purple-700" },
    deviation:   { border: "border-amber-300",   bg: "bg-amber-50",   label: "text-amber-700",   badge: "bg-amber-100 text-amber-700" },
    conditional: { border: "border-gray-300",    bg: "bg-gray-50",    label: "text-gray-600",    badge: "bg-gray-100 text-gray-600" },
    gate:        { border: "border-red-300",     bg: "bg-red-50",     label: "text-red-700",     badge: "bg-red-100 text-red-700" },
    output:      { border: "border-emerald-300", bg: "bg-emerald-50", label: "text-emerald-700", badge: "bg-emerald-100 text-emerald-700" },
  };

  const ALGORITHMS = [
    {
      id: "premops", label: "Premises & Operations", status: "implemented",
      description: "Bureau loss cost × LCM → ILTA → ILF → ELP → deductible credit → med pay → package mod",
      steps: [
        { id: "PO-1", type: "lookup", name: "Bureau Loss Cost", table: "PremOpsLossCost", db_table: "loss_cost_records",
          keys: [{ col: "StateCode", description: "2-letter state" }, { col: "PremOpsTerr", description: "Territory code" }, { col: "ClassCodeCGLProds", description: "5-digit GL class code" }],
          result_col: "Rate", formula: null, note: null,
          clm_rules: ["Rule 22"] },
        { id: "PO-2", type: "deviation", name: "Apply LCM (Loss Cost Multiplier)", table: null, db_table: null, keys: [],
          result_col: "rated_lc", formula: "rated_lc = bureau_lc × lcm",
          note: "lcm from active carrier deviation; defaults to 1.0 (bureau rates) if no deviation active",
          clm_rules: ["Carrier Dev"] },
        { id: "PO-3", type: "lookup", name: "ILTA Assignment", table: "PremOpsIncrdLimitTableAssignment", db_table: "factor_records",
          keys: [{ col: "StateCode", description: "State" }, { col: "ClassCodeCGLProds", description: "Class code" }],
          result_col: "IncreasedLimitsTableAssignmentPremOpsFinal", formula: null,
          note: "Result is integer 1–6. Used as key into ILFPremOps.",
          clm_rules: ["Rule 40.B.2.a"] },
        { id: "PO-4", type: "lookup", name: "ILF Lookup", table: "ILFPremOps", db_table: "factor_records",
          keys: [{ col: "StateCode", description: "State" }, { col: "IncreasedLimitsTableAssignmentPremOpsFinal", description: "ILTA integer from PO-3" }, { col: "EachOccurrenceLimit", description: "e.g. \"1,000,000 CSL\" — preserve CSL suffix" }, { col: "GeneralAggregateLimit", description: "e.g. \"2,000,000 CSL\"" }],
          result_col: "Factor", formula: null, note: "Defaults to 1.0 if ILTA is N/A or lookup fails",
          clm_rules: ["Rule 40.A.1"] },
        { id: "PO-5", type: "lookup", name: "ELP Factor", table: "PremOpsELP", db_table: "factor_records",
          keys: [{ col: "StateCode", description: "State" }, { col: "ClassCodeCGLProds", description: "Class code" }],
          result_col: "Rate", formula: null, note: "Rate of 0 is valid — class has no ELP surcharge",
          clm_rules: ["Rule 36"] },
        { id: "PO-7", type: "calculation", name: "Base Premium", table: null, db_table: null, keys: [],
          result_col: "base_premium", formula: "base_premium = rated_lc × (exposure ÷ exposure_unit) × ILF",
          note: "exposure_unit: Payroll=100, GrossSales/Area=1000, Units/PerCapita=1",
          clm_rules: ["Rule 22"] },
        { id: "PO-DED", type: "conditional", name: "Deductible Credit", table: "DedFactorPremOpsCSL", db_table: "factor_records",
          keys: [{ col: "StateCode", description: "CW (countrywide)" }, { col: "IncreasedLimitsTableAssignmentPremOpsFinal", description: "ILTA integer" }, { col: "PremOpsDed", description: "Deductible amount string" }],
          result_col: "Factor", formula: "ded_credit = base_premium × ded_factor  →  adjusted_base = base_premium − ded_credit",
          note: "Skipped if deductible = 'No Deductible'",
          clm_rules: ["Rule 42.A.4.a"] },
        { id: "PO-8", type: "conditional", name: "ELP Premium", table: null, db_table: null, keys: [],
          result_col: "elp_premium", formula: "elp_premium = elp_rate × (exposure ÷ exposure_unit)",
          note: "Skipped if elp_rate = 0",
          clm_rules: ["Rule 36"] },
        { id: "PO-MP", type: "conditional", name: "Medical Payments", table: "MedPayFactor", db_table: "factor_records",
          keys: [{ col: "StateCode", description: "CW" }, { col: "ClassCode", description: "Class code" }],
          result_col: "Factor", formula: "med_pay_premium = adjusted_base × (factor − 1.0)",
          note: "Only when MedPayCoverage = 'Yes'",
          clm_rules: ["Rule 45"] },
        { id: "MOD-PKG", type: "deviation", name: "Package Modifier", table: null, db_table: null, keys: [],
          result_col: "final_premium", formula: "final_premium = (adjusted_base + elp_premium + med_pay_premium) × package_mod_factor",
          note: "package_mod_factor from input; defaults to 1.0",
          clm_rules: ["Carrier Dev"] },
      ],
    },
    {
      id: "prods", label: "Products & Completed Operations", status: "implemented",
      description: "Bureau loss cost × LCM → ILTA (letter) → ILF → ELP → deductible credit → package mod",
      steps: [
        { id: "PR-1", type: "lookup", name: "Bureau Loss Cost", table: "ProdsCompldOpsLossCost", db_table: "loss_cost_records",
          keys: [{ col: "StateCode", description: "State" }, { col: "ProdsCompldOpsTerr", description: "Territory code — '999' = countrywide" }, { col: "ClassCodeCGLProds", description: "Class code" }],
          result_col: "Rate", formula: null, note: null,
          clm_rules: ["Rule 22"] },
        { id: "PR-2", type: "deviation", name: "Apply LCM", table: null, db_table: null, keys: [],
          result_col: "rated_lc", formula: "rated_lc = bureau_lc × lcm",
          note: "lcm keyed to ProdsCompldOps subline in deviation map",
          clm_rules: ["Carrier Dev"] },
        { id: "PR-3", type: "lookup", name: "ILTA Assignment", table: "IncreasedLimitsTableAssignmentProdsCompldOps", db_table: "factor_records",
          keys: [{ col: "StateCode", description: "State" }, { col: "ClassCodeCGLProds", description: "Class code" }],
          result_col: "IncreasedLimitsTableAssignmentProdsCompldOpsFinal", formula: null,
          note: "Result is letter A–F OR 'N/A'. N/A = no ILF available — basic limits only (ILF forced to 1.0)",
          clm_rules: ["Rule 40.B"] },
        { id: "PR-4", type: "lookup", name: "ILF Lookup", table: "ILFProds", db_table: "factor_records",
          keys: [{ col: "StateCode", description: "State" }, { col: "IncreasedLimitsTableAssignmentProdsCompldOpsFinal", description: "Letter from PR-3" }, { col: "EachOccurrenceLimit", description: "Limit string with CSL suffix" }, { col: "GeneralAggregateLimit", description: "Note: GeneralAggregateLimit, not ProdsCompldOpsAggregateLimit" }],
          result_col: "Factor", formula: null, note: "Skipped entirely when ILTA = N/A (ILF = 1.0)",
          clm_rules: ["Rule 40.B.1"] },
        { id: "PR-5", type: "lookup", name: "ELP Factor", table: "ProdsCompldOpsELPFactor", db_table: "factor_records",
          keys: [{ col: "StateCode", description: "State" }, { col: "ClassCodeCGLProds", description: "Class code" }],
          result_col: "Rate", formula: null, note: null,
          clm_rules: ["Rule 36"] },
        { id: "PR-6", type: "calculation", name: "Base Premium", table: null, db_table: null, keys: [],
          result_col: "base_premium", formula: "base_premium = rated_lc × (exposure ÷ exposure_unit) × ILF", note: null,
          clm_rules: ["Rule 22"] },
        { id: "PR-DED", type: "conditional", name: "Deductible Credit", table: "DedFactorProdsCSL", db_table: "factor_records",
          keys: [{ col: "StateCode", description: "CW" }, { col: "IncreasedLimitsTableAssignmentProdsCompldOpsFinal", description: "Letter" }, { col: "ProdsCompldOpsDed", description: "Deductible string" }],
          result_col: "Factor", formula: "ded_credit = base_premium × ded_factor  →  adjusted_base = base_premium − ded_credit",
          note: "Skipped if ILTA = N/A or deductible = 'No Deductible'",
          clm_rules: ["Rule 42.A.4.b"] },
        { id: "MOD-PKG", type: "deviation", name: "Package Modifier", table: null, db_table: null, keys: [],
          result_col: "final_premium", formula: "final_premium = adjusted_base × package_mod_factor", note: null,
          clm_rules: ["Carrier Dev"] },
      ],
    },
    {
      id: "owners-contractors", label: "Owners & Contractors", status: "spec-only",
      description: "Loss cost keyed on ClassCodeOwnersContrctrs (no territory) → LCM → ILF (no ILTA) → ELP → refer-to-company check",
      steps: [
        { id: "OC-1", type: "lookup", name: "Bureau Loss Cost", table: "OwnersContractorsLossCost", db_table: "loss_cost_records",
          keys: [{ col: "StateCode", description: "State" }, { col: "ClassCodeOwnersContrctrs", description: "O&C-specific class code column (not ClassCodeCGLProds)" }],
          result_col: "Factor", formula: null, note: "No territory key — O&C loss costs are territory-agnostic",
          clm_rules: ["Rule 22", "Rule 46"] },
        { id: "OC-RTC", type: "gate", name: "Refer-to-Company Threshold Check", table: "OwnersContractorsLossCostOverOneHundred", db_table: "loss_cost_records",
          keys: [{ col: "StateCode", description: "State" }, { col: "ClassCodeOwnersContrctrs", description: "Class code" }],
          result_col: "refer_to_company", formula: null,
          note: "If class found in OverOneHundred or OverOneMillion table → REFER TO UNDERWRITING. Rating stops.",
          clm_rules: ["Rule 46"] },
        { id: "OC-2", type: "deviation", name: "Apply LCM", table: null, db_table: null, keys: [],
          result_col: "rated_lc", formula: "rated_lc = bureau_lc × lcm", note: null,
          clm_rules: ["Carrier Dev"] },
        { id: "OC-3", type: "lookup", name: "ILF Lookup", table: "ILFOwnersContractors", db_table: "factor_records",
          keys: [{ col: "StateCode", description: "State" }, { col: "EachOccurrenceLimitOwnersContractors", description: "Limit string — no CSL suffix (e.g. '25,000')" }, { col: "AggregateLimitOwnersContractors", description: "Aggregate limit string" }],
          result_col: "Factor", formula: null, note: "No ILTA key — ILF keyed on limits only for O&C",
          clm_rules: ["Rule 46"] },
        { id: "OC-4", type: "lookup", name: "ELP Factor", table: "OwnersContractorsELP", db_table: "factor_records",
          keys: [{ col: "StateCode", description: "State" }, { col: "ClassCodeOwnersContrctrs", description: "Class code" }],
          result_col: "Rate", formula: null, note: null,
          clm_rules: ["Rule 46"] },
        { id: "OC-5", type: "calculation", name: "Base Premium", table: null, db_table: null, keys: [],
          result_col: "base_premium", formula: "base_premium = rated_lc × exposure × ILF", note: null,
          clm_rules: ["Rule 22", "Rule 46"] },
      ],
    },
    {
      id: "liquor", label: "Liquor Liability", status: "spec-only",
      description: "Loss cost → ILF (EachCommonCauseLimit, not EachOccurrenceLimit) → ELP → Grade factor → premium",
      steps: [
        { id: "LQ-1", type: "lookup", name: "Bureau Loss Cost", table: "LiquorLossCost", db_table: "loss_cost_records",
          keys: [{ col: "StateCode", description: "State" }, { col: "ClassCodeLiquor", description: "Liquor-specific class code column" }],
          result_col: "Rate", formula: null, note: null,
          clm_rules: ["Rule 22", "Rule 47"] },
        { id: "LQ-2", type: "lookup", name: "ILF Lookup", table: "ILFLiquor", db_table: "factor_records",
          keys: [{ col: "StateCode", description: "State" }, { col: "EachCommonCauseLimit", description: "CRITICAL: column is EachCommonCauseLimit, NOT EachOccurrenceLimit" }, { col: "AggregateLimitLiquor", description: "Aggregate limit" }],
          result_col: "Factor", formula: null, note: "No ILTA. Limit column name differs from all other ILF tables.",
          clm_rules: ["Rule 47"] },
        { id: "LQ-3", type: "lookup", name: "ELP Factor", table: "LiquorELP", db_table: "factor_records",
          keys: [{ col: "StateCode", description: "State" }, { col: "ClassCodeLiquor", description: "Liquor class code" }],
          result_col: "Rate", formula: null, note: null,
          clm_rules: ["Rule 47"] },
        { id: "LQ-4", type: "lookup", name: "Grade Factor", table: "LiquorLiabGrade", db_table: "factor_records",
          keys: [{ col: "StateCode", description: "State" }, { col: "ClassCodeLiquor", description: "Liquor class code" }],
          result_col: "Grade", formula: null,
          note: "Grade = integer 0–5. Applied as a multiplicative tier factor in premium calculation.",
          clm_rules: ["Rule 47"] },
        { id: "LQ-5", type: "calculation", name: "Base Premium", table: null, db_table: null, keys: [],
          result_col: "base_premium", formula: "base_premium = rated_lc × exposure × ILF × grade_factor", note: null,
          clm_rules: ["Rule 22", "Rule 47"] },
      ],
    },
    {
      id: "railroad", label: "Railroad Protective", status: "spec-only",
      description: "Loss cost → ILF → 3-key ELP (StateCode + ClassCode + NumPassgrFreightTrains)",
      steps: [
        { id: "RR-1", type: "lookup", name: "Bureau Loss Cost", table: "RailroadLossCost", db_table: "loss_cost_records",
          keys: [{ col: "StateCode", description: "State" }, { col: "ClassCode", description: "Railroad class code" }],
          result_col: "Rate", formula: null, note: null,
          clm_rules: ["Rule 22", "Rule 49"] },
        { id: "RR-2", type: "lookup", name: "ILF Lookup", table: "ILFRailroad", db_table: "factor_records",
          keys: [{ col: "StateCode", description: "State — verify columns from Def XML" }],
          result_col: "Factor", formula: null, note: "Exact columns require Def XML inspection — Railroad ILF schema varies",
          clm_rules: ["Rule 49"] },
        { id: "RR-3", type: "lookup", name: "Base ELP (3-key lookup)", table: "BaseELPRR", db_table: "factor_records",
          keys: [{ col: "StateCode", description: "State" }, { col: "ClassCode", description: "Railroad class code" }, { col: "NumPassgrFreightTrains", description: "Number of passenger/freight trains — third key, unique to this table" }],
          result_col: "Rate", formula: null, note: "Only table in the entire GL schema with 3 lookup keys",
          clm_rules: ["Rule 49"] },
        { id: "RR-4", type: "calculation", name: "Base Premium", table: null, db_table: null, keys: [],
          result_col: "base_premium", formula: "base_premium = rated_lc × exposure × ILF", note: null,
          clm_rules: ["Rule 22", "Rule 49"] },
      ],
    },
    {
      id: "product-withdrawal", label: "Product Withdrawal", status: "spec-only",
      description: "Shares Prods ILTA (letter) → ProductWithdrawal factor (keyed on ILTA + ProdWithdrawlAggregateLimit)",
      steps: [
        { id: "PW-1", type: "lookup", name: "ILTA Assignment (shared with Prods)", table: "IncreasedLimitsTableAssignmentProdsCompldOps", db_table: "factor_records",
          keys: [{ col: "StateCode", description: "State" }, { col: "ClassCodeCGLProds", description: "Class code" }],
          result_col: "IncreasedLimitsTableAssignmentProdsCompldOpsFinal", formula: null,
          note: "Shares the Prods ILTA letter (A–F). N/A means ProductWithdrawal is also unavailable.",
          clm_rules: ["Rule 40.B"] },
        { id: "PW-2", type: "lookup", name: "Product Withdrawal Factor", table: "ProductWithdrawalExpensesAndLiabilityIncrdLimitFactor", db_table: "factor_records",
          keys: [{ col: "StateCode", description: "State" }, { col: "IncreasedLimitsTableAssignmentProdsCompldOpsFinal", description: "Letter from PW-1" }, { col: "ProdWithdrawlAggregateLimit", description: "Note: 'Withdrawl' spelling in actual ERC column — do not correct" }],
          result_col: "Factor", formula: null,
          note: "Column name 'ProdWithdrawlAggregateLimit' preserves the original ERC typo intentionally",
          clm_rules: ["Rule 44"] },
        { id: "PW-3", type: "calculation", name: "Product Withdrawal Premium", table: null, db_table: null, keys: [],
          result_col: "pw_premium", formula: "pw_premium = base_prods_premium × pw_factor", note: null,
          clm_rules: ["Rule 44"] },
      ],
    },
    {
      id: "size-of-risk", label: "Size-of-Risk Adjustment", status: "spec-only",
      description: "Eligibility check via HomogeneityIndex → SOR loss cost alternative path (applies to PremOps and Prods)",
      steps: [
        { id: "SOR-1", type: "lookup", name: "Homogeneity Index (PremOps)", table: "PremOpsHomogeneityIndex", db_table: "factor_records",
          keys: [{ col: "StateCode", description: "State" }, { col: "ClassCodeCGLProds", description: "Class code" }],
          result_col: "HomogeneityIndex", formula: null,
          note: "'N/A' = class ineligible for SOR; skip SOR path entirely",
          clm_rules: ["Rule 52.A.1"] },
        { id: "SOR-2", type: "gate", name: "SOR Eligibility Gate", table: null, db_table: null, keys: [],
          result_col: null, formula: null,
          note: "Proceed only if HomogeneityIndex ≠ N/A AND SizeOfRiskRatingApplies = 'Yes'",
          clm_rules: ["Rule 52.A.1"] },
        { id: "SOR-3", type: "lookup", name: "SOR Loss Cost Lookup", table: "PremOpsSizeOfRiskLossCost", db_table: "loss_cost_records",
          keys: [{ col: "StateCode", description: "State" }, { col: "PremOpsTerr", description: "Territory" }, { col: "ClassCode", description: "NOTE: key column is ClassCode, not ClassCodeCGLProds" }],
          result_col: "LossCost", formula: null,
          note: "ClassCode (not ClassCodeCGLProds) and LossCost (not Rate) — different column names from standard path",
          clm_rules: ["Rule 52.A.2"] },
        { id: "SOR-4", type: "calculation", name: "SOR Premium Adjustment", table: null, db_table: null, keys: [],
          result_col: "sor_premium", formula: "sor_premium = sor_loss_cost × homogeneity_index × exposure_factor",
          note: "Replaces standard base premium when SOR applies",
          clm_rules: ["Rule 52.A.2"] },
      ],
    },
  ];

  return (
    <div className="space-y-4">
      {/* Legend */}
      <div className="flex items-center gap-3 text-xs flex-wrap">
        <span className="text-gray-400">Legend:</span>
        {[
          ["LOOKUP", "text-blue-700 bg-blue-50 border-blue-200"],
          ["CALCULATION", "text-purple-700 bg-purple-50 border-purple-200"],
          ["DEVIATION/MOD", "text-amber-700 bg-amber-50 border-amber-200"],
          ["CONDITIONAL", "text-gray-600 bg-gray-100 border-gray-300"],
          ["GATE", "text-red-700 bg-red-50 border-red-200"],
        ].map(([lbl, cls]) => (
          <span key={lbl} className={`px-2 py-0.5 rounded border font-mono ${cls}`}>{lbl}</span>
        ))}
      </div>

      {loading && <p className="text-gray-500 text-xs animate-pulse">Checking data presence…</p>}

      {ALGORITHMS.map(algo => (
        <div key={algo.id} className="rounded-lg border border-gray-200 overflow-hidden">
          <button
            onClick={() => toggleExpanded(algo.id)}
            className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
          >
            <span className="font-semibold text-gray-900">{algo.label}</span>
            <Badge
              label={algo.status === "implemented" ? "IMPLEMENTED" : "SPEC ONLY"}
              variant={algo.status === "implemented" ? "PASS" : "WARN"}
            />
            <span className="text-gray-400 text-xs flex-1">{algo.description}</span>
            <span className="text-gray-400 text-xs">{expanded[algo.id] ? "▲" : "▼"}</span>
          </button>

          {expanded[algo.id] && (
            <div className="px-4 py-3 space-y-2">
              {algo.steps.map(step => {
                const s = TYPE_STYLES[step.type] || TYPE_STYLES.conditional;
                const hasData = step.table != null ? presence[step.table] : null;
                return (
                  <div key={step.id} className={`ml-3 pl-4 border-l-2 ${s.border} ${s.bg} rounded-r px-3 py-2`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`font-mono text-xs px-1.5 py-0.5 rounded ${s.badge}`}>{step.id}</span>
                        <span className={`text-sm font-medium ${s.label}`}>{step.name}</span>
                        {step.clm_rules?.map(rule => (
                          <span key={rule} className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                            rule === "Carrier Dev"
                              ? "bg-amber-50 text-amber-600 border-amber-200"
                              : "bg-gray-50 text-gray-500 border-gray-200"
                          }`}>{rule}</span>
                        ))}
                      </div>
                      {step.table != null && (
                        <span className={`text-xs font-mono shrink-0 ${hasData === true ? "text-emerald-600" : "text-red-500"}`}>
                          {hasData === true ? "● Data" : "○ No data"}
                        </span>
                      )}
                    </div>
                    {step.table && (
                      <div className="text-xs text-gray-500 mt-1">
                        table: <span className="font-mono text-gray-800">{step.table}</span>
                      </div>
                    )}
                    {step.keys && step.keys.length > 0 && (
                      <div className="text-xs mt-1 text-gray-500 flex flex-wrap gap-x-1 items-center">
                        {step.keys.map((k, ki) => (
                          <span key={ki} className="inline-flex items-center gap-1">
                            <span className="font-mono text-gray-800">{k.col}</span>
                            <span className="italic text-gray-400">({k.description})</span>
                            {ki < step.keys.length - 1 && <span className="text-gray-300">·</span>}
                          </span>
                        ))}
                        {step.result_col && (
                          <>
                            <span className="text-gray-300 mx-1">→</span>
                            <span className="font-mono text-gray-700">{step.result_col}</span>
                          </>
                        )}
                      </div>
                    )}
                    {(!step.keys || !step.keys.length) && step.result_col && step.type !== "gate" && (
                      <div className="text-xs mt-1 text-gray-400">
                        → <span className="font-mono text-gray-700">{step.result_col}</span>
                      </div>
                    )}
                    {step.formula && (
                      <div className="mt-1.5 bg-gray-50 border border-gray-200 rounded px-2 py-1 font-mono text-xs text-purple-700 italic">
                        {step.formula}
                      </div>
                    )}
                    {step.note && (
                      <div className="text-gray-400 text-xs italic mt-1">{step.note}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Forms List tab ────────────────────────────────────────────────────────────
function FormsListTab({ state, edition }) {
  const [data, setData] = useState({ total: 0, rows: [] });
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  useEffect(() => { setPage(0); }, [state, edition]);

  useEffect(() => {
    setLoading(true);
    dataBrowser.formsList({
      state_code: state || undefined,
      edition_id: edition || undefined,
    }).then(setData).catch(() => {}).finally(() => setLoading(false));
  }, [state, edition]);

  const needle = search.trim().toLowerCase();
  const filtered = needle
    ? data.rows.filter(f =>
        [f.name, f.number, f.type, f.attachment_type, f.condition, f.source,
          ...(f.editions || []).map(e => e.state_applicability),
          ...(f.editions || []).map(e => e.edition_id),
        ].some(v => v && String(v).toLowerCase().includes(needle))
      )
    : data.rows;

  const PAGE_SIZE = 20;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageClamped = Math.min(page, totalPages - 1);
  const paged = filtered.slice(pageClamped * PAGE_SIZE, (pageClamped + 1) * PAGE_SIZE);

  return (
    <div className="space-y-3">
      {!state && !edition && (
        <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          Select a state to see eligible forms — CW (countrywide) editions are always included.
        </div>
      )}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-[10px] text-gray-400">
          {data.total} unique forms{state ? ` eligible for ${state.toUpperCase()} (includes CW)` : ""}
          {needle ? ` · ${filtered.length} matching` : ""}
        </span>
        <div className="flex items-center gap-2">
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            placeholder="Search name, number, edition…"
            className="bg-white border border-gray-300 rounded px-2.5 py-1 text-xs text-gray-800 w-52 focus:outline-none focus:border-blue-400"
          />
          {totalPages > 1 && (
            <div className="flex items-center gap-1 text-[10px] text-gray-500">
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={pageClamped === 0}
                className="px-1.5 py-0.5 rounded border border-gray-200 bg-white disabled:opacity-30 hover:bg-gray-50">←</button>
              <span className="font-mono px-1">{pageClamped + 1} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={pageClamped >= totalPages - 1}
                className="px-1.5 py-0.5 rounded border border-gray-200 bg-white disabled:opacity-30 hover:bg-gray-50">→</button>
            </div>
          )}
        </div>
      </div>
      <div className="overflow-x-auto rounded border border-gray-200">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {["Status", "Number", "Name", "Type", "Attachment", "Condition", "Source", "Editions"].map(h => (
                <th key={h} className="px-3 py-2 text-gray-500 text-left font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="px-3 py-6 text-gray-400 text-center animate-pulse">Loading…</td></tr>
            ) : paged.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-6 text-gray-400 text-center">
                {needle ? "No forms match that search." : "No forms found."}
              </td></tr>
            ) : paged.map((f, i) => (
              <tr key={i} className="border-b border-gray-100 hover:bg-gray-50 align-top">
                <td className="px-3 py-2">
                  <Badge
                    label={f.status === "N" ? "NEW" : f.status === "D" ? "DEL" : "ACT"}
                    variant={f.status === "N" ? "WARN" : f.status === "D" ? "FAIL" : "PASS"}
                  />
                </td>
                <td className="px-3 py-2 font-mono text-blue-600 whitespace-nowrap">{f.number || "—"}</td>
                <td className="px-3 py-2 text-gray-800 max-w-[220px]">{f.name}</td>
                <td className="px-3 py-2">
                  {f.type && (
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                      (f.type || "").toLowerCase() === "form"
                        ? "bg-blue-50 text-blue-700"
                        : "bg-purple-50 text-purple-700"
                    }`}>{f.type}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{f.attachment_type || "—"}</td>
                <td className="px-3 py-2 text-gray-400 max-w-[160px] truncate" title={f.condition}>{f.condition || "—"}</td>
                <td className="px-3 py-2">
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">{f.source || "ISO"}</span>
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {(f.editions || []).map((ed, ei) => (
                      <span key={ei} className={`inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                        ed.state_applicability === "CW"
                          ? "bg-indigo-50 text-indigo-600 border-indigo-200"
                          : "bg-gray-50 text-gray-600 border-gray-200"
                      }`}>
                        <span className="font-semibold">{ed.state_applicability}</span>
                        <span className="text-[9px] opacity-70">{ed.effective_date}</span>
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
// ── Map View tab ──────────────────────────────────────────────────────────────
const GEO_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";

const FIPS_TO_STATE = {
  "01":"AL","02":"AK","04":"AZ","05":"AR","06":"CA","08":"CO","09":"CT",
  "10":"DE","11":"DC","12":"FL","13":"GA","15":"HI","16":"ID","17":"IL",
  "18":"IN","19":"IA","20":"KS","21":"KY","22":"LA","23":"ME","24":"MD",
  "25":"MA","26":"MI","27":"MN","28":"MS","29":"MO","30":"MT","31":"NE",
  "32":"NV","33":"NH","34":"NJ","35":"NM","36":"NY","37":"NC","38":"ND",
  "39":"OH","40":"OK","41":"OR","42":"PA","44":"RI","45":"SC","46":"SD",
  "47":"TN","48":"TX","49":"UT","50":"VT","51":"VA","53":"WA","54":"WV",
  "55":"WI","56":"WY","72":"PR",
};

const STATE_NAMES = {
  AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",
  CO:"Colorado",CT:"Connecticut",DE:"Delaware",DC:"District of Columbia",
  FL:"Florida",GA:"Georgia",HI:"Hawaii",ID:"Idaho",IL:"Illinois",
  IN:"Indiana",IA:"Iowa",KS:"Kansas",KY:"Kentucky",LA:"Louisiana",
  ME:"Maine",MD:"Maryland",MA:"Massachusetts",MI:"Michigan",MN:"Minnesota",
  MS:"Mississippi",MO:"Missouri",MT:"Montana",NE:"Nebraska",NV:"Nevada",
  NH:"New Hampshire",NJ:"New Jersey",NM:"New Mexico",NY:"New York",
  NC:"North Carolina",ND:"North Dakota",OH:"Ohio",OK:"Oklahoma",OR:"Oregon",
  PA:"Pennsylvania",RI:"Rhode Island",SC:"South Carolina",SD:"South Dakota",
  TN:"Tennessee",TX:"Texas",UT:"Utah",VT:"Vermont",VA:"Virginia",
  WA:"Washington",WV:"West Virginia",WI:"Wisconsin",WY:"Wyoming",PR:"Puerto Rico",
};

// In the public demo build (VITE_MOCK=1) the react-simple-maps components
// don't ship a React-19-compatible release; we render a static panel instead.
const IS_DEMO_MAP = import.meta.env.VITE_MOCK === "1" || import.meta.env.VITE_MOCK === "true";

function MapViewTabDemoPlaceholder() {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded p-4 text-sm text-amber-900 max-w-2xl">
      <div className="font-semibold mb-1">Map view not available in demo</div>
      <div className="text-xs">
        The geographic ERC adoption map requires <code className="font-mono">react-simple-maps</code>,
        which doesn't yet ship a React 19-compatible release. In the working prototype this tab renders
        a choropleth of every state's bureau edition vs. carrier adoption status.
      </div>
    </div>
  );
}

function MapViewTab() {
  if (IS_DEMO_MAP) return <MapViewTabDemoPlaceholder />;
  return <MapViewTabLive />;
}

function MapViewTabLive() {
  const [hierarchy, setHierarchy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedCW, setSelectedCW] = useState("");
  const [tooltip, setTooltip] = useState(null);

  useEffect(() => {
    dataBrowser.ercHierarchy()
      .then(d => {
        setHierarchy(d);
        if (d.groups?.length > 0) setSelectedCW(d.groups[0].edition_id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const stateMap = useMemo(() => {
    if (!hierarchy || !selectedCW) return {};
    const group = hierarchy.groups.find(g => g.edition_id === selectedCW);
    if (!group) return {};
    const m = {};
    for (const s of group.states) {
      const existing = m[s.state_code];
      if (!existing) { m[s.state_code] = s; continue; }
      // Prefer ACTIVE; within same status, prefer higher version
      const sIsActive = s.load_status === "ACTIVE";
      const exIsActive = existing.load_status === "ACTIVE";
      if (sIsActive && !exIsActive) { m[s.state_code] = s; continue; }
      if (!sIsActive && exIsActive) continue;
      if (s.version > existing.version) m[s.state_code] = s;
    }
    return m;
  }, [hierarchy, selectedCW]);

  function handleGeoEnter(geo, evt) {
    const fips = String(geo.id).padStart(2, "0");
    const sc = FIPS_TO_STATE[fips];
    if (!sc) return;
    const ed = stateMap[sc];
    setTooltip({
      x: evt.clientX, y: evt.clientY,
      stateName: STATE_NAMES[sc] || sc,
      edition: ed || null,
    });
  }

  function handleMouseMove(evt) {
    setTooltip(t => t ? { ...t, x: evt.clientX, y: evt.clientY } : t);
  }

  if (loading) return <p className="text-gray-400 text-sm animate-pulse">Loading…</p>;
  if (!hierarchy) return <p className="text-red-500 text-sm">Failed to load hierarchy.</p>;

  const selectedGroup = hierarchy.groups.find(g => g.edition_id === selectedCW);
  const coverageCount = selectedGroup?.state_count ?? 0;

  return (
    <div className="space-y-4" onMouseMove={handleMouseMove}>
      {/* CW version selector */}
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-xs text-gray-500 font-medium">CW Base Version</label>
        <select
          value={selectedCW}
          onChange={e => setSelectedCW(e.target.value)}
          className="bg-white border border-gray-300 rounded px-2 py-1 text-sm text-gray-800 font-mono focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        >
          {hierarchy.groups.map(g => (
            <option key={g.edition_id} value={g.edition_id}>
              {g.edition_id} ({g.effective_date}) — {g.state_count} states
              {g.edition_count > g.state_count ? `, ${g.edition_count} eds` : ""}
            </option>
          ))}
        </select>
        {selectedCW && (
          <span className="text-xs text-gray-500">
            <span className="font-semibold text-blue-600">{coverageCount}</span> unique jurisdictions
            {selectedGroup && selectedGroup.edition_count > selectedGroup.state_count && (
              <span className="text-gray-400"> ({selectedGroup.edition_count} total editions)</span>
            )}
          </span>
        )}
      </div>

      {/* Map container */}
      <div className="relative border border-gray-200 rounded-xl overflow-hidden bg-[#F8F7F6]">
        <ComposableMap
          projection="geoAlbersUsa"
          projectionConfig={{ scale: 820 }}
          style={{ width: "100%", height: "auto" }}
        >
          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies.map(geo => {
                const fips = String(geo.id).padStart(2, "0");
                const sc = FIPS_TO_STATE[fips];
                const ed = sc ? stateMap[sc] : null;
                const hasErc = Boolean(ed);

                const fill = !sc ? "#E5E7EB"
                  : !hasErc ? "#D1D5DB"
                  : ed.load_status === "COEXISTING" ? "#818CF8"
                  : "#3B82F6";

                const hoverFill = !hasErc ? "#9CA3AF" : "#1D4ED8";

                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill={fill}
                    stroke="#FFFFFF"
                    strokeWidth={0.6}
                    onMouseEnter={evt => handleGeoEnter(geo, evt)}
                    onMouseLeave={() => setTooltip(null)}
                    style={{
                      default: { outline: "none" },
                      hover:   { fill: hoverFill, outline: "none", cursor: "default" },
                      pressed: { outline: "none" },
                    }}
                  />
                );
              })
            }
          </Geographies>
        </ComposableMap>

        {/* Legend */}
        <div className="absolute bottom-3 left-3 flex items-center gap-4 text-xs bg-white/90 border border-gray-200 rounded-lg px-3 py-2 shadow-sm">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-blue-500 border border-blue-600" />
            <span className="text-gray-600">ACTIVE</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-indigo-400 border border-indigo-500" />
            <span className="text-gray-600">COEXISTING</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-gray-300 border border-gray-400" />
            <span className="text-gray-600">No ERC</span>
          </div>
        </div>
      </div>

      {/* Tooltip — rendered at cursor position */}
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none"
          style={{ left: tooltip.x + 14, top: tooltip.y - 8 }}
        >
          <div className="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-xl min-w-[160px]">
            <div className="font-semibold mb-1">{tooltip.stateName}</div>
            {tooltip.edition ? (
              <>
                <div className="font-mono text-blue-300 mb-0.5">{tooltip.edition.edition_id}</div>
                <div className="text-gray-300 text-[11px]">
                  {tooltip.edition.effective_date} · V{String(tooltip.edition.version).padStart(2, "0")}
                </div>
                <div className={`mt-1 font-semibold text-[11px] ${
                  tooltip.edition.load_status === "ACTIVE" ? "text-emerald-400" :
                  tooltip.edition.load_status === "COEXISTING" ? "text-indigo-300" : "text-amber-400"
                }`}>
                  {tooltip.edition.load_status}
                </div>
              </>
            ) : (
              <div className="text-gray-400 text-[11px]">No ERC for this version</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── ERC Hierarchy tab ─────────────────────────────────────────────────────────
const STATUS_CHIP = {
  ACTIVE:     "bg-emerald-50 text-emerald-700 border-emerald-200",
  COEXISTING: "bg-amber-50 text-amber-700 border-amber-200",
  PENDING:    "bg-gray-50 text-gray-500 border-gray-200",
  SUPERSEDED: "bg-gray-100 text-gray-400 border-gray-200",
};

function ERCHierarchyTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(new Set());

  useEffect(() => {
    dataBrowser.ercHierarchy().then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  function toggle(id) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function expandAll() { setExpanded(new Set((data?.groups || []).map(g => g.edition_id))); }
  function collapseAll() { setExpanded(new Set()); }

  if (loading) return <p className="text-gray-400 text-sm animate-pulse">Loading…</p>;
  if (!data)   return <p className="text-red-500 text-sm">Failed to load hierarchy.</p>;

  return (
    <div className="space-y-3">
      {/* Summary + controls */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-3 text-xs text-gray-500 flex-1">
          <span><span className="font-semibold text-gray-800">{data.total_cw}</span> CW base editions</span>
          <span className="text-gray-300">·</span>
          <span>
            <span className="font-semibold text-gray-800">{data.total_states}</span> unique states
          </span>
          <span className="text-gray-300">·</span>
          <span>
            <span className="font-semibold text-gray-800">{data.total_editions}</span> total editions
          </span>
          {data.unlinked_states?.length > 0 && (
            <>
              <span className="text-gray-300">·</span>
              <span className="text-amber-600 font-medium">{data.unlinked_states.length} unlinked</span>
            </>
          )}
        </div>
        <div className="flex gap-3 text-xs">
          <button onClick={expandAll}   className="text-indigo-600 hover:text-indigo-800 underline">Expand all</button>
          <button onClick={collapseAll} className="text-gray-400 hover:text-gray-600 underline">Collapse all</button>
        </div>
      </div>

      {/* Single table — CW parent rows + inline child rows share column grid */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <colgroup>
            <col className="w-8" />      {/* chevron */}
            <col className="w-10" />     {/* badge */}
            <col />                      {/* edition id — flex */}
            <col className="w-28" />     {/* effective date */}
            <col className="w-12" />     {/* version */}
            <col className="w-28" />     {/* status */}
            <col className="w-32" />     {/* count / current */}
          </colgroup>
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-3 py-2" />
              <th className="px-2 py-2" />
              <th className="px-3 py-2 text-left text-gray-500 font-medium">Edition ID</th>
              <th className="px-3 py-2 text-left text-gray-500 font-medium">Effective Date</th>
              <th className="px-3 py-2 text-left text-gray-500 font-medium">Ver</th>
              <th className="px-3 py-2 text-left text-gray-500 font-medium">Status</th>
              <th className="px-3 py-2 text-right text-gray-500 font-medium">States / Eds</th>
            </tr>
          </thead>
          <tbody>
            {data.groups.map(cw => {
              const isOpen = expanded.has(cw.edition_id);
              const chip = STATUS_CHIP[cw.load_status] || STATUS_CHIP.PENDING;
              return (
                <>
                  {/* CW parent row */}
                  <tr
                    key={cw.edition_id}
                    onClick={() => toggle(cw.edition_id)}
                    className="border-b border-gray-100 bg-white hover:bg-gray-50 cursor-pointer select-none"
                  >
                    <td className="px-3 py-2.5 text-center">
                      <svg
                        className={`w-3 h-3 text-gray-400 inline transition-transform duration-150 ${isOpen ? "rotate-90" : ""}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </td>
                    <td className="px-2 py-2.5">
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 border border-indigo-200">
                        CW
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono font-semibold text-gray-900">{cw.edition_id}</td>
                    <td className="px-3 py-2.5 font-mono text-gray-500">{cw.effective_date}</td>
                    <td className="px-3 py-2.5 font-mono text-gray-400">V{String(cw.version).padStart(2, "0")}</td>
                    <td className="px-3 py-2.5">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${chip}`}>
                        {cw.load_status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-500 whitespace-nowrap">
                      {cw.state_count} states
                      {cw.edition_count > cw.state_count && (
                        <span className="text-gray-300"> · {cw.edition_count} eds</span>
                      )}
                    </td>
                  </tr>

                  {/* Child state rows */}
                  {isOpen && cw.states.map((s, i) => {
                    const sCls = STATUS_CHIP[s.load_status] || STATUS_CHIP.PENDING;
                    return (
                      <tr key={i} className="border-b border-gray-100 last:border-0 bg-gray-50/60 hover:bg-indigo-50/40">
                        <td className="px-3 py-1.5" />
                        <td className="px-2 py-1.5 text-center">
                          <span className="text-[10px] font-bold px-1 py-0.5 rounded bg-gray-100 text-gray-500 border border-gray-200 font-mono">
                            {s.state_code}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 font-mono text-gray-600">{s.edition_id}</td>
                        <td className="px-3 py-1.5 font-mono text-gray-500">{s.effective_date}</td>
                        <td className="px-3 py-1.5 font-mono text-gray-400">V{String(s.version).padStart(2, "0")}</td>
                        <td className="px-3 py-1.5">
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${sCls}`}>
                            {s.load_status}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-right text-gray-400">
                          {s.is_current_version_for_date ? "✓ current" : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Unlinked state editions */}
      {data.unlinked_states?.length > 0 && (
        <div className="border border-amber-200 rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-200">
            <span className="text-xs font-semibold text-amber-700">
              {data.unlinked_states.length} state editions have no CW reference
            </span>
          </div>
          <table className="w-full text-xs">
            <colgroup>
              <col /><col className="w-28" /><col className="w-12" /><col className="w-28" />
            </colgroup>
            <thead>
              <tr className="bg-amber-50/50 border-b border-amber-100">
                <th className="px-4 py-2 text-amber-700 font-medium text-left">Edition ID</th>
                <th className="px-4 py-2 text-amber-700 font-medium text-left">Effective Date</th>
                <th className="px-4 py-2 text-amber-700 font-medium text-left">Ver</th>
                <th className="px-4 py-2 text-amber-700 font-medium text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.unlinked_states.map((s, i) => (
                <tr key={i} className="border-b border-amber-50 last:border-0 hover:bg-amber-50">
                  <td className="px-4 py-1.5 font-mono text-gray-700">{s.edition_id}</td>
                  <td className="px-4 py-1.5 font-mono text-gray-500">{s.effective_date}</td>
                  <td className="px-4 py-1.5 font-mono text-gray-400">V{String(s.version).padStart(2, "0")}</td>
                  <td className="px-4 py-1.5">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${STATUS_CHIP[s.load_status] || STATUS_CHIP.PENDING}`}>
                      {s.load_status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── ERC Citations tab ────────────────────────────────────────────────────────
// Crosswalk between circulars (ISO bureau publications) and the ERC deliveries
// that cite them. Two views: per-delivery list (default) and circular × delivery
// matrix. Pulls from erc_circular_manifest written at ingest + backfill.
const TYPE_COLOR = {
  FORMS:        "border-blue-200 text-blue-700 bg-blue-50",
  RULES:        "border-purple-200 text-purple-700 bg-purple-50",
  "LOSS COSTS": "border-emerald-200 text-emerald-700 bg-emerald-50",
  RATES:        "border-emerald-200 text-emerald-700 bg-emerald-50",
  "STAT PLAN":  "border-amber-200 text-amber-700 bg-amber-50",
};

function TypeChip({ t }) {
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${TYPE_COLOR[t] || "border-gray-200 text-gray-600 bg-gray-50"}`}>
      {t}
    </span>
  );
}

function FilingRefChip({ r }) {
  return (
    <span title="Filing reference (SERFF track)"
      className="px-1.5 py-0.5 rounded font-mono text-[10px] border border-gray-300 text-gray-600 bg-white">
      {r}
    </span>
  );
}

const KNOWN_TYPES = ["FORMS", "RULES", "LOSS COSTS", "RATES", "STAT PLAN"];

function ERCCitationsTab({ state, edition }) {
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState("list");          // list | matrix
  const [typeFilter, setTypeFilter] = useState("");
  const [refFilter, setRefFilter] = useState("");
  const [circularFilter, setCircularFilter] = useState("");
  const [backfilling, setBackfilling] = useState(false);
  const [backfillFolder, setBackfillFolder] = useState("");
  const [backfillReport, setBackfillReport] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      dataBrowser.ercCitations({
        state_code: state,
        edition_id: edition,
        type_tag: typeFilter,
        filing_reference: refFilter,
        circular_id: circularFilter,
      }),
      dataBrowser.ercCitationsSummary(),
    ]).then(([r, s]) => {
      setRows(r);
      setSummary(s);
    }).finally(() => setLoading(false));
  }, [state, edition, typeFilter, refFilter, circularFilter]);

  useEffect(() => { load(); }, [load]);

  async function runBackfill() {
    if (!backfillFolder.trim()) return;
    setBackfilling(true); setBackfillReport(null);
    try {
      const r = await phaseD.backfillErcCircularManifest(backfillFolder.trim());
      setBackfillReport(r);
      load();
    } catch (e) {
      setBackfillReport({ error: e.message });
    } finally {
      setBackfilling(false);
    }
  }

  // For the matrix view: group rows by circular_id → [edition rows]
  const matrix = useMemo(() => {
    const byCirc = new Map();
    for (const r of rows) {
      if (!byCirc.has(r.circular_id)) byCirc.set(r.circular_id, {
        circular_id: r.circular_id,
        circular_title: r.circular_title,
        decision_status: r.decision_status,
        editions: [],
      });
      byCirc.get(r.circular_id).editions.push(r);
    }
    return Array.from(byCirc.values()).sort((a, b) => a.circular_id.localeCompare(b.circular_id));
  }, [rows]);

  return (
    <div className="space-y-4">
      {/* Summary tiles */}
      <div className="grid grid-cols-4 gap-2">
        {[
          ["Citations",          summary.total_citations, "INFO"],
          ["Distinct Circulars", summary.distinct_circulars, "INFO"],
          ["Editions w/ Evidence", summary.distinct_editions, "ACTIVE"],
          ["Editions Missing Evidence", summary.editions_without_manifest,
            (summary.editions_without_manifest || 0) > 0 ? "WARN" : "ACTIVE"],
        ].map(([label, val, variant]) => (
          <div key={label} className="bg-white border border-gray-200 rounded px-3 py-2 flex items-center justify-between">
            <div>
              <div className="text-gray-500 text-xs">{label}</div>
              <div className="text-gray-900 font-mono text-xl font-semibold">{val ?? 0}</div>
            </div>
            <Badge label="" variant={variant} />
          </div>
        ))}
      </div>

      {/* Backfill row — appears only when there are editions missing evidence */}
      {(summary.editions_without_manifest || 0) > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs">
          <div className="font-semibold text-amber-900 mb-1.5">
            Manifest backfill — {summary.editions_without_manifest} editions are missing manifest evidence
          </div>
          <div className="text-amber-800 mb-2 text-[11px]">
            Point this at an ERC delivery root (e.g. <code className="font-mono bg-white px-1 rounded">C:\Projects\version_6_proof_of_concept\erc_sample</code>) to re-parse every <code className="font-mono">Circulars.Metadata.xml</code> under it and upsert evidence rows. Activated editions are safe — this never touches the link table.
          </div>
          <div className="flex items-center gap-2">
            <input value={backfillFolder} onChange={e => setBackfillFolder(e.target.value)}
              placeholder="ERC delivery root folder path"
              className="flex-1 bg-white border border-amber-300 rounded px-2 py-1 text-xs font-mono" />
            <button onClick={runBackfill} disabled={backfilling || !backfillFolder.trim()}
              className="bg-amber-600 hover:bg-amber-700 disabled:opacity-40 text-white px-3 py-1 rounded text-xs font-semibold">
              {backfilling ? "Running…" : "Backfill"}
            </button>
          </div>
          {backfillReport && !backfillReport.error && (
            <div className="mt-2 text-[11px] text-amber-900">
              ✓ Scanned <span className="font-mono">{backfillReport.deliveries_scanned}</span>{" "}
              · processed <span className="font-mono">{backfillReport.deliveries_processed}</span>{" "}
              · skipped <span className="font-mono">{backfillReport.deliveries_skipped}</span>{" "}
              · wrote <span className="font-mono">{backfillReport.manifest_rows_total}</span> evidence rows.
            </div>
          )}
          {backfillReport?.error && (
            <div className="mt-2 text-[11px] text-red-700">Error: {backfillReport.error}</div>
          )}
        </div>
      )}

      {/* Filter row */}
      <div className="flex items-end gap-2 flex-wrap">
        <div>
          <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-0.5">View</label>
          <div className="inline-flex rounded border border-gray-300 overflow-hidden text-xs">
            <button onClick={() => setView("list")}
              className={`px-3 py-1 ${view === "list" ? "bg-gray-800 text-white" : "bg-white text-gray-700 hover:bg-gray-50"}`}>
              By Delivery
            </button>
            <button onClick={() => setView("matrix")}
              className={`px-3 py-1 ${view === "matrix" ? "bg-gray-800 text-white" : "bg-white text-gray-700 hover:bg-gray-50"}`}>
              Matrix
            </button>
          </div>
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-0.5">Type</label>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
            className="bg-white border border-gray-300 rounded px-2 py-1 text-xs">
            <option value="">All</option>
            {KNOWN_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-0.5">Filing ref</label>
          <input value={refFilter} onChange={e => setRefFilter(e.target.value)}
            placeholder="e.g. GL-2024-OFR24"
            className="bg-white border border-gray-300 rounded px-2 py-1 text-xs font-mono w-48" />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-0.5">Circular</label>
          <input value={circularFilter} onChange={e => setCircularFilter(e.target.value.toUpperCase())}
            placeholder="LI-GL-2019-138"
            className="bg-white border border-gray-300 rounded px-2 py-1 text-xs font-mono w-48" />
        </div>
        <div className="ml-auto text-[11px] text-gray-500 italic">
          {rows.length} citation{rows.length === 1 ? "" : "s"} matching
        </div>
      </div>

      {/* List view */}
      {view === "list" && (
        <div className="bg-white border border-gray-200 rounded overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-gray-50">
              <tr className="text-gray-500 text-left border-b border-gray-200">
                <th className="py-2 pl-3 pr-3 font-semibold">Edition</th>
                <th className="py-2 pr-3 font-semibold">State</th>
                <th className="py-2 pr-3 font-semibold">Edition Eff.</th>
                <th className="py-2 pr-3 font-semibold">Circular</th>
                <th className="py-2 pr-3 font-semibold">Title</th>
                <th className="py-2 pr-3 font-semibold">Types</th>
                <th className="py-2 pr-3 font-semibold">Filing Refs</th>
                <th className="py-2 pr-3 font-semibold">Manifest Eff.</th>
                <th className="py-2 pr-3 font-semibold">Decision</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && <tr><td colSpan={9} className="py-6 text-center text-gray-400">Loading…</td></tr>}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={9} className="py-6 text-center text-gray-400">No citations match filters</td></tr>
              )}
              {!loading && rows.map((r, i) => (
                <tr key={`${r.edition_id}|${r.circular_id}|${i}`} className="align-top hover:bg-gray-50">
                  <td className="py-1.5 pl-3 pr-3 font-mono text-gray-700">{r.edition_id}</td>
                  <td className="py-1.5 pr-3 text-gray-500">{r.state_code}</td>
                  <td className="py-1.5 pr-3 text-gray-500">{r.edition_effective_date}</td>
                  <td className="py-1.5 pr-3 font-mono text-blue-700">{r.circular_id}</td>
                  <td className="py-1.5 pr-3 text-gray-700">{r.circular_title || <span className="text-gray-400 italic">unregistered</span>}</td>
                  <td className="py-1.5 pr-3">
                    <div className="flex flex-wrap gap-1">
                      {(r.circular_types || []).map(t => <TypeChip key={t} t={t} />)}
                    </div>
                  </td>
                  <td className="py-1.5 pr-3">
                    <div className="flex flex-wrap gap-1">
                      {(r.filing_references || []).map(fr => <FilingRefChip key={fr} r={fr} />)}
                    </div>
                  </td>
                  <td className="py-1.5 pr-3 text-gray-500">{r.manifest_effective_date || "—"}</td>
                  <td className="py-1.5 pr-3">
                    {r.decision_status ? (
                      <Badge label={r.decision_status} variant={
                        r.decision_status === "approved" || r.decision_status === "adopted_with_mods" ? "ACTIVE"
                          : r.decision_status === "rejected" ? "BLOCKED"
                          : "PENDING"
                      } />
                    ) : <span className="text-gray-400 italic">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Matrix view */}
      {view === "matrix" && (
        <div className="bg-white border border-gray-200 rounded overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-100 text-[11px] text-gray-500 italic">
            One row per circular. Edition chips show every delivery that cites it; click into Phase D Circular Adoption to manage.
          </div>
          <table className="w-full text-xs">
            <thead className="bg-gray-50">
              <tr className="text-gray-500 text-left border-b border-gray-200">
                <th className="py-2 pl-3 pr-3 font-semibold w-40">Circular</th>
                <th className="py-2 pr-3 font-semibold">Title</th>
                <th className="py-2 pr-3 font-semibold w-24">Decision</th>
                <th className="py-2 pr-3 font-semibold">Editions citing it</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && <tr><td colSpan={4} className="py-6 text-center text-gray-400">Loading…</td></tr>}
              {!loading && matrix.length === 0 && (
                <tr><td colSpan={4} className="py-6 text-center text-gray-400">No citations match filters</td></tr>
              )}
              {!loading && matrix.map(c => (
                <tr key={c.circular_id} className="align-top hover:bg-gray-50">
                  <td className="py-1.5 pl-3 pr-3 font-mono text-blue-700">{c.circular_id}</td>
                  <td className="py-1.5 pr-3 text-gray-700">{c.circular_title || <span className="text-gray-400 italic">unregistered</span>}</td>
                  <td className="py-1.5 pr-3">
                    {c.decision_status ? (
                      <Badge label={c.decision_status} variant={
                        c.decision_status === "approved" || c.decision_status === "adopted_with_mods" ? "ACTIVE"
                          : c.decision_status === "rejected" ? "BLOCKED"
                          : "PENDING"
                      } />
                    ) : <span className="text-gray-400 italic">—</span>}
                  </td>
                  <td className="py-1.5 pr-3">
                    <div className="flex flex-wrap gap-1">
                      {c.editions.map(e => (
                        <span key={e.edition_id}
                          title={`${e.edition_id} · ${(e.circular_types || []).join(", ")}${(e.filing_references || []).length ? "\nFiling refs: " + (e.filing_references || []).join(", ") : ""}`}
                          className="px-1.5 py-0.5 rounded font-mono text-[10px] border border-gray-300 text-gray-700 bg-white">
                          {e.state_code} · {e.edition_effective_date}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const TABS = [
  { id: "loss-costs", label: "Loss Costs" },
  { id: "factors", label: "Factors" },
  { id: "ilta", label: "ILTA" },
  { id: "territory", label: "Territory" },
  { id: "forms-list", label: "Forms List" },
  { id: "forms", label: "Forms Data" },
  { id: "editions", label: "Editions" },
  { id: "erc-hierarchy", label: "ERC Hierarchy" },
  { id: "erc-citations", label: "ERC Citations" },
  // Map View requires react-simple-maps which doesn't ship a React-19-compatible
  // release; hidden in the demo build (VITE_MOCK=1) — see MapViewTab.
  ...(IS_DEMO_MAP ? [] : [{ id: "map-view", label: "Map View" }]),
  { id: "quotes", label: "Quotes" },
  { id: "policies", label: "Policies" },
  { id: "rating-algorithms", label: "Rating Algorithms" },
];

export default function Screen6_DataBrowser() {
  const [states, setStates] = useState([]);
  const [editions, setEditions] = useState([]);
  const [state, setState] = useState("");
  const [edition, setEdition] = useState("");
  const [activeTab, setActiveTab] = useState("loss-costs");

  useEffect(() => {
    dataBrowser.states().then(setStates).catch(() => {});
    dataBrowser.editions().then(setEditions).catch(() => {});
  }, []);

  return (
    <div className="p-6 text-gray-900">
      <div className="mb-5">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-2 h-2 rounded-full bg-indigo-500" />
          <h1 className="text-xl font-semibold text-gray-900">Data Browser</h1>
          <Badge label="SCREEN 6" variant="INFO" />
        </div>
        <p className="text-gray-500 text-sm">Browse all loaded content — filter by state and edition</p>
      </div>

      <FilterBar
        states={states}
        editions={editions}
        state={state}
        edition={edition}
        onState={setState}
        onEdition={setEdition}
      />

      {/* Tab nav */}
      <div className="flex gap-1 border-b border-gray-200 mb-4 flex-wrap">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-2 text-sm font-medium rounded-t transition-colors
              ${activeTab === tab.id
                ? "bg-white text-gray-900 border-b-2 border-indigo-500 shadow-sm"
                : "text-gray-500 hover:text-gray-800"}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <Panel className="min-h-[400px]">
        {activeTab === "loss-costs" && <LossCostTab state={state} edition={edition} />}
        {activeTab === "factors" && <FactorsTab state={state} edition={edition} />}
        {activeTab === "ilta" && <ILTATab state={state} edition={edition} />}
        {activeTab === "territory" && <TerritoryTab state={state} edition={edition} />}
        {activeTab === "forms-list" && <FormsListTab state={state} edition={edition} />}
        {activeTab === "forms" && <FormsTab state={state} edition={edition} />}
        {activeTab === "editions" && <EditionsTab state={state} edition={edition} />}
        {activeTab === "erc-hierarchy" && <ERCHierarchyTab />}
        {activeTab === "erc-citations" && <ERCCitationsTab state={state} edition={edition} />}
        {activeTab === "map-view" && <MapViewTab />}
        {activeTab === "quotes" && <QuotesTab state={state} edition={edition} />}
        {activeTab === "policies" && <PoliciesTab state={state} edition={edition} />}
        {activeTab === "rating-algorithms" && <RatingAlgorithmsTab state={state} edition={edition} />}
      </Panel>
    </div>
  );
}
