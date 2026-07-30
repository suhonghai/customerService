// .github/scripts/release-notes.ts
// Generate release notes from conventional commits between two git refs.
//
// Usage:
//   deno run --allow-net --allow-read --allow-env --allow-run \
//     .github/scripts/release-notes.ts --from <prev-tag-or-sha> --to <current-tag-or-sha>
//
// Behavior:
//   1. Collect commits via `git log <from>..<to>`.
//   2. Try rendering via GitHub Models LLM (defaults to `openai/gpt-4o-mini`).
//      Set RELEASE_NOTES_LLM_API_KEY (or fall back to GITHUB_TOKEN) and
//      optionally RELEASE_NOTES_LLM_MODEL / RELEASE_NOTES_LLM_BASE_URL.
//   3. If LLM fails, fall back to deterministic grouping by conventional
//      commit type — never blocks a release.
import { $ } from "https://deno.land/x/dax@0.39.2/mod.ts";

interface Commit {
  sha: string;
  subject: string;
  type: string; // chore / feat / fix / docs / refactor / test / other
}

async function getCommits(from: string, to: string): Promise<Commit[]> {
  const out = await $`git log ${from}..${to} --pretty=format:"%h|%s"`.text();
  return out
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [sha, subject] = line.split("|");
      const match = subject.match(/^([a-z]+)(?:\([^)]+\))?:\s*(.+)$/i);
      return {
        sha,
        subject,
        type: match ? match[1].toLowerCase() : "other",
      };
    });
}

function groupByType(commits: Commit[]): Record<string, Commit[]> {
  const groups: Record<string, Commit[]> = {};
  for (const c of commits) {
    (groups[c.type] = groups[c.type] || []).push(c);
  }
  return groups;
}

function renderConventional(commits: Commit[]): string {
  const groups = groupByType(commits);
  const sections: string[] = [];
  for (const [type, items] of Object.entries(groups)) {
    if (items.length === 0) continue;
    sections.push(`### ${type}\n`);
    for (const c of items) {
      sections.push(`- ${c.subject} (\`${c.sha}\`)`);
    }
  }
  return sections.join("\n");
}

async function renderLLM(
  commits: Commit[],
  apiKey: string,
  model: string,
  baseUrl: string,
): Promise<string> {
  const prompt =
    `Summarize the following conventional commits into a clean release notes markdown section grouped by type (feat / fix / chore / docs / refactor / test). Keep commit subjects concise. Output only markdown body, no preamble.\n\nCommits:\n${
      commits.map((c) => `- ${c.sha} ${c.subject}`).join("\n")
    }`;
  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
    }),
  });
  if (!resp.ok) throw new Error(`LLM API ${resp.status}`);
  const data = await resp.json();
  return data.choices[0].message.content;
}

function readArg(name: string): string | null {
  const eq = Deno.args.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.split("=")[1];
  const idx = Deno.args.indexOf(name);
  if (idx === -1 || idx === Deno.args.length - 1) return null;
  return Deno.args[idx + 1];
}

const from = readArg("--from");
const to = readArg("--to");
if (!from || !to) {
  console.error(
    "Usage: release-notes.ts --from <prev> --to <current>",
  );
  Deno.exit(1);
}

const commits = await getCommits(from, to);
console.log(`Found ${commits.length} commits from ${from} to ${to}`);

const apiKey =
  Deno.env.get("RELEASE_NOTES_LLM_API_KEY") || Deno.env.get("GITHUB_TOKEN");
const model = Deno.env.get("RELEASE_NOTES_LLM_MODEL") || "openai/gpt-4o-mini";
const baseUrl = Deno.env.get("RELEASE_NOTES_LLM_BASE_URL") ||
  "https://models.github.ai/inference";

let body: string;
if (apiKey) {
  try {
    body = await renderLLM(commits, apiKey, model, baseUrl);
    console.log("LLM rendering succeeded");
  } catch (err) {
    console.warn(
      `LLM rendering failed (${err}), falling back to conventional commits grouping`,
    );
    body = renderConventional(commits);
  }
} else {
  console.warn(
    "No LLM API key configured, falling back to conventional commits grouping",
  );
  body = renderConventional(commits);
}

console.log("\n--- BEGIN RELEASE NOTES ---\n");
console.log(body);
console.log("\n--- END RELEASE NOTES ---\n");
