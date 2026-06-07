// app.js — bootstrap
import { render } from './ui.js';

render().catch(err => {
  document.getElementById('app').innerHTML =
    '<div class="boot">Could not start. Is the server running? (npm start)</div>';
  console.error(err);
});

// PWA: install to home screen + offline static assets.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(()=>{}));
}
