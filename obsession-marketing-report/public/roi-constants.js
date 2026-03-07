/**
 * Obsession Marketing — ROI Model Constants
 *
 * All lift estimates are expressed as a percentage of annual revenue.
 * Conservative = realistic floor based on industry benchmarks.
 * Aggressive   = top-quartile performers.
 *
 * membershipPrice: known price per customer/member/seat from the prospect's website.
 *   Used to convert dollar lift estimates into real seat counts.
 *   Set to null if unknown — falls back to generic dollar-only display.
 *
 * unit: what one "seat" is called for this business (e.g. "member", "booking", "lead")
 *
 * Sources:
 *   Website: Utsubo 2026, ThillX CRO study — 20–50% conversion lift typical
 *   SEO:     BrightLocal (124% organic revenue increase avg), 400% ROI within 2 yrs
 *   Reviews: Harvard HBS (5–9% per star), SOCi (44% conv lift per +1 star)
 *   Social:  BrandMuscle 2024 — top local marketers see 56% more revenue
 *   Ads:     MetricNexus SMB 2026 — 2.5x–6.2x ROAS typical for SMBs
 *   Email:   Industry avg — email generates $36–$42 per $1 spent; 8–12% repeat lift
 */

// ─── Business-specific pricing (from prospect's website) ──────────────────
// Crushers Golf Lounge: $100/mo membership
// Update this per-prospect when deploying a report
const BUSINESS_MEMBERSHIP_PRICE = 100; // $ per month
const BUSINESS_UNIT = "member";        // singular label
const OBSESSION_MONTHLY_FEE = 300;     // our monthly retainer

const ROI_SERVICES = [
  {
    id: "website",
    name: "Website Redesign",
    icon: "🖥️",
    tagline: "Turn visitors into customers with a site that actually converts.",
    conservativePct: 0.10,
    aggressivePct:   0.25,
    unit: BUSINESS_UNIT,
    assumption: "A professionally redesigned website typically improves conversion rates by 20–50%. We apply a conservative 10–25% net revenue lift for local service businesses.",
    tooltip: "Utsubo 2026: well-executed redesigns deliver 20–50% conversion lift within 6 months. ThillX: CRO-driven redesigns deliver 223% ROI.",
    timeToResults: "2–4 months",
    color: "#4F46E5"
  },
  {
    id: "seo",
    name: "Local SEO",
    icon: "🔍",
    tagline: "Show up when locals search for what you offer.",
    conservativePct: 0.15,
    aggressivePct:   0.40,
    unit: BUSINESS_UNIT,
    assumption: "BrightLocal reports an average 124% organic revenue increase for SMBs with active local SEO. We apply a conservative 15–40% lift to account for timeline.",
    tooltip: "BrightLocal: avg 124% organic revenue increase. 40% of local SEO campaigns achieve 500%+ ROI. 46% of all Google searches have local intent.",
    timeToResults: "4–9 months",
    color: "#059669"
  },
  {
    id: "reviews",
    name: "Google Review Collection",
    icon: "⭐",
    tagline: "More 5-star reviews = more trust = more bookings.",
    conservativePct: 0.05,
    aggressivePct:   0.18,
    unit: BUSINESS_UNIT,
    assumption: "Harvard Business School research shows a 1-star rating improvement drives 5–9% revenue increase. Active review collection typically earns 1–2 stars over 6 months.",
    tooltip: "Harvard HBS: 5–9% revenue per star gained. SOCi: 44% conversion boost from +1.0 star. Businesses with 50+ reviews rank significantly higher.",
    timeToResults: "1–3 months",
    color: "#D97706"
  },
  {
    id: "social",
    name: "Social Media Management",
    icon: "📱",
    tagline: "Stay top-of-mind and drive repeat business through consistent posting.",
    conservativePct: 0.05,
    aggressivePct:   0.15,
    unit: BUSINESS_UNIT,
    assumption: "BrandMuscle 2024 found top local marketers see up to 56% more revenue growth vs. inactive competitors.",
    tooltip: "BrandMuscle 2024: active local social marketers see up to 56% more revenue. Primarily drives brand recall, referral traffic, and repeat customers.",
    timeToResults: "2–5 months",
    color: "#7C3AED"
  },
  {
    id: "ads",
    name: "Google Ads",
    icon: "📣",
    tagline: "Put your business in front of people actively searching to buy.",
    conservativePct: 0.12,
    aggressivePct:   0.30,
    unit: BUSINESS_UNIT,
    assumption: "MetricNexus SMB benchmarks show 2.5x–6.2x ROAS for local businesses spending $1K–$10K/month. Assumes ~5% of revenue in ad spend.",
    tooltip: "MetricNexus 2026: SMBs achieve 2.5x–6.2x ROAS. 75% of local searches convert into leads; 28% purchase within 24 hours.",
    timeToResults: "1–2 months",
    color: "#DC2626"
  },
  {
    id: "email",
    name: "Email Marketing",
    icon: "✉️",
    tagline: "Keep past customers coming back with targeted campaigns.",
    conservativePct: 0.08,
    aggressivePct:   0.20,
    unit: BUSINESS_UNIT,
    assumption: "Email marketing generates $36–$42 per $1 spent (DMA). We model an 8–20% revenue lift from improved customer retention and repeat bookings.",
    tooltip: "DMA: email averages $42 ROI per $1 spent. A 5% retention increase can boost profits 25–95% (Bain & Company).",
    timeToResults: "1–3 months",
    color: "#0891B2"
  }
];

// Combined lift cap — services compound but with diminishing returns
const COMBINED_CAP = {
  conservative: 0.80,
  aggressive: 1.50
};

// Export for use in both Node (Firebase Functions) and browser
if (typeof module !== "undefined") {
  module.exports = { ROI_SERVICES, COMBINED_CAP, BUSINESS_MEMBERSHIP_PRICE, BUSINESS_UNIT, OBSESSION_MONTHLY_FEE };
}
