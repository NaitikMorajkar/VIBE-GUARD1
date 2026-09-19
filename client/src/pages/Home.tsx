import { useMemo, useState } from "react";
import type { Finding, FindingModule, ScanResult } from "../../../lib/types";
import "./home.css";

const GROUPS: Array<{ key: FindingModule; title: string; eyebrow: string }> = [
  { key: "packages", title: "Packages", eyebrow: "Supply chain" },
  { key: "secrets", title: "Keys and secrets", eyebrow: "Credentials" },
  { key: "backend", title: "Database and backend setup", eyebrow: "Access control" },
];

function verdict(score: number): { label: string; tone: string } {
  if (score >= 80) return { label: "Looks safe to ship", tone: "safe" };
  if (score >= 50) return { label: "Fix before launch", tone: "warn" };
  return { label: "Not safe to ship", tone: "danger" };
}

function severityLabel(severity: Finding["severity"]): string {
  return severity === "critical" ? "Critical" : severity[0].toUpperCase() + severity.slice(1);
}

function FindingCard({ finding }: { finding: Finding }) {
  return (
    <article className={`finding finding-${finding.severity}`}>
      <div className="finding-topline">
        <h4>{finding.title}</h4>
        <span className="severity">{severityLabel(finding.severity)}</span>
      </div>
      {(finding.file || finding.line) && <code className="file-chip">{finding.file ?? "Repository"}{finding.line ? `:${finding.line}` : ""}</code>}
      <p>{finding.detail}</p>
    </article>
  );
}

function Group({ group, findings }: { group: typeof GROUPS[number]; findings: Finding[] }) {
  return (
    <section className="finding-group" aria-labelledby={`group-${group.key}`}>
      <div className="group-heading">
        <div>
          <span className="section-kicker">{group.eyebrow}</span>
          <h3 id={`group-${group.key}`}>{group.title}</h3>
        </div>
        <span className="group-count">{findings.length} {findings.length === 1 ? "finding" : "findings"}</span>
      </div>
      {findings.length === 0 ? <p className="empty-group">Nothing found here.</p> : <div className="findings-list">{findings.map(finding => <FindingCard key={finding.id} finding={finding} />)}</div>}
    </section>
  );
}

