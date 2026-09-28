import dotenv from "dotenv";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { OpenAIEmbeddings } from "@langchain/openai";
import { QdrantVectorStore } from "@langchain/qdrant";
import { fileURLToPath } from "node:url";

dotenv.config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });

const openAIKey = process.env.OPENAI_API_KEY;
const qdrantUrl = process.env.QDRANT_URL;

if (!openAIKey) {
  throw new Error("Missing OPENAI_API_KEY in the repository-root .env file.");
}

if (!qdrantUrl) {
  throw new Error("Missing QDRANT_URL in the repository-root .env file.");
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

const embeddings = new OpenAIEmbeddings({
  model: "text-embedding-3-large",
});
// todo: add metadata like page number, page count, etc.
await QdrantVectorStore.fromDocuments(chunks, embeddings, {
  url: qdrantUrl,
  collectionName: "the-bhagavad-geeta",

});

console.log({ documentsLoaded: docs.length, chunksIndexed: chunks.length });