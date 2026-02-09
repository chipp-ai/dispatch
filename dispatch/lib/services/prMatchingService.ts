import { db } from "../db";
import { generateEmbeddingForIssue, vectorToString } from "../utils/embeddings";

// Gemini client setup
import { GoogleGenerativeAI } from "@google/generative-ai";

const GEMINI_MODEL = "gemini-2.5-pro";
const CONFIDENCE_THRESHOLD = 0.85; // High threshold to avoid false positives

interface PRData {
  number: number;
  title: string;
  body: string | null;
  url: string;
  branchName: string;
  baseBranch: string;
  headBranch: string;
  author: string;
  commits?: Array<{ message: string; sha: string }>;
}

interface IssueCandidate {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  status_name: string;
  similarity: number;
}

interface MatchResult {
  issueId: string;
  issueIdentifier: string;
  confidence: number;
  reasoning: string;
  aiSummary: string;
  shouldUpdate: boolean;
}

function getGeminiClient(): GoogleGenerativeAI {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GOOGLE_GENERATIVE_AI_API_KEY environment variable is not set"
    );
  }
  return new GoogleGenerativeAI(apiKey);
}

/**
 * Find issues that semantically match a PR
 */
export async function findMatchingIssues(
  workspaceId: string,
  pr: PRData
): Promise<MatchResult[]> {
  // Step 1: Look for explicit issue identifiers in PR title/body/branch
  const explicitMatches = await findExplicitMatches(pr);

  // Step 2: Semantic search for potential matches
  const semanticMatches = await findSemanticMatches(workspaceId, pr);

  // Combine and dedupe candidates
  const candidateMap = new Map<string, IssueCandidate>();

  // Explicit matches get high base similarity
  for (const match of explicitMatches) {
    candidateMap.set(match.id, { ...match, similarity: 0.9 });
  }

  // Add semantic matches
  for (const match of semanticMatches) {
    if (!candidateMap.has(match.id)) {
      candidateMap.set(match.id, match);
    } else {
      // Boost similarity if found by both methods
      const existing = candidateMap.get(match.id)!;
      existing.similarity = Math.min(1.0, existing.similarity + 0.1);
    }
  }

  const candidates = Array.from(candidateMap.values());

  if (candidates.length === 0) {
    return [];
  }

  // Step 3: Use Gemini to analyze matches and determine confidence
  const results = await analyzeMatchesWithGemini(pr, candidates);

  return results.filter((r) => r.shouldUpdate);
}

/**
 * Find issues explicitly mentioned in PR title, body, or branch name
 */
async function findExplicitMatches(pr: PRData): Promise<IssueCandidate[]> {
  const identifierPattern = /[A-Z]+-\d+/g;

  const allText = `${pr.title} ${pr.body || ""} ${pr.branchName}`;
  const matches = allText.match(identifierPattern) || [];
  const uniqueIdentifiers = [...new Set(matches)];

  if (uniqueIdentifiers.length === 0) {
    return [];
  }

  const placeholders = uniqueIdentifiers.map((_, i) => `$${i + 1}`).join(", ");
  return db.query<IssueCandidate>(
    `SELECT i.id, i.identifier, i.title, i.description, s.name as status_name, 0.9 as similarity
     FROM dispatch_issue i
     JOIN dispatch_status s ON i.status_id = s.id
     WHERE i.identifier IN (${placeholders})`,
    uniqueIdentifiers
  );
}

/**
 * Find issues using semantic/vector similarity
 */
async function findSemanticMatches(
  workspaceId: string,
  pr: PRData
): Promise<IssueCandidate[]> {
  // Create a combined text for embedding
  const prText = `${pr.title}\n${pr.body || ""}\n${pr.branchName}`;

  try {
    const embedding = await generateEmbeddingForIssue(prText, null);
    const embeddingStr = vectorToString(embedding.vector);

    return db.query<IssueCandidate>(
      `SELECT
        i.id, i.identifier, i.title, i.description,
        s.name as status_name,
        1 - (i.embedding <=> $1::vector) as similarity
      FROM dispatch_issue i
      JOIN dispatch_status s ON i.status_id = s.id
      WHERE i.workspace_id = $2
        AND i.embedding IS NOT NULL
        AND NOT s.is_closed
      ORDER BY i.embedding <=> $1::vector
      LIMIT 10`,
      [embeddingStr, workspaceId]
    );
  } catch (error) {
    console.error("Failed to generate embedding for PR:", error);
    return [];
  }
}

/**
 * Use Gemini to analyze potential matches and determine confidence
 */
