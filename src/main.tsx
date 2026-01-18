import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import { ThemeProvider } from './contexts/ThemeContext.tsx';
import { AppProvider } from './contexts/AppContext.tsx';
import './styles/tokens.css';
import './styles/global.css';
import './styles/themes.css';
import './styles/print.css';
import './styles/expressive.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <AppProvider>
        <App />
      </AppProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
