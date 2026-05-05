/** @type {import('tailwindcss').Config} */
// PBS Hub palette adapted to ContractFlow, preserving semantic status colors in components.
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // PBS Hub surfaces
        'surface':                    '#ffffff',
        'surface-dim':                '#e1f1f8',
        'surface-bright':             '#ffffff',
        'surface-container-lowest':   '#ffffff',
        'surface-container-low':      '#fafdff',
        'surface-container':          '#effbff',
        'surface-container-high':     '#daf5fd',
        'surface-container-highest':  '#c9ebf7',
        // On-surface
        'on-surface':           '#0f172a',
        'on-surface-variant':   '#64748b',
        'inverse-surface':      '#0f172a',
        'inverse-on-surface':   '#f8fafc',
        // Outline
        'outline':              '#94a3b8',
        'outline-variant':      '#e2e8f0',
        'surface-tint':         '#01a1e1',
        // Primary
        'primary':              '#01a1e1',
        'on-primary':           '#ffffff',
        'primary-container':    '#01a1e1',
        'on-primary-container': '#ffffff',
        'inverse-primary':      '#57cdf1',
        'primary-fixed':        '#effbff',
        'primary-fixed-dim':    '#b9ebfa',
        'on-primary-fixed':     '#014b68',
        'on-primary-fixed-variant': '#0186bc',
        // Secondary
        'secondary':                  '#0186bc',
        'on-secondary':               '#ffffff',
        'secondary-container':        '#daf5fd',
        'on-secondary-container':     '#075985',
        'secondary-fixed':            '#effbff',
        'secondary-fixed-dim':        '#b9ebfa',
        'on-secondary-fixed':         '#075985',
        'on-secondary-fixed-variant': '#0186bc',
        // Tertiary
        'tertiary':                  '#0f172a',
        'on-tertiary':               '#ffffff',
        'tertiary-container':        '#e2f3fb',
        'on-tertiary-container':     '#0f172a',
        'tertiary-fixed':            '#effbff',
        'tertiary-fixed-dim':        '#daf5fd',
        'on-tertiary-fixed':         '#0f172a',
        'on-tertiary-fixed-variant': '#334155',
        // Error
        'error':            '#ba1a1a',
        'on-error':         '#ffffff',
        'error-container':  '#ffdad6',
        'on-error-container':'#93000a',
        // Background
        'background':    '#f5fbfe',
        'on-background': '#0f172a',
        // Surface variant
        'surface-variant': '#eff6fb',
      },
      borderRadius: {
        DEFAULT: '0.25rem',
        lg:      '0.5rem',
        xl:      '0.75rem',
        full:    '9999px',
      },
      spacing: {
        'xs':          '8px',
        'sm':          '12px',
        'md':          '16px',
        'lg':          '24px',
        'xl':          '32px',
        'grid-gutter': '20px',
        'grid-margin': '40px',
        'base':        '4px',
      },
      fontFamily: {
        'h1':         ['Inter', 'sans-serif'],
        'h2':         ['Inter', 'sans-serif'],
        'h3':         ['Inter', 'sans-serif'],
        'body-lg':    ['Inter', 'sans-serif'],
        'body-sm':    ['Inter', 'sans-serif'],
        'label-caps': ['Inter', 'sans-serif'],
        'table-data': ['Inter', 'sans-serif'],
      },
      fontSize: {
        'h1': ['32px', { lineHeight: '1.2', letterSpacing: '-0.02em', fontWeight: '600' }],
        'h2': ['24px', { lineHeight: '1.3', letterSpacing: '-0.01em', fontWeight: '600' }],
        'h3': ['20px', { lineHeight: '1.4', letterSpacing: '-0.01em', fontWeight: '600' }],
        'body-lg':    ['16px', { lineHeight: '1.6', letterSpacing: '0', fontWeight: '400' }],
        'body-sm':    ['14px', { lineHeight: '1.5', letterSpacing: '0', fontWeight: '400' }],
        'label-caps': ['12px', { lineHeight: '1',   letterSpacing: '0.05em', fontWeight: '600' }],
        'table-data': ['14px', { lineHeight: '1',   letterSpacing: '0',      fontWeight: '500' }],
      },
    },
  },
  plugins: [],
};
