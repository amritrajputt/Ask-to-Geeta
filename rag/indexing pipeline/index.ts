import {PDFLoader} from "@langchain/community/document_loaders/fs/pdf";
import { fileURLToPath } from "node:url";

const pdfPath = fileURLToPath(new URL("../The Bhagavad Gita.pdf", import.meta.url));
const loader = new PDFLoader(pdfPath);
const docs = await loader.load();
console.log({ documentsLoaded: docs.length });
