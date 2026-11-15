import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

/**
 * Los botones que solo tienen ícono se anuncian con su `title` si no traen `aria-label`:
 * así los lectores de pantalla no leen "botón" a secas.
 */
function labelIconButtons(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('button[title]:not([aria-label])').forEach((button) => {
    if (!button.textContent?.trim()) button.setAttribute('aria-label', button.title);
  });
}
let labelTimer: number | undefined;
new MutationObserver(() => {
  window.clearTimeout(labelTimer);
  labelTimer = window.setTimeout(() => labelIconButtons(document), 150);
}).observe(document.body, { childList: true, subtree: true });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
