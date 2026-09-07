import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import ClassroomApp from './ClassroomApp';
import './styles.css';

const pathname = window.location.pathname;
const RootApp = pathname === '/' || pathname.startsWith('/report/') ? ClassroomApp : App;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootApp />
  </StrictMode>,
);
