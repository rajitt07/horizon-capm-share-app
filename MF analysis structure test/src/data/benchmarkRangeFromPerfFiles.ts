import type { ITimeframeYears } from "./types";
import { isPerformanceFileName, parsePerformanceFile } from "./parsers/parsePerformanceFile";

function fileLabel(f: File): string {
  return f.webkitRelativePath || f.name;
}

/**
 * Min–max of `Return {horizon}Y (%) Benchmark` for every parsed fund row whose category matches,
 * scoped to uploaded performance files.
 *
 * When `restrictToFileLabels` is non-empty, only those files (match `webkitRelativePath || name`) are
 * parsed — i.e. the union of source files for the selected funds in that category. When empty or
 * omitted, all performance files in `files` are used (legacy / missing provenance).
 */
export async function computeBenchmarkRangeForCategory(
  files: File[],
  category: string,
  horizon: ITimeframeYears,
  restrictToFileLabels?: Set<string>
): Promise<{ min: number; max: number } | null> {
  const values: number[] = [];
  let sorted = files.filter((f) => isPerformanceFileName(f.name));
  sorted.sort((a, b) => fileLabel(a).localeCompare(fileLabel(b), undefined, { numeric: true }));

  if (restrictToFileLabels && restrictToFileLabels.size > 0) {
    sorted = sorted.filter((f) => restrictToFileLabels.has(fileLabel(f)));
  }

  for (const file of sorted) {
    const { funds } = await parsePerformanceFile(file);
    for (const fund of funds.values()) {
      if (fund.category !== category) continue;
      const v = fund.returnsBenchmarkByHorizon[horizon];
      if (v !== null && v !== undefined && Number.isFinite(v)) values.push(v);
    }
  }
  if (!values.length) return null;
  return { min: Math.min(...values), max: Math.max(...values) };
}
