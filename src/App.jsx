import { useState, useEffect, useRef } from "react";
import { carriers as carriersApi } from "./api/client";
import Screen1_OpsDashboard from "./screens/Screen1_OpsDashboard";
import Screen2_DeviationManager from "./screens/Screen2_DeviationManager";
import Screen3_QuoteEntry from "./screens/Screen3_QuoteEntry";
import Screen4_RatingWorkbench from "./screens/Screen4_RatingWorkbench";
import Screen5_PolicyWorkspace from "./screens/Screen5_PolicyWorkspace";
import Screen6_DataBrowser from "./screens/Screen6_DataBrowser";
import Screen7_CircularAdoption from "./screens/Screen7_CircularAdoption";
import Screen8_ActuarialDag from "./screens/Screen8_ActuarialDag";
import Screen9_IsoPermissions from "./screens/Screen9_IsoPermissions";
import Screen0_Carriers from "./screens/Screen0_Carriers";
import MockScreen from "./screens/MockScreen";

// In the public demo build (VITE_MOCK=1) the quote/rate/bind flow requires a
// live backend, so Screens 3/4/5 render static screenshots instead.
const IS_DEMO = import.meta.env.VITE_MOCK === "1" || import.meta.env.VITE_MOCK === "true";

// ── Inline SVG icons ────────────────────────────────────────────────────────
function IconOps() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="1" width="6" height="6" rx="1.2" fill="currentColor" />
      <rect x="9" y="1" width="6" height="6" rx="1.2" fill="currentColor" opacity=".4" />
      <rect x="1" y="9" width="6" height="6" rx="1.2" fill="currentColor" opacity=".4" />
      <rect x="9" y="9" width="6" height="6" rx="1.2" fill="currentColor" />
    </svg>
  );
}
function IconDeviation() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="2" y1="4" x2="14" y2="4" />
      <circle cx="6" cy="4" r="1.5" fill="currentColor" stroke="none" />
      <line x1="2" y1="8" x2="14" y2="8" />
      <circle cx="10" cy="8" r="1.5" fill="currentColor" stroke="none" />
      <line x1="2" y1="12" x2="14" y2="12" />
      <circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}
function IconQuote() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="1" width="10" height="14" rx="1.5" />
      <line x1="5.5" y1="5" x2="10.5" y2="5" />
      <line x1="5.5" y1="8" x2="10.5" y2="8" />
      <line x1="5.5" y1="11" x2="8.5" y2="11" />
    </svg>
  );
}
function IconRating() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="12" height="12" rx="1.5" />
      <line x1="5" y1="5" x2="11" y2="5" />
      <line x1="5" y1="8" x2="8" y2="8" />
      <line x1="5" y1="11" x2="8" y2="11" />
      <line x1="10" y1="9" x2="10" y2="13" />
      <line x1="8" y1="11" x2="12" y2="11" />
    </svg>
  );
}
function IconPolicy() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 1.5L2.5 3.5V8c0 3 2.5 5 5.5 6.5C11 13 13.5 11 13.5 8V3.5L8 1.5z" />
      <polyline points="5.5,8 7.5,10 10.5,6" />
    </svg>
  );
}
function IconData() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="8" cy="4" rx="5.5" ry="2" />
      <path d="M2.5 4v3c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2V4" />
      <path d="M2.5 7v3c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2V7" />
    </svg>
  );
}
function IconCircular() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 2h7l3 3v9H3V2z" />
      <polyline points="10,2 10,5 13,5" />
      <line x1="5.5" y1="8" x2="10.5" y2="8" />
      <line x1="5.5" y1="11" x2="9" y2="11" />
    </svg>
  );
}
function IconActuarialDag() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="3" cy="3" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="13" cy="3" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="3" cy="13" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="13" cy="13" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none" />
      <line x1="4" y1="3" x2="7" y2="7" />
      <line x1="12" y1="3" x2="9" y2="7" />
      <line x1="4" y1="13" x2="7" y2="9" />
      <line x1="12" y1="13" x2="9" y2="9" />
    </svg>
  );
}

function IconCarriers() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 14V5l6-3 6 3v9" />
      <line x1="2" y1="14" x2="14" y2="14" />
      <rect x="5" y="8" width="2" height="3" fill="currentColor" stroke="none" />
      <rect x="9" y="8" width="2" height="3" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconIsoPermissions() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 1.5L2.5 4v4c0 3.2 2.3 5.7 5.5 6.5 3.2-.8 5.5-3.3 5.5-6.5V4L8 1.5z" />
      <path d="M5.5 8l1.7 1.7L10.5 6.5" />
    </svg>
  );
}

