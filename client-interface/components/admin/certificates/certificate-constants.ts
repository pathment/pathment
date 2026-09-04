

export interface TierCriteria {
  id: string;
  name: string;
  priority?: number;
  badgeUrl?: string;
  keywords?: string[] | null;
  minScorePercent?: number | null;
  maxOpenBlockers?: number | null;
  minCompletionRate?: number | null;
  minOnTimeRate?: number | null;
  minAvgRating?: number | null;
  minAttendanceRate?: number | null;
  customRule?: string | null;
}


export const FONTS = [
  { value: 'Montserrat, sans-serif', label: 'Montserrat (Modern Sans)' },
  { value: 'Playfair Display, serif', label: 'Playfair Display (Elegant Serif)' },
  { value: 'Cinzel, serif', label: 'Cinzel (Classic Roman)' },
  { value: 'Great Vibes, cursive', label: 'Great Vibes (Calligraphy Script)' },
  { value: 'Alex Brush, cursive', label: 'Alex Brush (Elegant Handwriting)' },
  { value: 'Oswald, sans-serif', label: 'Oswald (Bold Cond)' },
  { value: 'Lustria, serif', label: 'Lustria (Editorial)' },
  { value: 'Sacramento, cursive', label: 'Sacramento (Retro Monoline)' },
  { value: 'Merriweather, serif', label: 'Merriweather (Classic Serif)' },
  { value: 'Courier New, monospace', label: 'Courier New (Mono)' }
] as const;


export const GOOGLE_FONTS_URL = "https://fonts.googleapis.com/css2?family=Alex+Brush&family=Cinzel:wght@400;700&family=Great+Vibes&family=Montserrat:wght@400;600;700&family=Oswald:wght@400;700&family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Sacramento&family=Lustria&family=Merriweather&display=swap";


export const DYNAMIC_SHORTCUTS = [
  { key: 'mentee_name', label: 'Member Name', tag: '{{name}}' },
  { key: 'program_name', label: 'Program Name', tag: '{{program_name}}' },
  { key: 'date_issued', label: 'Date', tag: '{{date}}' },
  { key: 'issuer_name', label: 'Issuer Name', tag: '{{issuer_name}}' },
  { key: 'issuer_title', label: 'Issuer Title', tag: '{{issuer_title}}' }
] as const;


export const DEFAULT_CRITERIA: TierCriteria[] = [
  { id: 'gold',          priority: 1, name: 'Gold Certificate',          badgeUrl: '', keywords: [], minScorePercent: 80, maxOpenBlockers: 0, minCompletionRate: 90, minOnTimeRate: 70, minAvgRating: 4.0, minAttendanceRate: 80, customRule: '' },
  { id: 'silver',        priority: 2, name: 'Silver Certificate',        badgeUrl: '', keywords: [], minScorePercent: 65, maxOpenBlockers: 2, minCompletionRate: 75, minOnTimeRate: 60, minAvgRating: 3.5, minAttendanceRate: 70, customRule: '' },
  { id: 'bronze',        priority: 3, name: 'Bronze Certificate',        badgeUrl: '', keywords: [], minScorePercent: 50, maxOpenBlockers: 5, minCompletionRate: 60, minOnTimeRate: 50, minAvgRating: 3.0, minAttendanceRate: 50, customRule: '' },
  { id: 'participation', priority: 4, name: 'Participation Certificate', badgeUrl: '', keywords: [], minScorePercent: 0,  maxOpenBlockers: -1, minCompletionRate: 0, minOnTimeRate: 0, minAvgRating: 0, minAttendanceRate: null, customRule: '' },
];


export interface BackgroundPreset {
  id: string;
  name: string;
  description: string;
  previewGradient: string;
  imageUrl: string;
}

export const BACKGROUND_PRESETS: BackgroundPreset[] = [
  {
    id: 'preset-bg1',
    name: 'Classic Certificate Frame',
    description: 'High-resolution professional certificate background image from /certificates/bg1.png',
    previewGradient: 'from-[#fffdfa] via-[#faf6ee] to-[#f3ede0] border-amber-500/40',
    imageUrl: '/certificates/bg1.png'
  }
];

export const BACKGROUND_PRESETS_MAP: Record<string, BackgroundPreset> = Object.fromEntries(
  BACKGROUND_PRESETS.map(p => [p.id, p])
);


