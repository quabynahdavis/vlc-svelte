import './app.css';
import App from './App.svelte';
import { applyAppearance } from './lib/theme';
import { settings } from './stores/settings';

// Apply accent/language/theme as soon as the (possibly persisted) settings are
// available, and re-apply on every later change, reset or import.
settings.subscribe((state) => {
  applyAppearance(state);
});

const app = new App({
  target: document.getElementById('app')!,
});

export default app;
