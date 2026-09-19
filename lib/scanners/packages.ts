import type { Finding, RepoFile } from "../types";

const POPULAR_NPM = [
  "react", "react-dom", "next", "express", "lodash", "axios", "typescript", "vite", "webpack", "firebase",
  "@supabase/supabase-js", "dotenv", "zod", "prisma", "mongoose", "cors", "jsonwebtoken", "bcrypt", "chalk", "commander",
  "tailwindcss", "eslint", "prettier", "vitest", "jest", "node-fetch", "uuid", "date-fns", "framer-motion", "lucide-react",
];
const POPULAR_PYPI = [
  "requests", "numpy", "pandas", "flask", "django", "fastapi", "boto3", "sqlalchemy", "pytest", "pydantic",
  "beautifulsoup4", "scikit-learn", "matplotlib", "tensorflow", "torch", "uvicorn", "python-dotenv", "cryptography", "celery", "redis",
];

interface NpmMetadata { time?: { created?: string } }
interface PyPiMetadata { releases?: Record<string, Array<{ upload_time_iso?: string; upload_time?: string }>> }
interface DownloadResponse { downloads?: number }

function levenshtein(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
}

function lookalike(name: string, popular: string[]): string | undefined {
  return popular.find(candidate => candidate !== name && levenshtein(name.toLowerCase(), candidate.toLowerCase()) === 1);
}

function parseNpmNames(files: RepoFile[]): string[] {
  const names = new Set<string>();
  for (const file of files.filter(candidate => candidate.path.toLowerCase().endsWith("package.json"))) {
    try {
      const parsed = JSON.parse(file.content) as Record<string, unknown>;
      for (const field of ["dependencies", "devDependencies", "optionalDependencies"]) {
        const dependencies = parsed[field];
        if (!dependencies || typeof dependencies !== "object") continue;
        for (const name of Object.keys(dependencies as Record<string, unknown>)) {
          const version = String((dependencies as Record<string, unknown>)[name] ?? "");
          if (!/^file:|^link:|^workspace:|^git:|^https?:|^npm:/i.test(version)) names.add(name);
        }
      }
    } catch {
      // Ignore malformed manifests; the other scanners can still inspect them.
    }
  }
  return Array.from(names).slice(0, 40);
}

function parsePythonNames(files: RepoFile[]): string[] {
  const names = new Set<string>();
  for (const file of files.filter(candidate => candidate.path.toLowerCase().split("/").pop() === "requirements.txt")) {
    for (const rawLine of file.content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#") || /^-(r|e)\b/i.test(line) || /^(git\+|https?:)/i.test(line)) continue;
      const name = line.split(/[<>=!~;\s]/, 1)[0]?.replace(/\[[^\]]*\]$/, "").trim();
      if (name && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name)) names.add(name.toLowerCase());
    }
  }
  return Array.from(names).slice(0, 40);
}

async function fetchWithTimeout<T>(url: string): Promise<{ status: number; data?: T }> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8_000), headers: { "User-Agent": "VibeGuard-security-checker" } });
    if (!response.ok) return { status: response.status };
    return { status: response.status, data: await response.json() as T };
  } catch {
    return { status: 0 };
  }
}

async function scanNpmPackage(name: string, file: string): Promise<Finding[]> {
  const downloadsResult = await fetchWithTimeout<DownloadResponse>(`https://api.npmjs.org/downloads/point/last-week/${encodeURIComponent(name)}`);
  if (!downloadsResult.data || downloadsResult.data.downloads === undefined) return [];
  const downloads = downloadsResult.data.downloads;
  if (downloads >= 100_000) return [];
  const registryResult = await fetchWithTimeout<NpmMetadata>(`https://registry.npmjs.org/${encodeURIComponent(name)}`);
  if (registryResult.status === 404) {
    return [{ id: "", module: "packages", severity: "critical", title: `${name} does not exist on npm`, detail: "This dependency is not published in the npm registry. AI-generated apps sometimes hallucinate package names, and attackers can register them later with malware.", file }];
  }
  if (!registryResult.data) return [];
  const findings: Finding[] = [];
  const typo = lookalike(name, POPULAR_NPM);
  if (typo && downloads < 10_000) findings.push({ id: "", module: "packages", severity: "high", title: `${name} looks like ${typo}`, detail: `This package is one character away from the popular ${typo} package and has only ${downloads.toLocaleString()} weekly downloads. Confirm the dependency name before installing it.`, file });
  const created = registryResult.data.time?.created ? new Date(registryResult.data.time.created).getTime() : 0;
  const ageDays = created ? (Date.now() - created) / 86_400_000 : Infinity;
  if (ageDays < 30 && downloads < 500) findings.push({ id: "", module: "packages", severity: "high", title: `${name} is brand new and barely used`, detail: `The package was published less than 30 days ago and has ${downloads.toLocaleString()} downloads this week. Review its source and maintainer before trusting it.`, file });
  else if (downloads < 100) findings.push({ id: "", module: "packages", severity: "medium", title: `${name} has very low adoption`, detail: "This package has fewer than 100 downloads this week. Low adoption is not proof of malware, but it increases the need for a source review.", file });
  return findings;
}

async function scanPyPiPackage(name: string, file: string): Promise<Finding[]> {
  const result = await fetchWithTimeout<PyPiMetadata>(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`);
  if (result.status === 404) return [{ id: "", module: "packages", severity: "critical", title: `${name} does not exist on PyPI`, detail: "This dependency is not published on PyPI. Check for an AI-hallucinated name or a typo before installing it.", file }];
  if (!result.data) return [];
  const timestamps = Object.values(result.data.releases ?? {}).flat().map(release => release.upload_time_iso ?? release.upload_time).filter(Boolean).map(value => new Date(value!).getTime()).filter(Number.isFinite);
  const ageDays = timestamps.length ? (Date.now() - Math.min(...timestamps)) / 86_400_000 : Infinity;
  const typo = lookalike(name, POPULAR_PYPI);
  if (typo && ageDays < 180) return [{ id: "", module: "packages", severity: "high", title: `${name} is a young lookalike of ${typo}`, detail: `This PyPI package is one character away from ${typo} and its earliest release is less than six months old. Confirm the package name and inspect its source.`, file }];
  if (ageDays < 30) return [{ id: "", module: "packages", severity: "high", title: `${name} was published less than 30 days ago`, detail: "New dependencies deserve extra scrutiny. Review the maintainer, source repository, and install scripts before shipping.", file }];
  return [];
}

async function batches<T, R>(items: T[], size: number, worker: (item: T) => Promise<R[]>): Promise<R[]> {
  const results: R[] = [];
  for (let index = 0; index < items.length; index += size) results.push(...(await Promise.all(items.slice(index, index + size).map(worker))).flat());
  return results;
}

export async function scanPackages(files: RepoFile[]): Promise<Finding[]> {
  const packageFiles = files.filter(file => file.path.toLowerCase().endsWith("package.json"));
  const requirementsFiles = files.filter(file => file.path.toLowerCase().split("/").pop() === "requirements.txt");
  const npmFindings = await batches(parseNpmNames(files), 10, name => scanNpmPackage(name, packageFiles[0]?.path ?? "package.json"));
  const pythonFindings = await batches(parsePythonNames(files), 10, name => scanPyPiPackage(name, requirementsFiles[0]?.path ?? "requirements.txt"));
  return [...npmFindings, ...pythonFindings];
}
