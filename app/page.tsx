"use client";

import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';
import { getSafetyAnalysis, SafetyAnalysis } from './services/GeminiService';
import { getRoute, RouteData } from './services/RouteService';
import { useAuth } from './components/AuthProvider';
import { logoutUser } from './lib/firebase';
import AuthModal from './components/AuthModal';
import GuardianManager from './components/GuardianManager';
import SafetyTimer from './components/SafetyTimer';

// Dynamically import Map to avoid SSR issues
const Map = dynamic(() => import('./components/MapComponent'), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-slate-900 flex items-center justify-center text-slate-500">Loading Map...</div>
});

const NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org/search";

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

export default function Home() {
  const { user } = useAuth();

  // App State
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showGuardians, setShowGuardians] = useState(false);
  const [safetyTimerActive, setSafetyTimerActive] = useState(false);

  // Map & Routing State
  const [origin, setOrigin] = useState('Current Location');
  const [destination, setDestination] = useState('');
  const [analysis, setAnalysis] = useState<SafetyAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [sosActive, setSosActive] = useState(false);
  const [isHoldingSOS, setIsHoldingSOS] = useState(false);
  const [center, setCenter] = useState<[number, number]>([51.505, -0.09]); // Default: London
  const [userLocation, setUserLocation] = useState<[number, number] | undefined>(undefined);
  const [destinationLocation, setDestinationLocation] = useState<[number, number] | undefined>(undefined);
  const [routePath, setRoutePath] = useState<[number, number][] | null>(null);

  // Multi-Modal State
  const [travelMode, setTravelMode] = useState<'walking' | 'cycling' | 'driving'>('walking');
  const [routeOptions, setRouteOptions] = useState<Record<string, RouteData | null>>({
    walking: null,
    cycling: null,
    driving: null
  });

  // Autocomplete State
  const [suggestions, setSuggestions] = useState<NominatimResult[]>();
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeInput, setActiveInput] = useState<'origin' | 'destination'>('destination');
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [isOnline, setIsOnline] = useState(true);
  const [amenities, setAmenities] = useState<Array<{ lat: number, lon: number, type: string, name: string }>>([]);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  const sosTimerRef = useRef<NodeJS.Timeout | null>(null);
  const watchIdRef = useRef<number | null>(null);

  // Offline & Service Worker
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsOnline(navigator.onLine);
      window.addEventListener('online', () => setIsOnline(true));
      window.addEventListener('offline', () => setIsOnline(false));

      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(err => console.error("SW Fail:", err));
      }
    }
    return () => {
      window.removeEventListener('online', () => setIsOnline(true));
      window.removeEventListener('offline', () => setIsOnline(false));
    };
  }, []);
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const newPos: [number, number] = [position.coords.latitude, position.coords.longitude];
          setCenter(newPos);
          setUserLocation(newPos);
        },
        (error) => {
          console.error("Error getting location:", error);
        }
      );
    }
  }, []);

  // Watch Position for Dynamic ETA
  useEffect(() => {
    if (analysis && navigator.geolocation) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (position) => {
          const newPos: [number, number] = [position.coords.latitude, position.coords.longitude];
          setUserLocation(newPos);
          // Only update path if we're actively routing? 
          // For MVP, we won't re-fetch the route on every small move to save API, 
          // but in production, we'd snap to route.
        },
        (error) => console.error("Watch Position Error:", error),
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
      );
    }
    return () => {
      if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, [analysis]);

  const [emergencyPath, setEmergencyPath] = useState<[number, number][] | null>(null);

  const fetchAmenities = async (type: string, location: [number, number]): Promise<any[]> => {
    try {
      const [lat, lon] = location;
      const radius = type === 'police' ? 5000 : 2000;


      const query = `[out:json][timeout:15];node["amenity"="${type}"](around:${radius},${lat},${lon});out body;`;

      const endpoints = [
        "https://overpass-api.de/api/interpreter",
        "https://api.openstreetmap.fr/oapi/interpreter", // Fallback Mirror
        "https://overpass.kumi.systems/api/interpreter" // Another Fallback
      ];

      let data;
      for (const endpoint of endpoints) {
        try {
          console.log(`Fetching ${type} from ${endpoint}...`);
          const res = await fetch(`${endpoint}?data=${encodeURIComponent(query)}`, {
            headers: { 'User-Agent': 'SafeStep/1.0 (Student Project)' },
            signal: AbortSignal.timeout(10000) // 10s strict client timeout
          });

          if (res.ok) {
            const text = await res.text();
            try {
              data = JSON.parse(text);
              if (data && data.elements) break; // Success
            } catch (e) {
              console.warn(`Non-JSON from ${endpoint}`);
            }
          } else {
            console.warn(`Error ${res.status} from ${endpoint}`);
          }
        } catch (e) {
          console.warn(`Failed to fetch from ${endpoint}:`, e);
        }
      }

      const elements = data?.elements || [];

      if (elements.length > 0) {
        const newAmenities = elements.map((el: any) => ({
          lat: el.lat,
          lon: el.lon,
          type: type,
          name: el.tags.name || "Unknown"
        }));

        if (type === 'police') {
          setAmenities(newAmenities);
          if (userLocation) {
            let closestPolice: { lat: number; lon: number; } | null = null;
            let minDistance = Infinity;

            // Simple Euclidean distance for MVP
            const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
              const dx = lat1 - lat2;
              const dy = lon1 - lon2;
              return dx * dx + dy * dy; // Squared distance for comparison
            };

            for (const amenity of newAmenities) {
              const dist = getDistance(userLocation[0], userLocation[1], amenity.lat, amenity.lon);
              if (dist < minDistance) {
                minDistance = dist;
                closestPolice = amenity;
              }
            }

            if (closestPolice) {
              setEmergencyPath([userLocation, [closestPolice.lat, closestPolice.lon]]);
            }
          }
        } else {
          setAmenities(prev => activeFilter === type ? [] : newAmenities);
        }
        return newAmenities;
      }
    } catch (e) {
      console.error("Overpass API Error:", e);
    }
    return [];
  };

  const toggleFilter = (type: string) => {
    setEmergencyPath(null); // Clear emergency lines when filtering normal stuff
    if (activeFilter === type) {
      setActiveFilter(null);
      setAmenities([]);
    } else {
      setActiveFilter(type);
      fetchAmenities(type, center);
    }
  };

  const handleNavigate = (lat: number, lon: number) => {
    setDestination(`${lat.toFixed(5)}, ${lon.toFixed(5)}`);
    setDestinationLocation([lat, lon]);
    // Trigger Route
    handleSearch({ preventDefault: () => { } } as React.FormEvent);
  };

  const geocode = async (query: string): Promise<[number, number] | null> => {
    try {
      const res = await fetch(`${NOMINATIM_BASE_URL}?format=json&q=${encodeURIComponent(query)}&limit=1`, {
        headers: { 'User-Agent': 'SafeStep/1.0 (Student Project)' }
      });

      if (!res.ok) {
        console.warn(`Nominatim Error: ${res.status}`);
        return null;
      }

      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        console.error("Nominatim returned non-JSON:", text.substring(0, 500));
        return null;
      }

      if (data && data.length > 0) {
        return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
      }
    } catch (e) { console.error(e); }
    return null;
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!destination.trim()) return;

    setIsLoading(true);
    setAnalysis(null);

    // Simulate "Thinking" time
    const minTime = new Promise(resolve => setTimeout(resolve, 1500));

    let startCoords = userLocation;

    // Handle Manual Origin
    if (origin !== 'Current Location') {
      const coords = await geocode(origin);
      if (coords) {
        startCoords = coords;
        setUserLocation(coords); // Update "User Location" to manual start for routing
        setCenter(coords);
      }
    }

    if (!startCoords) {
      setIsLoading(false);
      alert("Could not determine start location");
      return;
    }

    try {
      // Logic for separate destination coordinate fetch if needed, 
      // but usually destinationLocation is set by autocomplete click.
      let endCoords = destinationLocation;
      if (!endCoords) {
        const coords = await geocode(destination);
        if (coords) {
          endCoords = coords;
          setDestinationLocation(endCoords);
        }
      }

      if (startCoords && endCoords) {
        // Fetch All Routes Parallel
        const [walkRoute, bikeRoute, driveRoute] = await Promise.all([
          getRoute(startCoords, endCoords, 'walking'),
          getRoute(startCoords, endCoords, 'cycling'),
          getRoute(startCoords, endCoords, 'driving')
        ]);

        setRouteOptions({
          walking: walkRoute,
          cycling: bikeRoute,
          driving: driveRoute
        });

        // Set initial path
        const currentRoute = travelMode === 'walking' ? walkRoute : travelMode === 'cycling' ? bikeRoute : driveRoute;
        if (currentRoute) setRoutePath(currentRoute.coordinates);
      }

      const [result] = await Promise.all([
        getSafetyAnalysis(origin, destination, travelMode),
        minTime
      ]);
      setAnalysis(result);
      // Cache Result
      localStorage.setItem('lastAnalysis', JSON.stringify(result));

      if (user) setSafetyTimerActive(true); // Auto-start timer if logged in

    } catch (error) {
      console.error(error);

      // Offline Fallback
      if (!isOnline) {
        const cached = localStorage.getItem('lastAnalysis');
        if (cached) {
          const parsed = JSON.parse(cached);
          setAnalysis({ ...parsed, source: 'EST', tip: "[OFFLINE CACHE] " + parsed.tip });
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const switchMode = async (mode: 'walking' | 'cycling' | 'driving') => {
    setTravelMode(mode);
    setAnalysis(prev => prev ? { ...prev, tip: "Updating for " + mode + "..." } : null); // Optimistic UI

    if (routeOptions[mode]) {
      setRoutePath(routeOptions[mode]!.coordinates);
    }

    // Trigger new API call for safety analysis
    if (destination) {
      try {
        const result = await getSafetyAnalysis(origin, destination, mode);
        setAnalysis(result);
      } catch (e) { console.error(e); }
    }
  };

  // Autocomplete Logic
  const handleInput = (value: string, type: 'origin' | 'destination') => {
    if (type === 'origin') setOrigin(value);
    else setDestination(value);

    setActiveInput(type);

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(async () => {
      if (value.length > 2 && value !== 'Current Location') {
        try {
          const lat = center[0];
          const lon = center[1];
          const viewbox = `${lon - 0.5},${lat + 0.5},${lon + 0.5},${lat - 0.5}`;

          const res = await fetch(`${NOMINATIM_BASE_URL}?format=json&q=${encodeURIComponent(value)}&limit=5&viewbox=${viewbox}&bounded=1`, {
            headers: { 'User-Agent': 'SafeStep/1.0 (Student Project)' }
          });

          if (!res.ok) {
            console.warn(`Nominatim Autocomplete Error: ${res.status}`);
            return;
          }

          const text = await res.text();
          let data;
          try {
            data = JSON.parse(text);
          } catch (e) {
            console.error("Nominatim Autocomplete returned non-JSON:", text.substring(0, 200));
            return;
          }

          setSuggestions(data);
          setShowSuggestions(true);
        } catch (err) { console.error(err); }
      } else {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    }, 300);
  };

  const handleSuggestionClick = (place: NominatimResult) => {
    if (activeInput === 'origin') {
      setOrigin(place.display_name);
      // We'd ideally wait to set userLocation until Search is clicked or set it here?
      // For now, let Search handle the geocode confirmation or do it lazily.
    } else {
      setDestination(place.display_name);
      setDestinationLocation([parseFloat(place.lat), parseFloat(place.lon)]);
      setCenter([parseFloat(place.lat), parseFloat(place.lon)]);
    }
    setShowSuggestions(false);
  };

  // SOS Button Logic
  const startSOS = () => {
    setIsHoldingSOS(true);
    sosTimerRef.current = setTimeout(() => {
      triggerSOS();
    }, 2000);
  };

  const cancelSOS = () => {
    setIsHoldingSOS(false);
    if (sosTimerRef.current) {
      clearTimeout(sosTimerRef.current);
      sosTimerRef.current = null;
    }
  };

  const triggerSOS = async () => {
    setSosActive(true);
    setIsHoldingSOS(false);
    if (navigator.vibrate) navigator.vibrate([500, 200, 500]);

    // Fetch Police Stations Visuals
    if (isOnline && userLocation) {
      const stations = await fetchAmenities('police', userLocation);

      if (stations && stations.length > 0) {
        // Find Closest
        let closest = stations[0];
        let minDist = 99999999;

        stations.forEach(st => {
          const d = Math.sqrt(Math.pow(st.lat - userLocation[0], 2) + Math.pow(st.lon - userLocation[1], 2));
          if (d < minDist) {
            minDist = d;
            closest = st;
          }
        });

        setEmergencyPath([userLocation, [closest.lat, closest.lon]]);
        // Auto-center to show both
        setCenter([(userLocation[0] + closest.lat) / 2, (userLocation[1] + closest.lon) / 2]);
      }
    }

    setTimeout(() => setSosActive(false), 8000); // 8 seconds display
  };

  const formatArrival = (seconds: number) => {
    const now = new Date();
    now.setSeconds(now.getSeconds() + seconds);
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <main className="relative h-screen w-full bg-slate-900 overflow-hidden flex flex-col font-sans">

      {/* Auth Modal */}
      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}

      {/* Safety Timer Overlay */}

      <SafetyTimer
        isActive={safetyTimerActive}
        onStop={() => setSafetyTimerActive(false)}
        onTriggerSOS={triggerSOS}
        initialDuration={(() => {
          const currentRoute = routeOptions[travelMode];
          if (!currentRoute || currentRoute.distance === 0) return 1200; // Default 20 mins
          const speed = travelMode === 'walking' ? 5 : travelMode === 'cycling' ? 15 : 40;
          return Math.round(((currentRoute.distance / 1000) / speed) * 3600);
        })()}
      />

      {/* Map Layer */}
      <div className="absolute inset-0 z-0">
        <Map
          center={center}
          userLocation={userLocation}
          destinationLocation={destinationLocation}
          routePath={routePath}
          amenities={amenities}
          onNavigate={handleNavigate}
          emergencyPath={emergencyPath}
        />
      </div>

      {/* Map Filters (Safe Havens) */}
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-20 flex gap-2 overflow-x-auto max-w-full px-4 no-scrollbar">
        {[
          { id: 'restaurant', label: 'Food', icon: 'restaurant' },
          { id: 'hotel', label: 'Hotels', icon: 'hotel' },
          { id: 'hospital', label: 'Hospitals', icon: 'local_hospital' }
        ].map(filter => (
          <button
            key={filter.id}
            onClick={() => toggleFilter(filter.id)}
            disabled={!isOnline}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold border transition-all shadow-lg backdrop-blur-md
                    ${activeFilter === filter.id
                ? 'bg-neon-mint text-slate-900 border-neon-mint scale-105'
                : 'bg-slate-900/80 text-white border-slate-600 hover:bg-slate-800'
              } ${!isOnline ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <span className="material-symbols-outlined text-sm">{filter.icon}</span>
            {filter.label}
          </button>
        ))}
      </div>

      {/* Top Bar: Auth & User Status */}
      <div className="absolute top-4 right-4 z-20 flex gap-2">
        {user ? (
          <>
            <div className="flex items-center gap-2 bg-slate-800/90 p-1 pr-3 rounded-full border border-slate-700 shadow-lg">
              <div className="h-8 w-8 rounded-full bg-slate-700 flex items-center justify-center overflow-hidden">
                {user.photoURL ? (
                  <img src={user.photoURL} alt="User" className="h-full w-full object-cover" />
                ) : (
                  <span className="material-symbols-outlined text-slate-400 text-sm">person</span>
                )}
              </div>
              <button
                onClick={() => logoutUser()}
                className="text-xs font-bold text-slate-300 hover:text-red-400 transition ml-1"
              >
                LOGOUT
              </button>
            </div>

            <button
              onClick={() => setShowGuardians(!showGuardians)}
              className="bg-slate-800/90 text-white p-2 rounded-full shadow-lg border border-slate-700 hover:bg-slate-700 transition"
              title="Manage Guardians"
            >
              <span className="material-symbols-outlined">verified_user</span>
            </button>

            <div className={`bg-slate-800/90 px-3 py-2 rounded-full shadow-lg border border-slate-700 flex items-center gap-2 text-xs font-bold ${analysis ? 'text-neon-mint' : 'text-slate-500'}`}>
              <span className="material-symbols-outlined text-sm">smart_toy</span>
              {analysis ? 'AI ACTIVE' : 'AI READY'}
            </div>
          </>
        ) : (
          <button
            onClick={() => setShowAuthModal(true)}
            className="bg-neon-mint text-slate-900 px-4 py-2 rounded-full font-bold shadow-lg hover:bg-emerald-400 transition flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-sm">login</span>
            Login
          </button>
        )}
      </div>

      {/* Guardians Panel */}
      {showGuardians && (
        <div className="absolute top-16 right-4 z-20 w-72 animate-in slide-in-from-top-4">
          <GuardianManager />
        </div>
      )}

      {/* Search Bar - Floating Top Left */}
      <div className="absolute top-4 left-4 z-20 w-full max-w-sm pointer-events-none">
        <form onSubmit={handleSearch} className="pointer-events-auto bg-slate-900/90 backdrop-blur-md p-4 rounded-3xl border border-slate-700 shadow-2xl">

          {/* Origin Input */}
          <div className="relative flex items-center border-b border-slate-700/50 pb-2">
            <span className="material-symbols-outlined text-slate-400 w-8">my_location</span>
            <input
              type="text"
              className="w-full bg-transparent text-slate-100 placeholder-slate-500 text-sm focus:outline-none"
              placeholder="Current Location"
              value={origin}
              onChange={(e) => handleInput(e.target.value, 'origin')}
              onFocus={() => {
                setActiveInput('origin');
                if (suggestions && suggestions.length > 0) setShowSuggestions(true);
              }}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            />
          </div>

          {/* Destination Input */}
          <div className="relative flex items-center pt-2">
            <span className="material-symbols-outlined text-neon-mint w-8">location_on</span>
            <input
              type="text"
              className="w-full bg-transparent text-slate-100 placeholder-slate-500 text-sm focus:outline-none font-semibold"
              placeholder="Where to?"
              value={destination}
              onChange={(e) => handleInput(e.target.value, 'destination')}
              onFocus={() => {
                setActiveInput('destination');
                if (suggestions && suggestions.length > 0) setShowSuggestions(true);
              }}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            />
            <button
              type="submit"
              disabled={isLoading}
              className="bg-neon-mint text-slate-900 p-2 rounded-xl hover:bg-emerald-400 transition-colors disabled:opacity-50 ml-2"
            >
              {isLoading ? <span className="material-symbols-outlined animate-spin">refresh</span> : <span className="material-symbols-outlined">arrow_forward</span>}
            </button>
          </div>

          {/* Suggestions Dropdown */}
          {showSuggestions && suggestions && suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-slate-800 border border-slate-700 rounded-xl shadow-xl overflow-hidden z-50">
              <ul>
                {suggestions.map((place) => (
                  <li
                    key={place.place_id}
                    className="px-4 py-3 hover:bg-slate-700 cursor-pointer text-slate-300 text-sm border-b border-slate-700/50 flex items-start"
                    onClick={() => handleSuggestionClick(place)}
                  >
                    <span className="material-symbols-outlined text-sm mr-2 mt-0.5 text-slate-400">place</span>
                    <span className="truncate">{place.display_name}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </form>
      </div>

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-neon-mint"></div>
          <p className="mt-4 text-neon-mint font-semibold text-lg tracking-wide animate-pulse">Analyzing Route Safety...</p>
        </div>
      )}

      {/* SOS Alert Notification */}
      {sosActive && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-sm px-4">
          <div className={`text-white rounded-3xl p-6 shadow-2xl border-2 animate-bounce text-center ${!isOnline ? 'bg-orange-600 border-orange-400' : 'bg-red-600 border-red-400'}`}>
            <span className="material-symbols-outlined text-6xl mb-2">warning</span>
            <h2 className="text-2xl font-bold mb-1">{!isOnline ? 'OFFLINE SOS' : 'SOS SENT!'}</h2>

            {!isOnline ? (
              <div className="mt-2">
                <p className="text-orange-100 text-sm mb-3">No Internet. Send SMS manually.</p>
                <a
                  href={`sms:?body=EMERGENCY! I need help. My location: ${userLocation ? `${userLocation[0]},${userLocation[1]}` : 'Unknown'}`}
                  className="block w-full bg-white text-orange-700 font-black py-3 rounded-xl hover:bg-orange-50 transition"
                >
                  SEND SMS NOW
                </a>
              </div>
            ) : (
              <p className="text-red-100">Alert sent to guardians at {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.</p>
            )}
          </div>
        </div>
      )}

      {/* Draggable AI Analysis Card */}
      <div className="absolute inset-x-0 bottom-0 pointer-events-none z-50 overflow-visible h-screen"> {/* Increased Z-Index and container height */}
        {analysis && !isLoading && (
          <motion.div
            drag
            dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }} /* Allow full movement relative to parent */
            dragMomentum={false}
            initial={{ x: 20, y: 20 }}
            className="pointer-events-auto absolute bottom-24 right-8 w-full max-w-lg"
          >
            <div className="bg-slate-800/95 backdrop-blur-md rounded-3xl p-5 border border-slate-700 shadow-2xl cursor-grab active:cursor-grabbing">

              {/* Header with Modes */}
              <div className="flex justify-between items-center mb-4 bg-slate-900/50 rounded-xl p-1">
                {[
                  { id: 'walking', icon: 'directions_walk', label: 'Walk', speed: 5 },
                  { id: 'cycling', icon: 'directions_bike', label: 'Bike', speed: 15 },
                  { id: 'driving', icon: 'directions_car', label: 'Car', speed: 40 },
                ].map((mode) => {
                  const distMeters = routeOptions[mode.id]?.distance || 0;
                  // Time = Distance (km) / Speed (km/h) * 60 mins
                  const minutes = distMeters > 0 ? Math.round((distMeters / 1000) / mode.speed * 60) : 0;

                  // Format label
                  let timeLabel = '-';
                  if (distMeters > 0) {
                    if (minutes >= 60) {
                      const hrs = Math.floor(minutes / 60);
                      const mins = minutes % 60;
                      timeLabel = `${hrs} hr ${mins} m`;
                    } else {
                      timeLabel = `${minutes} min`;
                    }
                  }

                  return (
                    <button
                      key={mode.id}
                      onClick={() => switchMode(mode.id as any)}
                      className={`flex-1 flex flex-col items-center py-2 rounded-lg transition-all ${travelMode === mode.id ? 'bg-slate-700 text-neon-mint shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                      <span className="material-symbols-outlined mb-1">{mode.icon}</span>
                      <span className="text-[10px] uppercase font-bold tracking-wider">{mode.label}</span>
                      <span className="text-xs font-mono">{timeLabel}</span>
                    </button>
                  );
                })}
              </div>

              {/* Arrival Time */}
              <div className="text-center mb-4">
                <p className="text-slate-400 text-xs uppercase tracking-widest">Expected Arrival</p>
                <p className="text-2xl font-bold text-white">
                  {(() => {
                    const currentRoute = routeOptions[travelMode];
                    if (!currentRoute) return '--:--';

                    const speed = travelMode === 'walking' ? 5 : travelMode === 'cycling' ? 15 : 40;
                    const durationSecs = ((currentRoute.distance / 1000) / speed) * 3600;

                    return formatArrival(durationSecs);
                  })()}
                </p>
              </div>

              {/* Analysis Content */}
              {analysis && (
                <div className="flex items-start justify-between border-t border-slate-700 pt-4">
                  <div>
                    <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">AI Safety Score</h3>
                    <div className="flex items-baseline space-x-2">
                      <span className={`text-4xl font-black ${analysis.score >= 8 ? 'text-neon-mint' : analysis.score >= 5 ? 'text-yellow-400' : 'text-red-500'}`}>
                        {analysis.score}
                      </span>
                      <span className="text-slate-400 text-sm">/ 10</span>
                    </div>

                    {/* Status Indicator Based on Source */}
                    {analysis.source === 'Gemini' && (
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-neon-mint opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-neon-mint"></span>
                        </span>
                        <span className="text-[10px] text-neon-mint font-bold tracking-wider">AI LIVE (Gemini)</span>
                      </div>
                    )}

                    {analysis.source === 'Groq' && (
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-400"></span>
                        </span>
                        <span className="text-[10px] text-blue-400 font-bold tracking-wider">AI LIVE (Backup)</span>
                      </div>
                    )}

                    {analysis.source === 'EST' && (
                      <div className="flex items-center gap-1 mt-1">
                        <span className="text-[10px] text-slate-500 font-bold tracking-wider bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">EST</span>
                        <span className="text-[10px] text-slate-500">Offline Mode</span>
                      </div>
                    )}
                  </div>
                  <div className="p-3 bg-slate-700/50 rounded-2xl">
                    <span className={`material-symbols-outlined text-4xl ${analysis.score >= 8 ? 'text-neon-mint' : analysis.score >= 5 ? 'text-yellow-400' : 'text-red-500'}`}>
                      {analysis.score >= 8 ? 'verified_user' : 'gpp_maybe'}
                    </span>
                  </div>
                </div>
              )}

              {analysis && (
                <div className="mt-3 text-slate-300 text-sm leading-relaxed bg-slate-700/30 p-3 rounded-xl border border-slate-700/50">
                  <span className="text-neon-mint mr-2 font-bold flex items-center gap-2 mb-2">
                    <span className="material-symbols-outlined text-sm">psychology</span>
                    {analysis.source === 'EST' ? 'Safety Context (Est):' : 'Real-time Analysis:'}
                  </span>
                  {analysis.tip}
                </div>
              )}
              {/* End Analysis Content */}
            </div>
          </motion.div>
        )}
      </div>

      {/* SOS Button - Fixed Bottom Center */}
      <div className="absolute bottom-8 left-0 right-0 z-20 pointer-events-none flex justify-center">
        <div className="pointer-events-auto text-center">
          <button
            onMouseDown={startSOS}
            onMouseUp={cancelSOS}
            onMouseLeave={cancelSOS}
            onTouchStart={startSOS}
            onTouchEnd={cancelSOS}
            className={`
            relative group flex items-center justify-center rounded-full shadow-lg transition-all duration-300 select-none
            ${isHoldingSOS ? 'w-24 h-24 bg-red-600 scale-110' : 'w-20 h-20 bg-red-500 hover:bg-red-600'}
            `}
          >
            <div className={`absolute inset-0 rounded-full border-4 border-red-500/50 ${isHoldingSOS ? 'animate-ping' : 'opacity-0'}`}></div>
            <span className={`font-black text-white ${isHoldingSOS ? 'text-xs' : 'text-xl'}`}>
              {isHoldingSOS ? 'HOLD...' : 'SOS'}
            </span>
          </button>
          <p className="text-center text-slate-500 text-xs mt-2">Hold 2s for Emergency</p>
        </div>
      </div>
    </main>
  );
}
