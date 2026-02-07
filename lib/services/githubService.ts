import { execFileSync } from "child_process";

/**
 * GitHub service using the `gh` CLI for operations
 * This provides a simple interface without needing a full SDK
 */

export interface GitHubPR {
  number: number;
  title: string;
  body: string | null;
  url: string;
  state: "open" | "closed" | "merged";
  headRef: string;
  baseRef: string;
  author: string;
  mergedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GitHubCommit {
  sha: string;
  message: string;
  author: string;
}

/**
 * Execute a gh CLI command
 */
function execGh(args: string[], cwd?: string): string {
  try {
    return execFileSync("gh", args, {
      cwd: cwd || process.cwd(),
      encoding: "utf-8",
      timeout: 30000,
    }).trim();
  } catch (error) {
    console.error("gh CLI error:", error);
    return "";
  }
}

/**
 * Get a single PR by number
 */
export async function getPR(
  owner: string,
  repo: string,
  prNumber: number
): Promise<GitHubPR | null> {
  const json = execGh([
    "api",
    `repos/${owner}/${repo}/pulls/${prNumber}`,
    "--jq",
    `{
      number: .number,
      title: .title,
      body: .body,
      url: .html_url,
      state: .state,
      headRef: .head.ref,
      baseRef: .base.ref,
      author: .user.login,
      mergedAt: .merged_at,
      createdAt: .created_at,
      updatedAt: .updated_at
    }`,
  ]);

  if (!json) return null;

  try {
    const pr = JSON.parse(json);
    // Determine if merged (state is "closed" but has merged_at)
    if (pr.state === "closed" && pr.mergedAt) {
      pr.state = "merged";
    }
    return pr;
  } catch {
    return null;
  }
}

/**
 * Get commits in a PR
 */
export async function getPRCommits(
  owner: string,
  repo: string,
  prNumber: number
): Promise<GitHubCommit[]> {
  const json = execGh([
    "api",
    `repos/${owner}/${repo}/pulls/${prNumber}/commits`,
    "--jq",
    `[.[] | {sha: .sha, message: .commit.message, author: .commit.author.name}]`,
  ]);

  if (!json) return [];

  try {
    return JSON.parse(json);
  } catch {
    return [];
  }
}

/**
 * List recent PRs (open, merged, or closed)
 */
export async function listPRs(
  owner: string,
  repo: string,
  options: {
    state?: "open" | "closed" | "all";
    base?: string;
    limit?: number;
    since?: Date;
  } = {}
): Promise<GitHubPR[]> {
  const { state = "all", base, limit = 50, since } = options;

  let query = `repos/${owner}/${repo}/pulls?state=${state}&per_page=${limit}&sort=updated&direction=desc`;
  if (base) {
    query += `&base=${base}`;
  }

  const json = execGh([
    "api",
    query,
    "--jq",
    `[.[] | {
      number: .number,
      title: .title,
      body: .body,
      url: .html_url,
      state: .state,
      headRef: .head.ref,
      baseRef: .base.ref,
      author: .user.login,
      mergedAt: .merged_at,
      createdAt: .created_at,
      updatedAt: .updated_at
    }]`,
  ]);

  if (!json) return [];

  try {
    let prs: GitHubPR[] = JSON.parse(json);

    // Adjust state for merged PRs
    prs = prs.map((pr) => {
      if (pr.state === "closed" && pr.mergedAt) {
        return { ...pr, state: "merged" };
      }
      return pr;
    });

    // Filter by since date if provided
    if (since) {
      prs = prs.filter((pr) => new Date(pr.updatedAt) >= since);
    }

    return prs;
  } catch {
    return [];
  }
}

/**
 * Get PRs that were merged to a specific branch since a date
 */
export async function getMergedPRs(
  owner: string,
  repo: string,
  base: string,
  since: Date
): Promise<GitHubPR[]> {
  const prs = await listPRs(owner, repo, {
    state: "closed",
    base,
    limit: 100,
    since,
  });

  return prs.filter((pr) => pr.state === "merged");
}

/**
 * Parse owner/repo from a GitHub URL
 */
export function parseGitHubUrl(
  url: string
): { owner: string; repo: string } | null {
  const match = url.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

/**
 * Get the repository info from git remote
 */
export function getRepoFromGitRemote(
  cwd?: string
): { owner: string; repo: string } | null {
  const remoteUrl = execGh(
    [
      "repo",
      "view",
      "--json",
      "owner,name",
      "--jq",
      '"\(.owner.login)/\(.name)"',
    ],
    cwd
  );
  if (!remoteUrl) return null;

  const parts = remoteUrl.replace(/"/g, "").split("/");
  if (parts.length !== 2) return null;

  return { owner: parts[0], repo: parts[1] };
}
