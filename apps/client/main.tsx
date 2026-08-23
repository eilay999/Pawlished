import React from 'react';
import ReactDOM from 'react-dom/client';
import ClientApp from './ClientApp';
import '../../index.css';
import { applyTheme, loadTheme } from '../../theme';

applyTheme(loadTheme());

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ClientApp />
  </React.StrictMode>
);

