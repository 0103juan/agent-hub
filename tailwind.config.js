/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/webview/**/*.{html,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        vscode: {
          bg: "var(--vscode-sideBar-background, #18181b)",
          fg: "var(--vscode-sideBar-foreground, #f4f4f5)",
          border: "var(--vscode-sideBar-border, #27272a)",
          input: "var(--vscode-input-background, #27272a)",
          inputFg: "var(--vscode-input-foreground, #ffffff)",
          accent: "var(--vscode-button-background, #6366f1)",
          accentHover: "var(--vscode-button-hoverBackground, #4f46e5)",
          badge: "var(--vscode-badge-background, #3f3f46)"
        }
      }
    },
  },
  plugins: [],
}

