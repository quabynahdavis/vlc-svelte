/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{svelte,ts,js}'],
  theme: {
    extend: {
      colors: {
        vlc: {
          app: '#0B0B0B',
          panel: '#111111',
          card: '#1A1A1A',
          raised: '#232323',
          border: '#262626',
          orange: '#F08A1C',
          'orange-dark': '#A85A0F',
          text: '#FFFFFF',
          secondary: '#B8B8B8',
          muted: '#7A7A7A',
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
        'vlc-accent': 'linear-gradient(135deg, #A85A0F 0%, #F08A1C 100%)',
      },
    },
  },
  plugins: [],
};
