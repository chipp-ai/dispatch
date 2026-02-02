import { initEmbedder } from "./src/services/local-embeddings.service.ts";
import { processKnowledgeSource } from "./src/services/rag-ingestion.service.ts";

// Initialize embeddings model first
console.log("Initializing embeddings model...");
await initEmbedder();
console.log("Embeddings model ready");

const result = await processKnowledgeSource({
  knowledgeSourceId: "45efc3f2-ad4b-4e25-9cf8-2ad79d864fb0",
  applicationId: "53aedc18-2921-4eca-9139-9b99cb347f68",
});

console.log("Result:", result);
Deno.exit(0);
