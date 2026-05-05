---
name: Contract Analytics Design System
colors:
  surface: '#fcf8fa'
  surface-dim: '#dcd9db'
  surface-bright: '#fcf8fa'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f6f3f5'
  surface-container: '#f0edef'
  surface-container-high: '#eae7e9'
  surface-container-highest: '#e4e2e4'
  on-surface: '#1b1b1d'
  on-surface-variant: '#45464d'
  inverse-surface: '#303032'
  inverse-on-surface: '#f3f0f2'
  outline: '#76777d'
  outline-variant: '#c6c6cd'
  surface-tint: '#565e74'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#131b2e'
  on-primary-container: '#7c839b'
  inverse-primary: '#bec6e0'
  secondary: '#505f76'
  on-secondary: '#ffffff'
  secondary-container: '#d0e1fb'
  on-secondary-container: '#54647a'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#271901'
  on-tertiary-container: '#98805d'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dae2fd'
  primary-fixed-dim: '#bec6e0'
  on-primary-fixed: '#131b2e'
  on-primary-fixed-variant: '#3f465c'
  secondary-fixed: '#d3e4fe'
  secondary-fixed-dim: '#b7c8e1'
  on-secondary-fixed: '#0b1c30'
  on-secondary-fixed-variant: '#38485d'
  tertiary-fixed: '#fcdeb5'
  tertiary-fixed-dim: '#dec29a'
  on-tertiary-fixed: '#271901'
  on-tertiary-fixed-variant: '#574425'
  background: '#fcf8fa'
  on-background: '#1b1b1d'
  surface-variant: '#e4e2e4'
typography:
  h1:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  h2:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.3'
    letterSpacing: -0.01em
  h3:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: '1.4'
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
    letterSpacing: '0'
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
    letterSpacing: '0'
  label-caps:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: '1'
    letterSpacing: 0.05em
  table-data:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: '1'
    letterSpacing: '0'
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  grid-margin: 40px
  grid-gutter: 20px
---

## Brand & Style
The brand personality for this design system is defined by precision, institutional reliability, and effortless clarity. Designed for legal and procurement professionals, the UI evokes a sense of "quiet intelligence"—where the complexity of high-volume contract data is distilled into actionable insights without visual noise.

The style is **Modern SaaS**, heavily influenced by the functional minimalism of Stripe and Linear. It utilizes a restrained color palette and meticulous typography to establish a professional polish. The interface relies on structural integrity and intentional whitespace rather than decorative elements, ensuring that critical data points—such as expiration dates, risk scores, and clause deviations—remain the primary focus.

## Colors
This design system utilizes a high-contrast palette optimized for readability and professional aesthetics. The primary color is a deep, authoritative slate blue, used for key navigation, primary buttons, and headings to provide a grounded, executive feel.

- **Primary & Neutrals:** The layout utilizes a "Slate" scale. The background is a very light gray-slate to provide contrast for white content cards, creating a clear physical separation of data modules.
- **Semantic Logic:** Emerald Green represents healthy contract statuses and high compliance. Amber/Gold is reserved for warnings, such as upcoming expiration dates. Crimson is used strictly for high-risk clauses or critical document errors.
- **Data Visualization:** For charts, use a sequence of blues and slates, occasionally accented by the semantic palette when indicating risk distributions.

## Typography
The typography system relies on **Inter**, a typeface designed for screen legibility. The hierarchy is strictly enforced through weight and scale to ensure that dense contract metadata is scannable.

- **Headlines:** Use semi-bold weights with slight negative letter-spacing for a modern, compact look.
- **Body Text:** Standardized at 14px and 16px to maintain a balance between information density and readability.
- **Labels:** Use uppercase 12px labels for section headers within cards to provide clear categorizations without overwhelming the layout.
- **Numeric Data:** Ensure all tabular data uses tabular lining (monospaced numbers) to allow for easy vertical comparison of financial values.

## Layout & Spacing
The layout follows a 12-column fluid grid system with a maximum container width of 1440px. A 4px baseline grid ensures consistent vertical rhythm across all components.

- **Grid Philosophy:** Main dashboard views utilize a 24px (lg) margin between major sections. Within cards, a 16px (md) padding is standard to maintain a compact, professional appearance.
- **Density:** The system allows for high information density in table views (12px vertical padding on rows) while providing generous whitespace (32px+) in summary sections to allow key metrics to breathe.

## Elevation & Depth
Depth is created through tonal layering and refined ambient shadows rather than heavy gradients.

- **The Base:** The lowest level is the `#F8FAFC` layout background.
- **The Surface:** White cards (`#FFFFFF`) sit on the base. They use a very subtle `1px` border in `#E2E8F0` and a soft, diffused shadow (0px 4px 6px -1px rgba(0,0,0,0.05)) to suggest elevation.
- **The Popover:** Modals and dropdowns use a higher elevation with a more pronounced shadow to pull focus, maintaining sharp 1px borders to ensure they don't appear "fuzzy."
- **Ghost Borders:** For secondary elements like inactive tabs or input fields, use low-contrast outlines to keep the interface feeling flat and modern.

## Shapes
The shape language is consistently rounded to soften the industrial nature of contract data.

- **Standard Radius:** 8px (0.5rem) is the default for buttons, input fields, and small UI components.
- **Container Radius:** 12px (0.75rem) is used for large content cards and dashboard modules to create a clear "object" feel.
- **Full Radius:** Use pill-shapes (999px) exclusively for status badges and chips to distinguish them from interactive buttons.

## Components
This design system's components are engineered for data-heavy utility with a high-end finish.

- **Buttons:** Primary buttons use the deep blue background with white text. Secondary buttons are "ghost" style with a 1px slate border. All buttons use 8px rounded corners.
- **Status Chips:** Small, pill-shaped badges for contract status. They use a light-tinted background (e.g., 10% opacity of the semantic color) with high-contrast text for maximum legibility.
- **Data Tables:** These are the heart of the system. Use sticky headers, no vertical borders, and a subtle light gray background on hover to highlight the current row.
- **Input Fields:** Minimalist design with a 1px border. On focus, the border transitions to the primary blue with a subtle outer glow (2px spread, low opacity).
- **Metric Cards:** Large-format numbers (H1) paired with small trend indicators (Emerald or Crimson) and a label at the top.
- **Document Viewer:** A specialized component with a sidebar for "Extracted Clauses." Use highlighted text overlays in the document that correspond to the semantic colors of the risk profile.