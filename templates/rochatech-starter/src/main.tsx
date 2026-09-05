import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import './styles.css';

registerSW({ immediate: true });

function App() {
  return <main><h1>Novo projeto RochaTech</h1><p>Cloudflare-first, responsivo e instalável.</p></main>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