const NAV_ITEMS = [
  { id: 1, label: "Ops Dashboard",     sub: "Phase A", Icon: IconOps },
  { id: 2, label: "Deviation Manager", sub: "Phase B", Icon: IconDeviation },
  { id: 3, label: "Quote Entry",       sub: "Phase C", Icon: IconQuote },
  { id: 4, label: "Rating Workbench",  sub: "Phase C", Icon: IconRating },
  { id: 5, label: "Policy Workspace",  sub: "Phase C", Icon: IconPolicy },
  { id: 6, label: "Data Browser",      sub: "Content", Icon: IconData },
  { id: 7, label: "Circular Adoption", sub: "Phase D", Icon: IconCircular },
  { id: 8, label: "Actuarial DAG",      sub: "RS-2",      Icon: IconActuarialDag },
  { id: 0, label: "Carriers",          sub: "Workspace", Icon: IconCarriers },
  { id: 9, label: "ISO Permissions",   sub: "Admin",     Icon: IconIsoPermissions },
];

const SHELL_BG = "#2D1D1A";

function FederatoLogo({ height = 20 }) {
  const w = Math.round((82 / 12) * height);
  return (
    <svg width={w} height={height} viewBox="0 0 82 12" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M0.815918 0.909424H8.88041V2.85291H2.86091V5.10106H8.88041V7.01567H2.86091V11.0918H0.815918V0.909424Z" fill="white"/>
      <path d="M10.4314 0.911469H18.5974V2.84101H12.4764V5.03142H18.5974V6.96096H12.4764V9.1653H18.5974V11.0948H10.4314V0.911469Z" fill="white"/>
      <path d="M20.4521 0.911469H24.9195C28.1254 0.911469 29.8368 2.7534 29.8368 6.00316C29.8368 9.25292 28.1254 11.0948 24.9195 11.0948H20.4521V0.911469ZM24.7741 9.1653C26.848 9.1653 27.7769 7.99045 27.7769 5.98822C27.7769 3.986 26.849 2.84101 24.7741 2.84101H22.4971V9.1653H24.7741Z" fill="white"/>
      <path d="M31.2791 0.909424H39.4451V2.83897H33.324V5.02937H39.4451V6.95892H33.324V9.16326H39.4451V11.0928H31.2791V0.909424Z" fill="white"/>
      <path d="M41.2979 0.911469H47.3174C49.3773 0.911469 50.4068 2.01364 50.4068 3.78388C50.4068 4.91493 49.8701 5.82892 49.0139 6.07584C49.899 6.17739 50.3191 6.8156 50.3191 7.58423V11.0948H48.2742V8.06313C48.2742 7.52648 48.1149 7.14914 47.3891 7.14914H43.3419V11.0948H41.2969V0.911469H41.2979ZM47.0426 5.24847C47.9705 5.24847 48.3478 4.75562 48.3478 4.0298C48.3478 3.24624 47.9705 2.82608 47.0137 2.82608H43.3439V5.24847H47.0426Z" fill="white"/>
      <path d="M55.4656 0.911469H58.5988L62.8202 11.0939H60.5721L59.4989 8.46836H54.4949L53.3927 11.0939H51.2024L55.4656 0.911469ZM58.7721 6.62643L56.9879 2.34718L55.2038 6.62643H58.7721Z" fill="white"/>
      <path d="M65.3462 2.85495H61.5459V0.911469H71.2502V2.85495H67.4937V11.0939H65.3472V2.85495H65.3462Z" fill="white"/>
      <path d="M71.5132 5.98558C71.5132 2.89612 73.7473 0.734589 76.7352 0.734589H76.7641C79.7519 0.734589 82 2.89612 82 5.98558C82 9.07504 79.7519 11.2654 76.7641 11.2654H76.7352C73.7473 11.2654 71.5132 9.08998 71.5132 5.98558ZM76.7501 9.29309C78.592 9.29309 79.9411 7.98781 79.9411 6.00051C79.9411 4.01322 78.592 2.70794 76.7501 2.70794C74.9082 2.70794 73.5731 4.02816 73.5731 6.00051C73.5731 7.97287 74.9222 9.29309 76.7501 9.29309Z" fill="white"/>
    </svg>
  );
}

