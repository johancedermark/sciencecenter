import './styles.css';
import { App } from './app';

const app = new App(document.getElementById('app')!);
app.init().catch((err) => {
  console.error(err);
  const label = document.querySelector('.load-label');
  if (label) label.textContent = `Error: ${err?.message ?? err}`;
});
