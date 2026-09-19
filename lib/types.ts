export type Severity = "critical" | "high" | "medium" | "low";

export type FindingModule = "packages" | "secrets" | "backend";

export interface Finding {
  id: string;
  module: FindingModule;
  severity: Severity;
  title: string;
  detail: string;
  file?: string;
  line?: number;
}

export interface RepoFile {
  path: string;
  content: string;
}

export interface Explanation {
  summary: string;
  fixPrompt: string;
}

export interface ScanResult {
  repo: string;
  score: number;
  filesScanned: number;
  findings: Finding[];
  explanation: Explanation;
}
