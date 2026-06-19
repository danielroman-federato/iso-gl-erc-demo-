// Static screenshot panel used in the public demo build for screens that
// would require a live backend to drive (Quote Entry, Rating Workbench,
// Policy Workspace). Renders a screenshot from /public/mocks/<id>.png
// with a banner that labels the image honestly.
//
// To replace the placeholder: drop a PNG/JPG at frontend/public/mocks/<id>.png
// (e.g. screen3.png, screen4.png, screen5.png). On Vite build the file is
// served from the deployed site at <base>/mocks/<id>.png.

import { useState } from "react";

export default function MockScreen({ id, title, subtitle, caption }) {
  const [imgFailed, setImgFailed] = useState(false);
  const src = `${import.meta.env.BASE_URL}mocks/${id}.png`;

  return (
    <div className="p-6 text-gray-900">
      <div className="mb-4 flex items-center gap-3">
        <div className="w-2 h-2 rounded-full bg-blue-500" />
        <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] uppercase tracking-wide font-semibold">
          Demo Mock
        </span>
      </div>

      {subtitle && (
        <p className="text-gray-500 text-sm mb-4 max-w-3xl">{subtitle}</p>
      )}

      <div className="bg-amber-50 border border-amber-200 rounded px-4 py-2 text-xs text-amber-900 mb-4 max-w-3xl">
        <strong>Static screenshot.</strong> This screen is part of the live-backend flow
        (quote → rate → bind). The working prototype renders it end-to-end against the
        real rating engine. Here we show the visual only — the interactive flow is in
        the private working-prototype repo.
      </div>

      <div className="rounded-lg border border-gray-200 overflow-hidden bg-white max-w-5xl">
        {imgFailed ? (
          <div className="aspect-[16/10] flex items-center justify-center text-gray-400 text-sm bg-gray-50">
            <div className="text-center px-6">
              <div className="text-base text-gray-600 mb-1">Screenshot pending</div>
              <div className="text-xs">
                Drop a PNG at <code className="font-mono bg-white px-1 py-0.5 rounded border">frontend/public/mocks/{id}.png</code> and redeploy.
              </div>
            </div>
          </div>
        ) : (
          <img
            src={src}
            alt={`${title} screenshot`}
            className="w-full h-auto block"
            onError={() => setImgFailed(true)}
          />
        )}
      </div>

      {caption && (
        <p className="text-xs text-gray-500 mt-3 max-w-3xl italic">{caption}</p>
      )}
    </div>
  );
}
