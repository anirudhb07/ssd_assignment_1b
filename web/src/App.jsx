import { Route, Routes } from 'react-router';
import { Layout } from './components/Layout.jsx';
import { AnalyticsPage } from './pages/AnalyticsPage.jsx';
import { BrowsePage } from './pages/BrowsePage.jsx';
import { CheckoutPage } from './pages/CheckoutPage.jsx';
import { DetailPage } from './pages/DetailPage.jsx';
import { HomePage } from './pages/HomePage.jsx';
import { MapPage } from './pages/MapPage.jsx';
import { NotFoundPage } from './pages/NotFoundPage.jsx';
import { ReviewsPage } from './pages/ReviewsPage.jsx';
import { WalletPage } from './pages/WalletPage.jsx';

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
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
    </Routes>
  );
}
