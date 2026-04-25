/* Runs before body renders to prevent flash of wrong theme */
(function () {
  try {
    var t = localStorage.getItem('myo-theme');
    if (t === 'light' || t === 'dark') {
      document.documentElement.setAttribute('data-theme', t);
    }
  } catch (e) { /* localStorage blocked — use default */ }
}());
