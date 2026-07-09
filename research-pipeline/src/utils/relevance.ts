import type { Category } from "../config.js";

// Keywords with weights for relevance scoring
const KEYWORD_WEIGHTS: Record<string, number> = {
  // High relevance — core topics
  tokenization: 10,
  tokenize: 10,
  tokenized: 10,
  "solar energy": 15,
  "solar panel": 12,
  "solar farm": 12,
  "real world asset": 12,
  rwa: 10,
  "carbon credit": 10,
  "green bond": 10,
  depin: 10,
  "renewable energy": 8,
  blockchain: 6,
  staking: 8,
  "energy trading": 9,
  aptos: 15,
  "aptos tokenization": 20,
  "aptos rwa": 18,
  "aptos defi": 14,
  "aptos nft": 12,
  "move language": 10,
  aptoslabs: 12,

  // Medium relevance
  "smart contract": 5,
  "digital asset": 5,
  "fractional ownership": 8,
  "clean energy": 7,
  sustainability: 5,
  "climate finance": 7,
  "energy transition": 6,
  photovoltaic: 8,
  "distributed energy": 7,

  // Regions / regulatory
  regulation: 6,
  compliance: 5,
  sec: 4,
  mifid: 4,
  mica: 4,
  "security token": 8,
  sto: 7,
};

export function computeRelevanceScore(
  title: string,
  content: string,
  source: string
): number {
  const text = `${title} ${content}`.toLowerCase();
  let score = 0;

  for (const [keyword, weight] of Object.entries(KEYWORD_WEIGHTS)) {
    const regex = new RegExp(keyword.toLowerCase(), "gi");
    const matches = text.match(regex);
    if (matches) {
      score += weight * Math.min(matches.length, 5); // cap repetitions
    }
  }

  // Boost for trusted sources
  const trustedSources = [
    "coindesk",
    "cointelegraph",
    "theblock",
    "decrypt",
    "solarpowerworldonline",
    "pv-magazine",
    "irena",
    "iea",
    "reuters",
    "bloomberg",
  ];
  if (trustedSources.some((s) => source.toLowerCase().includes(s))) {
    score *= 1.3;
  }

  // Minimum baseline — if any keyword matched, ensure at least 5
  if (score > 0 && score < 5) score = 5;

  return Math.round(Math.min(score, 100));
}

export function categorizeArticle(
  title: string,
  content: string
): Category {
  const text = `${title} ${content}`.toLowerCase();

  const categoryScores: Record<Category, number> = {
    solar: 0,
    rwa: 0,
    carbon: 0,
    energy: 0,
    depin: 0,
    regulation: 0,
    investment: 0,
    blockchain: 0,
    aptos: 0,
    general: 1,
  };

  if (/solar|photovoltaic|pv\s/i.test(text)) categoryScores.solar += 10;
  if (/real.world.asset|rwa|fractional.ownership/i.test(text)) categoryScores.rwa += 10;
  if (/carbon.credit|carbon.offset|emission/i.test(text)) categoryScores.carbon += 10;
  if (/renewable.energy|clean.energy|energy.trading|grid/i.test(text)) categoryScores.energy += 10;
  if (/depin|decentralized.physical/i.test(text)) categoryScores.depin += 10;
  if (/regulat|compliance|sec\b|mica\b|legal.framework/i.test(text)) categoryScores.regulation += 10;
  if (/invest|fund|capital|stake|yield|return/i.test(text)) categoryScores.investment += 8;
  if (/blockchain|smart.contract|web3|crypto|token(?!iz)/i.test(text)) categoryScores.blockchain += 5;
  if (/aptos|aptoslabs|move.language/i.test(text)) categoryScores.aptos += 15;

  let best: Category = "general";
  let bestScore = 0;
  for (const [cat, score] of Object.entries(categoryScores)) {
    if (score > bestScore) {
      bestScore = score;
      best = cat as Category;
    }
  }
  return best;
}

export function extractTags(title: string, content: string): string[] {
  const text = `${title} ${content}`.toLowerCase();
  const tags: string[] = [];

  const tagPatterns: [RegExp, string][] = [
    [/tokeniz/i, "tokenization"],
    [/solar/i, "solar"],
    [/rwa|real.world.asset/i, "rwa"],
    [/carbon/i, "carbon"],
    [/depin/i, "depin"],
    [/aptos/i, "aptos"],
    [/ethereum|eth\b/i, "ethereum"],
    [/polygon/i, "polygon"],
    [/regulat/i, "regulation"],
    [/invest/i, "investment"],
    [/staking/i, "staking"],
    [/green.bond/i, "green-bond"],
    [/energy.trading/i, "energy-trading"],
    [/fractional/i, "fractional-ownership"],
    [/nft/i, "nft"],
    [/dao\b/i, "dao"],
  ];

  for (const [pattern, tag] of tagPatterns) {
    if (pattern.test(text)) tags.push(tag);
  }

  return [...new Set(tags)];
}

export function detectRegion(title: string, content: string): string {
  const text = `${title} ${content}`.toLowerCase();

  const regionPatterns: [RegExp, string][] = [
    [/\b(usa|united states|america|u\.s\.|sec\b|nasdaq)\b/i, "North America"],
    [/\b(europe|eu\b|germany|france|uk\b|mica\b|mifid)\b/i, "Europe"],
    [/\b(india|mumbai|delhi|sebi)\b/i, "India"],
    [/\b(china|beijing|shanghai)\b/i, "China"],
    [/\b(japan|tokyo)\b/i, "Japan"],
    [/\b(singapore|mas\b)\b/i, "Singapore"],
    [/\b(australia|sydney|melbourne)\b/i, "Australia"],
    [/\b(brazil|latin.america)\b/i, "Latin America"],
    [/\b(africa|nigeria|kenya|south.africa)\b/i, "Africa"],
    [/\b(middle.east|uae|dubai|saudi)\b/i, "Middle East"],
    [/\b(korea|seoul)\b/i, "South Korea"],
  ];

  for (const [pattern, region] of regionPatterns) {
    if (pattern.test(text)) return region;
  }
  return "Global";
}
