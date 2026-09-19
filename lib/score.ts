import type { Finding, Severity } from "./types";

export const severityRank: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const deductions: Record<Severity, number> = { critical: 25, high: 12, medium: 5, low: 2 };

export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || a.title.localeCompare(b.title));
}

export function computeScore(findings: Finding[]): number {
  const score = findings.reduce((total, finding) => total - deductions[finding.severity], 100);
  return Math.max(0, score);
}
