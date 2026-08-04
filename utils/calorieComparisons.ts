import type { AppLanguage } from "@/i18n";

/**
 * The website's pedagogical calorie comparison — "Motsvarar cirka 1
 * cheeseburgare" — ported VERBATIM from Nutri-Frontend
 * src/lib/calorieComparisons.ts (bands, items, seeding and the protein
 * suffix are byte-for-byte the site's; only the Lang type is the app's).
 *
 * Danish is not on the website; it reuses the English lines rather than
 * inventing new food comparisons — the instruction was to use the existing
 * copy, not to author more.
 */

type Band = { min: number; max: number; items: string[] };

const SV_BANDS: Band[] = [
  {
    min: 100,
    max: 200,
    items: [
      "Motsvarar cirka 1 liten chokladboll",
      "Motsvarar cirka 1 glasspinne",
      "Motsvarar cirka 1 liten näve chips",
      "Motsvarar cirka 1 liten kaka",
      "Motsvarar cirka 1 liten latte med mjölk",
    ],
  },
  {
    min: 200,
    max: 300,
    items: [
      "Motsvarar cirka 1 chokladboll",
      "Motsvarar cirka 1 kanelbulle",
      "Motsvarar cirka 1 liten pommes",
      "Motsvarar cirka 1 donut",
      "Motsvarar cirka 1 muffins",
    ],
  },
  {
    min: 300,
    max: 400,
    items: [
      "Motsvarar cirka 2 chokladbollar",
      "Motsvarar cirka 1 stor kanelbulle",
      "Motsvarar cirka 1 semla",
      "Motsvarar cirka 1 milkshake",
      "Motsvarar cirka 1 cheeseburgare",
    ],
  },
  {
    min: 400,
    max: 500,
    items: [
      "Motsvarar cirka 2-3 chokladbollar",
      "Motsvarar cirka 1 stor semla",
      "Motsvarar cirka 1 mellan pommes",
      "Motsvarar cirka 1 croissant + kaffe latte",
      "Motsvarar cirka 1 cheeseburgare + liten läsk",
    ],
  },
  {
    min: 500,
    max: 600,
    items: [
      "Motsvarar cirka 3 chokladbollar",
      "Motsvarar cirka 2 kanelbullar",
      "Motsvarar cirka 1 mindre hamburgermeny",
      "Motsvarar cirka 1 stor milkshake",
      "Motsvarar cirka en halv kebabtallrik",
    ],
  },
  {
    min: 600,
    max: 700,
    items: [
      "Motsvarar cirka 3-4 chokladbollar",
      "Motsvarar cirka 1 cheeseburgare + pommes",
      "Motsvarar cirka en halv pizza",
      "Motsvarar cirka 1 lätt kebabrulle",
      "Motsvarar cirka 1 nachotallrik",
    ],
  },
  {
    min: 700,
    max: 800,
    items: [
      "Motsvarar cirka 4 chokladbollar",
      "Motsvarar cirka 1 hamburgermeny",
      "Motsvarar cirka en halv kebabpizza",
      "Motsvarar cirka 1 kebabrulle",
      "Motsvarar cirka 1 stor pommes + milkshake",
    ],
  },
  {
    min: 800,
    max: 900,
    items: [
      "Motsvarar cirka 4-5 chokladbollar",
      "Motsvarar cirka 1 stor burgermeny",
      "Motsvarar cirka en halv stor pizza",
      "Motsvarar cirka 1 kebabtallrik",
      "Motsvarar cirka 1 friterad kyckling-meny",
    ],
  },
  {
    min: 900,
    max: 1000,
    items: [
      "Motsvarar cirka 5 chokladbollar",
      "Motsvarar cirka 1 stor snabbmatsmeny",
      "Motsvarar nästan 1 hel pizza",
      "Motsvarar cirka 1 lätt kebabpizza",
      "Motsvarar cirka chips + läsk + godis",
    ],
  },
  {
    min: 1000,
    max: 1100,
    items: [
      "Motsvarar cirka 5-6 chokladbollar",
      "Motsvarar cirka 1 hel pizza",
      "Motsvarar cirka 1 kebabpizza",
      "Motsvarar cirka 1 extra stor burgermeny",
      "Motsvarar cirka 1 stor kebabtallrik + läsk",
    ],
  },
];

const EN_BANDS: Band[] = [
  { min: 100, max: 200, items: ["About 1 small cookie", "About 1 small ice cream bar", "About 1 small handful of chips", "About 1 small latte with milk", "About 1 small chocolate bite"] },
  { min: 200, max: 300, items: ["About 1 cinnamon bun", "About 1 small fries", "About 1 donut", "About 1 muffin", "About 1 chocolate ball"] },
  { min: 300, max: 400, items: ["About 2 chocolate balls", "About 1 large cinnamon bun", "About 1 milkshake", "About 1 cheeseburger", "About 1 small fast-food side"] },
  { min: 400, max: 500, items: ["About 2-3 chocolate balls", "About 1 medium fries", "About 1 croissant + latte", "About 1 cheeseburger + small soda", "About 1 rich bakery pastry"] },
  { min: 500, max: 600, items: ["About 3 chocolate balls", "About 2 cinnamon buns", "About 1 smaller burger meal", "About 1 large milkshake", "About half a kebab plate"] },
  { min: 600, max: 700, items: ["About 3-4 chocolate balls", "About 1 cheeseburger + fries", "About half a pizza", "About 1 light kebab wrap", "About 1 nacho plate"] },
  { min: 700, max: 800, items: ["About 4 chocolate balls", "About 1 burger meal", "About half a kebab pizza", "About 1 kebab wrap", "About 1 large fries + milkshake"] },
  { min: 800, max: 900, items: ["About 4-5 chocolate balls", "About 1 large burger meal", "About half a large pizza", "About 1 kebab plate", "About 1 fried chicken meal"] },
  { min: 900, max: 1000, items: ["About 5 chocolate balls", "About 1 large fast-food meal", "About almost 1 whole pizza", "About 1 light kebab pizza", "About chips + soda + candy"] },
  { min: 1000, max: 1100, items: ["About 5-6 chocolate balls", "About 1 whole pizza", "About 1 kebab pizza", "About 1 extra-large burger meal", "About 1 large kebab plate + soda"] },
];

const BANDS: Record<AppLanguage, Band[]> = {
  sv: SV_BANDS,
  en: EN_BANDS,
  // Danish reuses the English comparisons — see the header.
  da: EN_BANDS,
};

function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function getCalorieComparison(
  kcal: number,
  protein?: number,
  seed?: string,
  lang: AppLanguage = "sv",
): string {
  const band = BANDS[lang].find((b) => kcal >= b.min && kcal < b.max);
  if (!band) return "";

  const hash = seed ? hashSeed(seed) : 0;
  const base = band.items[hash % band.items.length];

  if (!protein || protein <= 0) return `${base}.`;

  return lang === "sv"
    ? `${base} - men med ${protein}g protein.`
    : `${base}, but with ${protein}g protein.`;
}
