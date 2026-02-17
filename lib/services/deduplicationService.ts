/**
 * Deduplication Service
 *
 * Clusters similar issues using pgvector embeddings, reviews clusters
 * with Claude Haiku to identify true duplicates, and bulk-closes them.
 */

import Anthropic from "@anthropic-ai/sdk";
import { db } from "../db";
import { updateIssue } from "./issueService";
import { createComment } from "./commentService";
import { getStatusByName } from "./statusService";
import { getOrCreateDefaultWorkspace } from "./workspaceService";
import { broadcastBoardEvent } from "./boardBroadcast";
import { getIssueForBoard } from "./issueService";

// --- Types ---

interface ClusterIssue {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  status_name: string;
}

export interface DuplicateCluster {
  members: ClusterIssue[];
  avg_similarity: number;
}

export interface ReviewedCluster {
  canonical: ClusterIssue;
  duplicates: { issue: ClusterIssue; reason: string }[];
  keep_separate: ClusterIssue[];
}

export interface DedupResult {
  clustersReviewed: number;
  issuesClosed: number;
  commentsAdded: number;
  errors: string[];
}

// --- Union-Find for clustering ---

class UnionFind {
  private parent: Map<string, string>;
  private rank: Map<string, number>;

  constructor() {
    this.parent = new Map();
    this.rank = new Map();
  }

  makeSet(x: string) {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      this.rank.set(x, 0);
    }
  }

  find(x: string): string {
    if (this.parent.get(x) !== x) {
      this.parent.set(x, this.find(this.parent.get(x)!));
    }
    return this.parent.get(x)!;
  }

  union(x: string, y: string) {
    const rx = this.find(x);
    const ry = this.find(y);
    if (rx === ry) return;

    const rankX = this.rank.get(rx)!;
    const rankY = this.rank.get(ry)!;
    if (rankX < rankY) {
      this.parent.set(rx, ry);
    } else if (rankX > rankY) {
      this.parent.set(ry, rx);
    } else {
      this.parent.set(ry, rx);
      this.rank.set(rx, rankX + 1);
    }
  }

  getGroups(): Map<string, string[]> {
    const groups = new Map<string, string[]>();
    for (const key of this.parent.keys()) {
      const root = this.find(key);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root)!.push(key);
    }
    return groups;
  }
}

// --- Core Functions ---

/**
 * Find clusters of similar issues using pgvector cosine similarity.
 */
export async function findDuplicateClusters(
  options: {
    statuses?: string[];
    threshold?: number;
    maxClusters?: number;
  } = {}
): Promise<DuplicateCluster[]> {
  const {
    statuses = ["Backlog", "Investigating"],
    threshold = 0.85,
    maxClusters = 50,
  } = options;

  const workspace = await getOrCreateDefaultWorkspace();

  // Fetch issues with embeddings in target statuses
  const placeholders = statuses.map((_, i) => `$${i + 2}`).join(", ");
  const issues = await db.query<ClusterIssue & { embedding_exists: boolean }>(
    `SELECT i.id, i.identifier, i.title, i.description, s.name as status_name,
            (i.embedding IS NOT NULL) as embedding_exists
     FROM dispatch_issue i
     JOIN dispatch_status s ON i.status_id = s.id
     WHERE i.workspace_id = $1
       AND LOWER(s.name) IN (${placeholders})
       AND i.embedding IS NOT NULL
     ORDER BY i.created_at DESC`,
    [workspace.id, ...statuses.map((s) => s.toLowerCase())]
  );

  if (issues.length < 2) {
    return [];
  }

  // Find similar pairs using pgvector cosine distance
  const pairs = await db.query<{
    id_a: string;
    id_b: string;
    similarity: number;
  }>(
    `SELECT a.id as id_a, b.id as id_b,
            1 - (a.embedding <=> b.embedding) as similarity
     FROM dispatch_issue a
     JOIN dispatch_issue b ON a.id < b.id
     JOIN dispatch_status sa ON a.status_id = sa.id
     JOIN dispatch_status sb ON b.status_id = sb.id
     WHERE a.workspace_id = $1
       AND b.workspace_id = $1
       AND a.embedding IS NOT NULL
       AND b.embedding IS NOT NULL
       AND LOWER(sa.name) IN (${placeholders})
       AND LOWER(sb.name) IN (${placeholders})
       AND 1 - (a.embedding <=> b.embedding) >= $${statuses.length + 2}`,
    [
      workspace.id,
      ...statuses.map((s) => s.toLowerCase()),
      ...statuses.map((s) => s.toLowerCase()),
      threshold,
    ]
  );

  if (pairs.length === 0) {
    return [];
  }

  // Build clusters via union-find
  const uf = new UnionFind();
  const issueMap = new Map<string, ClusterIssue>();

  for (const issue of issues) {
    uf.makeSet(issue.id);
    issueMap.set(issue.id, {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description,
      status_name: issue.status_name,
    });
  }

  const pairSimilarities = new Map<string, number[]>();
  for (const pair of pairs) {
    uf.union(pair.id_a, pair.id_b);
    const key = [pair.id_a, pair.id_b].sort().join(":");
    if (!pairSimilarities.has(key)) pairSimilarities.set(key, []);
    pairSimilarities.get(key)!.push(Number(pair.similarity));
  }

  // Convert groups to clusters
  const groups = uf.getGroups();
  const clusters: DuplicateCluster[] = [];

  for (const [, memberIds] of groups) {
    if (memberIds.length < 2) continue;

    const members = memberIds
      .map((id) => issueMap.get(id))
      .filter((m): m is ClusterIssue => m !== undefined);

    // Compute average similarity across all pairs in cluster
    let totalSim = 0;
    let pairCount = 0;
    for (let i = 0; i < memberIds.length; i++) {
      for (let j = i + 1; j < memberIds.length; j++) {
        const key = [memberIds[i], memberIds[j]].sort().join(":");
        const sims = pairSimilarities.get(key);
        if (sims) {
          totalSim += sims.reduce((a, b) => a + b, 0) / sims.length;
          pairCount++;
        }
      }
    }

    clusters.push({
      members,
      avg_similarity: pairCount > 0 ? totalSim / pairCount : threshold,
    });
  }

  // Sort by cluster size descending, limit
  clusters.sort((a, b) => b.members.length - a.members.length);
  return clusters.slice(0, maxClusters);
}

