/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{svelte,ts,js}'],
  theme: {
    extend: {
      colors: {
        // Every vlc.* color resolves through a CSS custom property declared in
        // src/app.css, so the same utility follows the active data-theme.
        // `-rgb` triplets keep opacity modifiers (`bg-vlc-app/95`) working.
        vlc: {
          // Surfaces
          app: 'rgb(var(--bg-app-rgb) / <alpha-value>)',
          panel: 'rgb(var(--bg-panel-rgb) / <alpha-value>)',
          'panel-alt': 'rgb(var(--bg-panel-alt-rgb) / <alpha-value>)',
          panelAlt: 'rgb(var(--bg-panel-alt-rgb) / <alpha-value>)',
          card: 'rgb(var(--bg-card-rgb) / <alpha-value>)',
          raised: 'rgb(var(--bg-raised-rgb) / <alpha-value>)',

          // Borders. The shipped `border` utility is the hairline and
          // `borderStrong` the visible edge; keep those names on the matching
          // semantic tokens so dark mode is unchanged.
          border: 'rgb(var(--border-subtle-rgb) / <alpha-value>)',
          borderStrong: 'rgb(var(--border-rgb) / <alpha-value>)',
          borderSubtle: 'rgb(var(--border-subtle-rgb) / <alpha-value>)',

          // Text
          text: 'rgb(var(--text-primary-rgb) / <alpha-value>)',
          secondary: 'rgb(var(--text-secondary-rgb) / <alpha-value>)',
          muted: 'rgb(var(--text-muted-rgb) / <alpha-value>)',
          dim: 'rgb(var(--text-dim-rgb) / <alpha-value>)',

          // Semantic
          danger: 'rgb(var(--danger-rgb) / <alpha-value>)',
          orangeText: 'var(--accent-ink)',
          'orange-text': 'var(--accent-ink)',

          // Accent ramp is driven by CSS variables set in src/lib/theme.ts.
          // RGB triplets keep Tailwind opacity modifiers (`bg-vlc-orange/20`) working.
          orange: 'rgb(var(--accent-rgb) / <alpha-value>)',
          orangeDark: 'rgb(var(--accent-pressed-rgb) / <alpha-value>)',
          orangeDeep: 'rgb(var(--accent-deepest-rgb) / <alpha-value>)',
          // Retained for existing consumers; matches the camelCase token above.
          'orange-dark': 'rgb(var(--accent-pressed-rgb) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
      borderRadius: {
        panel: '12px',
        control: '8px',
        input: '6px',
      },
      backgroundImage: {
        'vlc-accent': 'var(--accent-gradient)',
      },
    },
  },
  plugins: [],
};
