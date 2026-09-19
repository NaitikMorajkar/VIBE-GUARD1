import type { Finding, RepoFile } from "../types";

export function scanBackendConfig(files: RepoFile[]): Finding[] {
  const findings: Finding[] = [];
  const sqlFiles = files.filter(file => file.path.toLowerCase().endsWith(".sql"));
  const hasSupabase = files.some(file => /@supabase\/supabase-js/.test(file.content));

  for (const file of files) {
    const lower = file.path.toLowerCase();
    const content = file.content;
    if (lower.endsWith(".rules")) {
      if (/allow\s+[^:]+:\s*if\s+true\s*;/i.test(content)) findings.push({ id: "", module: "backend", severity: "critical", title: "Firebase rules allow anyone to read and write", detail: "The rule uses `if true`, so anonymous users can access the protected data. Replace it with narrow path-level checks and test unauthenticated access.", file: file.path });
      else if (/request\.time\s*<\s*timestamp\.date\s*\(/i.test(content)) findings.push({ id: "", module: "backend", severity: "high", title: "Firebase rules are in test mode", detail: "The time-based test-mode rule expires eventually but currently allows broad access. Replace it with explicit ownership and validation rules.", file: file.path });
      else if (/if\s+request\.auth\s*!=\s*null\s*;/i.test(content)) findings.push({ id: "", module: "backend", severity: "medium", title: "Firebase rules allow every signed-in user", detail: "Checking only that a user is logged in means any account can access everything covered by the rule. Add ownership, role, and field-level checks.", file: file.path });
    }

    if (lower.endsWith("database.rules.json") && /["']\.(?:read|write)["']\s*:\s*true/i.test(content)) findings.push({ id: "", module: "backend", severity: "critical", title: "Realtime Database rules are fully open", detail: "A true `.read` or `.write` rule permits unrestricted access. Lock down each path and require authenticated, authorized users.", file: file.path });

    if (/service_role/i.test(content) && /\.(?:js|jsx|ts|tsx|py)$/i.test(lower) && !/(^|\/)api\//i.test(lower) && !/(^|\/)server\//i.test(lower) && !/(^|\/)functions\//i.test(lower)) {
      const clientFile = /use client/i.test(content);
      findings.push({ id: "", module: "backend", severity: clientFile ? "critical" : "high", title: clientFile ? "Supabase service role exposed to the browser" : "Supabase service role used outside a server boundary", detail: clientFile ? "The service-role key bypasses Row Level Security and must never be shipped to a client component. Use the public anon key in the browser and keep privileged work on the server." : "Keep the service-role key in a server-only module and never expose it to client bundles. Prefer the anon key plus RLS for user-facing operations.", file: file.path });
    }
  }

  for (const file of sqlFiles) {
    const matches = file.content.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?["`]?([a-zA-Z0-9_]+)["`]?/gi);
    const tables = Array.from(matches).map(match => match[1]).filter((table): table is string => Boolean(table));
    for (const table of tables) {
      const hasRls = new RegExp('alter\\s+table\\s+(?:if\\s+exists\\s+)?["`]?'+table+'["`]?\\s+enable\\s+row\\s+level\\s+security', "i").test(file.content);
      if (!hasRls) findings.push({ id: "", module: "backend", severity: "high", title: `Table ${table} has no Row Level Security`, detail: `Enable RLS before shipping this table. Fix SQL: ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY; Then add policies for each allowed operation.`, file: file.path });
    }
    if (/create\s+policy[\s\S]{0,600}?\b(using|with\s+check)\s*\(\s*true\s*\)/i.test(file.content)) findings.push({ id: "", module: "backend", severity: "high", title: "Supabase policy allows every user", detail: "A policy using `(true)` or `with check (true)` bypasses meaningful authorization. Replace it with a condition tied to auth.uid(), ownership, or a server-only workflow.", file: file.path });
  }

  if (hasSupabase && sqlFiles.length === 0) findings.push({ id: "", module: "backend", severity: "low", title: "Verify Supabase RLS in the dashboard", detail: "This repository uses @supabase/supabase-js but contains no SQL migrations to review. Confirm that every table has Row Level Security enabled in the Supabase dashboard.", file: files.find(file => /package\.json$/i.test(file.path))?.path });
  return findings;
}
