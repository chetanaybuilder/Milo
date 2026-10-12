import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles/styles.css';
import './styles/landing.css';

/**
 * Entry point for MILO application.
 * Mounts the root React component tree into the DOM.
 */
const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(<App />);
}
