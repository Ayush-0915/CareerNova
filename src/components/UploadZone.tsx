import { useRef, useState } from 'react';
import { UploadCloud, FileText, Sparkles, AlertCircle } from 'lucide-react';
import { extractTextFromPdf } from '../lib/pdfExtract';

interface UploadZoneProps {
  onSubmit: (resumeText: string) => void;
  isProcessing: boolean;
}

type Mode = 'upload' | 'paste';

const MAX_CHARS = 30_000;
const MIN_CHARS = 100;

const UploadZone = ({ onSubmit, isProcessing }: UploadZoneProps) => {
  const [mode, setMode] = useState<Mode>('upload');
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setError(null);

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Only PDF files are supported. Use the "Paste text" tab for other formats.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('PDF is too large (max 10 MB).');
      return;
    }

    setFileName(file.name);
    setIsExtracting(true);
    try {
      const extracted = await extractTextFromPdf(file);
      setText(extracted.slice(0, MAX_CHARS));
    } catch (err) {
      const code = err instanceof Error ? err.message : 'PDF_INVALID';
      if (code === 'PDF_NO_TEXT') {
        setError(
          "Couldn't extract text — this looks like a scanned/image PDF. Switch to \"Paste text\" instead.",
        );
      } else {
        setError("That doesn't look like a valid PDF. Try a different file.");
      }
      setFileName(null);
    } finally {
      setIsExtracting(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const handleSubmit = () => {
    setError(null);
    const trimmed = text.trim();
    if (trimmed.length < MIN_CHARS) {
      setError(`Need at least ${MIN_CHARS} characters of resume text.`);
      return;
    }
    onSubmit(trimmed);
  };

  const charCount = text.length;
  const overLimit = charCount > MAX_CHARS;
  const canSubmit = charCount >= MIN_CHARS && !overLimit && !isProcessing && !isExtracting;

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Mode tabs */}
      <div className="flex gap-2 mb-6 p-1 rounded-full border border-[#D7E2EA]/15 bg-[#141418] w-fit mx-auto">
        <button
          type="button"
          onClick={() => setMode('upload')}
          className={`px-5 py-2 rounded-full text-sm uppercase tracking-widest font-medium transition-colors ${
            mode === 'upload'
              ? 'bg-[#D7E2EA] text-[#0C0C0C]'
              : 'text-[#D7E2EA]/60 hover:text-[#D7E2EA]'
          }`}
        >
          Upload PDF
        </button>
        <button
          type="button"
          onClick={() => setMode('paste')}
          className={`px-5 py-2 rounded-full text-sm uppercase tracking-widest font-medium transition-colors ${
            mode === 'paste'
              ? 'bg-[#D7E2EA] text-[#0C0C0C]'
              : 'text-[#D7E2EA]/60 hover:text-[#D7E2EA]'
          }`}
        >
          Paste text
        </button>
      </div>

      {/* Dropzone / textarea */}
      {mode === 'upload' ? (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`w-full rounded-[32px] border-2 border-dashed p-10 sm:p-14 transition-all ${
            isDragging
              ? 'border-[#B600A8] bg-[#1a0f1f]'
              : 'border-[#D7E2EA]/25 bg-[#141418] hover:border-[#D7E2EA]/50 hover:bg-[#17171c]'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
          <div className="flex flex-col items-center gap-4 text-center">
            {fileName ? (
              <>
                <FileText size={48} className="text-[#D7E2EA]" strokeWidth={1.4} />
                <div className="flex flex-col gap-1">
                  <span className="text-base sm:text-lg font-medium text-[#D7E2EA] break-all">
                    {fileName}
                  </span>
                  {isExtracting ? (
                    <span className="text-sm text-[#D7E2EA]/60 animate-soft-pulse">
                      Extracting text…
                    </span>
                  ) : (
                    <span className="text-sm text-[#D7E2EA]/60">
                      {charCount.toLocaleString()} characters extracted · click to replace
                    </span>
                  )}
                </div>
              </>
            ) : (
              <>
                <UploadCloud size={48} className="text-[#D7E2EA]/70" strokeWidth={1.4} />
                <div className="flex flex-col gap-1">
                  <span className="text-base sm:text-lg font-medium text-[#D7E2EA]">
                    Drop your resume PDF here, or click to browse
                  </span>
                  <span className="text-sm text-[#D7E2EA]/50">
                    PDF only · max 10 MB · text is never stored
                  </span>
                </div>
              </>
            )}
          </div>
        </button>
      ) : (
        <div className="w-full rounded-[32px] border border-[#D7E2EA]/15 bg-[#141418] overflow-hidden">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste your full resume text here…"
            className="w-full h-64 p-5 sm:p-6 bg-transparent text-[#D7E2EA] font-light placeholder:text-[#D7E2EA]/30 resize-none focus:outline-none text-sm sm:text-base leading-relaxed"
            style={{ fontFamily: "'Kanit', sans-serif" }}
          />
          <div className="flex items-center justify-between px-5 sm:px-6 py-3 border-t border-[#D7E2EA]/10 text-xs text-[#D7E2EA]/50 uppercase tracking-widest">
            <span>{charCount.toLocaleString()} / {MAX_CHARS.toLocaleString()} chars</span>
            <span>{charCount < MIN_CHARS ? `${MIN_CHARS - charCount} more needed` : 'Ready'}</span>
          </div>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          <AlertCircle size={20} className="shrink-0 mt-0.5" strokeWidth={1.6} />
          <span>{error}</span>
        </div>
      )}

      {/* Submit */}
      <div className="mt-6 flex justify-center">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="inline-flex items-center gap-3 rounded-full px-10 py-4 text-sm sm:text-base font-medium uppercase tracking-widest text-white transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
          style={{
            background:
              'linear-gradient(123deg, #18011F 7%, #B600A8 37%, #7621B0 72%, #BE4C00 100%)',
            boxShadow:
              '0px 4px 4px rgba(181, 1, 167, 0.25), 4px 4px 12px #7721B1 inset',
            outline: '2px solid #FFFFFF',
            outlineOffset: '-3px',
          }}
        >
          <Sparkles size={18} strokeWidth={1.8} />
          {isProcessing ? 'Reviewing…' : 'Review my resume'}
        </button>
      </div>
    </div>
  );
};

export default UploadZone;
