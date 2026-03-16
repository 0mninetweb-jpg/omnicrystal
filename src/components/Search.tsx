import React, { useState, useEffect } from 'react';
import { Search as SearchIcon, Filter, Sparkles, Loader2, Code2, Database, ChevronDown, ChevronUp, AlertTriangle, MapPin, Gem, Globe2, Lock, Zap, X, TrendingUp } from 'lucide-react';
import { mockCards } from '../data/mockData';
import { SUPPORTED_DOMAINS } from '../data/domains';
import { CrystalCard } from './CrystalCard';
import { CrystalLoader } from './CrystalLoader';
import { CardData } from '../types/crystal';
import Markdown from 'react-markdown';
import { compileQuery, predict, getLocalInsights } from '../services/geminiService';
import { motion, AnimatePresence } from 'framer-motion';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { doc, setDoc, deleteDoc, getDoc, serverTimestamp } from 'firebase/firestore';

interface SearchProps {
  user: any;
  isGuest?: boolean;
  onLogin?: () => void;
  initialQuery?: string;
}

type SearchFilters = {
  horizon: 'now' | '7d' | '30d' | '90d' | '6m' | '12m';
  geography: 'auto' | 'global' | 'italy' | 'rome' | 'milan';
  confidence: 'balanced' | 'high' | 'rigorous';
};

const DEFAULT_FILTERS: SearchFilters = {
  horizon: '30d',
  geography: 'auto',
  confidence: 'balanced',
};

const GEOGRAPHY_METADATA: Record<SearchFilters['geography'], { label: string; level?: 'world' | 'country' | 'city'; location?: string }> = {
  auto: { label: 'Auto' },
  global: { label: 'Globale', level: 'world' },
  italy: { label: 'Italia', level: 'country', location: 'Italia' },
  rome: { label: 'Roma', level: 'city', location: 'Roma' },
  milan: { label: 'Milano', level: 'city', location: 'Milano' },
};

const CONFIDENCE_LABELS: Record<SearchFilters['confidence'], string> = {
  balanced: 'Bilanciata',
  high: 'Alta',
  rigorous: 'Massimo rigore',
};

