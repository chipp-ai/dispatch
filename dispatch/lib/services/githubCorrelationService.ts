/**
 * GitHub Correlation Service
 *
 * Finds recent commits that may have caused a Sentry error by:
 * 1. Looking at commits around the time the error first appeared
 * 2. Finding commits that touched files mentioned in the stack trace
 * 3. Identifying recent deployments/releases
 */

export interface GitHubCommit {
  sha: string;
  message: string;
  author: {
    name: string;
    email: string;
    date: string;
  };
  url: string;
  files?: string[];
}

export interface GitHubDeployment {
  id: number;
  environment: string;
  ref: string;
  sha: string;
  createdAt: string;
  url: string;
}

export interface CorrelationResult {
  suspectedCommits: GitHubCommit[];
  recentDeployments: GitHubDeployment[];
  matchedFiles: string[];
}

const GITHUB_API_BASE = "https://api.github.com";

/**
 * Find commits that may have caused an error
 *
 * @param firstSeen - ISO date string when the error was first seen
 * @param stackTraceFiles - List of file paths from the stack trace
 * @param lookbackHours - How many hours before firstSeen to search (default 24)
 */
export async function findSuspectedCommits(
  firstSeen: string,
  stackTraceFiles: string[],
  lookbackHours: number = 48
): Promise<CorrelationResult> {
  const githubToken = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO; // e.g., "BenchmarkAI/chipp-monorepo"

  if (!githubToken || !repo) {
    console.warn(
      "[GitHub Correlation] Missing GITHUB_TOKEN or GITHUB_REPO, skipping correlation"
    );
    return {
      suspectedCommits: [],
      recentDeployments: [],
      matchedFiles: [],
    };
  }

  const headers = {
    Authorization: `Bearer ${githubToken}`,
    Accept: "application/vnd.github.v3+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  const firstSeenDate = new Date(firstSeen);
  const lookbackDate = new Date(
    firstSeenDate.getTime() - lookbackHours * 60 * 60 * 1000
  );

  // Normalize stack trace files to match GitHub paths
  const normalizedFiles = normalizeStackTraceFiles(stackTraceFiles);

  try {
    // Fetch recent commits
    const commitsResponse = await fetch(
      `${GITHUB_API_BASE}/repos/${repo}/commits?since=${lookbackDate.toISOString()}&until=${firstSeenDate.toISOString()}&per_page=50`,
      { headers }
    );

    if (!commitsResponse.ok) {
      console.error(
        `[GitHub Correlation] Failed to fetch commits: ${commitsResponse.status}`
      );
      return {
        suspectedCommits: [],
        recentDeployments: [],
        matchedFiles: [],
      };
    }

    const commits = (await commitsResponse.json()) as Array<{
      sha: string;
      commit: {
        message: string;
        author: { name: string; email: string; date: string };
      };
      html_url: string;
      files?: Array<{ filename: string }>;
    }>;

    // For each commit, fetch the files changed (if we have stack trace files to match)
    const suspectedCommits: GitHubCommit[] = [];
    const matchedFiles: Set<string> = new Set();

    for (const commit of commits.slice(0, 20)) {
      // Limit to 20 most recent
      // Fetch commit details to get files
      const detailResponse = await fetch(
        `${GITHUB_API_BASE}/repos/${repo}/commits/${commit.sha}`,
        { headers }
      );

      if (!detailResponse.ok) continue;

      const detail = (await detailResponse.json()) as {
        files?: Array<{ filename: string }>;
      };
      const commitFiles = detail.files?.map((f) => f.filename) || [];

      // Check if any commit files match stack trace files
      const matches = findFileMatches(commitFiles, normalizedFiles);

      if (matches.length > 0 || normalizedFiles.length === 0) {
        // Include if matches, or if no stack trace files to filter by
        suspectedCommits.push({
          sha: commit.sha.substring(0, 7),
          message: commit.commit.message.split("\n")[0], // First line only
          author: {
            name: commit.commit.author.name,
            email: commit.commit.author.email,
            date: commit.commit.author.date,
          },
          url: commit.html_url,
          files: matches.length > 0 ? matches : commitFiles.slice(0, 5),
        });

        matches.forEach((f) => matchedFiles.add(f));
      }

      // Stop if we have enough suspected commits
      if (suspectedCommits.length >= 5) break;
    }

    // Fetch recent deployments
    const deployments = await fetchRecentDeployments(
      repo,
      headers,
      lookbackDate,
      firstSeenDate
    );

    return {
      suspectedCommits,
      recentDeployments: deployments,
      matchedFiles: Array.from(matchedFiles),
    };
  } catch (error) {
    console.error("[GitHub Correlation] Error:", error);
    return {
      suspectedCommits: [],
      recentDeployments: [],
      matchedFiles: [],
    };
  }
}

/**
 * Normalize stack trace file paths to match GitHub repo paths
 */
function normalizeStackTraceFiles(files: string[]): string[] {
  return files
    .map((f) => {
      // Remove common prefixes like /app/, node_modules path segments
      let normalized = f
        .replace(/^\/app\//, "")
        .replace(/^apps\//, "apps/")
        .replace(/.*node_modules\//, ""); // Remove node_modules paths

      // Skip node_modules and internal Node paths
      if (
        normalized.includes("node_modules") ||
        normalized.startsWith("node:")
      ) {
        return null;
      }

      return normalized;
    })
    .filter((f): f is string => f !== null);
}

/**
 * Find matching files between commit files and stack trace files
 */
function findFileMatches(
  commitFiles: string[],
  stackTraceFiles: string[]
): string[] {
  const matches: string[] = [];

  for (const commitFile of commitFiles) {
    for (const stackFile of stackTraceFiles) {
      // Check if file names match (accounting for path differences)
      if (
        commitFile.endsWith(stackFile) ||
        stackFile.endsWith(commitFile) ||
        commitFile.includes(stackFile) ||
        stackFile.includes(commitFile)
      ) {
        matches.push(commitFile);
        break;
      }
    }
  }

  return matches;
}

/**
 * Fetch recent deployments from GitHub
 */
async function fetchRecentDeployments(
  repo: string,
  headers: Record<string, string>,
  since: Date,
  until: Date
): Promise<GitHubDeployment[]> {
  try {
    const response = await fetch(
      `${GITHUB_API_BASE}/repos/${repo}/deployments?per_page=10`,
      { headers }
    );

    if (!response.ok) return [];

    const deployments = (await response.json()) as Array<{
      id: number;
      environment: string;
      ref: string;
      sha: string;
      created_at: string;
      url: string;
    }>;

    return deployments
      .filter((d) => {
        const deployDate = new Date(d.created_at);
        return deployDate >= since && deployDate <= until;
      })
      .map((d) => ({
        id: d.id,
        environment: d.environment,
        ref: d.ref,
        sha: d.sha.substring(0, 7),
        createdAt: d.created_at,
        url: d.url,
      }));
  } catch {
    return [];
  }
}

/**
 * Extract file paths from a stack trace string
 */
export function extractFilesFromStackTrace(stackTrace: string): string[] {
  const files: string[] = [];

  // Match common stack trace patterns
  // e.g., "at function (file.ts:123:45)" or "file.ts:123:45"
  const patterns = [
    /\(([^)]+\.(?:ts|js|tsx|jsx)):\d+:\d+\)/g, // (file.ts:line:col)
    /at\s+([^\s(]+\.(?:ts|js|tsx|jsx)):\d+:\d+/g, // at file.ts:line:col
    /([^\s]+\.(?:ts|js|tsx|jsx)):\d+:\d+/g, // file.ts:line:col
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(stackTrace)) !== null) {
      const file = match[1];
      if (file && !files.includes(file)) {
        files.push(file);
      }
    }
  }

  return files;
}

/**
 * Format correlation results as markdown for issue description
 */
export function formatCorrelationResults(
  result: CorrelationResult
): string | null {
  if (
    result.suspectedCommits.length === 0 &&
    result.recentDeployments.length === 0
  ) {
    return null;
  }

  const lines: string[] = [];
  lines.push("## Suspected Cause");
  lines.push("");

  if (result.suspectedCommits.length > 0) {
    lines.push("### Recent Commits");
    lines.push(
      "These commits were made shortly before the error first appeared:"
    );
    lines.push("");

    for (const commit of result.suspectedCommits) {
      const date = new Date(commit.author.date).toLocaleString();
      lines.push(`- [\`${commit.sha}\`](${commit.url}) - ${commit.message}`);
      lines.push(`  - **Author:** ${commit.author.name}`);
      lines.push(`  - **Date:** ${date}`);
      if (commit.files && commit.files.length > 0) {
        lines.push(`  - **Files:** ${commit.files.slice(0, 3).join(", ")}`);
      }
    }
    lines.push("");
  }

  if (result.recentDeployments.length > 0) {
    lines.push("### Recent Deployments");
    for (const deploy of result.recentDeployments) {
      const date = new Date(deploy.createdAt).toLocaleString();
      lines.push(
        `- **${deploy.environment}** - \`${deploy.sha}\` (${deploy.ref}) at ${date}`
      );
    }
    lines.push("");
  }

  if (result.matchedFiles.length > 0) {
    lines.push("### Files in Stack Trace Modified Recently");
    for (const file of result.matchedFiles) {
      lines.push(`- \`${file}\``);
    }
    lines.push("");
  }

  return lines.join("\n");
}
