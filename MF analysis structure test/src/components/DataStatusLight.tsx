import React from "react";

/** Green = ready / valid, Red = missing / invalid */
export function DataStatusLight(props: { ok: boolean; label?: string }) {
  const { ok, label } = props;
  return (
    <span className="inline-flex items-center gap-1.5" title={label}>
      <span
        className={`inline-block h-2 w-2 shrink-0 rounded-full shadow-[0_0_8px_currentColor] ${
          ok ? "bg-emerald-500 text-emerald-500" : "bg-red-500 text-red-500"
        }`}
      />
    </span>
  );
}
