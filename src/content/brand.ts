export const PRODUCT_BRAND = {
  name: 'Crystal',
  shellLabel: 'A clearer read on what may happen next',
  tagline: 'Clear forecasts, useful context, no extra noise.',
  primaryCta: 'Run a forecast',
  secondaryCta: 'See how it works',
  tutorialLabel: 'How it works',
  tutorialReplayLabel: 'Replay tutorial',
  plansLabel: 'Plans',
  plansTitle: 'Crystal Plans',
  guestLabel: 'Guest preview',
  savedLabel: 'Saved',
} as const;

export const WORLD_SIM_BRAND = {
  name: 'WorldSim',
  betaName: 'WorldSim Beta',
  previewName: 'WorldSim Preview',
  matrixName: 'Matrix Simulation',
  observeLabel: 'Observe',
  interveneLabel: 'Intervene',
  shortDescription: 'A premium simulation observatory for actors, pressure, and chain reactions.',
  honestNote:
    'Every plan uses the same engine. Depth, queue priority, and agent budget change by tier. WorldSim enriches the forecast; it does not replace it.',
  previewNote: 'Preview mode: the observatory is designed and ready, but the live backend is not connected yet.',
  betaNote:
    'Beta mode: the observatory is connected and usable through the adapter while Crystal validates the original runtime path.',
  liveNote: 'Live mode: this chamber is reading the current simulation digest.',
  matrixPreviewNote:
    'Matrix Simulation runs structured interventions and compares a baseline world with an alternate branch. In beta, some runs may still validate the original runtime before the chamber is fully live.',
  enterLabel: 'Open the observatory',
  teaserTitle: 'A simulation observatory for questions that need more than a single number.',
  teaserBody:
    'Use it when the answer depends on actors, pressure, second-order effects, and how a system reacts over time.',
} as const;

export const SECTION_COPY = {
  home: {
    navDescription: "Your starting point: today's signals, saved themes, and a quick read on what deserves attention.",
    headerDescription: 'A calm overview of what matters now, what you are tracking, and where to go next.',
    heroKicker: 'Start here',
    heroTitle: 'See what may matter next, faster.',
    heroBody:
      'Ask a clear question and Crystal turns it into a readable answer: what may happen, why it looks plausible, and what to watch now.',
  },
  forecast: {
    navDescription: 'Turn a question into a clear answer, the reasoning behind it, and the next signals worth watching.',
    headerDescription: 'A calmer way to turn uncertainty into a readable forecast, useful context, and next steps.',
    heroKicker: 'Forecast',
    heroTitle: 'One clear question. One clear read.',
    heroBody:
      'Crystal keeps the flow simple: what may happen, why it looks plausible, and when it is worth opening the WorldSim layer.',
  },
  nextletter: {
    navDescription: 'A daily read that keeps signals, context, and next moves in one useful place.',
    headerDescription: 'A more useful daily read: signals, context, and next moves without the theater.',
    heroKicker: 'Nextletter',
    heroTitle: 'Your daily read, made more useful.',
    heroBody:
      'Use Global Edition to orient quickly. Use Personal Edition to turn your themes into a more focused daily briefing.',
  },
  watchlist: {
    navDescription: 'Keep cities, countries, and themes in one calm pulse board with clear status and less noise.',
    headerDescription: 'Save the things you care about and read their pulse in a cleaner, steadier way.',
    heroKicker: 'Watchlist',
    heroTitle: 'Keep the right things in view.',
    heroBody:
      'Save a city, country, sector, or theme. Crystal reuses that context across Home, Forecast, and Nextletter.',
  },
  profile: {
    navDescription: 'A little context makes Forecast and Nextletter more personal, relevant, and useful.',
    headerDescription: 'A few details about you make the product more relevant without turning it into a long setup.',
    heroKicker: 'Profile',
    heroTitle: 'A little context. Better reads.',
    heroBody:
      'Add only what matters: where you are, what you do, and what you follow. Crystal uses that context to make each read more relevant.',
  },
} as const;

export const TUTORIAL_STEPS = [
  {
    id: 'what',
    kicker: 'What Crystal does',
    title: 'Crystal turns a question about the future into something you can actually read.',
    description:
      'Instead of giving you only text, it tries to give you a clear position: what may happen, why it looks plausible, and what to watch next.',
    bullets: [
      'You get a direct answer, not only a summary.',
      'You see the main drivers behind the forecast.',
      'You can save themes and revisit signals over time.',
    ],
  },
  {
    id: 'layers',
    kicker: 'Forecast vs WorldSim',
    title: 'Forecast answers first. WorldSim opens the deeper simulation layer.',
    description:
      'The base forecast gives you the readable answer. WorldSim comes in when actors, pressure, and chain reactions matter.',
    bullets: [
      'Forecast: answer, probability, risk, and next signals.',
      'WorldSim: pivotal actors, turning points, and deeper scenarios.',
      'WorldSim adds context. It does not replace the base engine.',
    ],
  },
  {
    id: 'action',
    kicker: 'Your first move',
    title: 'Start with one concrete question.',
    description:
      'The fastest way to understand the product is to run a simple forecast, save one theme in Watchlist, and then open Nextletter.',
    bullets: [
      'Try a short-horizon question first.',
      'Save one city, country, or theme in Watchlist.',
      'Open Nextletter to see the briefing side of the product.',
    ],
  },
] as const;

export const PLAN_COPY = {
  defaultUpgradeTitle: `Unlock the next layer of ${PRODUCT_BRAND.name}`,
  defaultUpgradeDescription: 'More credits, more continuity, and easier access to premium layers when they matter.',
  loginTitle: `Sign in to unlock ${PRODUCT_BRAND.name}`,
  loginDescription: 'Create a free account to save themes, use monthly credits, and activate personal surfaces.',
  checkoutError: 'Unable to open checkout.',
  billingDisabled: 'Billing is temporarily unavailable during the current test rollout.',
  currentPlanLabel: 'Current plan',
  monthlyLabel: 'Monthly',
  yearlyLabel: 'Yearly',
  yearlySavingsLabel: 'Save vs monthly',
  recommendedLabel: 'Recommended',
  currentPlanButton: 'Current plan',
  guestButton: 'Sign in for free',
} as const;

export const RUNTIME_COPY = {
  forecastPreview:
    'The full live forecast needs the backend to be active. For now you can still explore the product and see how the answers are structured.',
  forecastLimited:
    'Forecast is available and WorldSim can run in beta while the original runtime completes live validation.',
  worldSimPreview: WORLD_SIM_BRAND.previewNote,
  worldSimBeta: WORLD_SIM_BRAND.betaNote,
  worldSimLive: WORLD_SIM_BRAND.liveNote,
  runtimeLiveTitle: 'Live runtime',
  runtimeLiveDetail: 'Forecast and WorldSim are connected to the live backend.',
  runtimeLimitedTitle: 'Limited runtime',
  runtimeLimitedDetail:
    'Forecast is available, and WorldSim is usable in beta while the original runtime is still validating live completion.',
  runtimePreviewTitle: 'Preview runtime',
  runtimePreviewDetail:
    'The live backend is not connected yet. You can still explore the product structure and preview the premium layers.',
} as const;
