/** @type {import('tailwindcss').Config} */

// La paleta zinc se calcula mezclando el fondo y el texto del tema de VS Code, así
// funciona igual en temas oscuros y claros. Los fallback reproducen el aspecto original.
const BG = 'var(--vscode-sideBar-background, #09090b)';
const FG = 'var(--vscode-foreground, #d4d4d8)';
const EDITOR_FG = 'var(--vscode-editor-foreground, #f4f4f5)';

/** Color que acepta modificadores de opacidad (`bg-zinc-800/40`). */
const themed = (base) => ({ opacityValue }) =>
  opacityValue === undefined ? base : `color-mix(in srgb, ${base} calc(${opacityValue} * 100%), transparent)`;

// Porcentaje de texto mezclado sobre el fondo en cada escalón.
const ZINC_FOREGROUND_PERCENT = { 900: 5, 850: 8, 800: 12, 750: 16, 700: 22, 600: 32, 500: 50, 400: 68, 300: 85, 200: 95 };

const zinc = Object.fromEntries(
  Object.entries(ZINC_FOREGROUND_PERCENT).map(([step, percent]) => [
    step,
    themed(`color-mix(in srgb, ${FG} ${percent}%, ${BG})`)
  ])
);

module.exports = {
  content: ['./src/webview/**/*.{html,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        zinc: { ...zinc, 50: themed(EDITOR_FG), 100: themed(EDITOR_FG), 950: themed(BG) },
        // Acento: el color de botón del tema; solo los tonos de fondo, los de texto quedan como están.
        indigo: {
          500: themed('var(--vscode-button-hoverBackground, #6366f1)'),
          600: themed('var(--vscode-button-background, #4f46e5)'),
          700: themed('color-mix(in srgb, var(--vscode-button-background, #4f46e5) 80%, black)')
        }
      }
    }
  },
  plugins: []
};
