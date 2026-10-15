import { api } from './client.js';

// One function per endpoint in docs/api_endpoints.md. Screens import from
// here instead of calling fetch themselves, so a change to the API only
// needs updating in one place.

export const getHealth = () => api('/health');

// Browse
export const listUsers = (params) => api('/users', { params });
export const getUser = (id) => api(`/users/${id}`);
export const listRestaurants = (params) => api('/restaurants', { params });
export const getRestaurant = (id) => api(`/restaurants/${id}`);
export const getMenu = (restaurantId) => api(`/restaurants/${restaurantId}/menu`);
export const listOrders = (params) => api('/orders', { params });
export const getOrder = (id) => api(`/orders/${id}`);

// Workflow 1: checkout and order status
export const checkout = (body, params) => api('/checkout', { method: 'POST', body, params });
// `from` is the status the page shows; the API refuses (409) if it changed meanwhile.
export const advanceOrder = (id, from) => api(`/orders/${id}/advance`, { method: 'POST', body: from ? { from } : undefined });
export const topUpWallet = (userId, amount) => api(`/users/${userId}/topup`, { method: 'POST', body: { amount } });

// Wallet audit trail
export const getUserAudit = (userId, params) => api(`/users/${userId}/audit`, { params });

// Workflow 2: analytics and materialized view
export const getRevenue = (restaurantId) => api('/analytics/revenue', { params: { restaurantId } });
export const getRanking = (params) => api('/analytics/ranking', { params });
export const getSummary = () => api('/analytics/summary');
export const refreshSummary = () => api('/analytics/summary/refresh', { method: 'POST' });

// Workflow 3: map
export const getNearbyDrivers = ({ lat, lng, radius = 5000 }) => api('/drivers/nearby', { params: { lat, lng, radius } });

// Workflow 4: reviews
export const getReviewStats = (restaurantId) => api('/reviews/stats', { params: { restaurantId } });
