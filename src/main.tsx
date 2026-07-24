import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import Admin from './Admin';
import ResultReviewPage, { parseReviewRoute } from './ResultReviewPage';
import { ThemeProvider } from './theme';
import './App.css';

const pathname = window.location.pathname;
const reviewRoute = parseReviewRoute(pathname);
const isAdminRoute = pathname.startsWith('/admin');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      {reviewRoute ? (
        <ResultReviewPage mode={reviewRoute.mode} resultId={reviewRoute.resultId} />
      ) : isAdminRoute ? (
        <Admin />
      ) : (
        <App />
      )}
    </ThemeProvider>
  </StrictMode>,
);
