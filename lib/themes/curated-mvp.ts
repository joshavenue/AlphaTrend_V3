type CuratedThemeDetails = {
  indirectCategories: string[];
  supplyConstraints: string[];
  pricingPowerPoints: string[];
  requiredEconomicProof: string[];
  invalidationRules: string[];
};

export const MVP_THEME_CODES = ["T001", "T002", "T004", "T007", "T017"];

export const CURATED_MVP_THEME_DETAILS: Record<string, CuratedThemeDetails> = {
  T001: {
    indirectCategories: [
      "advanced packaging suppliers",
      "semiconductor capital equipment suppliers",
      "EDA software suppliers",
      "AI server networking and interconnect suppliers",
    ],
    invalidationRules: [
      "Hyperscaler AI capex guidance weakens or shifts away from accelerator purchases.",
      "Accelerator, ASIC, foundry, or high-speed networking revenue growth decelerates without backlog support.",
      "Advanced-node or packaging bottlenecks ease while pricing and gross margin contract.",
      "Direct beneficiaries show inventory build, order cancellations, or materially weaker data-center guidance.",
    ],
    pricingPowerPoints: [
      "accelerator ASPs and mix",
      "custom ASIC design wins",
      "advanced-node wafer pricing and utilization",
      "high-speed networking silicon attach rates",
    ],
    requiredEconomicProof: [
      "AI training and inference capex or order commentary from hyperscalers and server OEMs.",
      "GPU, accelerator, custom ASIC, foundry, or networking backlog/order growth.",
      "Data-center semiconductor revenue growth tied to AI workloads.",
      "Evidence that advanced-node capacity, packaging, or networking supply remains constrained.",
    ],
    supplyConstraints: [
      "advanced-node foundry capacity",
      "advanced packaging capacity",
      "HBM and substrate supply",
      "high-speed networking silicon qualification cycles",
    ],
  },
  T002: {
    indirectCategories: [
      "memory process equipment suppliers",
      "SSD controller suppliers",
      "AI server OEMs with storage attach-rate leverage",
      "storage test and packaging suppliers",
    ],
    invalidationRules: [
      "DRAM, HBM, NAND, enterprise SSD, or HDD pricing weakens across multiple checks.",
      "Storage and memory vendors report order cuts, inventory builds, or lower data-center demand.",
      "Gross margin fails to improve despite claimed scarcity.",
      "Customer capex moves away from storage-intensive AI workloads.",
    ],
    pricingPowerPoints: [
      "HBM contract pricing",
      "DRAM and NAND spot/contract pricing",
      "enterprise SSD mix",
      "nearline HDD capacity pricing",
    ],
    requiredEconomicProof: [
      "HBM, DRAM, NAND, enterprise SSD, HDD, or controller order growth.",
      "Memory/storage pricing improvement from vendor commentary or market data.",
      "Data-center storage demand cited in guidance, backlog, or customer capex.",
      "Margin expansion or mix improvement tied to AI data-center storage demand.",
    ],
    supplyConstraints: [
      "HBM capacity",
      "advanced DRAM and NAND supply",
      "enterprise SSD controller availability",
      "high-capacity HDD manufacturing lead times",
    ],
  },
  T004: {
    indirectCategories: [
      "grid equipment suppliers",
      "data-center REITs with construction backlog",
      "engineering and construction services",
      "thermal component suppliers",
    ],
    invalidationRules: [
      "Data-center power, cooling, or electrical order backlog declines.",
      "Utilities or grid operators report load delays, cancellations, or lower interconnection demand.",
      "Electrical equipment margins compress while management cites weaker data-center demand.",
      "AI data-center capex growth slows without offsetting grid or power infrastructure orders.",
    ],
    pricingPowerPoints: [
      "switchgear lead times",
      "cooling-system backlog",
      "electrical equipment margin mix",
      "data-center construction services utilization",
    ],
    requiredEconomicProof: [
      "AI data-center construction or power demand increases.",
      "Switchgear, cooling, electrical equipment, or grid services backlog/order growth.",
      "Management commentary linking revenue or margin to data-center power bottlenecks.",
      "Utility load-growth or interconnection evidence tied to data centers.",
    ],
    supplyConstraints: [
      "transformer and switchgear capacity",
      "thermal management equipment lead times",
      "skilled electrical construction labor",
      "grid interconnection and transmission capacity",
    ],
  },
  T007: {
    indirectCategories: [
      "nuclear engineering services",
      "nuclear component suppliers",
      "reactor technology developers",
      "utilities with material nuclear generation exposure",
    ],
    invalidationRules: [
      "Uranium contracting activity, term prices, or enrichment demand weakens.",
      "Reactor life-extension, restart, or SMR project momentum stalls materially.",
      "Direct beneficiaries fail to convert higher uranium prices into revenue, margin, or cash-flow improvement.",
      "Policy, permitting, or financing delays materially reduce nuclear generation growth expectations.",
    ],
    pricingPowerPoints: [
      "uranium term contract pricing",
      "enrichment and conversion pricing",
      "long-term fuel service contracts",
      "scarce permitted uranium production capacity",
    ],
    requiredEconomicProof: [
      "Uranium term contracting, spot/term price strength, or enrichment/conversion demand.",
      "Utility nuclear fuel procurement or reactor life-extension evidence.",
      "SMR, restart, or new-build project milestones with credible funding or customers.",
      "Revenue, margin, or cash-flow validation from uranium, enrichment, fuel, or nuclear services beneficiaries.",
    ],
    supplyConstraints: [
      "permitted uranium mine supply",
      "conversion and enrichment capacity",
      "qualified nuclear fuel services",
      "long reactor procurement and licensing cycles",
    ],
  },
  T017: {
    indirectCategories: [
      "aerospace component suppliers",
      "secure communications suppliers",
      "defense software and autonomy suppliers",
      "materials and propulsion suppliers with defense programs",
    ],
    invalidationRules: [
      "Defense budget, procurement, or funded backlog weakens for drone, autonomy, missile, or sensor programs.",
      "Specialized defense technology revenue fails to convert into order growth or margin expansion.",
      "Prime contractor exposure remains broad defense spending without theme-specific program leverage.",
      "Commercial aerospace weakness overwhelms defense or autonomy exposure.",
    ],
    pricingPowerPoints: [
      "funded backlog",
      "sole-source or high-spec program positions",
      "drone and autonomy system demand",
      "missile defense and sensor program growth",
    ],
    requiredEconomicProof: [
      "Defense procurement growth for drones, autonomy, missile defense, sensors, or electronics.",
      "Funded backlog, bookings, awards, or program wins tied to the theme.",
      "Management commentary connecting revenue growth to defense modernization or geopolitical demand.",
      "Margin or cash-flow improvement from scaled defense technology programs.",
    ],
    supplyConstraints: [
      "qualified defense electronics supply",
      "munitions and propulsion capacity",
      "secure sensor and communications qualification cycles",
      "program certification and procurement lead times",
    ],
  },
};