function CarrierSwitcher({ carriers, currentCarrierId, onPick, onManage }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onDocClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const current = carriers.find(c => c.carrier_id === currentCarrierId);
  const active = carriers.filter(c => c.impl_status === "ACTIVE" && c.onboarding_status !== "legacy");
  const legacy = carriers.filter(c => c.onboarding_status === "legacy" || c.impl_status === "DRAFT");

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 rounded px-2.5 py-1 text-xs font-medium transition-colors"
        style={{
          backgroundColor: open ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.18)",
          color: "rgba(255,255,255,0.9)",
        }}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 14V5l6-3 6 3v9" /><line x1="2" y1="14" x2="14" y2="14" />
        </svg>
        <span className="font-semibold">
          {current ? current.carrier_name : "No carrier selected"}
        </span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2.5 4l2.5 2.5L7.5 4" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-72 rounded-lg shadow-2xl overflow-hidden z-50"
          style={{ backgroundColor: "#fff", border: "1px solid #E0E0E0" }}>
          <div className="px-3 py-2 text-[10px] uppercase tracking-wider font-bold text-gray-500 bg-gray-50 border-b border-gray-200">
            Active carriers ({active.length})
          </div>
          {active.length === 0 ? (
            <div className="px-3 py-3 text-xs text-gray-400 italic">
              No onboarded carriers yet. Use "+ New Carrier" on the Carriers screen.
            </div>
          ) : (
            <div className="max-h-60 overflow-y-auto">
              {active.map(c => (
                <button key={c.carrier_id} onClick={() => { onPick(c.carrier_id); setOpen(false); }}
                  className={`w-full text-left px-3 py-2 hover:bg-blue-50 border-b border-gray-100 text-xs ${
                    c.carrier_id === currentCarrierId ? "bg-blue-50" : ""
                  }`}>
                  <div className="font-semibold text-gray-800">{c.carrier_name}</div>
                  <div className="text-[10px] text-gray-500 font-mono">
                    {c.carrier_id} · {c.cw_count} CW · {c.state_count} states
                  </div>
                </button>
              ))}
            </div>
          )}
          {legacy.length > 0 && (
            <>
              <div className="px-3 py-2 text-[10px] uppercase tracking-wider font-bold text-amber-700 bg-amber-50 border-y border-amber-200">
                Legacy / DRAFT ({legacy.length})
              </div>
              <div className="max-h-32 overflow-y-auto">
                {legacy.map(c => (
                  <button key={c.carrier_id} onClick={() => { onManage(); setOpen(false); }}
                    className="w-full text-left px-3 py-2 hover:bg-amber-50 border-b border-gray-100 text-xs">
                    <div className="font-semibold text-gray-800">{c.carrier_name}</div>
                    <div className="text-[10px] text-amber-700">{c.carrier_id} · needs onboarding</div>
                  </button>
                ))}
              </div>
            </>
          )}
          <button onClick={() => { onManage(); setOpen(false); }}
            className="w-full text-left px-3 py-2 hover:bg-gray-50 text-xs font-semibold text-blue-600 border-t border-gray-200">
            Manage carriers →
          </button>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [active, setActive] = useState(1);
  const [quoteId, setQuoteId] = useState(null);
  const [bindResult, setBindResult] = useState(null);
  const [currentCarrierId, setCurrentCarrierId] = useState(null);
  const [carrierList, setCarrierList] = useState([]);
  const [carrierRefreshKey, setCarrierRefreshKey] = useState(0);
  const [screen0InitialCarrier, setScreen0InitialCarrier] = useState(null);

  useEffect(() => {
    carriersApi.list().then(setCarrierList).catch(() => {});
  }, [carrierRefreshKey]);

  function handleRated(qid) { setQuoteId(qid); setActive(4); }
  function handleBound(result) { setBindResult(result); setActive(5); }

  function handleCarrierPick(carrier_id) {
    setCurrentCarrierId(carrier_id);
    setScreen0InitialCarrier(carrier_id);
    setActive(0);
  }
  function handleManageCarriers() {
    setScreen0InitialCarrier(null);
    setActive(0);
  }
  function handleScreen0CarrierActivated(carrier_id) {
    setCurrentCarrierId(carrier_id);
    setCarrierRefreshKey(k => k + 1);
  }

  const activeItem = NAV_ITEMS.find(n => n.id === active);

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ fontFamily: "'Inter', sans-serif", backgroundColor: SHELL_BG }}
    >
      <div className="flex flex-1 flex-col min-w-0 min-h-0">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <header className="flex items-center px-5 shrink-0" style={{ height: "68px", backgroundColor: SHELL_BG }}>

          {/* Wordmark */}
          <div className="flex items-center gap-3">
            <FederatoLogo height={22} />

            {/* Prototype badge */}
            <span
              className="ml-1 inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest select-none"
              style={{
                border: "1px solid rgba(255,255,255,0.22)",
                color: "rgba(255,255,255,0.65)",
                backgroundColor: "rgba(255,255,255,0.07)",
                letterSpacing: "0.12em",
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full animate-pulse"
                style={{ backgroundColor: "#F59E0B" }}
              />
              Prototype
            </span>
          </div>

          {/* Right side — workspace switcher + breadcrumb + quote crumb */}
          <div className="ml-auto flex items-center gap-3">
            <CarrierSwitcher
              carriers={carrierList}
              currentCarrierId={currentCarrierId}
              onPick={handleCarrierPick}
              onManage={handleManageCarriers}
            />
            {quoteId && active >= 3 && (
              <span
                className="text-[10px] font-mono rounded px-2 py-1"
                style={{ color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.12)" }}
              >
                {quoteId}
              </span>
            )}
            <span
              className="text-xs font-medium"
              style={{ color: "rgba(255,255,255,0.45)" }}
            >
              {activeItem?.sub}
            </span>
            <span style={{ color: "rgba(255,255,255,0.2)" }} className="text-sm">/</span>
            <span
              className="text-sm font-medium"
              style={{ color: "rgba(255,255,255,0.8)" }}
            >
              {activeItem?.label}
            </span>
          </div>
        </header>

        {/* ── Body row: sidebar + content card ───────────────────────────── */}
        <div className="flex flex-1 min-w-0 min-h-0">

          {/* Sidebar — narrow, icon-only */}
          <nav className="flex flex-col items-center py-2 gap-0.5" style={{ width: "52px", backgroundColor: SHELL_BG }}>
            {NAV_ITEMS.map(({ id, Icon, label }) => {
              const isActive = active === id;
              return (
                <button
                  key={id}
                  onClick={() => setActive(id)}
                  title={label}
                  className="flex items-center justify-center rounded-lg transition-all"
                  style={{
                    width: "36px",
                    height: "36px",
                    color: isActive ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.30)",
                    backgroundColor: isActive ? "rgba(255,255,255,0.12)" : "transparent",
                  }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = "rgba(255,255,255,0.65)"; }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = "rgba(255,255,255,0.30)"; }}
                >
                  <Icon />
                </button>
              );
            })}
          </nav>

          {/* Content card — rounded, floats inside the dark shell */}
          <div className="flex-1 min-w-0 pb-3 pr-3">
            <div className="h-full rounded-2xl overflow-hidden flex flex-col" style={{ backgroundColor: "#F8F7F6" }}>

              {/* Sub-header breadcrumb bar */}
              <div className="flex items-center gap-2 px-5 border-b shrink-0" style={{ height: "40px", borderColor: "#E8E5E2" }}>
                <span className="text-xs text-gray-400 font-medium">ISO GL ERC 2.0</span>
                <span className="text-gray-300 text-xs">/</span>
                <span className="text-xs text-gray-600 font-medium">{activeItem?.label}</span>
              </div>

              {/* Scrollable screen content */}
              <div className="flex-1 overflow-auto" style={{ backgroundColor: "#F8F7F6" }}>
                {active === 0 && (
                  <Screen0_Carriers
                    initialCarrierId={screen0InitialCarrier}
                    onCarrierActivated={handleScreen0CarrierActivated}
                    onClearInitial={() => setScreen0InitialCarrier(null)}
                  />
                )}
                {active === 1 && <Screen1_OpsDashboard />}
                {active === 2 && <Screen2_DeviationManager />}
                {active === 3 && (IS_DEMO
                  ? <MockScreen id="screen3" title="Quote Entry" subtitle="Risk and class data entry. In the working prototype this drives a live rating call." caption="Screen 3 — drop screen3.png at frontend/public/mocks/ to replace this placeholder." />
                  : <Screen3_QuoteEntry onRated={handleRated} />)}
                {active === 4 && (IS_DEMO
                  ? <MockScreen id="screen4" title="Rating Workbench" subtitle="Live rating with diff banner and premium breakout. Edits trigger a rerate; the diff strip shows what changed." caption="Screen 4 — drop screen4.png at frontend/public/mocks/ to replace this placeholder." />
                  : <Screen4_RatingWorkbench quoteId={quoteId} onBound={handleBound} />)}
                {active === 5 && (IS_DEMO
                  ? <MockScreen id="screen5" title="Policy Workspace" subtitle="Bound policy view with audit package, schedule of forms, and worksheet PDF." caption="Screen 5 — drop screen5.png at frontend/public/mocks/ to replace this placeholder." />
                  : <Screen5_PolicyWorkspace bindResult={bindResult} />)}
                {active === 6 && <Screen6_DataBrowser currentCarrierId={currentCarrierId} />}
                {active === 7 && <Screen7_CircularAdoption />}
                {active === 8 && <Screen8_ActuarialDag />}
                {active === 9 && (
                  <Screen9_IsoPermissions
                    currentCarrierId={currentCarrierId}
                    carriers={carrierList}
                    onPickCarrier={setCurrentCarrierId}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
