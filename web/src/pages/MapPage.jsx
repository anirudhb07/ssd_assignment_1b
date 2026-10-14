import { useQuery } from '@tanstack/react-query';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useState } from 'react';
import { Circle, MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import { getNearbyDrivers, listRestaurants } from '../api/endpoints.js';
import { Button, Card, PageHeader, QueryState, SelectField, Stat, TextField } from '../components/ui/index.js';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';
import { formatDateTime, formatDistance } from '../lib/format.js';

// Custom icons using CSS tokens to ensure crisp rendering without external asset dependencies
const restaurantIcon = L.divIcon({
  className: 'custom-map-icon',
  html: '<div style="background-color: var(--color-primary, #1f6f5c); width: 28px; height: 28px; border-radius: 4px; border: 2px solid #ffffff; box-shadow: 0 2px 5px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: #ffffff; font-size: 14px;">🍽</div>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  popupAnchor: [0, -14],
});

const driverIcon = L.divIcon({
  className: 'custom-driver-icon',
  html: '<div style="background-color: var(--color-accent, #d98a1c); width: 22px; height: 22px; border-radius: 50%; border: 2px solid #ffffff; box-shadow: 0 2px 4px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; font-size: 11px;">🛵</div>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  popupAnchor: [0, -11],
});

// Updates the map view ONLY when the origin coordinates change (e.g. user picks a new restaurant).
// Prevents resetting pan/zoom on 5-second polling refetches.
function RecenterMap({ lat, lng }) {
  const map = useMap();
  useEffect(() => {
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      map.setView([lat, lng], 13);
    }
  }, [lat, lng, map]);
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

  const origin = useMemo(() => {
    if (!currentRestaurant) return null;
    return {
      lat: currentRestaurant.latitude,
      lng: currentRestaurant.longitude,
    };
  }, [currentRestaurant]);

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
        description="Live drivers within 5 km of a restaurant. Updates automatically every 5 seconds."
      />

      {/* Controls row: Filter restaurant & refresh */}
      <div className="row" style={{ alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div className="row" style={{ flex: 1, maxWidth: '640px' }}>
          <div style={{ flex: '1 1 200px' }}>
            <TextField
              id="restaurant-search"
              label="Filter restaurants"
              placeholder="e.g. Restaurant-166"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div style={{ flex: '1 1 240px' }}>
            <SelectField
              id="restaurant-select"
              label="Origin restaurant"
              value={currentRestaurant?.id ?? ''}
              onChange={(e) => setSelectedId(e.target.value)}
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

      {/* Main View: Map + Sidebar list, wrapped in QueryState */}
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
            <Card
              title={`Live Map (${formatDistance(radiusMeters)} radius)`}
              style={{ padding: 'var(--space-3)' }}
            >
              <div style={{ height: '500px', width: '100%', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                <MapContainer
                  center={[resolvedOrigin.lat, resolvedOrigin.lng]}
                  zoom={13}
                  scrollWheelZoom={false}
                  style={{ height: '100%', width: '100%' }}
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <RecenterMap lat={resolvedOrigin.lat} lng={resolvedOrigin.lng} />

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
                      <strong>{currentRestaurant?.name || 'Selected Origin'}</strong>
                      <div className="small muted">
                        {resolvedOrigin.lat.toFixed(4)}, {resolvedOrigin.lng.toFixed(4)}
                      </div>
                    </Popup>
                  </Marker>

                  {/* Driver Markers */}
                  {driverList.map((d) => (
                    <Marker
                      key={d.driverId}
                      position={[d.lat, d.lng]}
                      icon={driverIcon}
                    >
                      <Popup>
                        <strong>{d.driverId}</strong>
                        <div>Distance: {formatDistance(d.distanceMeters)}</div>
                        <div className="small muted">
                          Last seen: {new Date(d.lastSeenAt).toLocaleTimeString()}
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
                        {new Date(d.lastSeenAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}
      </QueryState>
    </div>
  );
}