export function Search({ user, isGuest, onLogin, initialQuery }: SearchProps) {
  const [query, setQuery] = useState(initialQuery || '');
  const [hasSearched, setHasSearched] = useState(false);
  const [isLoadingPlan, setIsLoadingPlan] = useState(false);
  const [isLoadingPrediction, setIsLoadingPrediction] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Analizzo la tua richiesta...');
  const [queryPlan, setQueryPlan] = useState<any>(null);
  const [generatedCard, setGeneratedCard] = useState<CardData | null>(null);
  const [localInsights, setLocalInsights] = useState<{text: string, chunks: any[]} | null>(null);
  const [isLoadingInsights, setIsLoadingInsights] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCardSaved, setIsCardSaved] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>(DEFAULT_FILTERS);

  // Trigger search on mount if initialQuery is provided
  useEffect(() => {
    if (initialQuery && !hasSearched) {
      handleSearch(initialQuery);
    }
  }, [initialQuery]);

  const loadingMessages = [
    "Analizzando il passato per prevedere il futuro...",
    "Crystal in azione: calibrazione dati...",
    "Consulto 20 anni di storia per te...",
    "Connessione ai nodi di intelligenza globale...",
    "Sintetizzando il verdetto deterministico...",
    "Quasi pronto: sto scrivendo il tuo futuro...",
    "Analisi dei driver in corso..."
  ];

  useEffect(() => {
    let interval: any;
    if (isLoadingPlan || isLoadingPrediction) {
      interval = setInterval(() => {
        setLoadingMessage(prev => {
          const currentIndex = loadingMessages.indexOf(prev);
          const nextIndex = (currentIndex + 1) % loadingMessages.length;
          return loadingMessages[nextIndex];
        });
      }, 2500);
    }
    return () => clearInterval(interval);
  }, [isLoadingPlan, isLoadingPrediction]);

  // Check if card is saved
  useEffect(() => {
    const checkSaved = async () => {
      if (generatedCard && user) {
        const path = `users/${user.uid}/cards/${generatedCard.card_id}`;
        try {
          const docRef = doc(db, 'users', user.uid, 'cards', generatedCard.card_id);
          const docSnap = await getDoc(docRef);
          setIsCardSaved(docSnap.exists());
        } catch (err) {
          handleFirestoreError(err, OperationType.GET, path);
        }
      }
    };
    checkSaved();
  }, [generatedCard, user]);

  const applyFilters = (patch: Partial<SearchFilters>) => {
    const nextFilters = { ...filters, ...patch };
    setFilters(nextFilters);

    if (hasSearched && query.trim()) {
      void handleSearch(query, nextFilters);
    }
  };

  const handleSaveCard = async (card: CardData) => {
    if (!user) return;
    
    const path = `users/${user.uid}/cards/${card.card_id}`;
    const docRef = doc(db, 'users', user.uid, 'cards', card.card_id);
    
    try {
      if (isCardSaved) {
        // Remove it
        await deleteDoc(docRef);
        setIsCardSaved(false);
      } else {
        // Add it
        await setDoc(docRef, {
          ...card,
          createdAt: serverTimestamp()
        });
        setIsCardSaved(true);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  };

  const handleSearch = async (e: React.FormEvent | string, activeFilters: SearchFilters = filters) => {
    if (typeof e !== 'string') e.preventDefault();
    
    if (isGuest && onLogin) {
      onLogin();
      return;
    }

    const searchQuery = typeof e === 'string' ? e : query;
    
    if (!searchQuery.trim()) return;
    
    setQuery(searchQuery);
    setHasSearched(true);
    setIsLoadingPlan(true);
    setQueryPlan(null);
    setGeneratedCard(null);
    setLocalInsights(null);
    setShowDebug(false);
    setError(null);
    setIsCardSaved(false);

    try {
      // Step 1: Compile Query
      const plan = await compileQuery(searchQuery);

      const nextPlan = {
        ...plan,
        filters: { ...(plan.filters || {}) },
        constraints: { ...(plan.constraints || {}) },
        entities: [...(plan.entities || [])],
        horizons: [...(plan.horizons || [])],
      };

      const normalizedHorizon = activeFilters.horizon === 'now' ? '7d' : activeFilters.horizon;
      if (nextPlan.horizons.length > 0) {
        nextPlan.horizons[0] = { ...nextPlan.horizons[0], horizon_id: normalizedHorizon };
      } else {
        nextPlan.horizons = [{ horizon_id: normalizedHorizon }];
      }

      const geographyMeta = GEOGRAPHY_METADATA[activeFilters.geography];
      nextPlan.filters = {
        ...nextPlan.filters,
        geography: activeFilters.geography,
        geography_label: geographyMeta.label,
        confidence_preference: activeFilters.confidence,
      };
      nextPlan.constraints = {
        ...nextPlan.constraints,
        confidence_preference: activeFilters.confidence,
      };

      if (geographyMeta.level) {
        nextPlan.filters.geography_level = geographyMeta.level;
      }

      if (geographyMeta.location) {
        nextPlan.filters.location = geographyMeta.location;
        const locationEntityType = geographyMeta.level === 'country' ? 'country' : 'city';
        const hasLocationEntity = nextPlan.entities.some(
          (entity: any) => entity.label === geographyMeta.location && entity.entity_type === locationEntityType
        );

        if (!hasLocationEntity) {
          nextPlan.entities.push({
            entity_id: geographyMeta.location.toLowerCase(),
            entity_type: locationEntityType,
            label: geographyMeta.location,
          });
        }
      }

      setQueryPlan(nextPlan);
      setIsLoadingPlan(false);

      // Step 2: Generate Prediction (LLM + Search Grounding)
      setIsLoadingPrediction(true);
      
      let userContext;
      if (user) {
        const path = `users/${user.uid}`;
        try {
          const userDocRef = doc(db, 'users', user.uid);
          const userDocSnap = await getDoc(userDocRef);
          userContext = userDocSnap.exists() ? userDocSnap.data() : undefined;
        } catch (err) {
          handleFirestoreError(err, OperationType.GET, path);
        }
      }

      const card = await predict(searchQuery, nextPlan, userContext);
      
      setGeneratedCard(card);

      // Step 3: Generate Local Insights (Maps Grounding)
      setIsLoadingInsights(true);
      getLocalInsights(searchQuery, nextPlan.entities).then(data => {
        setLocalInsights(data);
        setIsLoadingInsights(false);
      }).catch(err => {
        console.error("Local Insights fetch error:", err);
        setIsLoadingInsights(false);
      });
      
    } catch (err) {
      console.error("Failed to process query", err);
      setError(err instanceof Error ? err.message : "Si è verificato un errore imprevisto.");
    } finally {
      setIsLoadingPlan(false);
      setIsLoadingPrediction(false);
    }
  };

  return (
    <div className="space-y-10">
      <motion.form 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        onSubmit={handleSearch} 
        className="relative group max-w-4xl mx-auto"
      >
        <div className="absolute inset-y-0 left-6 flex items-center pointer-events-none">
          <SearchIcon className="w-6 h-6 text-indigo-400 group-focus-within:text-indigo-600 transition-colors" />
        </div>
        <input
          type="text"
          className="w-full pl-16 pr-24 py-6 bg-white border-2 border-slate-100 rounded-[32px] shadow-[0_10px_40px_rgba(0,0,0,0.04)] focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 text-xl font-semibold text-slate-800 placeholder:text-slate-400 transition-all"
          placeholder="Cerca un evento, una città o fai una domanda..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="absolute inset-y-0 right-6 flex items-center gap-2">
          <AnimatePresence>
            {query && (
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                type="button"
                onClick={() => setQuery('')}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </motion.button>
            )}
          </AnimatePresence>
          <div className="w-px h-8 bg-slate-200 mx-1"></div>
          <button
            type="submit"
            disabled={isLoadingPlan || isLoadingPrediction || !query.trim()}
            className="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoadingPlan || isLoadingPrediction ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Filter className="w-4 h-4" />
            )}
            Prevedi
          </button>
        </div>
      </motion.form>

      {/* Universal Filters */}
      <div className="flex flex-nowrap overflow-x-auto no-scrollbar gap-4 pb-2 px-4 md:mx-0 md:px-0 md:flex-wrap justify-center max-w-4xl mx-auto">
        <select 
          value={filters.horizon}
          onChange={(e) => applyFilters({ horizon: e.target.value as SearchFilters['horizon'] })}
          className="shrink-0 px-5 py-3 bg-white border border-slate-200/60 rounded-2xl text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm cursor-pointer hover:bg-slate-50 transition-all"
        >
          <option value="now">Orizzonte: Ora</option>
          <option value="7d">Orizzonte: 7 giorni</option>
          <option value="30d">Orizzonte: 30 giorni</option>
          <option value="90d">Orizzonte: 90 giorni</option>
          <option value="6m">Orizzonte: 6 mesi</option>
          <option value="12m">Orizzonte: 12 mesi</option>
        </select>
        <select
          value={filters.geography}
          onChange={(e) => applyFilters({ geography: e.target.value as SearchFilters['geography'] })}
          className="shrink-0 px-5 py-3 bg-white border border-slate-200/60 rounded-2xl text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm cursor-pointer hover:bg-slate-50 transition-all"
        >
          <option value="auto">Area: Auto</option>
          <option value="global">Area: Globale</option>
          <option value="italy">Area: Italia</option>
          <option value="rome">Area: Roma</option>
          <option value="milan">Area: Milano</option>
        </select>
        <select
          value={filters.confidence}
          onChange={(e) => applyFilters({ confidence: e.target.value as SearchFilters['confidence'] })}
          className="shrink-0 px-5 py-3 bg-white border border-slate-200/60 rounded-2xl text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm cursor-pointer hover:bg-slate-50 transition-all"
        >
          <option value="balanced">Fiducia: Bilanciata</option>
          <option value="high">Fiducia: Alta</option>
          <option value="rigorous">Fiducia: Massimo Rigore</option>
        </select>
      </div>

      <div className="flex flex-wrap justify-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
        <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 shadow-sm">
          Scope {GEOGRAPHY_METADATA[filters.geography].label}
        </span>
        <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 shadow-sm">
          {filters.horizon === 'now' ? 'Ora' : filters.horizon}
        </span>
        <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 shadow-sm">
          Fiducia {CONFIDENCE_LABELS[filters.confidence]}
        </span>
      </div>

      {error && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="p-6 bg-rose-50 border border-rose-200 rounded-[32px] text-rose-700 flex items-start gap-4 shadow-sm"
        >
          <AlertTriangle className="w-6 h-6 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-bold text-lg">Impossibile completare la previsione</h4>
            <p className="text-sm mt-1 font-medium opacity-80">{error}</p>
          </div>
        </motion.div>
      )}

      {!hasSearched ? (
        <div className="mt-16 text-center max-w-4xl mx-auto">
          <motion.div 
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="inline-flex items-center justify-center w-20 h-20 rounded-[28px] bg-gradient-to-br from-indigo-50 to-indigo-100 text-indigo-600 mb-8 shadow-xl shadow-indigo-100/50 border border-white"
          >
            <Sparkles className="w-10 h-10" />
          </motion.div>
          <h3 className="text-3xl md:text-5xl font-display font-bold text-slate-900 mb-6 tracking-tight">Cosa vuoi prevedere?</h3>
          <p className="text-slate-500 text-lg md:text-xl leading-relaxed font-medium mb-12 max-w-2xl mx-auto">
            Interroga il motore predittivo su città, mercati, trend economici o eventi futuri.
          </p>
          
          <div className="mb-16">
            <div className="flex items-center justify-center gap-2 mb-6 text-slate-400 font-bold text-sm uppercase tracking-widest">
              <TrendingUp className="w-4 h-4" />
              <span>Ricerche di tendenza</span>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              {[
                { text: 'Turismo a Roma nei prossimi 30 giorni', icon: <MapPin className="w-4 h-4" /> },
                { text: 'Pressione inflazione in Italia', icon: <Globe2 className="w-4 h-4" /> },
                { text: 'Le azioni Apple saliranno questa settimana?', icon: <TrendingUp className="w-4 h-4" /> }
              ].map((suggestion, i) => (
                <motion.button 
                  key={suggestion.text}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  onClick={() => handleSearch(suggestion.text)} 
                  className="flex items-center gap-2 px-6 py-4 bg-white border border-slate-200 rounded-2xl text-sm font-bold text-slate-600 hover:border-indigo-300 hover:text-indigo-700 hover:bg-indigo-50/50 hover:shadow-xl hover:shadow-indigo-100/20 transition-all group"
                >
                  <span className="text-slate-400 group-hover:text-indigo-500 transition-colors">{suggestion.icon}</span>
                  {suggestion.text}
                </motion.button>
              ))}
            </div>
          </div>

          <div className="border-t border-slate-100 pt-16">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em] mb-8">Esplora per Dominio</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
              {SUPPORTED_DOMAINS.map((domain, i) => (
                <motion.button 
                  key={domain} 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.05 }}
                  onClick={() => setQuery(`Previsioni per il dominio ${domain}`)}
                  className="flex flex-col items-center justify-center gap-3 p-6 bg-slate-50 hover:bg-white border border-slate-100 hover:border-indigo-200 hover:shadow-lg hover:shadow-indigo-100/40 text-slate-600 hover:text-indigo-700 rounded-[24px] transition-all cursor-pointer group"
                >
                  <div className="w-10 h-10 rounded-full bg-white group-hover:bg-indigo-50 flex items-center justify-center shadow-sm group-hover:shadow text-slate-400 group-hover:text-indigo-500 transition-all">
                    <Database className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-bold uppercase tracking-wider text-center">{domain.replace(/_/g, ' ')}</span>
                </motion.button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-12 mt-12">
          <AnimatePresence mode="wait">
            {isLoadingPlan ? (
              <motion.div 
                key="loading-plan"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center py-12"
              >
                <CrystalLoader />
                <p className="font-bold text-xl text-slate-900 text-center px-4 mt-6">{loadingMessage}</p>
                <p className="text-slate-400 mt-2 font-medium">Compilazione del QueryPlan Multi-Dominio</p>
              </motion.div>
            ) : (
              <motion.div
                key="results"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-12"
              >
                {isLoadingPrediction ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <CrystalLoader />
                    <p className="font-bold text-xl text-slate-900 text-center px-4 mt-6">{loadingMessage}</p>
                  </div>
                ) : (
                  generatedCard && (
                    <div className="animate-in fade-in slide-in-from-bottom-8 duration-700">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
                        <div>
                          <h3 className="text-3xl font-display font-bold text-slate-900 tracking-tight">Risultato della previsione</h3>
                          <div className="flex items-center gap-3 mt-2">
                            <span className="text-sm font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full flex items-center gap-1.5 border border-emerald-100">
                              <Sparkles className="w-4 h-4" /> Real-time Data
                            </span>
                            <span className="text-sm font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100">
                              Gemini 3 Flash
                            </span>
                            {(generatedCard as any)._source === 'cache' && (
                              <span className="text-sm font-bold text-amber-600 bg-amber-50 px-3 py-1 rounded-full flex items-center gap-1.5 border border-amber-100">
                                <Zap className="w-4 h-4" /> Instant (Cached)
                              </span>
                            )}
                          </div>
                        </div>
                        
                        <button 
                          onClick={() => setShowDebug(!showDebug)}
                          className="flex items-center gap-2 px-5 py-3 bg-white border border-slate-200 hover:border-indigo-200 text-slate-600 hover:text-indigo-600 rounded-2xl text-sm font-bold transition-all shadow-sm"
                        >
                          <Code2 className="w-4 h-4" />
                          {showDebug ? 'Nascondi Debug' : 'Mostra Debug'}
                          {showDebug ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>

                      <AnimatePresence>
                        {showDebug && queryPlan && (
                          <motion.div 
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="bg-slate-900 rounded-[32px] p-8 overflow-hidden shadow-2xl mb-12 border border-slate-800"
                          >
                            <div className="flex items-center gap-3 text-emerald-400 mb-6">
                              <Code2 className="w-6 h-6" />
                              <h3 className="font-mono text-sm font-bold uppercase tracking-widest">QueryPlan JSON</h3>
                            </div>
                            <pre className="text-[13px] font-mono text-slate-300 overflow-x-auto leading-relaxed no-scrollbar">
                              {JSON.stringify(queryPlan, null, 2)}
                            </pre>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                        <CrystalCard 
                          card={generatedCard} 
                          onSave={handleSaveCard}
                          isSaved={isCardSaved}
                        />
                        
                        {/* Local Insights Section */}
                        <div className="flex flex-col gap-6">
                          <AnimatePresence mode="wait">
                            {isLoadingInsights ? (
                              <motion.div 
                                key="loading-insights"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="bg-white rounded-[32px] shadow-[0_2px_12px_rgba(0,0,0,0.02)] border border-slate-200/60 p-8 flex flex-col items-center justify-center text-slate-500 h-full min-h-[400px]"
                              >
                                <MapPin className="w-12 h-12 animate-bounce mb-6 text-indigo-400" />
                                <p className="font-bold text-lg text-slate-900">Recupero dati locali...</p>
                                <p className="text-slate-400 mt-1 font-medium">Google Maps Grounding</p>
                              </motion.div>
                            ) : localInsights && (
                              <motion.div 
                                key="insights-content"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                className="bg-white rounded-[32px] shadow-[0_2px_12px_rgba(0,0,0,0.02)] border border-slate-200/60 p-8 flex flex-col h-full"
                              >
                                <div className="flex items-center gap-3 mb-6">
                                  <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
                                    <MapPin className="w-5 h-5 text-indigo-600" />
                                  </div>
                                  <h3 className="text-xl font-display font-bold text-slate-900 tracking-tight">Approfondimenti Locali</h3>
                                </div>
                                <div className="prose prose-slate max-w-none mb-8 text-slate-600 font-medium leading-relaxed">
                                  <Markdown>{localInsights.text}</Markdown>
                                </div>
                                
                                {localInsights.chunks && localInsights.chunks.length > 0 && (
                                  <div className="mt-auto pt-6 border-t border-slate-100">
                                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-5">FONTI E LUOGHI VERIFICATI</h4>
                                    <div className="grid grid-cols-1 gap-3">
                                      {localInsights.chunks.map((chunk: any, i: number) => {
                                        const uri = chunk.maps?.uri || chunk.web?.uri;
                                        const title = chunk.maps?.title || chunk.web?.title || "Fonte esterna";
                                        
                                        if (uri) {
                                          return (
                                            <motion.a 
                                              key={i} 
                                              whileHover={{ x: 4, backgroundColor: 'rgba(255, 255, 255, 1)' }}
                                              href={uri} 
                                              target="_blank" 
                                              rel="noopener noreferrer" 
                                              className="flex items-center gap-4 p-4 bg-slate-50/50 hover:bg-white border border-transparent hover:border-slate-200 rounded-2xl transition-all group"
                                            >
                                              <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm group-hover:shadow-md transition-all">
                                                {chunk.maps ? <MapPin className="w-5 h-5 text-slate-400 group-hover:text-indigo-600 transition-colors" /> : <Globe2 className="w-5 h-5 text-slate-400 group-hover:text-indigo-600 transition-colors" />}
                                              </div>
                                              <span className="text-[15px] font-bold text-slate-700 group-hover:text-indigo-600 transition-colors">{title}</span>
                                            </motion.a>
                                          );
                                        }
                                        return null;
                                      })}
                                    </div>
                                  </div>
                                )}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>
                    </div>
                  )
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
