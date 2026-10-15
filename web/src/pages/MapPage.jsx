import { useQuery } from '@tanstack/react-query';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useState } from 'react';
import { Circle, MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { getNearbyDrivers, listRestaurants } from '../api/endpoints.js';
import {
  Button, Card, EmptyState, ErrorState, PageHeader, QueryState, SelectField, Stat, TextField,
} from '../components/ui/index.js';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';
import { formatDateTime, formatDistance, formatTime } from '../lib/format.js';

// Custom icons using CSS tokens to ensure crisp rendering without external asset dependencies
const restaurantIcon = L.divIcon({
  className: 'custom-map-icon',
  html: '<div style="background-color: var(--color-primary, #1f6f5c); width: 28px; height: 28px; border-radius: 4px; border: 2px solid #ffffff; box-shadow: 0 2px 5px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: #ffffff; font-size: 14px;">🍽</div>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  popupAnchor: [0, -14],
});

// Driver markers carry their place in the list (1 = nearest), so a marker
// and its row in "Nearby Drivers" can be matched at a glance.
const driverIcon = (n) => L.divIcon({
  className: 'custom-driver-icon',
  html: `<div class="driver-pin">${n}</div>`,
  iconSize: [26, 26],
  iconAnchor: [13, 13],
  popupAnchor: [0, -13],
});

// Clicking the map moves the origin there.
function PickOrigin({ onPick }) {
  useMapEvents({ click: (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

const inRange = (value, limit) => value !== '' && Number.isFinite(Number(value)) && Math.abs(Number(value)) <= limit;

// Updates the map view ONLY when the origin coordinates change (e.g. user picks a new restaurant).
// Prevents resetting pan/zoom on 5-second polling refetches.
function RecenterMap({ lat, lng, radiusMeters }) {
  const map = useMap();
  useEffect(() => {
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      if (radiusMeters && L?.latLng) {
        const bounds = L.latLng(lat, lng).toBounds(radiusMeters * 2);
        map.fitBounds(bounds, { padding: [16, 16] });
      } else {
        map.setView([lat, lng], 13);
      }
    }
  }, [lat, lng, radiusMeters, map]);
  return null;
}

export function MapPage() {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);

  // Fetch restaurants for the origin picker (with optional search)
  const restaurantsQuery = useQuery({
    queryKey: ['restaurants', { search: debouncedSearch, pageSize: 100 }],
    queryFn: () => listRestaurants({ search: debouncedSearch, pageSize: 100 }),
  });

  const restaurants = restaurantsQuery.data?.items ?? [];
  const [selectedId, setSelectedId] = useState('');

  // Default to first restaurant when loaded
  const currentRestaurant = useMemo(() => {
    if (selectedId) {
      const found = restaurants.find((r) => r.id === selectedId);
      if (found) return found;
    }
    return restaurants[0] ?? null;
  }, [restaurants, selectedId]);

  // A point picked on the map or typed in replaces the restaurant as origin.
  const [customOrigin, setCustomOrigin] = useState(null);
  const [latInput, setLatInput] = useState('');
  const [lngInput, setLngInput] = useState('');
  const validInput = inRange(latInput, 90) && inRange(lngInput, 180);
  const pick = (point) => {
    setCustomOrigin(point);
    setLatInput(point.lat.toFixed(4));
    setLngInput(point.lng.toFixed(4));
  };

  const origin = useMemo(() => {
    if (customOrigin) return customOrigin;
    if (!currentRestaurant) return null;
    return {
      lat: currentRestaurant.latitude,
      lng: currentRestaurant.longitude,
    };
  }, [customOrigin, currentRestaurant]);
  const originName = customOrigin ? 'Custom point' : currentRestaurant?.name;

  // Nearby drivers query: polls every 5 seconds (5000 ms)
  const driversQuery = useQuery({
    queryKey: ['nearbyDrivers', { lat: origin?.lat, lng: origin?.lng }],
    queryFn: () => getNearbyDrivers({ lat: origin.lat, lng: origin.lng, radius: 5000 }),
    enabled: Boolean(origin && Number.isFinite(origin.lat) && Number.isFinite(origin.lng)),
    refetchInterval: 5000,
  });

  const drivers = driversQuery.data?.drivers ?? [];
  const closest = drivers[0];

  const restaurantOptions = useMemo(
    () => restaurants.map((r) => ({ value: r.id, label: r.name })),
    [restaurants],
  );

  return (
    <div className="stack">
      <PageHeader
        title="Map"
        description="Live drivers within 5 km of a restaurant or any point you choose."
        actions={<span className="live-badge">Live · every 5 s</span>}
      />

      {/* Controls row: Filter restaurant & refresh */}
      <div className="row" style={{ alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div className="row" style={{ flex: 1, maxWidth: '640px' }}>
          <div style={{ flex: '1 1 200px' }}>
            <TextField
              id="restaurant-search"
              label="Filter restaurants"
              placeholder="e.g. Kaveri"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div style={{ flex: '1 1 240px' }}>
            <SelectField
              id="restaurant-select"
              label="Origin restaurant"
              value={currentRestaurant?.id ?? ''}
              onChange={(e) => { setSelectedId(e.target.value); setCustomOrigin(null); }}
              options={restaurantOptions}
              placeholder={restaurantsQuery.isLoading ? 'Loading restaurants…' : 'Select a restaurant'}
            />
          </div>
        </div>
        <div>
          <Button
            variant="secondary"
            onClick={() => driversQuery.refetch()}
            disabled={driversQuery.isFetching}
          >
            {driversQuery.isFetching ? 'Updating…' : 'Refresh'}
          </Button>
        </div>
      </div>

      {/* Metric Stat Cards */}
      <div className="grid-cards">
        <Card>
          <Stat
            label="Drivers in range"
            value={drivers.length}
            hint="Within 5 km radius"
          />
        </Card>
        <Card>
          <Stat
            label="Closest driver"
            value={closest ? formatDistance(closest.distanceMeters) : '—'}
            hint={closest ? closest.driverId : 'No drivers near origin'}
          />
        </Card>
        <Card>
          <Stat
            label="Last updated"
            value={driversQuery.dataUpdatedAt ? formatDateTime(driversQuery.dataUpdatedAt) : '—'}
            hint="Polling every 5s"
          />
        </Card>
      </div>

      {/* Main View: Map + Sidebar list, wrapped in QueryState. The drivers
          query waits for an origin, so without one say why instead of
          showing "Loading…" forever. */}
      <Card>
        <form
          className="row"
          style={{ alignItems: 'flex-end' }}
          onSubmit={(e) => { e.preventDefault(); if (validInput) pick({ lat: Number(latInput), lng: Number(lngInput) }); }}
        >
          <TextField id="origin-lat" label="Latitude" inputMode="decimal" placeholder="e.g. 12.9716" value={latInput} onChange={(e) => setLatInput(e.target.value)} />
          <TextField id="origin-lng" label="Longitude" inputMode="decimal" placeholder="e.g. 77.5946" value={lngInput} onChange={(e) => setLngInput(e.target.value)} />
          <Button type="submit" variant="secondary" disabled={!validInput}>Set origin</Button>
          {customOrigin && <Button variant="secondary" onClick={() => { setCustomOrigin(null); setLatInput(''); setLngInput(''); }}>Back to restaurant</Button>}
        </form>
        {(latInput || lngInput) && !validInput && (
          <p className="small" role="status">Enter a latitude from −90 to 90 and a longitude from −180 to 180.</p>
        )}
        <p className="muted small">
          Origin: <strong>{originName ?? '—'}</strong>
          {origin && ` (${origin.lat.toFixed(4)}, ${origin.lng.toFixed(4)})`}. Click the map, or type a point, to search around it.
        </p>
      </Card>

      {restaurantsQuery.isError && !customOrigin ? (
        <ErrorState error={restaurantsQuery.error} onRetry={() => restaurantsQuery.refetch()} />
      ) : restaurantsQuery.isSuccess && !origin ? (
        <EmptyState title="No restaurants match" message="Try a different name in Filter restaurants." />
      ) : (
        <QueryState
          query={driversQuery}
          isEmpty={(data) => !data?.drivers || data.drivers.length === 0}
          emptyTitle="No drivers within 5 km"
          emptyMessage="No active drivers found within 5 km of this restaurant. Pings arrive continuously from moving drivers."
        >
          {({ origin: resolvedOrigin, radiusMeters, drivers: driverList }) => (
            <div
              className="map-layout"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))',
                gap: 'var(--space-4)',
                alignItems: 'start',
              }}
            >
              {/* Map Card */}
              <Card title={`Live Map (${formatDistance(radiusMeters)} radius)`}>
                <div style={{ height: '500px', width: '100%', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                  <MapContainer
                    center={[resolvedOrigin.lat, resolvedOrigin.lng]}
                    zoom={12}
                    scrollWheelZoom={false}
                    style={{ height: '100%', width: '100%' }}
                  >
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <RecenterMap lat={resolvedOrigin.lat} lng={resolvedOrigin.lng} radiusMeters={radiusMeters} />
                    <PickOrigin onPick={pick} />
  
                    {/* 5 km Radius Circle */}
                    <Circle
                      center={[resolvedOrigin.lat, resolvedOrigin.lng]}
                      radius={radiusMeters}
                      pathOptions={{
                        color: 'var(--color-primary, #1f6f5c)',
                        fillColor: 'var(--color-primary, #1f6f5c)',
                        fillOpacity: 0.08,
                        dashArray: '6, 6',
                      }}
                    />
  
                    {/* Origin Restaurant Marker */}
                    <Marker
                      position={[resolvedOrigin.lat, resolvedOrigin.lng]}
                      icon={restaurantIcon}
                    >
                      <Popup>
                        <strong>{originName || 'Selected Origin'}</strong>
                        <div className="small muted">
                          {resolvedOrigin.lat.toFixed(4)}, {resolvedOrigin.lng.toFixed(4)}
                        </div>
                      </Popup>
                    </Marker>
  
                    {/* Driver Markers */}
                    {driverList.map((d, index) => (
                      <Marker
                        key={d.driverId}
                        position={[d.lat, d.lng]}
                        icon={driverIcon(index + 1)}
                      >
                        <Popup>
                          <strong>{d.driverId}</strong>
                          <div>Distance: {formatDistance(d.distanceMeters)}</div>
                          <div className="small muted">
                            Last seen: {formatTime(d.lastSeenAt)}
                          </div>
                        </Popup>
                      </Marker>
                    ))}
                  </MapContainer>
                </div>
              </Card>
  
              {/* Side List: Drivers sorted by distance */}
              <Card title={`Nearby Drivers (${driverList.length})`}>
                <div
                  className="stack"
                  style={{
                    maxHeight: '500px',
                    overflowY: 'auto',
                    gap: 'var(--space-2)',
                  }}
                >
                  {driverList.map((d, index) => (
                    <div
                      key={d.driverId}
                      className="row"
                      style={{
                        justifyContent: 'space-between',
                        padding: 'var(--space-2) var(--space-3)',
                        backgroundColor: index % 2 === 0 ? 'var(--color-bg)' : 'transparent',
                        borderRadius: 'var(--radius-sm)',
                      }}
                    >
                      <div className="row" style={{ gap: 'var(--space-2)' }}>
                        <span className="muted small num">{index + 1}.</span>
                        <strong className="small">{d.driverId}</strong>
                      </div>
                      <div className="row" style={{ gap: 'var(--space-3)' }}>
                        <span className="num" style={{ fontWeight: 600 }}>
                          {formatDistance(d.distanceMeters)}
                        </span>
                        <span className="muted small" style={{ minWidth: '60px', textAlign: 'right' }}>
                          {formatTime(d.lastSeenAt)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}
        </QueryState>
      )}
    </div>
  );
}
