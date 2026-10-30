/**
 * Euloge Arcade — PRISM-DECK // ATELIER HOLO-CARTOUCHE design tokens.
 * Colors are CSS variables (see src/styles/index.css) so dark/light themes
 * and Chroma Skins share the same utility classes.
 */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: token('bg'),
        surface: token('surface'),
        'surface-2': token('surface-2'),
        line: token('line'),
        ink: token('ink'),
        'ink-muted': token('ink-muted'),
        'ink-faint': token('ink-faint'),
        accent: token('accent'),
        'accent-2': token('accent-2'),
        'accent-3': token('accent-3'),
        success: token('success'),
        warning: token('warning'),
        danger: token('danger'),
      },
      fontFamily: {
        display: ['"Space Grotesk Variable"', 'system-ui', 'sans-serif'],
        sans: ['"Inter Variable"', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgb(var(--accent) / 0.38), 0 12px 44px -10px rgb(var(--accent) / 0.55)',
        'glow-violet': '0 0 0 1px rgb(var(--accent-2) / 0.42), 0 12px 44px -10px rgb(var(--accent-2) / 0.6)',
        'glow-cyan': '0 0 0 1px rgb(var(--accent-3) / 0.45), 0 12px 40px -10px rgb(var(--accent-3) / 0.5)',
        card: '0 20px 55px -20px rgb(0 0 0 / 0.72)',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, rgb(var(--accent-3)) 0%, rgb(var(--accent)) 48%, rgb(var(--accent-2)) 100%)',
      },
      keyframes: {
        'fade-up': {
          '0%': {opacity: '0', transform: 'translateY(14px)'},
          '100%': {opacity: '1', transform: 'translateY(0)'},
        },
        'fade-in': {'0%': {opacity: '0'}, '100%': {opacity: '1'}},
        shimmer: {'100%': {transform: 'translateX(100%)'}},
        'ken-burns': {
          '0%': {transform: 'scale(1.04)'},
          '100%': {transform: 'scale(1.12) translate(-1%, -1%)'},
        },
        progress: {'0%': {transform: 'scaleX(0)'}, '100%': {transform: 'scaleX(1)'}},
        'spin-slow': {'100%': {transform: 'rotate(360deg)'}},
        'pulse-subtle': {
          '0%, 100%': {opacity: '1', transform: 'scale(1)'},
          '50%': {opacity: '0.65', transform: 'scale(0.96)'},
        },
        'float-slow': {
          '0%, 100%': {transform: 'translateY(0px)'},
          '50%': {transform: 'translateY(-6px)'},
        },
      },
      animation: {
        'fade-up': 'fade-up 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) both',
        'fade-in': 'fade-in 0.4s ease-out both',
        shimmer: 'shimmer 1.6s infinite',
        'ken-burns': 'ken-burns 9s ease-out both',
        'spin-slow': 'spin-slow 1.4s linear infinite',
        'pulse-subtle': 'pulse-subtle 2.8s ease-in-out infinite',
        'float-slow': 'float-slow 5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
