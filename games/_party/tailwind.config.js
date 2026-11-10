/** Tailwind config shared by the same-device party games (games/_party + each game). */
export default {
  content: [
    './games/_party/**/*.{ts,tsx,html}',
    './games/loups-de-minuit/**/*.{ts,tsx,html}',
    './games/chroma-clash/**/*.{ts,tsx,html}',
    './games/micro-neon/**/*.{ts,tsx,html}',
  ],
  theme: {
    extend: {
      colors: {
        bg: '#070914',
        surface: '#0d1124',
        surface2: '#161d3a',
        line: 'rgba(255,255,255,0.1)',
        ink: '#eef2ff',
        muted: '#a3add4',
        accent: '#2f7bff',
        violet: '#a24dff',
        cyan: '#38e1ff',
        danger: '#fb4c6e',
        success: '#34d399',
        warning: '#fbbf24',
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'system-ui', 'sans-serif'],
        display: ['"Space Grotesk Variable"', '"Inter Variable"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
