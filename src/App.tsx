import { useState } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle } from 'lucide-react';
import UploadZone from './components/UploadZone';
import LoadingState from './components/LoadingState';
import ResultView from './components/ResultView';
import type { ReviewResult } from './lib/types';

type AppState =
  | { phase: 'idle' }
  | { phase: 'loading'; resumeText: string }
  | { phase: 'result'; resumeText: string; result: ReviewResult }
  | { phase: 'error'; resumeText: string; error: string };

const App = () => {
  const [state, setState] = useState<AppState>({ phase: 'idle' });

  const handleReview = async (resumeText: string) => {
    setState({ phase: 'loading', resumeText });

    try {
      const res = await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeText }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Review failed.');
      }

      setState({ phase: 'result', resumeText, result: data as ReviewResult });

      // Scroll to top so the user sees the score
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      setState({ phase: 'error', resumeText, error: msg });
    }
  };

  const reset = () => setState({ phase: 'idle' });

  return (
    <main className="relative min-h-screen w-full bg-[#0C0C0C]">
      {/* Header */}
      <header className="w-full px-6 md:px-10 pt-6 md:pt-8 flex items-center justify-between">
        <a
          href="/"
          className="flex items-center gap-2 text-[#D7E2EA] font-medium uppercase tracking-widest text-sm sm:text-base"
        >
          <span className="score-gradient font-black text-xl sm:text-2xl">
            C
          </span>
          CareerNova
        </a>
        <span className="text-xs sm:text-sm uppercase tracking-widest text-[#D7E2EA]/40">
          Powered by Gemini
        </span>
      </header>

      <div className="px-5 sm:px-8 md:px-10 pt-12 sm:pt-20 md:pt-24 pb-16">
        {state.phase === 'idle' && (
          <>
            {/* Hero */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: [0.25, 0.1, 0.25, 1] }}
              className="text-center flex flex-col items-center gap-6 mb-12 sm:mb-16"
            >
              <h1
                className="hero-heading font-black uppercase leading-none tracking-tight"
                style={{ fontSize: 'clamp(3rem, 11vw, 9rem)' }}
              >
                Resume reviewer
              </h1>
              <p
                className="max-w-2xl font-light text-[#D7E2EA]/70 leading-relaxed"
                style={{ fontSize: 'clamp(1rem, 1.7vw, 1.25rem)' }}
              >
                Drop in your resume. Get a brutally honest, AI-powered review with
                scores, strengths, weaknesses, and rewritten bullets — in seconds.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              <UploadZone onSubmit={handleReview} isProcessing={false} />
            </motion.div>

            {/* Trust strip */}
            <div className="mt-16 sm:mt-20 max-w-3xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 text-center">
              {[
                { num: '4', label: 'Scored categories' },
                { num: '3', label: 'Bullets rewritten' },
                { num: '~8s', label: 'Average response' },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-2xl border border-[#D7E2EA]/10 bg-[#141418]/50 p-5 flex flex-col items-center gap-2"
                >
                  <span className="score-gradient text-3xl sm:text-4xl font-black">
                    {stat.num}
                  </span>
                  <span className="text-xs uppercase tracking-widest text-[#D7E2EA]/50">
                    {stat.label}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        {state.phase === 'loading' && <LoadingState />}

        {state.phase === 'result' && (
          <ResultView
            result={state.result}
            resumeText={state.resumeText}
            onReset={reset}
          />
        )}

        {state.phase === 'error' && (
          <div className="max-w-xl mx-auto flex flex-col items-center gap-6 py-16 text-center">
            <AlertCircle size={48} className="text-red-400" strokeWidth={1.4} />
            <h2 className="text-2xl font-medium text-[#D7E2EA]">
              Couldn't review that resume
            </h2>
            <p className="text-[#D7E2EA]/70 leading-relaxed">{state.error}</p>
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-2 rounded-full border-2 border-[#D7E2EA] px-8 py-3 text-sm font-medium uppercase tracking-widest text-[#D7E2EA] hover:bg-[#D7E2EA]/10 transition-colors"
            >
              Try again
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-[#D7E2EA]/10 px-6 md:px-10 py-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs uppercase tracking-widest text-[#D7E2EA]/40">
        <span>© 2026 Ayush Singh</span>
        <span>Your resume is processed in real time and never stored</span>
      </footer>
    </main>
  );
};

export default App;
