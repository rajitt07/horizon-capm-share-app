import { PipelineError } from "./data/processAnalysis";

export type ProcessFailure = {
  title: string;
  summary: string;
  hints: string[];
  technicalDetail?: string;
};

export function formatProcessFailure(e: unknown): ProcessFailure {
  if (e instanceof PipelineError) {
    const hints: string[] = [];
    if (/Parse|TER|performance/i.test(e.stepName)) {
      hints.push("Ensure each sheet has a header row containing “Scheme Name” and return columns.");
      hints.push("TER must be a .csv with scheme names aligned to the performance export.");
    }
    return {
      title: `Step ${e.step}: ${e.stepName}`,
      summary: e.message,
      hints,
      technicalDetail: e.detail
    };
  }

  if (e instanceof Error) {
    return {
      title: "Process failed",
      summary: e.message,
      hints: ["Check the process log above the button for the step that failed."]
    };
  }

  return {
    title: "Process failed",
    summary: String(e),
    hints: []
  };
}
