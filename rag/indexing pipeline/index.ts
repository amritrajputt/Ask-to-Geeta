import dotenv from "dotenv";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { OpenAIEmbeddings } from "@langchain/openai";
import { QdrantVectorStore, type QdrantLibArgs } from "@langchain/qdrant";
import { fileURLToPath } from "node:url";

dotenv.config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });

function requireEnv(name: "OPENAI_API_KEY" | "QDRANT_URL"): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing ${name} in the repository-root .env file.`);
  }

  return value;
}

const openAIKey = requireEnv("OPENAI_API_KEY");
const qdrantUrl = new URL(requireEnv("QDRANT_URL"));

if (qdrantUrl.protocol !== "http:" && qdrantUrl.protocol !== "https:") {
  throw new Error("QDRANT_URL must use the http or https protocol.");
}

const pdfPath = fileURLToPath(new URL("../The Bhagavad Gita.pdf", import.meta.url));
const loader = new PDFLoader(pdfPath);
const docs = await loader.load();

if (docs.length === 0) {
  throw new Error(`No pages were extracted from ${pdfPath}.`);
}

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1000,
  chunkOverlap: 150,
});
const chunks = await splitter.splitDocuments(docs);

if (chunks.length === 0) {
  throw new Error("No text chunks were created from the PDF.");
}

const embeddings = new OpenAIEmbeddings({
  model: "text-embedding-3-large",
  apiKey: openAIKey,
});
const sourceUrl = "/sources/the-bhagavad-gita.pdf";

for (const chunk of chunks) {
  const pageNumber = chunk.metadata.loc?.pageNumber;
  console.log({ pageNumber });
  if (typeof pageNumber !== "number") {
    throw new Error("A chunk is missing its source PDF page number.");
  }

  Object.assign(chunk.metadata, {
    sourceId: "bhagavad-gita-pdf",
    sourceTitle: "The Bhagavad Gita",
    sourceType: "pdf",
    sourceUrl: `${sourceUrl}#page=${pageNumber}`,
    pageNumber,
    pageCount: docs.length,
  });
}

const qdrantConfig = {
  url: qdrantUrl.href,
  collectionName: "the-bhagavad-geeta",
} satisfies QdrantLibArgs;

const vectorStore = new QdrantVectorStore(embeddings, qdrantConfig);
const batchSize = 100;

for (let startIndex = 0; startIndex < chunks.length; startIndex += batchSize) {
  await vectorStore.addDocuments(chunks.slice(startIndex, startIndex + batchSize));
}

console.log({ documentsLoaded: docs.length, chunksIndexed: chunks.length });