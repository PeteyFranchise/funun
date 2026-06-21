import type { Config } from 'tailwindcss'

// ─── Funun design tokens ─────────────────────────────────────────────
// Accent hexes (indigo #818CF8, fuchsia #D946EF, emerald #34D399,
// rose #F43F5E, amber #F59E0B) already match Tailwind's indigo-400 /
// fuchsia-500 / emerald-400 / rose-500 / amber-500, so we only add the
// dark surfaces, lavender text, gradients, hairline borders, and font.
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0a0a0f', // page background (near-black, indigo undertone)
        card: '#0E0D1E', // card / panel surface
        card2: '#1A1838', // raised surface (nav active, chips, icon tiles)
        lav: '#C7CBF7', // secondary text (soft lavender-grey)
        lavdim: '#7c80b4', // tertiary / muted / inactive nav
        brandindigo: '#818CF8', // gradient start
        brandfuchsia: '#D946EF', // gradient end
        money: '#F59E0B', // money / earnings
        money2: '#F4C77B',
        hair: 'rgba(199,203,247,.12)', // hairline border
        hairstrong: 'rgba(199,203,247,.22)', // emphasis border
      },
      backgroundImage: {
        grad: 'linear-gradient(105deg,#818CF8 0%,#D946EF 100%)',
        'grad-money': 'linear-gradient(105deg,#F4C77B 0%,#F59E0B 100%)',
        'nav-rail': 'linear-gradient(180deg,#0d0c1c 0%,#09080f 100%)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        cta: '0 12px 30px -10px rgba(217,70,239,.5)',
      },
      borderRadius: {
        card: '18px',
      },
    },
  },
  plugins: [],
}

export default config
