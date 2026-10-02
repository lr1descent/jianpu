const { ipcRenderer } = require('electron');

window.addEventListener('DOMContentLoaded', () => {
  const report = () => ipcRenderer.send('round-state', document.body.classList.contains('is-quiz'));
  new MutationObserver(report).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  report();
});
