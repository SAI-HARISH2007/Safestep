import { MapContainer, TileLayer, Marker, useMap, Polyline, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect } from 'react';

// Fix for default marker icons not showing in Next.js
const icon = L.icon({
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});

// Helper to control map view (Center vs Route)
function MapController({ center, routePath }: { center: [number, number], routePath?: [number, number][] | null }) {
    const map = useMap();

    useEffect(() => {
        if (!map) return; // Guard against undefined map

        map.whenReady(() => {
            if (routePath && routePath.length > 0) {
                // If route exists, fit bounds to show full path
                const bounds = L.latLngBounds(routePath);
                map.fitBounds(bounds, { padding: [50, 50] });
            } else {
                // If no route, just fly to the center (User Location or Search Result)
                map.flyTo(center, 15, { duration: 1.5 });
            }
        });
    }, [center, routePath, map]);

    return null;
}

export default function MapComponent({
    center,
    userLocation,
    destinationLocation,
    routePath,
    amenities = [],
    onNavigate,
    emergencyPath
}: {
    center: [number, number],
    userLocation?: [number, number],
    destinationLocation?: [number, number],
    routePath?: [number, number][] | null,
    amenities?: Array<{ lat: number, lon: number, type: string, name: string }>,
    onNavigate?: (lat: number, lon: number) => void,
    emergencyPath?: [number, number][] | null
}) {
    const { Popup } = require('react-leaflet');

    return (
        <MapContainer
            center={center}
            zoom={13}
            className="h-full w-full z-0 block"
        >
            <MapController center={center} routePath={routePath} />
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url={emergencyPath
                    ? "https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png"
                    : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                }
            />

            {/* Emergency Line (SOS) */}
            {emergencyPath && <Polyline positions={emergencyPath as L.LatLngExpression[]} color="#ef4444" weight={6} opacity={0.9} dashArray="10, 10" />}

            {/* Standard Route Line */}
            {routePath && !emergencyPath && <Polyline positions={routePath as L.LatLngExpression[]} color="#00ff9f" weight={5} opacity={0.8} dashArray="1, 10" />}

            {/* User Location Marker */}
            {userLocation && <Marker position={userLocation} icon={icon} />}

            {/* Destination Marker */}
            {destinationLocation && <Marker position={destinationLocation} icon={icon} />}

            {/* Fallback Marker */}
            {!userLocation && !destinationLocation && <Marker position={center} icon={icon} />}

            {/* Amenity Markers */}
            {amenities.map((item, idx) => {
                let emoji = '📍';
                let colorClass = 'text-blue-500';
                let zIndex = 0;

                if (item.type === 'restaurant') { emoji = '🍽️'; colorClass = 'text-orange-500'; }
                else if (item.type === 'hotel') { emoji = '🛏️'; colorClass = 'text-blue-600'; }
                else if (item.type === 'hospital') { emoji = '🏥'; colorClass = 'text-red-600'; zIndex = 900; }
                else if (item.type === 'police') { emoji = '🛡️'; colorClass = 'text-red-700'; zIndex = 1000; }

                // Add pulse effect for emergency services
                const isEmergency = item.type === 'police' || item.type === 'hospital';
                const pulseClass = isEmergency ? 'animate-pulse scale-125' : '';

                const customIcon = L.divIcon({
                    className: 'custom-icon',
                    html: `<div class="${pulseClass}" style="font-size: 28px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5)); transform: ${isEmergency ? 'scale(1.3)' : 'scale(1.1)'}; transition: all 0.3s ease;">${emoji}</div>`,
                    iconSize: [35, 35],
                    iconAnchor: [17, 17]
                });

                return (
                    <Marker key={idx} position={[item.lat, item.lon]} icon={customIcon} zIndexOffset={zIndex}>
                        <Popup>
                            <div className="font-sans min-w-[150px]">
                                <strong className="block text-xs uppercase text-slate-500 mb-1">{item.type === 'police' ? 'EMERGENCY: POLICE' : item.type}</strong>
                                <h3 className="text-lg font-bold text-slate-900 leading-tight mb-2">{item.name}</h3>
                                {item.type !== 'police' && (
                                    <div className="flex items-center gap-1 mb-2 text-yellow-500 text-xs">
                                        {'★'.repeat(4)}{'☆'}
                                        <span className="text-slate-400 ml-1">(4.0)</span>
                                    </div>
                                )}
                                <button
                                    onClick={() => onNavigate && onNavigate(item.lat, item.lon)}
                                    className="w-full bg-blue-600 text-white text-xs font-bold py-2 rounded-lg hover:bg-blue-700 transition flex items-center justify-center gap-1"
                                >
                                    <span className="material-symbols-outlined text-sm">navigation</span>
                                    NAVIGATE
                                </button>
                            </div>
                        </Popup>
                    </Marker>
                );
            })}
        </MapContainer>
    );
}
