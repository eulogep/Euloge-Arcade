// Applies the saved theme/motion preference before first paint (no flash).
// External file (not inline) so the Content-Security-Policy can forbid inline scripts.
try {
  var s = JSON.parse(localStorage.getItem('ea:settings') || '{}');
  if (s.theme === 'light') document.documentElement.dataset.theme = 'light';
  if (s.reducedMotion) document.documentElement.dataset.motion = 'reduced';
} catch (e) {}
