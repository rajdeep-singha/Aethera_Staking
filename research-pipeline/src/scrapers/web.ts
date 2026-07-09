import axios from "axios";
import * as cheerio from "cheerio";
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

// Curated pages and search endpoints to scrape
const WEB_SOURCES: { url: string; name: string; type: "listing" | "search" }[] = [
  {
    url: "https://www.coindesk.com/tag/tokenization/",
    name: "CoinDesk Tokenization",
    type: "listing",
  },
  {
    url: "https://cointelegraph.com/tags/tokenization",
    name: "CoinTelegraph Tokenization",
    type: "listing",
  },
  {
    url: "https://www.ledgerinsights.com/tag/tokenization/",
    name: "Ledger Insights",
    type: "listing",
  },
  {
    url: "https://www.pv-magazine.com/?s=tokenization+blockchain",
    name: "PV Magazine",
    type: "search",
  },
  {
    url: "https://www.energy-storage.news/?s=tokenization",
    name: "Energy Storage News",
    type: "search",
  },
  // Aptos-specific sources
  {
    url: "https://www.coindesk.com/tag/aptos/",
    name: "CoinDesk Aptos",
    type: "listing",
  },
  {
    url: "https://cointelegraph.com/tags/aptos",
    name: "CoinTelegraph Aptos",
    type: "listing",
  },
  {
    url: "https://www.theblock.co/tag/aptos",
    name: "The Block Aptos",
    type: "listing",
  },
  {
    url: "https://messari.io/asset/aptos/profile",
    name: "Messari Aptos",
    type: "listing",
  },
];

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml",
  "Accept-Language": "en-US,en;q=0.9",
};

export class WebScraper extends BaseScraper {
  name = "web";

  async scrape(query: string): Promise<ScraperResult> {
    const articles: Article[] = [];
    const errors: string[] = [];

    for (const source of WEB_SOURCES) {
      try {
        logger.info(`Web: Scraping ${source.name}...`);
        const { data } = await axios.get(source.url, {
          headers: HEADERS,
          timeout: 15000,
        });

        const $ = cheerio.load(data);
        const extracted = this.extractArticles($, source.name, source.url);
        articles.push(...extracted);

        await this.delay(config.requestDelayMs);
      } catch (err) {
        const msg = `Web: Failed to scrape ${source.name}: ${(err as Error).message}`;
        logger.warn(msg);
        errors.push(msg);
      }
    }

    // Also scrape Google News search results if no API key needed
    try {
      const googleArticles = await this.scrapeGoogleNews(query);
      articles.push(...googleArticles);
    } catch (err) {
      errors.push(`Web: Google News scrape failed: ${(err as Error).message}`);
    }

    // If query is Aptos-related, run extra targeted Google News searches
    if (/aptos/i.test(query)) {
      const aptosQueries = [
        "aptos tokenization RWA",
        "aptos blockchain DeFi 2025 2026",
        "aptos move language token",
      ];
      for (const aq of aptosQueries) {
        try {
          const extra = await this.scrapeGoogleNews(aq);
          articles.push(...extra);
        } catch (err) {
          errors.push(`Web: Aptos Google News (${aq}) failed: ${(err as Error).message}`);
        }
      }
    }

    logger.info(`Web: Collected ${articles.length} articles`);
    return this.createResult(articles, errors);
  }

  private extractArticles(
    $: cheerio.CheerioAPI,
    sourceName: string,
    baseUrl: string
  ): Article[] {
    const articles: Article[] = [];

    // Generic article extraction — works across most news sites
    const selectors = [
      "article",
      ".post",
      ".article-card",
      ".story-card",
      '[class*="article"]',
      '[class*="post-item"]',
      ".search-result",
    ];

    for (const selector of selectors) {
      $(selector).each((_, el) => {
        const $el = $(el);
        const titleEl =
          $el.find("h1 a, h2 a, h3 a, .title a, .headline a").first();
        const title = titleEl.text().trim() || $el.find("h2, h3").first().text().trim();
        let url = titleEl.attr("href") || "";

        if (!title || title.length < 10) return;

        // Resolve relative URLs
        if (url && !url.startsWith("http")) {
          const base = new URL(baseUrl);
          url = new URL(url, base.origin).href;
        }

        const snippet =
          $el.find("p, .excerpt, .summary, .description").first().text().trim() || "";

        const article: Article = {
          title,
          url,
          source: sourceName,
          summary: snippet.slice(0, 500),
          content: snippet.slice(0, 5000),
          category: categorizeArticle(title, snippet),
          tags: extractTags(title, snippet),
          region: detectRegion(title, snippet),
          publishedAt:
            $el.find("time").attr("datetime") || new Date().toISOString(),
          scrapedAt: new Date().toISOString(),
          relevanceScore: computeRelevanceScore(title, snippet, sourceName),
        };

        articles.push(article);
      });

      if (articles.length > 0) break; // use first matching selector
    }

    return articles;
  }

  private async scrapeGoogleNews(query: string): Promise<Article[]> {
    const articles: Article[] = [];
    const searchQuery = encodeURIComponent(`${query} tokenization`);
    const url = `https://news.google.com/rss/search?q=${searchQuery}&hl=en-US&gl=US&ceid=US:en`;

    try {
      logger.info("Web: Fetching Google News RSS...");
      const { data } = await axios.get(url, {
        headers: HEADERS,
        timeout: 15000,
      });

      const $ = cheerio.load(data, { xmlMode: true });
      $("item").each((_, el) => {
        const $el = $(el);
        const title = $el.find("title").text().trim();
        const link = $el.find("link").text().trim();
        const pubDate = $el.find("pubDate").text().trim();
        const source = $el.find("source").text().trim() || "Google News";

        if (!title) return;

        articles.push({
          title,
          url: link,
          source: `Google News / ${source}`,
          summary: title,
          content: title,
          category: categorizeArticle(title, ""),
          tags: extractTags(title, ""),
          region: detectRegion(title, ""),
          publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
          scrapedAt: new Date().toISOString(),
          relevanceScore: computeRelevanceScore(title, "", source),
        });
      });
    } catch (err) {
      logger.warn(`Web: Google News failed: ${(err as Error).message}`);
    }

    return articles;
  }
}
