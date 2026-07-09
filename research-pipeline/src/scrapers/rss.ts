import Parser from "rss-parser";
import { BaseScraper, type ScraperResult } from "./base.js";
import type { Article } from "../config.js";
import {
  computeRelevanceScore,
  categorizeArticle,
  extractTags,
  detectRegion,
} from "../utils/relevance.js";
import { logger } from "../utils/logger.js";
import { config } from "../config.js";

// RSS feeds covering tokenization, solar, RWA, blockchain energy
const RSS_FEEDS: { url: string; name: string }[] = [
  // Crypto / tokenization
  { url: "https://www.coindesk.com/arc/outboundfeeds/rss/", name: "CoinDesk" },
  { url: "https://cointelegraph.com/rss", name: "CoinTelegraph" },
  { url: "https://decrypt.co/feed", name: "Decrypt" },
  { url: "https://thedefiant.io/feed", name: "The Defiant" },
  { url: "https://www.theblock.co/rss.xml", name: "The Block" },

  // Solar / energy
  { url: "https://www.pv-magazine.com/feed/", name: "PV Magazine" },
  { url: "https://solarpowerworldonline.com/feed/", name: "Solar Power World" },
  { url: "https://cleantechnica.com/feed/", name: "CleanTechnica" },
  { url: "https://reneweconomy.com.au/feed/", name: "RenewEconomy" },

  // General finance / regulation
  { url: "https://www.ledgerinsights.com/feed/", name: "Ledger Insights" },

  // Aptos ecosystem
  { url: "https://medium.com/feed/tag/aptos", name: "Medium Aptos" },
  { url: "https://medium.com/feed/aptoslabs", name: "Aptos Labs Blog" },
];

export class RssScraper extends BaseScraper {
  name = "rss";
  private parser = new Parser({
    timeout: 15000,
    headers: {
      "User-Agent": "AetheraResearchBot/1.0 (tokenization research)",
    },
  });

  async scrape(query: string): Promise<ScraperResult> {
    const articles: Article[] = [];
    const errors: string[] = [];
    const queryLower = query.toLowerCase();

    for (const feed of RSS_FEEDS) {
      try {
        logger.info(`RSS: Fetching ${feed.name}...`);
        const parsed = await this.parser.parseURL(feed.url);

        for (const item of parsed.items || []) {
          const title = item.title || "";
          const content = item.contentSnippet || item.content || "";
          const combined = `${title} ${content}`.toLowerCase();

          // Filter: must match query or contain tokenization/Aptos-related terms
          const isRelevant =
            combined.includes(queryLower) ||
            /tokeniz|rwa|real.world.asset|solar.*blockchain|energy.*token|depin|carbon.*token/i.test(combined) ||
            /aptos|move.language|aptoslabs|aptos.*defi|aptos.*nft/i.test(combined);

          if (!isRelevant) continue;

          const article: Article = {
            title,
            url: item.link || "",
            source: feed.name,
            summary: (item.contentSnippet || "").slice(0, 500),
            content: (item.content || item.contentSnippet || "").slice(0, 5000),
            category: categorizeArticle(title, content),
            tags: extractTags(title, content),
            region: detectRegion(title, content),
            publishedAt: item.isoDate || item.pubDate || new Date().toISOString(),
            scrapedAt: new Date().toISOString(),
            relevanceScore: computeRelevanceScore(title, content, feed.name),
          };

          articles.push(article);
        }

        await this.delay(config.requestDelayMs);
      } catch (err) {
        const msg = `RSS: Failed to fetch ${feed.name}: ${(err as Error).message}`;
        logger.warn(msg);
        errors.push(msg);
      }
    }

    logger.info(`RSS: Collected ${articles.length} relevant articles`);
    return this.createResult(articles, errors);
  }
}
