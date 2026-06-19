const variants = {
  READY:       "bg-green-50 text-green-700 border border-green-200",
  BLOCKED:     "bg-red-50 text-red-700 border border-red-200",
  IN_PROGRESS: "bg-blue-50 text-blue-700 border border-blue-200",
  COMPLETE:    "bg-green-50 text-green-700 border border-green-200",
  PENDING:     "bg-amber-50 text-amber-700 border border-amber-200",
  ACTIVE:      "bg-emerald-50 text-emerald-700 border border-emerald-200",
  LIVE:        "bg-emerald-50 text-emerald-700 border border-emerald-200",
  PASS:        "bg-green-50 text-green-700 border border-green-200",
  WARN:        "bg-amber-50 text-amber-700 border border-amber-200",
  FAIL:        "bg-red-50 text-red-700 border border-red-200",
  INFO:        "bg-blue-50 text-blue-700 border border-blue-200",
};

export function Badge({ label, variant }) {
  const cls = variants[variant] || variants.INFO;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-semibold ${cls}`}>
      {label}
    </span>
  );
}
