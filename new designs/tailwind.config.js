/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        // near-black ink on warm off-white — the Swiss/editorial base
        ink: {
          DEFAULT: '#09090B',
          soft: '#27272A',
          mute: '#52525B',
          faint: '#A1A1AA',
        },
        canvas: '#FAFAFA',
        hairline: '#E4E4E7',
        // accent = action blue (used sparingly). `brand` kept as the token name
        // the screens already reference, but retuned from indigo to a clean blue.
        brand: {
          50: '#EEF4FF',
          100: '#DBE7FF',
          200: '#BDD3FF',
          300: '#90B4FF',
          400: '#5A8BFF',
          500: '#0066FF',
          600: '#0052D6',
          700: '#0A44A8',
        },
        // semantic risk red from the mockup
        signal: {
          red: '#FF3B30',
          blue: '#0066FF',
        },
      },
      borderRadius: {
        // Editorial-Swiss: one tight radius. Every rounded-sm/md/lg/xl/2xl/3xl
        // collapses to ~3px so nothing reads as a soft "AI-SaaS" bubble.
        // `full` is preserved for dots, toggles and the few truly-round bits.
        none: '0',
        sm: '2px',
        DEFAULT: '3px',
        md: '3px',
        lg: '3px',
        xl: '3px',
        '2xl': '4px',
        '3xl': '4px',
        full: '9999px',
      },
      boxShadow: {
        // Near-zero. Hairline borders do the work; soft drop-shadows are the
        // generic-SaaS tell, so even our "lift" is a whisper.
        soft: '0 1px 1px rgba(9,9,11,0.03)',
        card: '0 1px 1px rgba(9,9,11,0.03)',
        lift: '0 8px 24px rgba(9,9,11,0.10)',
        ring: '0 0 0 2px rgba(0,102,255,0.30)',
      },
      keyframes: {
        slideIn: {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        scaleIn: {
          from: { opacity: '0', transform: 'scale(0.98)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'slide-in': 'slideIn 0.28s cubic-bezier(0.16,1,0.3,1)',
        'fade-in': 'fadeIn 0.22s ease',
        'scale-in': 'scaleIn 0.16s cubic-bezier(0.16,1,0.3,1)',
      },
    },
  },
  plugins: [],
};
