import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

export const config = {
  port: parseInt(process.env.PORT || "4100"),
  newsApiKey: process.env.NEWS_API_KEY || "",
  googleApiKey: process.env.GOOGLE_API_KEY || "",
  googleSearchEngineId: process.env.GOOGLE_SEARCH_ENGINE_ID || "",
  scrapeIntervalHours: parseInt(process.env.SCRAPE_INTERVAL_HOURS || "6"),
  maxConcurrentRequests: parseInt(process.env.MAX_CONCURRENT_REQUESTS || "3"),
  requestDelayMs: parseInt(process.env.REQUEST_DELAY_MS || "2000"),
  dbPath: process.env.DB_PATH || path.resolve(__dirname, "../data/research.db"),
};

// Search topics the pipeline tracks
export const TOPICS = {
  SOLAR_TOKENIZATION: "solar energy tokenization",
  RWA: "real world asset tokenization",
  CARBON_CREDITS: "carbon credit tokenization blockchain",
  ENERGY_BLOCKCHAIN: "renewable energy blockchain",
  GREEN_BONDS: "green bond tokenization",
  SOLAR_INVESTMENT: "solar project investment platform",
  DEPIN: "decentralized physical infrastructure DePIN",
  TOKENIZED_ENERGY: "tokenized energy trading",
  APTOS_RWA: "aptos real world assets",
  APTOS_TOKENIZATION: "aptos tokenization",
  APTOS_DEFI: "aptos defi ecosystem",
  APTOS_MOVE: "aptos move language smart contract",
  APTOS_NFT: "aptos NFT digital asset",
  REGULATION: "tokenization regulation compliance",
} as const;

export const CATEGORIES = [
  "solar",
  "rwa",
  "carbon",
  "energy",
  "depin",
  "regulation",
  "investment",
  "blockchain",
  "aptos",
  "general",
] as const;

export type Category = (typeof CATEGORIES)[number];

export interface Article {
  id?: number;
  title: string;
  url: string;
  source: string;
  summary: string;
  content: string;
  category: Category;
  tags: string[];
  region: string;
  publishedAt: string;
  scrapedAt: string;
  relevanceScore: number;
}
