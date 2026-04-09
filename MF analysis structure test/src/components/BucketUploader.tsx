import React from "react";
import { isPerformanceFileName } from "../data/parsers/parsePerformanceFile";
import { DataStatusLight } from "./DataStatusLight";

/** Bucket file pickers; parent runs Process Analysis on uploaded files. */
export default function BucketUploader(props: {
  bucketName: string;
  embedded?: boolean;
  perfFiles: File[];
  onPerfFilesChange: (files: File[]) => void;
  terFile: File | null;
  onTerFileChange: (f: File | null) => void;
}) {
  const { bucketName, embedded, perfFiles, onPerfFilesChange, terFile, onTerFileChange } = props;

  const hint =
    perfFiles.length && terFile
      ? `${perfFiles.length} performance file(s), TER ready — use Process Analysis.`
      : "Add Performance (CSV/XLSX) + TER, then Process Analysis.";

  const perfOk = perfFiles.length > 0;
  const terOk = Boolean(terFile);

  const inner = (
    <>
      {!embedded ? (
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="section-title">{bucketName}</div>
            <div className="text-sm text-slate-400">Configure files, then run Process Analysis below the upload row.</div>
          </div>
        </div>
      ) : (
        <div className="text-xs text-slate-500 whitespace-pre-wrap min-h-[2.25rem] leading-snug">{hint}</div>
      )}

      <div className="grid grid-cols-1 gap-3 mt-1">
        <PerformanceDrop files={perfFiles} onFiles={onPerfFilesChange} dataOk={perfOk} />
        <FileDrop
          label="TER File (CSV)"
          hint="Total Expense Ratio (Direct Plan)"
          accept=".csv"
          file={terFile}
          onFile={onTerFileChange}
          dataOk={terOk}
        />
      </div>
    </>
  );

  if (embedded) {
    return <div className="relative">{inner}</div>;
  }

  return <section className="panel">{inner}</section>;
}

function pickPerfFilesFromList(list: FileList | null): File[] {
  if (!list?.length) return [];
  return Array.from(list).filter((f) => isPerformanceFileName(f.name));
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
    </svg>
  );
}

function PerformanceDrop(props: { files: File[]; onFiles: (files: File[]) => void; dataOk: boolean }) {
  const { files, onFiles, dataOk } = props;
  const [dragOver, setDragOver] = React.useState(false);

  const summary =
    files.length === 0
      ? "Drop files or use buttons"
      : files.length === 1
        ? files[0].name
        : `${files.length} files — ${files[0].name}${files.length > 1 ? " …" : ""}`;

  function handleFiles(list: FileList | null) {
    const picked = pickPerfFilesFromList(list);
    onFiles(picked);
  }

  const folderInputProps = { webkitdirectory: "", directory: "" } as React.InputHTMLAttributes<HTMLInputElement>;

  return (
    <div
      className={`file-drop flex gap-3 ${dragOver ? "drag-over" : ""}`}
      onDragEnter={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        handleFiles(e.dataTransfer.files);
      }}
    >
      <div className="shrink-0 rounded-lg bg-slate-800/80 p-2 text-[#3b82f6]">
        <UploadIcon className="h-6 w-6" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-semibold text-slate-200">Performance</div>
          <DataStatusLight ok={dataOk} label={dataOk ? "Files added" : "No files"} />
        </div>
        <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">
          CSV / XLSX — returns + benchmark. Folder or multi-file merges; duplicate schemes use last file.
        </div>
        <div className="text-[11px] text-slate-400 mt-1.5 truncate" title={summary}>
          {summary}
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          <label className="ghost-button inline-flex items-center cursor-pointer text-xs py-1.5 px-3">
            File(s)
            <input className="hidden" type="file" accept=".csv,.xlsx,.xls" multiple onChange={(e) => handleFiles(e.target.files)} />
          </label>
          <label className="ghost-button inline-flex items-center cursor-pointer text-xs py-1.5 px-3">
            Folder
            <input className="hidden" type="file" multiple {...folderInputProps} onChange={(e) => handleFiles(e.target.files)} />
          </label>
        </div>
      </div>
    </div>
  );
}

function FileDrop(props: {
  label: string;
  hint: string;
  accept: string;
  file: File | null;
  onFile: (file: File) => void;
  dataOk: boolean;
}) {
  const { label, hint, accept, file, onFile, dataOk } = props;
  const [dragOver, setDragOver] = React.useState(false);

  function handlePick(f: File | null) {
    if (!f) return;
    onFile(f);
  }

  return (
    <div
      className={`file-drop flex gap-3 ${dragOver ? "drag-over" : ""}`}
      onDragEnter={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        handlePick(e.dataTransfer.files?.[0] ?? null);
      }}
    >
      <div className="shrink-0 rounded-lg bg-slate-800/80 p-2 text-[#3b82f6]">
        <UploadIcon className="h-6 w-6" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-semibold text-slate-200">{label}</div>
          <DataStatusLight ok={dataOk} label={dataOk ? "File selected" : "No file"} />
        </div>
        <div className="text-[11px] text-slate-500 mt-0.5">{hint}</div>
        <div className="text-[11px] text-slate-400 mt-1.5 truncate">{file ? file.name : "No file yet"}</div>
        <label className="ghost-button inline-flex items-center cursor-pointer text-xs py-1.5 px-3 mt-2">
          Choose file
          <input className="hidden" type="file" accept={accept} onChange={(e) => handlePick(e.target.files?.[0] ?? null)} />
        </label>
      </div>
    </div>
  );
}
