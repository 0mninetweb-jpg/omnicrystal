export const PRODUCT_BRAND = {
  name: 'Crystal',
  shellLabel: 'Read what may happen next',
  tagline: 'Previsioni leggibili, senza rumore inutile.',
  tutorialLabel: 'How it works',
  tutorialReplayLabel: 'Replay tutorial',
  plansLabel: 'Plans',
  plansTitle: 'Crystal Plans',
  guestLabel: 'Guest preview',
};

export const WORLD_SIM_BRAND = {
  name: 'WorldSim',
  previewName: 'WorldSim Preview',
  matrixName: 'Matrix Simulation',
  observeLabel: 'Observe',
  interveneLabel: 'Intervene',
  shortDescription: 'Una simulation chamber premium per leggere attori, attriti e reazioni a catena.',
  honestNote: 'Usa lo stesso motore per tutti i piani: cambiano profondita, coda e numero di agenti. Non sostituisce il forecast base.',
  previewNote: 'Preview mode: la scena e pronta, ma il backend live non e ancora collegato.',
  liveNote: 'Live mode: questa scena sta leggendo il digest corrente del layer simulativo.',
  matrixPreviewNote:
    'Matrix Simulation usa interventi strutturati e una simulazione ipotetica. Finche il runtime completo non e live, i branch restano una preview guidata.',
  enterLabel: 'Apri la simulation chamber',
};

export const SECTION_COPY = {
  home: {
    navDescription: 'Il punto di partenza: segnali chiave, temi salvati e una lettura rapida di quello che conta oggi.',
    headerDescription: 'Una vista semplice dei segnali da seguire, dei temi salvati e di cosa merita attenzione adesso.',
    heroKicker: 'Start here',
    heroTitle: 'Capisci piu in fretta cosa potrebbe succedere dopo.',
    heroBody:
      'Fai una domanda chiara e Crystal la traduce in una lettura semplice: cosa puo succedere, perche e plausibile e cosa conviene guardare adesso.',
  },
  forecast: {
    navDescription: 'Fai una domanda e ottieni una risposta chiara, i motivi dietro il numero e cosa osservare dopo.',
    headerDescription: 'Trasforma una domanda in una previsione leggibile, con contesto, motivi principali e prossimi segnali.',
    heroKicker: 'Forecast',
    heroTitle: 'Una domanda chiara. Una risposta chiara.',
    heroBody:
      'Crystal ordina un tema complesso in tre livelli semplici: cosa puo succedere, perche sembra plausibile e quando vale la pena entrare nel layer WorldSim.',
  },
  nextletter: {
    navDescription: 'La tua lettura del giorno: segnali, contesto e mosse possibili, senza tono teatrale.',
    headerDescription: 'Una lettura quotidiana piu utile: segnali, contesto e cosa fare dopo in una forma semplice.',
    heroKicker: 'Nextletter',
    heroTitle: 'La lettura quotidiana, resa piu utile.',
    heroBody:
      'Usa la Global Edition per orientarti in pochi minuti. Usa la Personal Edition per rileggere i segnali piu vicini ai tuoi interessi.',
  },
  watchlist: {
    navDescription: 'Tieni sotto controllo citta, paesi e temi in una lista ordinata, con stato e pulse sempre leggibili.',
    headerDescription: 'Salva i temi che contano per te e rileggi il loro stato in modo semplice, senza rumore.',
    heroKicker: 'Watchlist',
    heroTitle: 'Tieni sotto osservazione le cose giuste.',
    heroBody:
      'Salva una citta, un paese o un tema. Crystal li riusa in Home, Forecast e Nextletter per darti un contesto piu personale.',
  },
  profile: {
    navDescription: 'Bastano pochi dettagli su di te per rendere Forecast e Nextletter piu pertinenti.',
    headerDescription: 'Un po di contesto rende l app piu utile: posizione, lavoro e interessi bastano per personalizzare il prodotto.',
    heroKicker: 'Profile',
    heroTitle: 'Pochi dettagli, forecast piu utili.',
    heroBody:
      'Aggiungi il minimo che serve: dove sei, cosa fai e cosa segui. Crystal usa questo contesto per rendere le risposte piu rilevanti.',
  },
} as const;

export const TUTORIAL_STEPS = [
  {
    id: 'what',
    kicker: 'What Crystal does',
    title: 'Crystal prende una domanda sul futuro e la rende leggibile.',
    description:
      'Invece di restituirti solo testo, prova a darti un punto di vista chiaro: cosa puo succedere, perche e plausibile e cosa osservare adesso.',
    bullets: [
      'Ricevi una risposta diretta, non solo un riassunto.',
      'Vedi i motivi principali dietro al forecast.',
      'Puoi salvare temi e rileggere i segnali nel tempo.',
    ],
  },
  {
    id: 'layers',
    kicker: 'Forecast vs WorldSim',
    title: 'Il forecast risponde. WorldSim apre la camera di simulazione.',
    description:
      'La previsione base produce la risposta leggibile. WorldSim entra solo quando servono attori, attriti e reazioni a catena.',
    bullets: [
      'Forecast: risposta, probabilita, rischio e prossimi segnali.',
      'WorldSim: attori chiave, punti di svolta e scenari piu profondi.',
      'WorldSim aggiunge contesto: non sostituisce il motore base.',
    ],
  },
  {
    id: 'action',
    kicker: 'Your first move',
    title: 'Parti da una domanda concreta.',
    description:
      'Il modo piu veloce per capire il prodotto e fare una prima previsione semplice, poi salvare un tema in Watchlist e aprire Nextletter.',
    bullets: [
      'Prova una domanda a 30 giorni.',
      'Salva un tema o una citta in Watchlist.',
      'Apri Nextletter per vedere il lato briefing del prodotto.',
    ],
  },
] as const;

export const RUNTIME_COPY = {
  forecastPreview:
    'Le previsioni live complete richiedono ancora il backend attivo. Intanto puoi esplorare il prodotto e vedere come sono organizzate le risposte.',
  worldSimPreview: WORLD_SIM_BRAND.previewNote,
  worldSimLive: WORLD_SIM_BRAND.liveNote,
};
