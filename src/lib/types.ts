export interface CategoryScores {
  clarity: number;
  impact: number;
  atsCompatibility: number;
  structure: number;
}

export interface Rewrite {
  original: string;
  suggested: string;
  reason: string;
}

export interface ReviewResult {
  overallScore: number;
  categoryScores: CategoryScores;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  rewrites: Rewrite[];
  missingSections?: string[];
}