/**
 * Review clusters with Claude Haiku to decide which are true duplicates.
 */
export async function reviewClusters(
  clusters: DuplicateCluster[]
): Promise<ReviewedCluster[]> {
  const client = new Anthropic();
  const reviewed: ReviewedCluster[] = [];

  for (const cluster of clusters) {
    const issueList = cluster.members
      .map(
        (m, i) =>
          `${i + 1}. ${m.identifier}: "${m.title}"${
            m.description
              ? `\n   ${m.description.slice(0, 300).replace(/\n/g, " ")}`
              : ""
          }`
      )
      .join("\n");

    const prompt = `You are reviewing a cluster of similar issues to identify true duplicates.

Issues in this cluster (avg similarity: ${cluster.avg_similarity.toFixed(2)}):
${issueList}

For each cluster, decide:
1. Which issue is the "canonical" one (most complete/descriptive) — identify by its number
2. Which issues are true duplicates of the canonical (same problem, just different wording)
3. Which issues are similar but different (should stay separate)

Respond in JSON only:
{
  "canonical": 1,
  "duplicates": [{"number": 2, "reason": "same error in same file"}],
  "keep_separate": [3]
}`;

    try {
      const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      });

      const text =
        response.content[0].type === "text" ? response.content[0].text : "";

      // Extract JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) continue;

      const decision = JSON.parse(jsonMatch[0]) as {
        canonical: number;
        duplicates: { number: number; reason: string }[];
        keep_separate: number[];
      };

      const canonicalIdx = decision.canonical - 1;
      if (canonicalIdx < 0 || canonicalIdx >= cluster.members.length) continue;

      reviewed.push({
        canonical: cluster.members[canonicalIdx],
        duplicates: (decision.duplicates || [])
          .filter(
            (d) => d.number - 1 >= 0 && d.number - 1 < cluster.members.length
          )
          .map((d) => ({
            issue: cluster.members[d.number - 1],
            reason: d.reason,
          })),
        keep_separate: (decision.keep_separate || [])
          .filter((n) => n - 1 >= 0 && n - 1 < cluster.members.length)
          .map((n) => cluster.members[n - 1]),
      });
    } catch (error) {
      console.error(
        "Failed to review cluster:",
        error instanceof Error ? error.message : error
      );
    }
  }

  return reviewed;
}

/**
 * Execute dedup decisions: close duplicates, add cross-reference comments.
 */
export async function executeDedupDecisions(
  reviewedClusters: ReviewedCluster[]
): Promise<DedupResult> {
  const result: DedupResult = {
    clustersReviewed: reviewedClusters.length,
    issuesClosed: 0,
    commentsAdded: 0,
    errors: [],
  };

  const workspace = await getOrCreateDefaultWorkspace();
  const canceledStatus = await getStatusByName(workspace.id, "Canceled");
  if (!canceledStatus) {
    result.errors.push("Could not find 'Canceled' status");
    return result;
  }

  for (const cluster of reviewedClusters) {
    const dupeIdentifiers = cluster.duplicates.map((d) => d.issue.identifier);

    // Close each duplicate
    for (const dupe of cluster.duplicates) {
      try {
        await updateIssue(dupe.issue.id, {
          statusId: canceledStatus.id,
        });

        // Comment on the closed issue
        await createComment({
          issueId: dupe.issue.id,
          body: `Closed as duplicate of **${cluster.canonical.identifier}** — ${dupe.reason}`,
        });
        result.commentsAdded++;
        result.issuesClosed++;

        // Broadcast board update
        const boardIssue = await getIssueForBoard(dupe.issue.identifier);
        if (boardIssue) {
          broadcastBoardEvent({
            type: "issue_updated",
            issue: boardIssue,
            timestamp: new Date().toISOString(),
          });
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        result.errors.push(
          `Failed to close ${dupe.issue.identifier}: ${msg}`
        );
      }
    }

    // Comment on canonical issue about closed dupes
    if (cluster.duplicates.length > 0) {
      try {
        const dupeList = dupeIdentifiers.join(", ");
        await createComment({
          issueId: cluster.canonical.id,
          body: `Dedup: ${cluster.duplicates.length} duplicate(s) closed — ${dupeList}`,
        });
        result.commentsAdded++;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        result.errors.push(
          `Failed to comment on canonical ${cluster.canonical.identifier}: ${msg}`
        );
      }
    }
  }

  return result;
}
