import type { Finding, RepoFile } from "../types";

const GENERIC_DUMMY_WORDS = /your|xxx|example|placeholder|changeme|super|test|dummy|fake|password123|secret123/i;
const GENERIC_SKIP_PATH = /(^|\/)(test|tests|__tests__|fixtures|mocks|examples|demo)(\/|$)|\.(test|spec)\./i;

function mask(value: string): string {
  const clean = value.replace(/["'`\s]/g, "");
  if (clean.length <= 8) return "•••";
  return `${clean.slice(0, 5)}…${clean.slice(-2)}`;
}

function finding(file: string, line: number, severity: Finding["severity"], title: string, detail: string, match: string): Finding {
  return { id: "", module: "secrets", severity, title, detail: `${detail} Detected value: ${mask(match)}`, file, line };
}

export function scanSecrets(files: RepoFile[]): Finding[] {
  const findings: Finding[] = [];
  for (const file of files) {
    const basename = file.path.toLowerCase().split("/").pop() ?? file.path.toLowerCase();
    if (basename.startsWith(".env") && !/[.]example$|[.]sample$|[.]template$/i.test(basename)) {
      findings.push({ id: "", module: "secrets", severity: "high", title: "Environment file is committed", detail: "This .env file is committed to the repository. Remove it from history and rotate every key it may contain.", file: file.path });
    }
    if (/[.]example$|[.]sample$|[.]template$/i.test(basename)) continue;
    const lines = file.content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? "";
      if (line.length > 2_000) continue;
      const candidate = line.match(/(?:=|:|=>)\s*["'`]([^"'`\s]+)["'`]?/);
      const rawValue = candidate?.[1] ?? "";
      const privateKey = line.match(/-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/);
      const apiKey = line.match(/\b(sk-(?:ant-|proj-)?[A-Za-z0-9_-]{8,}|sk_live_[A-Za-z0-9]{8,})\b/i);
      const aws = line.match(/\bAKIA[0-9A-Z]{16}\b/);
      const github = line.match(/\bgh[pousr]_[A-Za-z0-9]{20,}\b/);
      const google = line.match(/\bAIza[0-9A-Za-z_-]{20,}\b/);
      const publicSecret = line.match(/\b(?:NEXT_PUBLIC|VITE|REACT_APP|EXPO_PUBLIC)_[A-Z0-9_]*(?:SECRET|SERVICE_ROLE|PRIVATE|PASSWORD)[A-Z0-9_]*\b\s*(?:=|:)\s*["'`]?([^"'`\s]+)["'`]?/i);
      const generic = line.match(/\b(?:api[_-]?key|secret|token|password)\b\s*(?:=|:)\s*["'`]([^"'`]{16,})["'`]/i);
      if (privateKey) findings.push(finding(file.path, index + 1, "critical", "Private key committed in source", "Private keys grant direct access to infrastructure or signing systems. Revoke and rotate the key immediately.", privateKey[0]));
      else if (apiKey) findings.push(finding(file.path, index + 1, "critical", "AI provider or Stripe secret key exposed", "This secret can be used to spend money or access a provider account. Revoke it, move it server-side, and rotate it.", apiKey[1]));
      else if (aws) findings.push(finding(file.path, index + 1, "critical", "AWS access key exposed", "An AWS access key in source can be used to access cloud resources. Revoke it and check CloudTrail for misuse.", aws[0]));
      else if (github) findings.push(finding(file.path, index + 1, "critical", "GitHub token exposed", "Revoke this token and issue a least-privilege replacement through environment variables or a secret manager.", github[0]));
      else if (publicSecret) findings.push(finding(file.path, index + 1, "critical", "Secret exposed to the browser", "Anything prefixed with a public environment variable is bundled for browsers. Keep service-role, private, and password values server-side.", publicSecret[1] ?? publicSecret[0]));
      else if (google) findings.push(finding(file.path, index + 1, "medium", "Google or Firebase API key in source", "Firebase web keys are designed to be public, but restrict them by domain, API, and quota in Google Cloud.", google[0]));
      else if (generic && rawValue.length >= 16 && !GENERIC_SKIP_PATH.test(file.path) && !GENERIC_DUMMY_WORDS.test(rawValue)) findings.push(finding(file.path, index + 1, "medium", "Hardcoded secret in code", "Move this value to an environment variable or managed secret and rotate it if it has ever been real.", generic[1]));
    }
  }
  return findings;
}
