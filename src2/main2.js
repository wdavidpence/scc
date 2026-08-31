import { createGame2 } from './createGame2.js';

let booted = false;
function boot() { if (booted) return; booted = true; createGame2('game'); }

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
