import { explain } from "../../../lib/explain";
import { fetchRepoFiles, parseRepoUrl } from "../../../lib/github";
import { computeScore, sortFindings } from "../../../lib/score";
import { scanBackendConfig } from "../../../lib/scanners/backend-config";
import { scanPackages } from "../../../lib/scanners/packages";
import { scanSecrets } from "../../../lib/scanners/secrets";
import type { Finding, ScanResult } from "../../../lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json() as { repoUrl?: unknown };
    if (typeof body.repoUrl !== "string" || !body.repoUrl.trim()) {
      return Response.json({ error: "Paste a public GitHub repository URL to start a scan." }, { status: 400 });
    }

    const parsed = parseRepoUrl(body.repoUrl);
    const { files, totalFiles } = await fetchRepoFiles(parsed.owner, parsed.repo);
    if (files.length === 0) {
      return Response.json({ error: "No scannable text files were found in that repository. It may be empty, binary-only, or over the scan limits." }, { status: 422 });
    }

    const findings = sortFindings((await Promise.all([
      scanPackages(files),
      scanSecrets(files),
      Promise.resolve(scanBackendConfig(files)),
    ])).flat()).map((finding, index): Finding => ({ ...finding, id: `finding-${index + 1}` }));
    const repo = `${parsed.owner}/${parsed.repo}`;
    const result: ScanResult = {
      repo,
      score: computeScore(findings),
      filesScanned: files.length,
      totalFiles,
      findings,
      explanation: await explain(findings, repo),
    };
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The scan could not be completed. Try again.";
    return Response.json({ error: message }, { status: 400 });
  }
}