async function analyzeMatchesWithGemini(
  pr: PRData,
  candidates: IssueCandidate[]
): Promise<MatchResult[]> {
  const genAI = getGeminiClient();
  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    generationConfig: {
      temperature: 0.1, // Low temperature for consistent analysis
      maxOutputTokens: 4096,
    },
  });

  const prompt = `You are analyzing a GitHub Pull Request to determine which issues it addresses.

CRITICAL: We need EXTREMELY high confidence to avoid false positives. Customers receive notifications when issues are updated, so incorrectly linking a PR to an issue would be very embarrassing.

## Pull Request Details
- **Number**: #${pr.number}
- **Title**: ${pr.title}
- **Branch**: ${pr.branchName}
- **Base Branch**: ${pr.baseBranch}
- **Author**: ${pr.author}
- **Description**:
${pr.body || "(no description)"}

${pr.commits ? `## Recent Commits:\n${pr.commits.map((c) => `- ${c.message}`).join("\n")}` : ""}

## Candidate Issues to Match

${candidates
  .map(
    (c, i) => `### Candidate ${i + 1}: ${c.identifier}
- **Title**: ${c.title}
- **Current Status**: ${c.status_name}
- **Description**: ${c.description || "(no description)"}
- **Vector Similarity Score**: ${(c.similarity * 100).toFixed(1)}%
`
  )
  .join("\n")}

## Instructions

Analyze each candidate and determine:
1. **Confidence** (0-100): How confident are you this PR addresses this issue?
   - 90-100: The PR explicitly mentions the issue identifier OR the title/description is an exact match
   - 80-89: Very strong semantic match with clear connection
   - 70-79: Good match but some uncertainty
   - 60-69: Possible match, needs human review
   - Below 60: Unlikely match

2. **Reasoning**: Brief explanation of why this is/isn't a match

3. **AI Summary**: If confidence >= ${CONFIDENCE_THRESHOLD * 100}, write a brief (1-2 sentence) summary of how the PR relates to the issue

IMPORTANT: Only return matches with confidence >= ${CONFIDENCE_THRESHOLD * 100}. We would rather miss a match than create a false positive.

Return your analysis as JSON:
{
  "matches": [
    {
      "identifier": "DISPATCH-123",
      "confidence": 95,
      "reasoning": "PR title explicitly mentions DISPATCH-123 and the changes align with the issue description",
      "ai_summary": "This PR fixes the authentication timeout issue by extending the token TTL."
    }
  ]
}

If no candidates meet the threshold, return: {"matches": []}`;

  try {
    const result = await model.generateContent(prompt);
    const response = result.response.text();

    // Extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("Failed to parse Gemini response:", response);
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return parsed.matches
      .map(
        (match: {
          identifier: string;
          confidence: number;
          reasoning: string;
          ai_summary?: string;
        }) => {
          const candidate = candidates.find(
            (c) => c.identifier === match.identifier
          );
          if (!candidate) return null;

          return {
            issueId: candidate.id,
            issueIdentifier: match.identifier,
            confidence: match.confidence / 100, // Convert to 0-1 scale
            reasoning: match.reasoning,
            aiSummary: match.ai_summary || "",
            shouldUpdate: match.confidence >= CONFIDENCE_THRESHOLD * 100,
          };
        }
      )
      .filter(Boolean) as MatchResult[];
  } catch (error) {
    console.error("Failed to analyze with Gemini:", error);
    return [];
  }
}

/**
 * Analyze a release PR to find all issues being deployed to production
 */
export async function analyzeReleasePR(
  workspaceId: string,
  pr: PRData
): Promise<MatchResult[]> {
  // A release PR merges staging -> main
  // We need to find all issues that are currently "In Staging"

  // First, check if this is a release PR
  if (pr.baseBranch !== "main" || pr.headBranch !== "staging") {
    return [];
  }

  // Get all issues in "In Staging" status
  const inStagingIssues = await db.query<IssueCandidate>(
    `SELECT i.id, i.identifier, i.title, i.description, s.name as status_name, 1.0 as similarity
     FROM dispatch_issue i
     JOIN dispatch_status s ON i.status_id = s.id
     WHERE i.workspace_id = $1
       AND LOWER(s.name) = 'in staging'`,
    [workspaceId]
  );

  if (inStagingIssues.length === 0) {
    return [];
  }

  // Also try to find issue identifiers in the PR commits
  const commitIdentifiers = new Set<string>();
  if (pr.commits) {
    const identifierPattern = /[A-Z]+-\d+/g;
    for (const commit of pr.commits) {
      const matches = commit.message.match(identifierPattern) || [];
      matches.forEach((m) => commitIdentifiers.add(m));
    }
  }

  // Use Gemini to verify which issues are actually in this release
  const genAI = getGeminiClient();
  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 4096,
    },
  });

  const prompt = `You are analyzing a Release PR that merges staging to main (production deployment).

