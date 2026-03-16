import React, { useState, useEffect } from 'react';
import { Mail, Globe2, User, ArrowRight, Zap, Calendar, Lock, ChevronRight, Plus, Loader2, Trophy, Laptop, TrendingUp, Lightbulb, Check, Database, Sparkles, Quote, Shield, Activity, Bookmark } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from './CrystalCard';
import { generateNextletter, generateCrystalQuotes } from '../services/geminiService';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { CrystalQuote } from '../types/crystal';

interface NextletterProps {
  user: any;
  isGuest?: boolean;
  onLogin?: () => void;
  onGenerateCard?: (query: string) => void;
}

const PREDEFINED_TOPICS = [
  { id: 'calcio', label: '⚽ Calcio & Sport' },
  { id: 'bollette', label: '💡 Risparmio Bollette' },
  { id: 'tech', label: '🛠️ Tool & Produttività' },
  { id: 'finanza', label: '📈 Finanza & Crypto' },
  { id: 'eventi', label: '🎉 Eventi Locali' },
  { id: 'intrattenimento', label: '🎬 Intrattenimento' },
];

export function Nextletter({ user, isGuest, onLogin, onGenerateCard }: NextletterProps) {
  const [activeEdition, setActiveEdition] = useState<'global' | 'personal'>('global');
  const [isBuilding, setIsBuilding] = useState(false);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [customTopic, setCustomTopic] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedLetter, setGeneratedLetter] = useState<any>(null);
  const [userContext, setUserContext] = useState<any>(null);
  const [crystalQuotes, setCrystalQuotes] = useState<CrystalQuote[]>([]);
  const [isLoadingQuotes, setIsLoadingQuotes] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState<CrystalQuote | null>(null);
  const [savedQuotes, setSavedQuotes] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (user) {
      const fetchContext = async () => {
        const path = `users/${user.uid}`;
        try {
          const docRef = doc(db, 'users', user.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            setUserContext(docSnap.data());
          }
        } catch (err) {
          handleFirestoreError(err, OperationType.GET, path);
        }
      };
      fetchContext();
    }

    const fetchQuotes = async () => {
      setIsLoadingQuotes(true);
      try {
        const result = await generateCrystalQuotes();
        setCrystalQuotes(result.quotes || []);
      } catch (error) {
        console.error("Error fetching quotes:", error);
      } finally {
        setIsLoadingQuotes(false);
      }
    };
    fetchQuotes();
  }, [user]);

  const handleSaveQuote = async (quote: CrystalQuote) => {
    if (!user) return;
    setIsSaving(true);
    try {
      const quoteRef = doc(db, 'users', user.uid, 'saved_quotes', quote.quote_id);
      await setDoc(quoteRef, {
        ...quote,
        savedAt: serverTimestamp()
      });
      setSavedQuotes(prev => [...prev, quote.quote_id]);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}/saved_quotes`);
    } finally {
      setIsSaving(false);
    }
  };

  const toggleTopic = (topic: string) => {
    setSelectedTopics(prev => 
      prev.includes(topic) ? prev.filter(t => t !== topic) : [...prev, topic]
    );
  };

  const handleGenerate = async () => {
    const allTopics = [...selectedTopics];
    if (customTopic.trim()) {
      allTopics.push(customTopic.trim());
    }

    if (allTopics.length === 0) return;

    setIsGenerating(true);
    try {
      const result = await generateNextletter(allTopics, userContext);
      setGeneratedLetter(result);
      setIsBuilding(false);
    } catch (error) {
      console.error("Error generating nextletter:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  const getIcon = (iconName: string) => {
    const icons: any = { Trophy, Zap, Laptop, TrendingUp, Calendar, Lightbulb, Globe2, Shield, Activity, Landmark: Database };
    const Icon = icons[iconName] || Lightbulb;
    return <Icon className="w-6 h-6" />;
  };

  return (
    <div className="max-w-4xl mx-auto space-y-12">
      {/* Header */}
      <div className="text-center space-y-6 mb-16">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="inline-flex items-center justify-center p-4 bg-sky-500/10 rounded-3xl text-sky-400 mb-2 border border-sky-500/20 shadow-lg shadow-sky-500/5"
        >
          <Mail className="w-10 h-10" />
        </motion.div>
        <h1 className="text-5xl md:text-7xl font-display font-bold text-white tracking-tight leading-none">
          Nextletter
        </h1>
        <p className="text-xl text-slate-400 font-medium max-w-xl mx-auto leading-relaxed">
          Non riassumiamo il passato. Anticipiamo il futuro. <br className="hidden md:block"/>
          La tua curatela di eventi, tendenze e azioni per i prossimi 30 giorni.
        </p>
      </div>

      {/* Edition Toggle */}
      <div className="flex p-1.5 bg-white/5 backdrop-blur-xl rounded-2xl max-w-md mx-auto border border-white/10 shadow-2xl">
        <button
          onClick={() => setActiveEdition('global')}
          className={cn(
            "flex-1 flex items-center justify-center gap-2.5 py-3.5 px-6 rounded-xl font-bold text-sm transition-all duration-300",
            activeEdition === 'global' 
              ? "bg-white text-black shadow-xl" 
              : "text-slate-500 hover:text-slate-300"
          )}
        >
          <Globe2 className="w-4 h-4" />
          Crystal Edition
        </button>
        <button
          onClick={() => setActiveEdition('personal')}
          className={cn(
            "flex-1 flex items-center justify-center gap-2.5 py-3.5 px-6 rounded-xl font-bold text-sm transition-all duration-300",
            activeEdition === 'personal' 
              ? "bg-white text-black shadow-xl" 
              : "text-slate-500 hover:text-slate-300"
          )}
        >
          <User className="w-4 h-4" />
          Personal Edition
        </button>
      </div>

      {/* Content Area */}
      <AnimatePresence mode="wait">
        {activeEdition === 'global' && (
          <motion.article 
            key="global"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30 }}
            className="space-y-12"
          >
            {/* Crystal Quotes Section */}
            <section className="space-y-6">
              <div className="flex items-center justify-between mb-8">
                <div className="flex flex-col">
                  <h2 className="text-sm font-bold text-slate-400 uppercase tracking-[0.3em]">Crystal Quotes</h2>
                  <p className="text-xs text-slate-600 mt-1 uppercase tracking-widest">Le chiamate dirette dell'Oracolo</p>
                </div>
                <div className="h-px flex-1 bg-white/5 mx-8" />
              </div>

              <div className="grid grid-cols-1 gap-6">
                {isLoadingQuotes ? (
                  <div className="py-12 flex justify-center">
                    <Loader2 className="w-8 h-8 text-sky-500 animate-spin" />
                  </div>
                ) : (
                  crystalQuotes.map((quote, i) => (
                    <motion.div 
                      key={quote.quote_id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.1 }}
                      className="bg-[#0a0a0a] p-8 rounded-[40px] border border-white/10 shadow-sm relative overflow-hidden group hover:shadow-xl hover:shadow-sky-500/10 transition-all cursor-pointer"
                      onClick={() => setSelectedQuote(quote)}
                    >
                      <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
                        <Quote className="w-24 h-24 text-sky-500" />
                      </div>
                      <div className="flex items-center gap-3 mb-4 relative z-10">
                        <span className="text-[10px] font-bold text-sky-400 uppercase tracking-[0.2em] bg-sky-500/10 px-3 py-1 rounded-full border border-sky-500/20">
                          {quote.context}
                        </span>
                      </div>
                      <p className="text-2xl font-display font-bold text-white leading-tight mb-6 relative z-10">
                        "{quote.text}"
                      </p>
                      <div className="flex items-center justify-between relative z-10">
                        <span className="text-xs font-bold text-slate-400 italic">{quote.author}</span>
                        <button className="flex items-center gap-2 text-xs font-bold text-sky-400 hover:text-sky-300 transition-colors">
                          Vedi Analisi <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            </section>

            {/* Main Newspaper Section */}
            <div className="bg-[#0a0a0a] rounded-[48px] border border-white/10 shadow-2xl overflow-hidden relative">
              <div className="bg-[#050505] text-white p-10 md:p-20 text-center relative overflow-hidden border-b border-white/10">
                <div className="absolute inset-0 premium-gradient opacity-10 pointer-events-none" />
                <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-10 mix-blend-overlay"></div>
                
                <motion.span 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="inline-block px-4 py-1.5 bg-white/5 rounded-full text-[10px] font-bold tracking-[0.3em] uppercase mb-8 backdrop-blur-md border border-white/10 text-sky-300"
                >
                  The Crystal Times • Issue #42
                </motion.span>
                
                <h2 className="text-4xl md:text-6xl font-display font-bold leading-[1.1] mb-8 tracking-tight">
                  Lo Shock Energetico Autunnale e l'Automazione del Service
                </h2>
                
                <p className="text-slate-400 font-serif text-xl md:text-2xl max-w-2xl mx-auto italic leading-relaxed opacity-80">
                  Preparati ai due macro-trend che ridefiniranno i costi operativi e il mercato del lavoro nel prossimo trimestre.
                </p>
              </div>

              <div className="p-10 md:p-20 space-y-20 font-serif text-xl text-slate-300 leading-relaxed">
                <section className="space-y-8">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 bg-amber-500/10 rounded-2xl flex items-center justify-center border border-amber-500/20">
                      <Zap className="w-6 h-6 text-amber-400" /> 
                    </div>
                    <span className="text-xs font-bold text-amber-400 uppercase tracking-[0.3em]">Macroeconomia / Energia</span>
                  </div>
                  <h3 className="text-3xl md:text-4xl font-sans font-bold text-white tracking-tight">
                    1. Il Rincaro Energetico Imminente: Analisi dei Driver Geopolitici
                  </h3>
                  <p>
                    I nostri modelli predittivi indicano una probabilità del <strong className="text-white">72%</strong> di un picco dei costi energetici in Europa. A differenza delle fluttuazioni stagionali, questo spike è guidato da una convergenza di tagli OPEC+ e tensioni logistiche nel Mar Rosso che influenzeranno i prezzi del GNL.
                  </p>
                  <p className="text-lg text-slate-400">
                    Analizzando i pattern storici degli ultimi 20 anni, in particolare la crisi del 2008 e lo shock del 2022, osserviamo una correlazione diretta tra la riduzione delle scorte strategiche e l'aumento della volatilità nei contratti a termine.
                  </p>
                  <div className="bg-amber-500/5 border border-amber-500/20 p-8 rounded-[32px] relative overflow-hidden group">
                    <div className="absolute top-0 left-0 w-1 h-full bg-amber-500" />
                    <h4 className="font-sans font-bold text-amber-400 text-xs uppercase tracking-[0.2em] mb-4">L'Azione Strategica</h4>
                    <p className="text-slate-300 text-lg m-0 leading-relaxed">
                      Hai una finestra di circa 3 settimane prima che i fornitori retail adeguino le tariffe. <strong className="text-white">Azione consigliata:</strong> Blocca ora una tariffa fissa a 12 mesi se il tuo contratto è in scadenza o variabile.
                    </p>
                  </div>
                </section>

                <div className="h-px w-full bg-gradient-to-r from-transparent via-white/5 to-transparent" />

                <section className="space-y-8">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 bg-sky-500/10 rounded-2xl flex items-center justify-center border border-sky-500/20">
                      <Globe2 className="w-6 h-6 text-sky-400" /> 
                    </div>
                    <span className="text-xs font-bold text-sky-400 uppercase tracking-[0.3em]">Tecnologia / Lavoro</span>
                  </div>
                  <h3 className="text-3xl md:text-4xl font-sans font-bold text-white tracking-tight">
                    2. Disruption nel Customer Service: L'Era dell'AI Orchestration
                  </h3>
                  <p>
                    L'adozione di agenti AI vocali autonomi sta superando la fase di test. Prevediamo che entro fine anno il <strong className="text-white">40%</strong> dei contact center Tier 1 sarà automatizzato. Non è una "news tech", è un imminente shift del mercato del lavoro che Crystal ha tracciato attraverso l'analisi dei brevetti e degli investimenti R&D delle Big Tech.
                  </p>
                  <p className="text-lg text-slate-400">
                    Il modello predittivo suggerisce che le aziende che non integreranno sistemi di orchestrazione entro i prossimi 90 giorni subiranno un calo della competitività del 15% rispetto ai "first adopters".
                  </p>
                  <div className="bg-sky-500/5 border border-sky-500/20 p-8 rounded-[32px] relative overflow-hidden group">
                    <div className="absolute top-0 left-0 w-1 h-full bg-sky-500" />
                    <h4 className="font-sans font-bold text-sky-400 text-xs uppercase tracking-[0.2em] mb-4">Il Tuo Posizionamento</h4>
                    <p className="text-slate-300 text-lg m-0 leading-relaxed">
                      Il 15 del prossimo mese si terrà il summit europeo sull'AI Orchestration. <strong className="text-white">Azione consigliata:</strong> Iscriviti per posizionarti come gestore di queste tecnologie, non come vittima dell'automazione.
                    </p>
                  </div>
                </section>
              </div>
            </div>
          </motion.article>
        )}

        {activeEdition === 'personal' && (
          <motion.article 
            key="personal"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30 }}
          >
            {isGuest ? (
              <div className="bg-[#0a0a0a] p-16 rounded-[48px] border border-white/10 shadow-2xl text-center relative overflow-hidden">
                <div className="absolute inset-0 premium-gradient opacity-5 pointer-events-none" />
                <div className="relative z-10">
                  <div className="w-24 h-24 bg-white/5 rounded-[32px] flex items-center justify-center mx-auto mb-8 border border-white/10 shadow-xl">
                    <Lock className="w-10 h-10 text-slate-400" />
                  </div>
                  <h2 className="text-4xl font-display font-bold text-white mb-6 tracking-tight">La tua Nextletter Privata</h2>
                  <p className="text-slate-400 text-xl mb-10 max-w-md mx-auto leading-relaxed">
                    Accedi e configura il tuo profilo per ricevere un'edizione editoriale cucita su misura per la tua città, il tuo lavoro e i tuoi interessi.
                  </p>
                  <button 
                    onClick={onLogin}
                    className="px-10 py-5 bg-white text-black rounded-2xl font-bold text-lg hover:bg-sky-50 transition-all shadow-2xl"
                  >
                    Accedi per sbloccare
                  </button>
                </div>
              </div>
            ) : generatedLetter ? (
              <div className="bg-[#0a0a0a] rounded-[48px] border border-white/10 shadow-2xl overflow-hidden">
                <div className="premium-gradient text-white p-10 md:p-20 relative overflow-hidden border-b border-white/10">
                  <div className="absolute top-0 right-0 p-12 opacity-10 pointer-events-none">
                    <User className="w-64 h-64" />
                  </div>
                  <motion.span 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="inline-block px-4 py-1.5 bg-white/10 rounded-full text-[10px] font-bold tracking-[0.3em] uppercase mb-8 backdrop-blur-md border border-white/20 text-sky-200"
                  >
                    Generata per {user?.displayName || 'Te'} • Oggi
                  </motion.span>
                  <h2 className="text-4xl md:text-6xl font-display font-bold leading-[1.1] mb-8 tracking-tight">
                    {generatedLetter.title || 'La tua Nextletter'}
                  </h2>
                  <p className="text-sky-100 font-serif text-xl md:text-2xl max-w-2xl italic leading-relaxed opacity-90">
                    {generatedLetter.subtitle || 'Ecco i consigli e le azioni per i prossimi giorni.'}
                  </p>
                </div>

                <div className="p-10 md:p-20 space-y-20 font-serif text-xl text-slate-300 leading-relaxed">
                  {generatedLetter.sections?.map((section: any, idx: number) => (
                    <React.Fragment key={idx}>
                      <div className="flex flex-col md:flex-row gap-10">
                        <div className="flex-shrink-0 w-16 h-16 bg-sky-500/10 text-sky-400 rounded-2xl flex items-center justify-center border border-sky-500/20 shadow-lg shadow-sky-500/5">
                          {getIcon(section.icon)}
                        </div>
                        <div className="flex-1 space-y-8">
                          <div className="flex flex-wrap items-center gap-4">
                            <span className="text-xs font-bold text-sky-400 uppercase tracking-[0.2em]">{section.topic}</span>
                            <div className="flex items-center gap-2.5">
                              <span className="text-[10px] font-bold px-3 py-1.5 bg-white/5 text-slate-400 rounded-xl uppercase border border-white/10 tracking-wider">
                                Horizon: {section.horizon || '7d'}
                              </span>
                              <span className="text-[10px] font-bold px-3 py-1.5 bg-white/5 text-slate-400 rounded-xl uppercase border border-white/10 tracking-wider">
                                Prob: {section.probability || 80}%
                              </span>
                              <span className={cn(
                                "text-[10px] font-bold px-3 py-1.5 rounded-xl uppercase border tracking-wider",
                                section.impact === 'High' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : 
                                section.impact === 'Medium' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 
                                'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              )}>
                                Impact: {section.impact || 'Medium'}
                              </span>
                            </div>
                          </div>
                          <h3 className="text-3xl md:text-4xl font-sans font-bold text-white tracking-tight">
                            {section.title}
                          </h3>
                          <div className="space-y-6">
                            <p className="text-slate-400 leading-relaxed">
                              {section.content}
                            </p>
                            {section.historical_context && (
                              <div className="bg-white/5 p-8 rounded-[32px] border border-white/5 text-[15px] text-slate-400 italic flex gap-4 leading-relaxed">
                                <Database className="w-5 h-5 mt-0.5 flex-shrink-0 text-slate-600" />
                                <p>{section.historical_context}</p>
                              </div>
                            )}
                          </div>
                          <div className="inline-flex items-center gap-4 text-sky-400 font-sans text-lg bg-sky-500/5 px-8 py-8 rounded-[40px] border border-sky-500/20 w-full shadow-inner">
                            <ArrowRight className="w-6 h-6 flex-shrink-0 text-sky-500" /> 
                            <span className="leading-relaxed"><strong className="font-bold uppercase tracking-[0.2em] text-[11px] mr-3 text-sky-300 block mb-1">Azione Strategica</strong> {section.so_what || section.action}</span>
                          </div>
                          {onGenerateCard && section.query_suggestion && (
                            <button
                              onClick={() => onGenerateCard(section.query_suggestion)}
                              className="inline-flex items-center gap-3 px-8 py-4 bg-white text-black rounded-2xl text-sm font-bold hover:bg-slate-200 transition-all shadow-xl"
                            >
                              <Sparkles className="w-4 h-4" />
                              Genera carta predittiva
                            </button>
                          )}
                        </div>
                      </div>
                      {idx < generatedLetter.sections.length - 1 && <div className="h-px w-full bg-gradient-to-r from-transparent via-white/5 to-transparent" />}
                    </React.Fragment>
                  ))}
                </div>
                <div className="p-10 bg-white/5 border-t border-white/10 text-center">
                  <button 
                    onClick={() => {
                      setGeneratedLetter(null);
                      setIsBuilding(true);
                    }}
                    className="text-sm font-bold text-slate-400 hover:text-white transition-colors tracking-widest uppercase"
                  >
                    Crea una nuova edizione
                  </button>
                </div>
              </div>
            ) : isBuilding ? (
              <div className="bg-[#0a0a0a] p-10 md:p-20 rounded-[48px] border border-white/10 shadow-2xl relative overflow-hidden">
                <div className="absolute inset-0 premium-gradient opacity-5 pointer-events-none" />
                <div className="relative z-10">
                  <div className="text-center mb-16">
                    <h2 className="text-4xl md:text-5xl font-display font-bold text-white mb-6 tracking-tight">Cosa ti interessa?</h2>
                    <p className="text-xl text-slate-400 font-medium max-w-xl mx-auto leading-relaxed">Seleziona gli argomenti per la tua Nextletter personalizzata. Analizzeremo i prossimi 30 giorni per te.</p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-12">
                    {PREDEFINED_TOPICS.map(topic => (
                      <button
                        key={topic.id}
                        onClick={() => toggleTopic(topic.label)}
                        className={cn(
                          "p-8 rounded-[32px] border-2 transition-all flex items-center justify-between group relative overflow-hidden",
                          selectedTopics.includes(topic.label)
                            ? "bg-sky-500/10 border-sky-500 shadow-2xl shadow-sky-500/10"
                            : "bg-white/5 border-white/10 hover:border-white/20"
                        )}
                      >
                        <span className="font-bold text-xl text-white relative z-10">{topic.label}</span>
                        <div className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 relative z-10",
                          selectedTopics.includes(topic.label) ? "bg-sky-500 text-white scale-110" : "bg-white/10 text-slate-400 group-hover:bg-white/20"
                        )}>
                          {selectedTopics.includes(topic.label) && <Check className="w-5 h-5" />}
                        </div>
                      </button>
                    ))}
                  </div>

                  <div className="mb-16">
                    <label className="block text-[11px] font-bold text-slate-400 mb-4 uppercase tracking-[0.3em] px-2">Altro? Scrivilo qui</label>
                    <input
                      type="text"
                      value={customTopic}
                      onChange={(e) => setCustomTopic(e.target.value)}
                      placeholder="Es. Formula 1, Concerti Rock, Borsa Americana..."
                      className="w-full px-8 py-6 bg-white/5 border border-white/10 rounded-[32px] focus:outline-none focus:ring-2 focus:ring-sky-500/50 font-semibold text-xl text-white placeholder:text-slate-700 transition-all shadow-inner"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-8 border-t border-white/10">
                    <button 
                      onClick={() => setIsBuilding(false)}
                      className="px-8 py-4 text-slate-400 font-bold hover:text-white transition-colors text-lg"
                    >
                      Annulla
                    </button>
                    <button 
                      onClick={handleGenerate}
                      disabled={isGenerating || (selectedTopics.length === 0 && !customTopic.trim())}
                      className="px-10 py-5 bg-sky-500 text-white rounded-2xl font-bold hover:bg-sky-600 transition-all shadow-2xl shadow-sky-500/20 flex items-center gap-3 text-lg disabled:opacity-50"
                    >
                      {isGenerating ? (
                        <>
                          <Loader2 className="w-6 h-6 animate-spin" /> Generazione...
                        </>
                      ) : (
                        <>
                          <Zap className="w-6 h-6" /> Genera Nextletter
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-[#0a0a0a] rounded-[48px] border border-white/10 shadow-2xl overflow-hidden text-center p-16 relative overflow-hidden">
                <div className="absolute inset-0 premium-gradient opacity-5 pointer-events-none" />
                <div className="relative z-10">
                  <div className="w-28 h-28 bg-sky-500/10 rounded-[40px] flex items-center justify-center mx-auto mb-10 border border-sky-500/20 shadow-xl shadow-sky-500/5">
                    <Lightbulb className="w-14 h-14 text-sky-400" />
                  </div>
                  <h2 className="text-4xl md:text-5xl font-display font-bold text-white mb-6 tracking-tight">Costruisci la tua Nextletter</h2>
                  <p className="text-xl text-slate-400 font-medium mb-12 max-w-lg mx-auto leading-relaxed">
                    Scegli gli argomenti che ti interessano di più e l'AI scriverà un'edizione personalizzata piena di consigli pratici e pronostici per i prossimi 30 giorni.
                  </p>
                  <button 
                    onClick={() => setIsBuilding(true)}
                    className="px-12 py-6 bg-white text-black rounded-2xl font-bold hover:bg-sky-50 transition-all shadow-2xl inline-flex items-center gap-3 text-xl"
                  >
                    <Plus className="w-6 h-6" /> Inizia ora
                  </button>
                </div>
              </div>
            )}
          </motion.article>
        )}
      </AnimatePresence>

      {/* Analysis Modal (Shared with GlobalDashboards) */}
      <AnimatePresence>
        {selectedQuote && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-10">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedQuote(null)}
              className="absolute inset-0 bg-black/90 backdrop-blur-xl"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-4xl bg-[#0a0a0a] rounded-[48px] border border-white/10 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            >
              <div className="p-8 md:p-12 overflow-y-auto no-scrollbar flex-1">
                <div className="flex justify-between items-start mb-12">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-sky-500 rounded-2xl flex items-center justify-center shadow-lg shadow-sky-500/20">
                      <Database className="w-7 h-7 text-white" />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-sky-400 uppercase tracking-[0.3em]">The Deep Analysis</h2>
                      <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">Crystal Intelligence Report</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setSelectedQuote(null)}
                    className="p-3 bg-white/5 rounded-2xl text-slate-400 hover:text-white transition-colors border border-white/10"
                  >
                    <ChevronRight className="w-6 h-6 rotate-90" />
                  </button>
                </div>

                <div className="space-y-12">
                  <div className="space-y-6">
                    <div className="p-8 bg-white/5 rounded-[32px] border border-white/10 italic font-serif text-2xl text-slate-300 leading-relaxed">
                      "{selectedQuote.text}"
                    </div>
                    <div className="flex items-center gap-3 px-4">
                      <Sparkles className="w-5 h-5 text-sky-400" />
                      <span className="text-sm font-bold text-slate-400 italic">{selectedQuote.author}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                    <div className="space-y-8">
                      <section>
                        <h3 className="text-xl font-display font-bold text-white mb-4 flex items-center gap-3">
                          <Activity className="w-5 h-5 text-sky-400" /> Analisi Predittiva
                        </h3>
                        <p className="text-slate-400 leading-relaxed font-medium">
                          {selectedQuote.analysis.full_text}
                        </p>
                      </section>

                      <section>
                        <h3 className="text-xl font-display font-bold text-white mb-4 flex items-center gap-3">
                          <TrendingUp className="w-5 h-5 text-emerald-400" /> Impatto Globale
                        </h3>
                        <p className="text-slate-400 leading-relaxed font-medium">
                          {selectedQuote.analysis.impact}
                        </p>
                      </section>
                    </div>

                    <div className="space-y-8">
                      <section className="bg-white/5 p-8 rounded-[32px] border border-white/10">
                        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                          <Shield className="w-4 h-4 text-sky-400" /> Driver Analizzati
                        </h3>
                        <div className="space-y-4">
                          {selectedQuote.analysis.drivers.map((driver, idx) => (
                            <div key={idx} className="flex items-center gap-4 p-4 bg-black/40 rounded-2xl border border-white/5">
                              <div className="w-2 h-2 bg-sky-500 rounded-full shadow-[0_0_8px_rgba(14,165,233,0.5)]" />
                              <span className="text-sm font-bold text-slate-300">{driver}</span>
                            </div>
                          ))}
                        </div>
                      </section>

                      <section className="bg-sky-500/5 p-8 rounded-[32px] border border-sky-500/20">
                        <h3 className="text-sm font-bold text-sky-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                          <Calendar className="w-4 h-4" /> Parallelo Storico (20y)
                        </h3>
                        <p className="text-slate-300 text-sm leading-relaxed italic">
                          {selectedQuote.analysis.historical_parallel}
                        </p>
                      </section>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-8 bg-white/5 border-t border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-4 text-slate-400 text-xs font-bold uppercase tracking-widest">
                  <Globe2 className="w-4 h-4" /> Crystal Global Intelligence
                </div>
                <button 
                  onClick={() => handleSaveQuote(selectedQuote)}
                  disabled={isSaving || savedQuotes.includes(selectedQuote.quote_id)}
                  className={cn(
                    "px-10 py-4 rounded-2xl font-bold text-sm transition-all flex items-center gap-3 shadow-2xl",
                    savedQuotes.includes(selectedQuote.quote_id)
                      ? "bg-emerald-500 text-white"
                      : "bg-white text-black hover:bg-sky-50"
                  )}
                >
                  {isSaving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : savedQuotes.includes(selectedQuote.quote_id) ? (
                    <><Check className="w-4 h-4" /> Salvato</>
                  ) : (
                    <><Bookmark className="w-4 h-4" /> Salva Analisi</>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
