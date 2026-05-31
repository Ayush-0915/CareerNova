import * as pdfjsLib from 'pdfjs-dist';
// Vite's ?url import bundles the worker and gives us the resolved URL.
// pdfjs requires the worker file to be served separately for performance.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface TextItemLike {
  str: string;
}

/**
 * Extract all text from a PDF file in the browser.
 * Returns the concatenated text, normalized to single spaces and trimmed.
 *
 * Throws when:
 * - The file isn't a valid PDF (`PDF_INVALID`)
 * - The PDF has no extractable text (likely scanned/image-only) (`PDF_NO_TEXT`)
 */
export async function extractTextFromPdf(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();

  let pdf;
  try {
    pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  } catch {
    throw new Error('PDF_INVALID');
  }

  let fullText = '';
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => (item as TextItemLike).str)
      .join(' ');
    fullText += pageText + '\n';
  }

  const cleaned = fullText
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (cleaned.length < 50) {
    // Most likely a scanned/image-only PDF — pdfjs can't OCR.
    throw new Error('PDF_NO_TEXT');
  }

  return cleaned;
}
