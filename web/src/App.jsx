import { lazy, Suspense } from 'react';
import { Outlet, Route, Routes } from 'react-router';
import { Layout } from './components/Layout.jsx';
import { Loading } from './components/ui/index.js';
import { HomePage } from './pages/HomePage.jsx';
import { NotFoundPage } from './pages/NotFoundPage.jsx';

// The other screens load when first opened, so the map (Leaflet) and the
// charts (Recharts) are not in the first download.
const page = (load, name) => lazy(() => load().then((m) => ({ default: m[name] })));
const AnalyticsPage = page(() => import('./pages/AnalyticsPage.jsx'), 'AnalyticsPage');
const BrowsePage = page(() => import('./pages/BrowsePage.jsx'), 'BrowsePage');
const CheckoutPage = page(() => import('./pages/CheckoutPage.jsx'), 'CheckoutPage');
const DetailPage = page(() => import('./pages/DetailPage.jsx'), 'DetailPage');
const MapPage = page(() => import('./pages/MapPage.jsx'), 'MapPage');
const ReviewsPage = page(() => import('./pages/ReviewsPage.jsx'), 'ReviewsPage');
const WalletPage = page(() => import('./pages/WalletPage.jsx'), 'WalletPage');

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route element={<Suspense fallback={<Loading />}><Outlet /></Suspense>}>
          <Route index element={<HomePage />} />
          <Route path="browse" element={<BrowsePage />} />
          <Route path="browse/:entity/:id" element={<DetailPage />} />
          <Route path="checkout" element={<CheckoutPage />} />
          <Route path="wallet" element={<WalletPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="map" element={<MapPage />} />
          <Route path="reviews" element={<ReviewsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
