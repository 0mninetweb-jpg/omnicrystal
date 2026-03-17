import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Compass, Sparkles, Waypoints, X } from 'lucide-react';

type OnboardingModalProps = {
  open: boolean;
  onClose: () => void;
  onStartForecast: () => void;
};

type TutorialStep = {
  id: string;
  kicker: string;
  title: string;
  description: string;
  bullets: string[];
  icon: React.ComponentType<{ className?: string }>;
};

const STEPS: TutorialStep[] = [
  {
    id: 'what',
    kicker: 'What Crystal Does',
    title: 'Crystal trasforma domande sul futuro in decisioni leggibili.',
    description:
      'Ogni forecast unisce probabilita, driver verificabili e azioni pratiche in un formato semplice da leggere anche se il tema e complesso.',
    bullets: [
      'Ricevi una risposta chiara, non solo una sintesi di notizie.',
      'Vedi cosa conta davvero: probabilita, rischio, fiducia e scenari.',
      'Puoi salvare i segnali che vuoi monitorare nel tempo.',
    ],
    icon: Compass,
  },
  {
    id: 'layers',
    kicker: 'Prediction Layer vs Oracle',
    title: 'Il prediction layer risponde. Oracle WorldSim simula.',
    description:
      'La previsione standard produce il numero e i driver principali. Oracle WorldSim entra solo quando serve piu profondita causale e piu storytelling strategico.',
    bullets: [
      'Prediction layer: outcome, probabilita, rischio, trust.',
      'Oracle WorldSim: attori pivot, narrative arc e intervention points.',
      'Oracle arricchisce il forecast, non sostituisce il motore base.',
    ],
    icon: Waypoints,
  },
  {
    id: 'action',
    kicker: 'Your First Action',
    title: 'Parti da una domanda concreta.',
    description:
      'Per capire Crystal in pochi secondi, la cosa migliore e lanciare una previsione semplice e vedere come viene spiegata.',
    bullets: [
      'Prova una domanda con orizzonte 30 giorni.',
      'Poi salva una entita nella Watchlist.',
      'Infine apri il Briefing per vedere il prodotto in modalita editoriale.',
    ],
    icon: Sparkles,
  },
];

export function OnboardingModal({ open, onClose, onStartForecast }: OnboardingModalProps) {
  const [activeStep, setActiveStep] = useState(0);
  const step = useMemo(() => STEPS[activeStep], [activeStep]);

  const handleClose = () => {
    setActiveStep(0);
    onClose();
  };

  const handleNext = () => {
    if (activeStep === STEPS.length - 1) {
      setActiveStep(0);
      onStartForecast();
      return;
    }
    setActiveStep((current) => current + 1);
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 md:p-8">
          <motion.button
            aria-label="Chiudi tutorial"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="absolute inset-0 bg-[rgba(15,23,42,0.42)] backdrop-blur-xl"
          />

          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="relative w-full max-w-3xl overflow-hidden rounded-[32px] border border-white/70 bg-[rgba(251,249,244,0.96)] shadow-[0_40px_120px_rgba(15,23,42,0.18)]"
          >
            <div className="absolute inset-0 soft-grid opacity-60" />
            <div className="relative border-b border-slate-200/80 px-6 py-5 md:px-8">
              <div className="flex items-start justify-between gap-6">
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-[20px] bg-[rgba(20,83,232,0.08)] text-[#1453e8] shadow-inner">
                    <step.icon className="h-7 w-7" />
                  </div>
                  <div>
                    <div className="section-kicker">{step.kicker}</div>
                    <h2 className="mt-2 max-w-xl text-2xl font-display font-semibold text-slate-950 md:text-3xl">
                      {step.title}
                    </h2>
                  </div>
                </div>

                <button
                  onClick={handleClose}
                  className="rounded-full border border-slate-200 bg-white/80 p-2 text-slate-500 transition hover:border-slate-300 hover:text-slate-900"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="relative grid gap-8 px-6 py-7 md:grid-cols-[1.1fr_0.9fr] md:px-8 md:py-8">
              <div>
                <p className="text-base leading-7 text-slate-600 md:text-[17px]">{step.description}</p>
                <div className="mt-6 space-y-3">
                  {step.bullets.map((item) => (
                    <div
                      key={item}
                      className="flex items-start gap-3 rounded-[22px] border border-slate-200/80 bg-white/80 px-4 py-3 text-sm font-medium leading-6 text-slate-700"
                    >
                      <div className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-[#1453e8]" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[28px] ink-panel p-6">
                <div className="section-kicker !text-slate-400">How It Feels</div>
                <p className="mt-3 text-sm leading-7 text-slate-300">
                  Crystal non ti butta addosso complessita. Ti mostra un numero, ti spiega perche quel numero esiste e
                  ti dice dove guardare dopo.
                </p>

                <div className="mt-6 rounded-[24px] border border-white/10 bg-white/5 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                    Step {activeStep + 1} / {STEPS.length}
                  </div>
                  <div className="mt-4 flex gap-2">
                    {STEPS.map((item, index) => (
                      <button
                        key={item.id}
                        onClick={() => setActiveStep(index)}
                        className={`h-2 flex-1 rounded-full transition ${
                          index === activeStep ? 'bg-rose-300' : 'bg-white/10 hover:bg-white/20'
                        }`}
                      />
                    ))}
                  </div>
                </div>

                <div className="mt-6 text-xs leading-6 text-slate-400">
                  Il tutorial resta sempre richiamabile dall&apos;header con <span className="font-semibold text-slate-200">How Crystal works</span>.
                </div>
              </div>
            </div>

            <div className="relative flex flex-col gap-3 border-t border-slate-200/80 bg-white/70 px-6 py-5 md:flex-row md:items-center md:justify-between md:px-8">
              <div className="text-sm font-medium text-slate-500">
                Ti bastano pochi passaggi per capire dove finisce il feed e dove comincia il prediction layer.
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleClose}
                  className="rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
                >
                  Chiudi
                </button>
                <button
                  onClick={handleNext}
                  className="inline-flex items-center gap-2 rounded-full bg-[#1453e8] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1248c8]"
                >
                  {activeStep === STEPS.length - 1 ? 'Apri Forecast' : 'Continua'}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