export default function Home() {
  const [repoUrl, setRepoUrl] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const currentVerdict = result ? verdict(result.score) : null;
  const grouped = useMemo<Record<FindingModule, Finding[]>>(() => ({
    packages: result?.findings.filter((finding: Finding) => finding.module === "packages") ?? [],
    secrets: result?.findings.filter((finding: Finding) => finding.module === "secrets") ?? [],
    backend: result?.findings.filter((finding: Finding) => finding.module === "backend") ?? [],
  }), [result]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setResult(null);
    setCopied(false);
    setLoading(true);
    try {
      const response = await fetch("/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ repoUrl }) });
      const payload = await response.json() as ScanResult & { error?: string };
      if (!response.ok) throw new Error(payload.error || "The scan could not be completed.");
      setResult(payload);
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : "The scan could not be completed.");
    } finally {
      setLoading(false);
    }
  }

  async function copyPrompt() {
    if (!result?.explanation.fixPrompt) return;
    await navigator.clipboard.writeText(result.explanation.fixPrompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2_000);
  }

  return (
    <div className="site-shell">
      <header className="site-header">
        <a className="brand" href="/" aria-label="VibeGuard home"><span className="brand-mark">V</span><span>VibeGuard</span></a>
        <span className="header-note">A second set of eyes for AI-built apps</span>
      </header>

      <main className="main-content">
        <section className="hero" aria-labelledby="page-title">
          <div className="hero-copy">
            <p className="eyebrow"><span className="eyebrow-dot" /> Repository security check</p>
            <h1 id="page-title">Check what your AI builder <em>actually shipped.</em></h1>
            <p className="hero-description">Paste a public GitHub repo. VibeGuard looks for risky dependencies, leaked keys, and backend rules that are too open—then gives you a fix prompt in plain English.</p>
          </div>
          <form className="scan-form" onSubmit={handleSubmit}>
            <label className="sr-only" htmlFor="repo-url">Public GitHub repository URL</label>
            <div className="input-wrap">
              <span className="input-prefix">github.com/</span>
              <input id="repo-url" type="url" value={repoUrl} onChange={event => setRepoUrl(event.target.value)} placeholder="owner/repository" autoComplete="url" required />
            </div>
            <button type="submit" disabled={!repoUrl.trim() || loading}>{loading ? "Scanning…" : "Scan repo"}<span aria-hidden="true">↗</span></button>
          </form>
          {error && <p className="error-message" role="alert">{error}</p>}
          <p className="privacy-note"><span aria-hidden="true">◌</span> Public repositories only · Nothing is stored</p>
        </section>

        {!result && !loading && (
          <section className="how-it-works depth-stage" aria-label="What VibeGuard checks">
            <div className="mini-card"><span className="mini-number">01</span><strong>Scan the surface</strong><p>Up to 50 text files from the repo’s default branch.</p></div>
            <div className="mini-card"><span className="mini-number">02</span><strong>Spot the signals</strong><p>Dependencies, credentials, database rules, and RLS.</p></div>
            <div className="mini-card"><span className="mini-number">03</span><strong>Make the repair</strong><p>Copy a focused prompt into your AI builder.</p></div>
          </section>
        )}

        {loading && <section className="loading-card" aria-live="polite"><span className="loading-orbit" /><div><strong>Reading the repo</strong><p>Checking dependencies, secrets, and access rules. This can take a minute for a busy repository.</p></div></section>}

        {result && currentVerdict && (
          <section className="results" aria-live="polite">
            <div className="result-topbar"><div><span className="section-kicker">Scan complete</span><h2>{result.repo}</h2></div><button className="text-button" type="button" onClick={() => { setResult(null); setRepoUrl(""); }}>Scan another repo <span aria-hidden="true">↗</span></button></div>
            <div className="score-card">
              <div className="score-number"><span>{result.score}</span><small>/100</small></div>
              <div className="score-context"><span className={`verdict verdict-${currentVerdict.tone}`}>{currentVerdict.label}</span><p>{result.explanation.summary}</p></div>
              <div className="scan-stats"><div><strong>{result.findings.length}</strong><span>Findings</span></div><div><strong>{result.filesScanned}</strong><span>Files scanned</span></div></div>
            </div>

            <div className="results-heading"><div><span className="section-kicker">The signal</span><h2>What needs your attention</h2></div><button className="details-button" type="button" onClick={() => setShowDetails(value => !value)}>{showDetails ? "Hide detail" : "Show detail"} <span aria-hidden="true">{showDetails ? "−" : "+"}</span></button></div>
            <div className={`findings-shell ${showDetails ? "show-detail" : ""}`}>
              {GROUPS.map(group => <Group key={group.key} group={group} findings={grouped[group.key]} />)}
            </div>

            <section className="fix-panel" aria-labelledby="fix-prompt-title">
              <div className="fix-panel-heading"><div><span className="section-kicker">Your next move</span><h2 id="fix-prompt-title">Fix prompt</h2></div>{result.explanation.fixPrompt && <button type="button" className="copy-button" onClick={copyPrompt}>{copied ? "Copied" : "Copy prompt"}<span aria-hidden="true">{copied ? "✓" : "↗"}</span></button>}</div>
              {result.explanation.fixPrompt ? <><pre>{result.explanation.fixPrompt}</pre><p className="fix-hint">Paste this into Lovable, Cursor or Claude, then scan again.</p></> : <p className="clean-state">No fixes needed from the checks we ran. Keep your secrets rotated and your access rules narrow.</p>}
            </section>
          </section>
        )}
      </main>
      <footer className="site-footer"><span>VibeGuard</span><span>Built for the moment after “it works”</span><span>Default branch · 50 file limit</span></footer>
    </div>
  );
}
