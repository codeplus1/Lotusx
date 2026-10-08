import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { SafeLogger } from './security/SafeLogger';

// Initialize production security guards (HTTPS enforcement, error sanitization, URL scrubbing)
SafeLogger.initRuntimeSecurity();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
