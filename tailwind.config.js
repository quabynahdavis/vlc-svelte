/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{svelte,ts,js}'],
  theme: {
    extend: {
      colors: {
        vlc: {
          app: '#0E0E0E',
          panel: '#181818',
          card: '#1B1B1B',
          raised: '#232323',
          border: '#262626',
          borderStrong: '#373737',
          orange: '#D37918',
          orangeDark: '#AB6314',
          orangeDeep: '#371F06',
          // Retained for existing consumers; matches the camelCase token above.
          'orange-dark': '#AB6314',
          text: '#EAEAEA',
          secondary: '#B8B8B8',
          muted: '#6B6B6B',
          dim: '#8F8F8F',
          danger: '#E81123',
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
        'vlc-accent': 'linear-gradient(135deg, #AB6314 0%, #D37918 100%)',
      },
    },
  },
  plugins: [],
};