## Release PR
- **Number**: #${pr.number}
- **Title**: ${pr.title}
- **Description**:
${pr.body || "(no description)"}

${pr.commits ? `## Commits in this release:\n${pr.commits.map((c) => `- ${c.message}`).join("\n")}` : ""}

## Issues currently "In Staging" that may be included:

${inStagingIssues.map((i) => `- **${i.identifier}**: ${i.title}`).join("\n")}

## Issue identifiers found in commits:
${commitIdentifiers.size > 0 ? Array.from(commitIdentifiers).join(", ") : "None found"}

## Instructions

Determine which issues are being deployed to production in this release.

Rules:
1. If an issue identifier is explicitly mentioned in the PR or commits, it's definitely included (confidence: 95+)
2. Issues that are "In Staging" are likely included, but we can't be 100% certain without explicit mention
3. Be conservative - we'd rather miss an update than incorrectly notify a customer

Return JSON:
{
  "matches": [
    {
      "identifier": "DISPATCH-123",
      "confidence": 95,
      "reasoning": "Explicitly mentioned in commit message",
      "ai_summary": "Deployed to production as part of release."
    }
  ]
}`;

  try {
    const result = await model.generateContent(prompt);
    const response = result.response.text();

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error(
        "Failed to parse Gemini response for release PR:",
        response
      );
      // Fall back to issues with explicit mentions in commits
      return inStagingIssues
        .filter((i) => commitIdentifiers.has(i.identifier))
        .map((i) => ({
          issueId: i.id,
          issueIdentifier: i.identifier,
          confidence: 0.95,
          reasoning: "Issue identifier found in release commits",
          aiSummary: "Deployed to production.",
          shouldUpdate: true,
        }));
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return parsed.matches
      .map(
        (match: {
          identifier: string;
          confidence: number;
          reasoning: string;
          ai_summary?: string;
        }) => {
          const candidate = inStagingIssues.find(
            (c) => c.identifier === match.identifier
          );
          if (!candidate) return null;

          return {
            issueId: candidate.id,
            issueIdentifier: match.identifier,
            confidence: match.confidence / 100,
            reasoning: match.reasoning,
            aiSummary: match.ai_summary || "Deployed to production.",
            shouldUpdate: match.confidence >= CONFIDENCE_THRESHOLD * 100,
          };
        }
      )
      .filter(Boolean) as MatchResult[];
  } catch (error) {
    console.error("Failed to analyze release PR with Gemini:", error);
    // Fall back to issues with explicit mentions
    return inStagingIssues
      .filter((i) => commitIdentifiers.has(i.identifier))
      .map((i) => ({
        issueId: i.id,
        issueIdentifier: i.identifier,
        confidence: 0.95,
        reasoning: "Issue identifier found in release commits",
        aiSummary: "Deployed to production.",
        shouldUpdate: true,
      }));
  }
}

/**
 * Determine the target status for an issue based on PR state
 */
export function determineTargetStatus(
  pr: PRData,
  currentStatus: string
): string | null {
  // PR merged to main (via release PR) -> "In Production"
  if (pr.baseBranch === "main" && pr.headBranch === "staging") {
    return "In Production";
  }

  // PR opened to staging -> "In Review"
  if (pr.baseBranch === "staging") {
    // Only move to "In Review" if not already further along
    const statusOrder = [
      "backlog",
      "triage",
      "todo",
      "in progress",
      "in review",
      "in staging",
      "in production",
      "done",
    ];
    const currentIndex = statusOrder.indexOf(currentStatus.toLowerCase());
    const targetIndex = statusOrder.indexOf("in review");

    if (currentIndex < targetIndex) {
      return "In Review";
    }
  }

  return null;
}

/**
 * Determine status when PR is merged
 */
export function determineStatusOnMerge(
  pr: PRData,
  currentStatus: string
): string | null {
  // Merged to main (release PR) -> "In Production"
  if (pr.baseBranch === "main") {
    return "In Production";
  }

  // Merged to staging -> "In Staging"
  if (pr.baseBranch === "staging") {
    return "In Staging";
  }

  return null;
}
