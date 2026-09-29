import dotenv from "dotenv";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { OpenAIEmbeddings } from "@langchain/openai";
import { QdrantVectorStore, type QdrantLibArgs } from "@langchain/qdrant";
import { fileURLToPath } from "node:url";

const rootEnvPath = fileURLToPath(new URL("../../.env", import.meta.url));
dotenv.config({ path: rootEnvPath });

const openAiApiKey = process.env.OPENAI_API_KEY?.trim();
const qdrantUrlValue = process.env.QDRANT_URL?.trim();
const qdrantApiKey = process.env.QDRANT_API_KEY?.trim();

if (!openAiApiKey) {
  throw new Error("OPENAI_API_KEY is missing from the repository-root .env file.");
}

if (!qdrantUrlValue) {
  throw new Error("QDRANT_URL is missing from the repository-root .env file.");
}

const qdrantUrl = new URL(qdrantUrlValue);

if (qdrantUrl.protocol !== "http:" && qdrantUrl.protocol !== "https:") {
  throw new Error("QDRANT_URL must use http:// or https:// because Qdrant uses its REST API.");
}

const pdfPath = fileURLToPath(new URL("../The Bhagavad Gita.pdf", import.meta.url));
const pages = await new PDFLoader(pdfPath).load();



const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1000,
  chunkOverlap: 150,
});
const chunks = await splitter.splitDocuments(pages);

if (chunks.length === 0) {
  throw new Error("No text chunks were created from the PDF.");
}

const embeddings = new OpenAIEmbeddings({
  model: "text-embedding-3-large",
  apiKey: openAiApiKey,
});
const sourceUrl = "/sources/the-bhagavad-gita.pdf";

for (const chunk of chunks) {
  const pageNumber = chunk.metadata.loc?.pageNumber;

  if (typeof pageNumber !== "number") {
    throw new Error("A chunk is missing its source PDF page number.");
  }

  chunk.metadata = {
    ...chunk.metadata,
    sourceId: "bhagavad-gita-pdf",
    sourceTitle: "The Bhagavad Gita",
    sourceType: "pdf",
    sourceUrl: `${sourceUrl}#page=${pageNumber}`,
    pageNumber,
    pageCount: pages.length,
  };
}

const qdrantConfig = {
  url: qdrantUrl.href,
  collectionName: "the-bhagavad-geeta",
  ...(qdrantApiKey ? { apiKey: qdrantApiKey } : {}),
} satisfies QdrantLibArgs;

const vectorStore = new QdrantVectorStore(embeddings, qdrantConfig);
const chunkBatchSize = 100;
await vectorStore.ensureCollection();

const { count: storedChunkCount } = await vectorStore.client.count(
  qdrantConfig.collectionName,
  { exact: true },
);

if (storedChunkCount === chunks.length) {
  console.log({
    pagesLoaded: pages.length,
    chunksIndexed: storedChunkCount,
    embeddingsSkipped: true,
  });
} else {
  if (storedChunkCount !== 0) {
    throw new Error(
      `The Qdrant collection contains ${storedChunkCount} chunks, but this PDF produces ${chunks.length}. ` +
        "Clear the collection before indexing again to avoid duplicate or incomplete data.",
    );
  }

  for (let startIndex = 0; startIndex < chunks.length; startIndex += chunkBatchSize) {
    const chunkBatch = chunks.slice(startIndex, startIndex + chunkBatchSize);
    await vectorStore.addDocuments(chunkBatch);
  }

  console.log({ pagesLoaded: pages.length, chunksIndexed: chunks.length });
}