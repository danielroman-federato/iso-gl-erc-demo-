import { useState } from "react";

function Chevron({ collapsed }) {
  return (
    <svg
      width="12" height="12" viewBox="0 0 12 12" fill="none"
      className={`shrink-0 text-gray-400 transition-transform duration-150 ${collapsed ? "-rotate-90" : ""}`}
    >
      <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Panel({ title, children, className = "", defaultCollapsed = false }) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <div
      className={`bg-white border rounded-lg shadow-sm overflow-hidden ${className}`}
      style={{ borderColor: "#E8E5E2" }}
    >
      {title ? (
        <>
          <button
            type="button"
            onClick={() => setCollapsed(c => !c)}
            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
            style={{ borderBottom: collapsed ? "none" : "1px solid #F0EDEA" }}
          >
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{title}</h3>
            <Chevron collapsed={collapsed} />
          </button>
          {!collapsed && <div className="p-4">{children}</div>}
        </>
      ) : (
        <div className="p-4">{children}</div>
      )}
    </div>
  );
}
