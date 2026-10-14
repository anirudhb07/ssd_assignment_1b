import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getNearbyDrivers, listRestaurants } from '../api/endpoints.js';
import { MapPage } from './MapPage.jsx';

// Mock react-leaflet components for jsdom
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }) => <div data-testid="map-container">{children}</div>,
  TileLayer: () => <div data-testid="tile-layer" />,
  Circle: ({ center, radius }) => <div data-testid="map-circle" data-center={JSON.stringify(center)} data-radius={radius} />,
  Marker: ({ position, children }) => <div data-testid="map-marker" data-position={JSON.stringify(position)}>{children}</div>,
  Popup: ({ children }) => <div data-testid="map-popup">{children}</div>,
  useMap: () => ({ setView: vi.fn() }),
}));

vi.mock('../api/endpoints.js', () => ({
  listRestaurants: vi.fn(),
  getNearbyDrivers: vi.fn(),
}));

const mockRestaurants = [
  { id: 'rest-1', name: 'Restaurant-166', latitude: 12.9716, longitude: 77.5946 },
  { id: 'rest-2', name: 'Restaurant-247', latitude: 12.9800, longitude: 77.6000 },
];

const mockDrivers = [
  { driverId: 'driver-000347', lat: 12.974, lng: 77.593, distanceMeters: 370, lastSeenAt: '2026-10-14T10:42:00Z' },
  { driverId: 'driver-000213', lat: 12.976, lng: 77.597, distanceMeters: 540, lastSeenAt: '2026-10-14T10:41:56Z' },
  { driverId: 'driver-000130', lat: 12.970, lng: 77.589, distanceMeters: 620, lastSeenAt: '2026-10-14T10:41:52Z' },
];

function renderMapPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 0,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MapPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  listRestaurants.mockResolvedValue({ items: mockRestaurants, total: 2, page: 1, pageSize: 20 });
});

describe('MapPage', () => {
  it('renders loading state initially while fetching nearby drivers', async () => {
    getNearbyDrivers.mockImplementation(() => new Promise(() => {}));
    renderMapPage();

    expect(screen.getByText('Map')).toBeInTheDocument();
    expect(await screen.findByText(/Loading/i)).toBeInTheDocument();
  });

  it('renders empty state when no drivers are within 5 km', async () => {
    getNearbyDrivers.mockResolvedValue({
      origin: { lat: 12.9716, lng: 77.5946 },
      radiusMeters: 5000,
      drivers: [],
    });

    renderMapPage();

    expect(await screen.findByText('No drivers within 5 km')).toBeInTheDocument();
    expect(screen.getByText(/No active drivers found within 5 km/i)).toBeInTheDocument();
  });

  it('renders error state with API error message and retry button', async () => {
    getNearbyDrivers.mockRejectedValue(new Error('Cannot reach the API. Please try again.'));

    renderMapPage();

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Cannot reach the API. Please try again.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('renders sorted list of nearby drivers and map markers', async () => {
    getNearbyDrivers.mockResolvedValue({
      origin: { lat: 12.9716, lng: 77.5946 },
      radiusMeters: 5000,
      drivers: mockDrivers,
    });

    renderMapPage();

    // Verify drivers list renders driver IDs
    const d1Elements = await screen.findAllByText('driver-000347');
    expect(d1Elements.length).toBeGreaterThanOrEqual(1);

    const d2Elements = screen.getAllByText('driver-000213');
    expect(d2Elements.length).toBeGreaterThanOrEqual(1);

    const d3Elements = screen.getAllByText('driver-000130');
    expect(d3Elements.length).toBeGreaterThanOrEqual(1);

    // Verify distances
    const distElements = screen.getAllByText('370 m');
    expect(distElements.length).toBeGreaterThanOrEqual(1);

    // Verify metric cards
    expect(screen.getByText('3')).toBeInTheDocument(); // 3 drivers in range

    // Verify map container & markers rendered
    expect(screen.getByTestId('map-container')).toBeInTheDocument();
    expect(screen.getByTestId('map-circle')).toBeInTheDocument();
    const markers = screen.getAllByTestId('map-marker');
    expect(markers).toHaveLength(4); // 1 origin + 3 drivers
  });

  it('refetches nearby drivers after 5 seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    getNearbyDrivers.mockResolvedValue({
      origin: { lat: 12.9716, lng: 77.5946 },
      radiusMeters: 5000,
      drivers: mockDrivers,
    });

    renderMapPage();

    await waitFor(() => {
      expect(getNearbyDrivers).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5100);
    });

    await waitFor(() => {
      expect(getNearbyDrivers).toHaveBeenCalledTimes(2);
    });

    vi.useRealTimers();
  });
});
