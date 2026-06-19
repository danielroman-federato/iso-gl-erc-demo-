import { phaseC } from "../api/client";
import { Badge } from "../components/Badge";
import { Panel } from "../components/Panel";
import { RatingAuditCard } from "../components/RatingAuditCard";

const BASIS_COLOR = {
  MANDATORY: "bg-emerald-100 text-emerald-700 border-emerald-200",
  CONDITIONAL_ATTACHED: "bg-blue-100 text-blue-700 border-blue-200",
  OPTIONAL_SELECTED: "bg-teal-100 text-teal-700 border-teal-200",
};

const BASIS_LABEL = {
  MANDATORY: "Mandatory",
  CONDITIONAL_ATTACHED: "Conditional",
  OPTIONAL_SELECTED: "Optional",
};

function PolicyFormSchedule({ schedule, policyId, effectiveDate }) {
  function copyList() {
    const text = schedule
      .filter(f => f.form_number)
      .map(f => `${f.form_number}\t${f.form_name || ""}`)
      .join("\n");
    navigator.clipboard?.writeText(text);
  }

  function downloadSchedule() {
    const lines = [
      "POLICY FORM SCHEDULE",
      `Policy Number: ${policyId}`,
      `Effective Date: ${effectiveDate}`,
      "",
      ...schedule
        .filter(f => f.form_number)
        .map(f => `${f.form_number.padEnd(18)} ${f.form_name || ""}`),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `form_schedule_${policyId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Panel title="Policy Form Schedule" className="mb-4">
      <div className="mb-3 flex gap-2">
        <button onClick={copyList}
          className="bg-gray-100 hover:bg-gray-200 border border-gray-300 text-gray-700 px-3 py-1 rounded text-xs">
          Copy Form List
        </button>
        <button onClick={downloadSchedule}
          className="bg-gray-100 hover:bg-gray-200 border border-gray-300 text-gray-700 px-3 py-1 rounded text-xs">
          Download Form Schedule (TXT)
        </button>
        <span className="text-gray-400 text-xs self-center ml-auto">{schedule.length} forms</span>
      </div>
      <div className="overflow-auto max-h-96 border border-gray-200 rounded">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-gray-500 sticky top-0">
            <tr>
              <th className="text-left px-2 py-1 w-10">#</th>
              <th className="text-left px-2 py-1 w-36">Form #</th>
              <th className="text-left px-2 py-1">Form Name</th>
              <th className="text-left px-2 py-1 w-20">Type</th>
              <th className="text-left px-2 py-1 w-36">Basis</th>
              <th className="text-left px-2 py-1 w-16">Source</th>
            </tr>
          </thead>
          <tbody>
            {schedule.map((f, i) => (
              <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-2 py-1 text-gray-400">{i + 1}</td>
                <td className="px-2 py-1 font-mono text-gray-800">{f.form_number || "—"}</td>
                <td className="px-2 py-1 text-gray-700">{f.form_name}</td>
                <td className="px-2 py-1 text-gray-500">{f.form_type}</td>
                <td className="px-2 py-1">
                  <span className={`inline-block px-2 py-0.5 rounded border text-[10px] font-semibold ${BASIS_COLOR[f.attachment_type] || "bg-gray-100 text-gray-600 border-gray-200"}`}
                    title={f.attachment_reason}>
                    {BASIS_LABEL[f.attachment_type] || f.attachment_type}
                  </span>
                </td>
                <td className="px-2 py-1 text-gray-500 uppercase font-mono text-[10px]">{f.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

export default function Screen5_PolicyWorkspace({ bindResult }) {
  if (!bindResult) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 text-gray-900">
        <p className="text-gray-400">No policy bound yet. Complete rating and bind first.</p>
      </div>
    );
  }

  const pol = bindResult.ui_policy_state;
  const audit = bindResult.audit_package;
  const lifecycle = pol?.lifecycle_panel;

  return (
    <div className="p-6 text-gray-900">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <h1 className="text-xl font-semibold text-gray-900">Policy Workspace</h1>
          <Badge label="SCREEN 5" variant="INFO" />
        </div>
        <p className="text-gray-500 text-sm">Phase C · Policy Lifecycle &amp; Audit</p>
      </div>

      <Panel title="Policy Summary" className="mb-4">
        <div className="flex items-center gap-4 mb-4">
          <Badge
            label={pol?.status_badge || "BOUND"}
            variant={pol?.issuance_status === "ISSUED" ? "PASS" : "WARN"}
          />
          <span className="text-gray-900 font-semibold text-lg">{pol?.display_label}</span>
        </div>
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div className="bg-gray-50 border border-gray-100 rounded p-3">
            <div className="text-gray-500">Policy ID</div>
            <div className="font-mono text-gray-800">{pol?.policy_id}</div>
          </div>
          <div className="bg-gray-50 border border-gray-100 rounded p-3">
            <div className="text-gray-500">Quote ID</div>
            <div className="font-mono text-gray-800">{pol?.quote_id}</div>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 rounded p-3">
            <div className="text-emerald-600 font-medium">Premium</div>
            <div className="font-mono text-emerald-700 text-xl font-bold">{pol?.premium_display}</div>
          </div>
          <div className="bg-gray-50 border border-gray-100 rounded p-3">
            <div className="text-gray-500">Edition</div>
            <div className="font-mono text-gray-800">{pol?.edition_label}</div>
          </div>
          <div className="bg-gray-50 border border-gray-100 rounded p-3">
            <div className="text-gray-500">Issuance</div>
            <div className={pol?.issuance_status === "ISSUED" ? "text-emerald-600 font-semibold" : "text-amber-600 font-semibold"}>
              {pol?.issuance_status}
            </div>
          </div>
          <div className="bg-gray-50 border border-gray-100 rounded p-3">
            <div className="text-gray-500">Forms Issued</div>
            <div className="text-gray-700">{pol?.forms_issued?.length || 0} forms</div>
          </div>
        </div>

        {pol?.new_form_warnings?.length > 0 && (
          <div className="mt-3 text-amber-700 text-xs bg-amber-50 border border-amber-200 rounded px-3 py-2">
            New edition forms — confirm carrier templates: {pol.new_form_warnings.join(", ")}
          </div>
        )}
      </Panel>

      <Panel title="Lifecycle" className="mb-4">
        <div className="grid grid-cols-4 gap-3 text-xs">
          <div className="bg-gray-50 border border-gray-100 rounded p-3">
            <div className="text-gray-500">Effective</div>
            <div className="font-mono text-gray-800">{lifecycle?.effective_date}</div>
          </div>
          <div className="bg-gray-50 border border-gray-100 rounded p-3">
            <div className="text-gray-500">Expiration</div>
            <div className="font-mono text-gray-800">{lifecycle?.expiration_date}</div>
          </div>
          <div className="bg-gray-50 border border-gray-100 rounded p-3">
            <div className="text-gray-500">Renewal Action By</div>
            <div className="font-mono text-gray-800">{lifecycle?.renewal_action_date}</div>
          </div>
          <div className="bg-gray-50 border border-gray-100 rounded p-3 space-y-1">
            <div className="text-gray-500">Available Actions</div>
            {lifecycle?.endorsement_available && <div className="text-blue-600 font-medium">Endorsement</div>}
            {lifecycle?.audit_available && <div className="text-blue-600 font-medium">Premium Audit</div>}
          </div>
        </div>
      </Panel>

      {pol?.form_schedule?.length > 0 && (
        <PolicyFormSchedule schedule={pol.form_schedule} policyId={pol.policy_id} effectiveDate={lifecycle?.effective_date} />
      )}

      {audit && (
        <Panel title="Rating Audit" className="mb-4">
          <RatingAuditCard audit={audit} />
        </Panel>
      )}

      {pol?.policy_id && (
        <div className="mt-4 flex gap-3">
          <button
            onClick={() => phaseC.downloadPolicyWorksheet(pol.policy_id)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded text-sm font-semibold transition-colors"
          >
            Download Rating Worksheet (PDF)
          </button>
          <button
            onClick={() => phaseC.downloadAuditPackage(pol.policy_id)}
            className="bg-gray-100 hover:bg-gray-200 border border-gray-300 text-gray-700 px-4 py-2 rounded text-sm font-medium transition-colors"
          >
            Download Audit Package (JSON)
          </button>
        </div>
      )}
    </div>
  );
}
