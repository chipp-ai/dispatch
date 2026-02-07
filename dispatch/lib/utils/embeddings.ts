import OpenAI from "openai";

const EMBEDDING_MODEL = "text-embedding-3-large";

// Lazy initialization to avoid build-time errors when OPENAI_API_KEY isn't set
let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openaiClient;
}
const EMBEDDING_DIMENSIONS = 3072;

export interface EmbeddingResult {
  vector: number[];
  provider: string;
  model: string;
}

export async function generateEmbedding(
  text: string
): Promise<EmbeddingResult> {
  const response = await getOpenAIClient().embeddings.create({
    model: EMBEDDING_MODEL,
    input: text.slice(0, 8000), // Limit input length
    dimensions: EMBEDDING_DIMENSIONS,
  });

  return {
    vector: response.data[0].embedding,
    provider: "openai",
    model: EMBEDDING_MODEL,
  };
}

export async function generateEmbeddingForIssue(
  title: string,
  description: string | null
): Promise<EmbeddingResult> {
  const text = description ? `${title}\n\n${description}` : title;
  return generateEmbedding(text);
}

export function vectorToString(vector: number[]): string {
  return `[${vector.join(",")}]`;
}
