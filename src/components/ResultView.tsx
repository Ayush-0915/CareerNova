import { motion } from 'framer-motion';
import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  ChevronRight,
} from 'lucide-react';
import type { ReviewResult, CategoryScores } from '../lib/types';

interface ResultViewProps {
  result: ReviewResult;
  resumeText: string;
  onReset: () => void;
}

const CATEGORY_LABELS: Record<keyof CategoryScores, string> = {
  clarity: 'Clarity',
  impact: 'Impact',
  atsCompatibility: 'ATS',
  structure: 'Structure',
};

const scoreColor = (score: number): string => {
  if (score >= 80) return '#4ade80'; // green
  if (score >= 60) return '#facc15'; // yellow
  if (score >= 40) return '#fb923c'; // orange
  return '#f87171'; // red
};

const scoreLabel = (score: number): string => {
  if (score >= 85) return 'Excellent';
  if (score >= 70) return 'Strong';
  if (score >= 55) return 'Decent';
  if (score >= 40) return 'Needs work';
  return 'Weak';
};

const ResultView = ({ result, resumeText, onReset }: ResultViewProps) => {
  return (
    <div className="w-full max-w-6xl mx-auto flex flex-col gap-10 sm:gap-14">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-2 text-sm uppercase tracking-widest text-[#D7E2EA]/60 hover:text-[#D7E2EA] transition-colors"
        >
          <ArrowLeft size={16} strokeWidth={1.8} />
          Review another
        </button>
        <span className="text-xs uppercase tracking-widest text-[#D7E2EA]/40">
          {resumeText.length.toLocaleString()} chars analysed
        </span>
      </div>

      {/* Hero score */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
        className="text-center flex flex-col items-center gap-4 sm:gap-6"
      >
        <span className="text-xs sm:text-sm uppercase tracking-widest text-[#D7E2EA]/50">
          Overall Score
        </span>
        <div className="flex flex-col items-center">
          <span
            className="score-gradient font-black leading-none"
            style={{ fontSize: 'clamp(6rem, 22vw, 18rem)' }}
          >
            {result.overallScore}
          </span>
          <span
            className="font-medium uppercase tracking-widest mt-2"
            style={{ color: scoreColor(result.overallScore) }}
          >
            {scoreLabel(result.overallScore)}
          </span>
        </div>
        <p
          className="max-w-2xl font-light text-[#D7E2EA]/80 leading-relaxed"
          style={{ fontSize: 'clamp(1rem, 1.8vw, 1.3rem)' }}
        >
          {result.summary}
        </p>
      </motion.div>

      {/* Category bars */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.15 }}
        className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4"
      >
        {(Object.keys(CATEGORY_LABELS) as Array<keyof CategoryScores>).map(
          (key) => {
            const score = result.categoryScores[key];
            return (
              <div
                key={key}
                className="rounded-3xl border border-[#D7E2EA]/15 bg-[#141418] p-5 sm:p-6 flex flex-col gap-3"
              >
                <span className="text-xs uppercase tracking-widest text-[#D7E2EA]/50">
                  {CATEGORY_LABELS[key]}
                </span>
                <span
                  className="text-3xl sm:text-4xl font-black"
                  style={{ color: scoreColor(score) }}
                >
                  {score}
                  <span className="text-base text-[#D7E2EA]/30 font-light">
                    /100
                  </span>
                </span>
                <div className="h-1.5 w-full rounded-full bg-[#0C0C0C] overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${score}%` }}
                    transition={{ duration: 0.9, delay: 0.3, ease: 'easeOut' }}
                    className="h-full rounded-full"
                    style={{ background: scoreColor(score) }}
                  />
                </div>
              </div>
            );
          },
        )}
      </motion.div>

      {/* Strengths + Weaknesses two-column */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.25 }}
          className="rounded-3xl border border-green-500/20 bg-green-500/5 p-6 sm:p-8 flex flex-col gap-5"
        >
          <div className="flex items-center gap-3">
            <CheckCircle2 size={22} className="text-green-400" strokeWidth={1.6} />
            <h3 className="text-lg sm:text-xl font-medium uppercase tracking-widest text-[#D7E2EA]">
              Strengths
            </h3>
          </div>
          <ul className="flex flex-col gap-4">
            {result.strengths.map((s, i) => (
              <li key={i} className="flex gap-3 text-[#D7E2EA]/90 leading-relaxed">
                <span className="text-green-400/60 font-medium shrink-0">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="rounded-3xl border border-amber-500/20 bg-amber-500/5 p-6 sm:p-8 flex flex-col gap-5"
        >
          <div className="flex items-center gap-3">
            <AlertTriangle size={22} className="text-amber-400" strokeWidth={1.6} />
            <h3 className="text-lg sm:text-xl font-medium uppercase tracking-widest text-[#D7E2EA]">
              Weaknesses
            </h3>
          </div>
          <ul className="flex flex-col gap-4">
            {result.weaknesses.map((w, i) => (
              <li key={i} className="flex gap-3 text-[#D7E2EA]/90 leading-relaxed">
                <span className="text-amber-400/60 font-medium shrink-0">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </motion.section>
      </div>

      {/* Missing sections */}
      {result.missingSections && result.missingSections.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.35 }}
          className="rounded-3xl border border-[#D7E2EA]/15 bg-[#141418] p-6 sm:p-8 flex flex-col gap-4"
        >
          <h3 className="text-lg sm:text-xl font-medium uppercase tracking-widest text-[#D7E2EA]">
            Missing sections
          </h3>
          <div className="flex flex-wrap gap-2">
            {result.missingSections.map((m, i) => (
              <span
                key={i}
                className="px-4 py-1.5 rounded-full border border-[#D7E2EA]/20 text-sm text-[#D7E2EA]/80"
              >
                {m}
              </span>
            ))}
          </div>
        </motion.section>
      )}

      {/* Rewrites */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.4 }}
        className="flex flex-col gap-6"
      >
        <div className="flex items-center gap-3">
          <Sparkles size={22} className="text-[#B600A8]" strokeWidth={1.6} />
          <h3 className="text-lg sm:text-xl font-medium uppercase tracking-widest text-[#D7E2EA]">
            Suggested rewrites
          </h3>
        </div>

        <div className="flex flex-col gap-4">
          {result.rewrites.map((r, i) => (
            <article
              key={i}
              className="rounded-3xl border border-[#D7E2EA]/15 bg-[#141418] p-5 sm:p-6 md:p-7 flex flex-col gap-4"
            >
              <div className="flex items-center gap-3">
                <span className="text-xs uppercase tracking-widest text-[#D7E2EA]/40">
                  Rewrite {i + 1}
                </span>
                <span className="text-xs uppercase tracking-widest text-[#D7E2EA]/60">
                  · {r.reason}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 md:gap-5 items-stretch">
                <div className="rounded-2xl bg-[#0C0C0C] border border-amber-500/15 p-4 sm:p-5">
                  <span className="text-xs uppercase tracking-widest text-amber-400/70 block mb-2">
                    Original
                  </span>
                  <p className="text-sm sm:text-base text-[#D7E2EA]/70 leading-relaxed line-through decoration-amber-500/40">
                    {r.original}
                  </p>
                </div>

                <div className="hidden md:flex items-center justify-center">
                  <ChevronRight size={22} className="text-[#D7E2EA]/40" strokeWidth={1.6} />
                </div>

                <div className="rounded-2xl bg-[#0C0C0C] border border-green-500/20 p-4 sm:p-5">
                  <span className="text-xs uppercase tracking-widest text-green-400/80 block mb-2">
                    Suggested
                  </span>
                  <p className="text-sm sm:text-base text-[#D7E2EA] leading-relaxed font-medium">
                    {r.suggested}
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </motion.section>

      {/* Footer CTA */}
      <div className="flex justify-center pt-4 pb-12">
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-3 rounded-full border-2 border-[#D7E2EA] px-10 py-4 text-sm sm:text-base font-medium uppercase tracking-widest text-[#D7E2EA] hover:bg-[#D7E2EA]/10 transition-colors"
        >
          <ArrowLeft size={18} strokeWidth={1.8} />
          Review another resume
        </button>
      </div>
    </div>
  );
};

export default ResultView;
