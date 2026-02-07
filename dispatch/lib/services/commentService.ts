import { db } from "../db";
import { v4 as uuidv4 } from "uuid";
import { generateEmbedding, vectorToString } from "../utils/embeddings";

export interface Comment {
  id: string;
  issue_id: string;
  author_id: string | null;
  body: string;
  created_at: Date;
  updated_at: Date;
}

export interface CommentWithAuthor extends Comment {
  author_name: string | null;
}

export interface CreateCommentInput {
  issueId: string;
  body: string;
  authorId?: string;
}

export async function createComment(
  input: CreateCommentInput
): Promise<CommentWithAuthor> {
  // Generate embedding for comment
  let embeddingStr: string | null = null;
  try {
    const embedding = await generateEmbedding(input.body);
    embeddingStr = vectorToString(embedding.vector);
  } catch (e) {
    console.error("Failed to generate comment embedding:", e);
  }

  const id = uuidv4();
  await db.query(
    `INSERT INTO chipp_comment (id, issue_id, author_id, body, embedding, embedding_provider, embedding_model, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5::vector, $6, $7, NOW(), NOW())`,
    [
      id,
      input.issueId,
      input.authorId || null,
      input.body,
      embeddingStr,
      embeddingStr ? "openai" : null,
      embeddingStr ? "text-embedding-3-large" : null,
    ]
  );

  const comment = await db.queryOne<Comment & { author_name: string | null }>(
    `SELECT c.*, a.name as author_name
     FROM chipp_comment c
     LEFT JOIN chipp_agent a ON c.author_id = a.id
     WHERE c.id = $1`,
    [id]
  );

  return comment!;
}

export async function listComments(
  issueId: string
): Promise<CommentWithAuthor[]> {
  return db.query<CommentWithAuthor>(
    `SELECT c.*, a.name as author_name
     FROM chipp_comment c
     LEFT JOIN chipp_agent a ON c.author_id = a.id
     WHERE c.issue_id = $1
     ORDER BY c.created_at ASC`,
    [issueId]
  );
}

export async function getComment(
  commentId: string
): Promise<CommentWithAuthor | null> {
  return db.queryOne<CommentWithAuthor>(
    `SELECT c.*, a.name as author_name
     FROM chipp_comment c
     LEFT JOIN chipp_agent a ON c.author_id = a.id
     WHERE c.id = $1`,
    [commentId]
  );
}

export async function updateComment(
  commentId: string,
  body: string
): Promise<CommentWithAuthor | null> {
  const existing = await getComment(commentId);
  if (!existing) return null;

  // Regenerate embedding for updated body
  let embeddingStr: string | null = null;
  try {
    const embedding = await generateEmbedding(body);
    embeddingStr = vectorToString(embedding.vector);
  } catch (e) {
    console.error("Failed to generate comment embedding:", e);
  }

  await db.query(
    `UPDATE chipp_comment SET
      body = $1,
      embedding = COALESCE($2::vector, embedding),
      updated_at = NOW()
    WHERE id = $3`,
    [body, embeddingStr, commentId]
  );

  return getComment(commentId);
}

export async function deleteComment(commentId: string): Promise<boolean> {
  const result = await db.query(
    `DELETE FROM chipp_comment WHERE id = $1 RETURNING id`,
    [commentId]
  );
  return result.length > 0;
}

export async function getComments(
  issueId: string
): Promise<CommentWithAuthor[]> {
  return listComments(issueId);
}
