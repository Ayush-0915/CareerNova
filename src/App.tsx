import { useState } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle } from 'lucide-react';
import UploadZone from './components/UploadZone';
import LoadingState from './components/LoadingState';
import ResultView from './components/ResultView';
import type { CategoryScores, ReviewResult } from './lib/types';

type AppState =
  | { phase: 'idle' }
  | { phase: 'loading'; resumeText: string }
  | { phase: 'result'; resumeText: string; result: ReviewResult }
  | { phase: 'error'; resumeText: string; error: string };

const DEFAULT_CATEGORY_SCORES: CategoryScores = {
  clarity: 0,
  impact: 0,
  atsCompatibility: 0,
  structure: 0,
};

const normalizeReviewResult = (value: unknown): ReviewResult => {
  const base: ReviewResult = {
    overallScore: 0,
    categoryScores: DEFAULT_CATEGORY_SCORES,
    summary: 'No review summary was returned.',
    strengths: [],
    weaknesses: [],
    rewrites: [],
    missingSections: [],
  };

  if (!value || typeof value !== 'object') return base;

  const record = value as Record<string, unknown>;
  const categoryScores =
    record.categoryScores && typeof record.categoryScores === 'object'
      ? (record.categoryScores as Partial<CategoryScores>)
      : undefined;

  const scaleScore = (score: unknown) => {
    if (typeof score !== 'number' || Number.isNaN(score)) return 0;
    if (score <= 10) return Math.round(score * 10);
    return Math.max(0, Math.min(100, Math.round(score)));
  };

  const strengths = Array.isArray(record.strengths)
    ? record.strengths.filter((item): item is string => typeof item === 'string')
    : [];
  const weaknesses = Array.isArray(record.weaknesses)
    ? record.weaknesses.filter((item): item is string => typeof item === 'string')
    : [];
  const rewrites = Array.isArray(record.rewrites)
    ? record.rewrites.filter((item): item is ReviewResult['rewrites'][number] => {
        return Boolean(
          item &&
            typeof item === 'object' &&
            typeof (item as Record<string, unknown>).original === 'string' &&
            typeof (item as Record<string, unknown>).suggested === 'string' &&
            typeof (item as Record<string, unknown>).reason === 'string',
        );
      })
    : [];

  return {
    overallScore: typeof record.overallScore === 'number' ? record.overallScore : base.overallScore,
    categoryScores: {
      clarity: scaleScore(categoryScores?.clarity),
      impact: scaleScore(categoryScores?.impact),
      atsCompatibility: scaleScore(categoryScores?.atsCompatibility),
      structure: scaleScore(categoryScores?.structure),
    },
    summary: typeof record.summary === 'string' ? record.summary : base.summary,
    strengths,
    weaknesses,
    rewrites,
    missingSections: Array.isArray(record.missingSections)
      ? record.missingSections.filter((item): item is string => typeof item === 'string')
      : [],
  };
};

const getFriendlyErrorMessage = (value: unknown, fallback: string) => {
  if (!value || typeof value !== 'object') return fallback;

  const record = value as Record<string, unknown>;
  const error = record.error;

  if (error && typeof error === 'object') {
    const errorRecord = error as Record<string, unknown>;
    const code = errorRecord.code;
    const status = errorRecord.status;
    const message = errorRecord.message;

    if (
      code === 429 ||
      status === 'RESOURCE_EXHAUSTED' ||
      (typeof message === 'string' && message.toLowerCase().includes('quota'))
    ) {
      return "You've hit the Gemini free-tier limit. Try again later.";
    }

    if (typeof message === 'string' && message.trim()) {
      return message;
    }

    return JSON.stringify(errorRecord, null, 2);
  }

  if (typeof error === 'string') return error;

  return fallback;
};

const App = () => {
  const [state, setState] = useState<AppState>({ phase: 'idle' });

  const handleReview = async (resumeText: string) => {
    console.log('[Front-End] Resume upload initiated. Text length:', resumeText.length);
    setState({ phase: 'loading', resumeText });

    try {
      const apiUrl = (import.meta.env.VITE_API_URL as string) || '/api/review';
      console.log('[Front-End] Dispatching API request to', apiUrl);
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeText }),
      });

      console.log('[Front-End] API response status received:', res.status);
      const raw = await res.text();
      let data: unknown;
      try {
        data = raw ? JSON.parse(raw) : undefined;
        console.log('[Front-End] JSON parsed successfully from response.');
      } catch {
        // If parsing failed and the response wasn't OK, surface the raw text
        // (which often contains a human-friendly error). If it was OK but
        // returned malformed JSON, throw a specific error.
        if (!res.ok) throw new Error(raw || 'Review failed.');
        throw new Error('AI returned malformed JSON. Try again.');
      }

      if (!res.ok) {
        // `data` may be an object with an `error` field when parse succeeded.
        let errMsg = 'Review failed.';
        if (typeof data === 'object' && data) {
          errMsg = getFriendlyErrorMessage(data, errMsg);
        } else if (typeof data === 'string') {
          errMsg = data;
        }
        throw new Error(errMsg);
      }

      console.log('[Front-End] Rendering review results.');
      setState({ phase: 'result', resumeText, result: normalizeReviewResult(data) });

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
          className="flex items-center gap-3 text-[#D7E2EA] font-medium uppercase tracking-widest text-sm sm:text-base"
        >
          <img
            src="/logo.svg"
            alt="CareerNova logo"
            className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl shadow-[0_10px_30px_rgba(182,0,168,0.22)]"
          />
          <span>CareerNova</span>
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
