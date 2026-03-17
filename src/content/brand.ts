export const PRODUCT_BRAND = {
  name: 'Crystal',
  shellLabel: 'Forecasts, made readable',
  tagline: 'Capire cosa puo succedere dopo, in modo semplice.',
  tutorialLabel: 'See how it works',
  tutorialReplayLabel: 'Replay tutorial',
  plansLabel: 'Plans',
  plansTitle: 'Crystal Plans',
  guestLabel: 'Guest preview',
};

export const WORLD_SIM_BRAND = {
  name: 'WorldSim',
  previewName: 'WorldSim Preview',
  shortDescription: 'Un layer premium di simulazione per le domande piu delicate.',
  honestNote: 'Aggiunge profondita allo scenario. Non sostituisce il forecast base.',
};

export const SECTION_COPY = {
  home: {
    navDescription: 'Il punto di partenza: segnali chiave, temi salvati e una lettura rapida di quello che conta oggi.',
    headerDescription: 'Una vista semplice dei segnali da seguire, dei temi salvati e di cosa merita attenzione adesso.',
    heroKicker: 'A clearer way to read what may happen next',
    heroTitle: 'Un modo piu semplice per capire cosa puo succedere dopo.',
    heroBody:
      'Fai una domanda chiara e Crystal la trasforma in una previsione leggibile: probabilita, motivi principali e prossimi segnali da tenere d occhio.',
  },
  forecast: {
    navDescription: 'Fai una domanda e ottieni una risposta chiara, i motivi dietro il numero e cosa osservare dopo.',
    headerDescription: 'Trasforma una domanda in una previsione leggibile, con contesto, motivi principali e prossimi segnali.',
    heroKicker: 'Forecast',
    heroTitle: 'Una domanda chiara. Una risposta chiara.',
    heroBody:
      'Crystal riordina un tema complesso in un forecast leggibile: cosa puo succedere, perche sembra plausibile e quanto fidarsi del risultato.',
  },
  nextletter: {
    navDescription: 'La tua lettura del giorno: segnali, contesto e mosse possibili, senza tono teatrale.',
    headerDescription: 'Una lettura quotidiana piu utile: segnali, contesto e cosa fare dopo in una forma semplice.',
    heroKicker: 'Nextletter',
    heroTitle: 'La lettura quotidiana, resa piu utile.',
    heroBody:
      'Usa la Global Edition per orientarti velocemente. Usa la Personal Edition per filtrare i segnali intorno ai tuoi interessi.',
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
    title: 'Crystal trasforma una domanda sul futuro in una risposta leggibile.',
    description:
      'Invece di mostrarti solo testo, prova a darti una posizione chiara: cosa puo succedere, perche sembra plausibile e cosa osservare adesso.',
    bullets: [
      'Ricevi una risposta diretta, non solo un riassunto.',
      'Vedi i motivi principali dietro al forecast.',
      'Puoi salvare temi e rileggere i segnali nel tempo.',
    ],
  },
  {
    id: 'layers',
    kicker: 'Forecast vs WorldSim',
    title: 'Il forecast risponde. WorldSim aggiunge profondita.',
    description:
      'La previsione base produce il numero e i motivi principali. WorldSim entra nei casi piu delicati per mostrare come possono reagire attori e sistemi.',
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
    'Le previsioni live non sono ancora collegate in questa versione. Puoi esplorare il prodotto, ma le risposte AI complete richiedono il backend attivo.',
  worldSimPreview:
    'WorldSim e mostrato come preview finche il backend live non e connesso.',
  worldSimLive:
    'WorldSim e disponibile su questa versione per le query premium ad alto impatto.',
};
