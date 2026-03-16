import React, { useState, useEffect } from 'react';
import { Globe2, TrendingUp, AlertTriangle, ChevronRight, Activity, MapPin, Sparkles, ArrowUpRight, ArrowDownRight, Quote, Calendar, Database, Shield, Bookmark, Check, Loader2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from './CrystalCard';
import { generateCrystalQuotes } from '../services/geminiService';
import { CrystalQuote } from '../types/crystal';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { doc, setDoc, collection, serverTimestamp } from 'firebase/firestore';

export function GlobalDashboards({ user }: { user: any }) {
  const [activeTab, setActiveTab] = useState<'quotes' | 'hazards' | 'pulse'>('quotes');
  const [quotes, setQuotes] = useState<CrystalQuote[]>([]);
  const [isLoadingQuotes, setIsLoadingQuotes] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState<CrystalQuote | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [savedQuotes, setSavedQuotes] = useState<string[]>([]);

  useEffect(() => {
    const fetchQuotes = async () => {
      setIsLoadingQuotes(true);
      try {
        const result = await generateCrystalQuotes();
        setQuotes(result.quotes || []);
      } catch (error) {
        console.error("Error fetching quotes:", error);
      } finally {
        setIsLoadingQuotes(false);
      }
    };
    fetchQuotes();
  }, []);

  const handleSaveQuote = async (quote: CrystalQuote) => {
    if (!user) return;
    setIsSaving(true);
    try {
      const path = `users/${user.uid}/saved_quotes/${quote.quote_id}`;
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

  const hazards = [
    { id: 'h1', title: 'Crisi Idrica Estiva', area: 'Sud Europa', prob: 0.88, horizon: '90d', risk: 'extreme' },
    { id: 'h2', title: 'Sciopero Logistica (Amazon/UPS)', area: 'Europa Centrale', prob: 0.72, horizon: '14d', risk: 'high' },
    { id: 'h3', title: 'Rally Prezzi Cacao', area: 'Globale', prob: 0.65, horizon: '30d', risk: 'medium' },
    { id: 'h4', title: 'Nuova Variante Virale', area: 'Asia', prob: 0.15, horizon: '6m', risk: 'high' },
  ];

  const cityPulse = [
    { rank: 1, city: 'Milano', trend: 'up', score: 94, reason: 'Boom Immobiliare + Olimpiadi 2026' },
    { rank: 2, city: 'Napoli', trend: 'up', score: 89, reason: 'Rinascimento Turistico & Culturale' },
    { rank: 3, city: 'Venezia', trend: 'down', score: 65, reason: 'Over-tourism & Tasse Ingresso' },
    { rank: 4, city: 'Torino', trend: 'flat', score: 78, reason: 'Transizione Automotive Lenta' },
  ];

  return (
    <div className="space-y-10">
      {/* Top Stats / Quick Nav */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <motion.div 
          whileHover={{ y: -4 }}
          onClick={() => setActiveTab('quotes')}
          className={cn(
            "p-6 rounded-[32px] border-2 transition-all cursor-pointer group",
            activeTab === 'quotes' ? "bg-sky-500/10 border-sky-500/30 shadow-xl shadow-sky-500/10" : "bg-[#0a0a0a] border-white/10 hover:border-sky-500/30"
          )}
        >
          <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110", activeTab === 'quotes' ? "bg-sky-500 text-white" : "bg-sky-500/10 text-sky-400")}>
            <Globe2 className="w-6 h-6" />
          </div>
          <h3 className="text-xl font-display font-bold text-white mb-1">Crystal Quotes</h3>
          <p className="text-sm text-slate-400 font-medium">Chiamate dirette del motore AI</p>
        </motion.div>

        <motion.div 
          whileHover={{ y: -4 }}
          onClick={() => setActiveTab('hazards')}
          className={cn(
            "p-6 rounded-[32px] border-2 transition-all cursor-pointer group",
            activeTab === 'hazards' ? "bg-rose-500/10 border-rose-500/30 shadow-xl shadow-rose-500/10" : "bg-[#0a0a0a] border-white/10 hover:border-rose-500/30"
          )}
        >
          <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110", activeTab === 'hazards' ? "bg-rose-500 text-white" : "bg-rose-500/10 text-rose-500")}>
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h3 className="text-xl font-display font-bold text-white mb-1">Hazards Radar</h3>
          <p className="text-sm text-slate-400 font-medium">Probabilità eventi critici 7d/30d</p>
        </motion.div>

        <motion.div 
          whileHover={{ y: -4 }}
          onClick={() => setActiveTab('pulse')}
          className={cn(
            "p-6 rounded-[32px] border-2 transition-all cursor-pointer group",
            activeTab === 'pulse' ? "bg-emerald-500/10 border-emerald-500/30 shadow-xl shadow-emerald-500/10" : "bg-[#0a0a0a] border-white/10 hover:border-emerald-500/30"
          )}
        >
          <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110", activeTab === 'pulse' ? "bg-emerald-500 text-white" : "bg-emerald-500/10 text-emerald-500")}>
            <TrendingUp className="w-6 h-6" />
          </div>
          <h3 className="text-xl font-display font-bold text-white mb-1">City Pulse</h3>
          <p className="text-sm text-slate-400 font-medium">Ranking variazioni per città</p>
        </motion.div>
      </div>

      {/* Content Area */}
      <AnimatePresence mode="wait">
        {activeTab === 'quotes' && (
          <motion.section 
            key="quotes"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex flex-col">
                <h2 className="text-sm font-bold text-slate-500 uppercase tracking-[0.2em]">CRYSTAL QUOTES (WEEKLY CALLS)</h2>
                <p className="text-xs text-slate-600 mt-1">Le 5 intuizioni più profonde del motore AI per questa settimana.</p>
              </div>
              <div className="h-px flex-1 bg-white/5 mx-6" />
            </div>

            {isLoadingQuotes ? (
              <div className="flex flex-col items-center justify-center py-20 bg-[#0a0a0a] rounded-[48px] border border-white/5">
                <Loader2 className="w-12 h-12 text-sky-500 animate-spin mb-4" />
                <p className="text-slate-400 font-medium">Consultando l'Oracolo di Crystal...</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6">
                {quotes.map((quote, i) => (
                  <motion.div 
                    key={quote.quote_id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="bg-[#0a0a0a] p-10 rounded-[48px] border border-white/10 shadow-sm relative overflow-hidden group hover:shadow-2xl hover:shadow-sky-500/10 transition-all cursor-pointer"
                    onClick={() => setSelectedQuote(quote)}
                  >
                    <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                      <Quote className="w-32 h-32 text-sky-500" />
                    </div>
                    <div className="flex items-center gap-3 mb-6 relative z-10">
                      <span className="text-[10px] font-bold text-sky-400 uppercase tracking-[0.3em] bg-sky-500/10 px-4 py-1.5 rounded-full border border-sky-500/20">
                        {quote.context}
                      </span>
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">Issue #{i + 1} • {quote.date}</span>
                    </div>
                    <p className="text-3xl md:text-4xl font-display font-bold text-white leading-tight mb-8 relative z-10">
                      "{quote.text}"
                    </p>
                    <div className="flex items-center justify-between relative z-10">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-white/5 rounded-full flex items-center justify-center border border-white/10">
                          <Sparkles className="w-5 h-5 text-sky-400" />
                        </div>
                        <span className="text-sm font-bold text-slate-400 italic">{quote.author}</span>
                      </div>
                      <button className="flex items-center gap-2 text-sm font-bold text-sky-400 hover:text-sky-300 transition-colors bg-sky-500/5 px-6 py-3 rounded-2xl border border-sky-500/10">
                        Vedi Analisi Completa <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.section>
        )}

        {activeTab === 'hazards' && (
          <motion.section 
            key="hazards"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-4"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-[0.2em]">RADAR RISCHI IMMINENTI</h2>
              <div className="h-px flex-1 bg-white/5 mx-6" />
            </div>
            <div className="grid grid-cols-1 gap-4">
              {hazards.map((hazard) => (
                <div key={hazard.id} className="bg-[#0a0a0a] p-6 rounded-[32px] border border-white/10 shadow-sm flex items-center justify-between group hover:border-rose-500/30 transition-all">
                  <div className="flex items-center gap-6">
                    <div className={cn(
                      "w-14 h-14 rounded-2xl flex items-center justify-center font-bold text-lg shadow-inner",
                      hazard.risk === 'extreme' ? "bg-rose-600 text-white" : 
                      hazard.risk === 'high' ? "bg-rose-500/20 text-rose-400" : "bg-amber-500/20 text-amber-400"
                    )}>
                      {Math.round(hazard.prob * 100)}%
                    </div>
                    <div>
                      <h4 className="text-lg font-display font-bold text-white mb-1">{hazard.title}</h4>
                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1 text-xs font-bold text-slate-500 uppercase tracking-wider">
                          <MapPin className="w-3 h-3" /> {hazard.area}
                        </span>
                        <span className="w-1 h-1 bg-white/10 rounded-full" />
                        <span className="flex items-center gap-1 text-xs font-bold text-sky-400 uppercase tracking-wider">
                          <Activity className="w-3 h-3" /> Orizzonte: {hazard.horizon}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button className="p-4 bg-white/5 text-slate-500 rounded-2xl hover:bg-rose-500/20 hover:text-rose-400 transition-all group-hover:translate-x-1">
                    <ChevronRight className="w-6 h-6" />
                  </button>
                </div>
              ))}
            </div>
          </motion.section>
        )}

        {activeTab === 'pulse' && (
          <motion.section 
            key="pulse"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-4"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-[0.2em]">CITY PULSE RANKING</h2>
              <div className="h-px flex-1 bg-white/5 mx-6" />
            </div>
            <div className="bg-[#0a0a0a] rounded-[40px] border border-white/10 shadow-sm overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-white/5 border-bottom border-white/10">
                    <th className="px-8 py-5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest">Rank</th>
                    <th className="px-8 py-5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest">Città</th>
                    <th className="px-8 py-5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest">Trend</th>
                    <th className="px-8 py-5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest">Score</th>
                    <th className="px-8 py-5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest">Driver Principale</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {cityPulse.map((city) => (
                    <tr key={city.city} className="hover:bg-white/5 transition-colors group">
                      <td className="px-8 py-6 font-display font-bold text-slate-500 text-xl">#{city.rank}</td>
                      <td className="px-8 py-6 font-display font-bold text-white text-lg">{city.city}</td>
                      <td className="px-8 py-6">
                        {city.trend === 'up' ? (
                          <div className="flex items-center gap-1 text-emerald-400 font-bold text-sm">
                            <ArrowUpRight className="w-4 h-4" /> Crescita
                          </div>
                        ) : city.trend === 'down' ? (
                          <div className="flex items-center gap-1 text-rose-400 font-bold text-sm">
                            <ArrowDownRight className="w-4 h-4" /> Calo
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-slate-500 font-bold text-sm">
                            Stabile
                          </div>
                        )}
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-3">
                          <div className="w-24 h-2 bg-white/10 rounded-full overflow-hidden">
                            <div className="h-full bg-sky-500 rounded-full" style={{ width: `${city.score}%` }} />
                          </div>
                          <span className="font-bold text-white">{city.score}</span>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <span className="px-4 py-1.5 bg-sky-500/10 text-sky-400 rounded-full text-xs font-bold border border-sky-500/20">
                          {city.reason}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* Analysis Modal */}
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
                      <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Crystal Intelligence Report</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setSelectedQuote(null)}
                    className="p-3 bg-white/5 rounded-2xl text-slate-500 hover:text-white transition-colors border border-white/10"
                  >
                    <X className="w-6 h-6" />
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
                        <h3 className="text-sm font-bold text-slate-500 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
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
                <div className="flex items-center gap-4 text-slate-500 text-xs font-bold uppercase tracking-widest">
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
