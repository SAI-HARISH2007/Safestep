"use client";

import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { Search, Shield, AlertTriangle, MapPin, Loader2, Navigation, Crosshair, Car, Footprints, Bike } from 'lucide-react';
import { getSafetyAnalysis, SafetyAnalysis } from './services/GeminiService';
import { getRoute, RouteData } from './services/RouteService';

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
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const sosTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Get User Location
  const [isLocating, setIsLocating] = useState(true);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const newPos: [number, number] = [position.coords.latitude, position.coords.longitude];
          setCenter(newPos);
          setUserLocation(newPos);
          setIsLocating(false);
        },
        (error) => {
          console.error("Error getting location:", error);
          setIsLocating(false); // Fallback to London
        }
      );
    } else {
      setIsLocating(false);
    }
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!destination.trim()) return;

    setIsLoading(true);
    setAnalysis(null);

    // Simulate "Thinking" time for premium feel if API is too fast
    const minTime = new Promise(resolve => setTimeout(resolve, 1500));

    // Use coordinates if default "Current Location" is selected, otherwise use text input
    const startPointStr = (origin === 'Current Location' && userLocation)
      ? `${userLocation[0]}, ${userLocation[1]}`
      : origin;

    try {
      // Fetch All Routes Parallel
      const [walkRoute, bikeRoute, driveRoute] = await Promise.all([
        (userLocation && destinationLocation) ? getRoute(userLocation, destinationLocation, 'walking') : null,
        (userLocation && destinationLocation) ? getRoute(userLocation, destinationLocation, 'cycling') : null,
        (userLocation && destinationLocation) ? getRoute(userLocation, destinationLocation, 'driving') : null
      ]);

      setRouteOptions({
        walking: walkRoute,
        cycling: bikeRoute,
        driving: driveRoute
      });

      // Set initial path based on current mode (default walking)
      const currentRoute = travelMode === 'walking' ? walkRoute : travelMode === 'cycling' ? bikeRoute : driveRoute;
      if (currentRoute) setRoutePath(currentRoute.coordinates);

      // Note: If origin is typed manually (not current location), we ideally need coordinates. 
      // For this demo, we rely on userLocation being set for OSRM, or simple straight line fallback if no route.

      const [result] = await Promise.all([
        getSafetyAnalysis(startPointStr, destination, travelMode),
        minTime
      ]);
      setAnalysis(result);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const switchMode = async (mode: 'walking' | 'cycling' | 'driving') => {
    setTravelMode(mode);
    setAnalysis(prev => prev ? { ...prev, tip: "Updating for " + mode + "..." } : null); // Optimistic UI

    // Update Map Path
    if (routeOptions[mode]) {
      setRoutePath(routeOptions[mode]!.coordinates);
    }

    // Re-run analysis for new mode
    if (destination) {
      // setIsLoading(true); // Don't block whole UI, just show updating status
      const startPointStr = (origin === 'Current Location' && userLocation)
        ? `${userLocation[0]}, ${userLocation[1]}`
        : origin;

      try {
        const result = await getSafetyAnalysis(startPointStr, destination, mode);
        setAnalysis(result);
      } catch (e) { console.error(e); }
    }
  };

  // SOS Button Logic
  const startSOS = () => {
    setIsHoldingSOS(true);
    sosTimerRef.current = setTimeout(() => {
      triggerSOS();
    }, 2000); // 2 seconds hold
  };

  const cancelSOS = () => {
    setIsHoldingSOS(false);
    if (sosTimerRef.current) {
      clearTimeout(sosTimerRef.current);
      sosTimerRef.current = null;
    }
  };

  const triggerSOS = () => {
    setSosActive(true);
    setIsHoldingSOS(false);
    // Vibrate device if supported
    if (navigator.vibrate) navigator.vibrate([500, 200, 500]);

    // Auto-hide alert after 5 seconds for demo
    setTimeout(() => setSosActive(false), 5000);
  };

  return (
    <main className="relative h-screen w-full bg-slate-900 overflow-hidden flex flex-col">

      {/* Map Layer */}
      {/* Map Layer */}
      <div className="absolute inset-0 z-0">
        <Map center={center} userLocation={userLocation} destinationLocation={destinationLocation} routePath={routePath} />

        {/* Initial Location Loader Overlay */}
        {isLocating && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900">
            <div className="flex flex-col items-center">
              <Loader2 className="h-10 w-10 text-neon-mint animate-spin mb-3" />
              <p className="text-slate-400 text-sm tracking-wider animate-pulse">Locating you...</p>
            </div>
          </div>
        )}
      </div>

      {/* Overlay: Top Search Bar */}
      <div className="relative z-10 p-4 pt-12 bg-gradient-to-b from-slate-900/90 to-transparent pointer-events-none">
        <form onSubmit={handleSearch} className="relative max-w-md mx-auto pointer-events-auto space-y-2">
          {/* Origin Input */}
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Navigation className="h-5 w-5 text-slate-400" />
            </div>
            <input
              type="text"
              className="block w-full pl-10 pr-10 py-3 border border-slate-700 rounded-2xl leading-5 bg-slate-800/80 backdrop-blur-md text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent transition-all shadow-lg text-sm"
              placeholder="Start Location"
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
            />
            {/* Current Location Button */}
            <button
              type="button"
              onClick={() => {
                setOrigin("Current Location");
                if (userLocation) setCenter(userLocation);
              }}
              className="absolute right-3 top-3 text-slate-400 hover:text-neon-mint transition-colors"
              title="Use Current Location"
            >
              <Crosshair className="h-5 w-5" />
            </button>
          </div>

          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-neon-mint" />
            </div>
            <input
              type="text"
              className="block w-full pl-10 pr-16 py-3 border border-slate-700 rounded-2xl leading-5 bg-slate-800/80 backdrop-blur-md text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-neon-mint focus:border-transparent transition-all shadow-lg"
              placeholder="Where are you going?"
              value={destination}
              onChange={(e) => {
                setDestination(e.target.value);
                // Debounce Suggestion Fetch
                if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
                searchTimeoutRef.current = setTimeout(async () => {
                  if (e.target.value.length > 2) {
                    try {
                      // Calculate bounding box for ~50km bias
                      // 1 deg lat is ~111km. 0.5 deg is ~55km.
                      const lat = center[0];
                      const lon = center[1];
                      const viewbox = `${lon - 0.5},${lat + 0.5},${lon + 0.5},${lat - 0.5}`; // left,top,right,bottom

                      const res = await fetch(`${NOMINATIM_BASE_URL}?format=json&q=${encodeURIComponent(e.target.value)}&limit=5&viewbox=${viewbox}&bounded=1`);
                      const data = await res.json();
                      setSuggestions(data);
                      setShowSuggestions(true);
                    } catch (err) {
                      console.error("Autocomplete Error:", err);
                    }
                  } else {
                    setSuggestions([]);
                    setShowSuggestions(false);
                  }
                }, 300);
              }}
              onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)} // Delay to allow click
            />

            {/* Suggestions Dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-slate-800/95 backdrop-blur-md border border-slate-700 rounded-xl shadow-xl overflow-hidden z-50">
                <ul>
                  {suggestions.map((place) => (
                    <li
                      key={place.place_id}
                      className="px-4 py-3 hover:bg-slate-700/50 cursor-pointer text-slate-300 text-sm border-b border-slate-700/50 last:border-0 transition-colors flex items-start"
                      onClick={() => {
                        setDestination(place.display_name);
                        setShowSuggestions(false);
                        const newLat = parseFloat(place.lat);
                        const newLon = parseFloat(place.lon);
                        setDestinationLocation([newLat, newLon]);
                        setCenter([newLat, newLon]);
                      }}
                    >
                      <MapPin className="h-4 w-4 mt-0.5 mr-2 text-neon-mint shrink-0" />
                      <span className="truncate">{place.display_name}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="absolute right-2 top-2 bottom-2 bg-neon-mint text-slate-900 px-4 rounded-xl font-bold text-sm hover:bg-emerald-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Go'}
            </button>
          </div>
        </form>
      </div>

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="relative">
            <div className="absolute inset-0 bg-neon-mint/30 blur-xl rounded-full"></div>
            <Loader2 className="h-16 w-16 text-neon-mint animate-spin relative z-10" />
          </div>
          <p className="mt-4 text-neon-mint font-semibold text-lg tracking-wide animate-pulse">Running Safety Analysis...</p>
        </div>
      )}

      {/* SOS Alert Notification */}
      {sosActive && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-sm px-4">
          <div className="bg-red-600 text-white rounded-3xl p-6 shadow-2xl border-2 border-red-400 animate-bounce text-center">
            <AlertTriangle className="h-12 w-12 mx-auto mb-2 text-white fill-current" />
            <h2 className="text-2xl font-bold mb-1">SOS SENT!</h2>
            <p className="text-red-100">Alert sent to trusted contacts.</p>
          </div>
        </div>
      )}

      {/* Bottom Sheet / Controls */}
      <div className="mt-auto relative z-10 p-4 pb-8 bg-gradient-to-t from-slate-900 via-slate-900/90 to-transparent pointer-events-none">
        <div className="max-w-md mx-auto space-y-4 pointer-events-auto">


          {/* Safety Card (if analysis exists) */}
          {analysis && !isLoading && (
            <div className="bg-slate-800/90 backdrop-blur-md rounded-3xl p-5 border border-slate-700 shadow-xl animate-in slide-in-from-bottom duration-500">

              {/* Mode Selector */}
              <div className="flex justify-between items-center mb-4 bg-slate-900/50 rounded-xl p-1">
                {[
                  { id: 'walking', icon: Footprints, label: 'Walk', time: routeOptions.walking ? Math.round(routeOptions.walking.duration / 60) + ' m' : (isLoading ? '...' : '-') },
                  { id: 'cycling', icon: Bike, label: 'Bike', time: routeOptions.cycling ? Math.round(routeOptions.cycling.duration / 60) + ' m' : (isLoading ? '...' : '-') },
                  { id: 'driving', icon: Car, label: 'Car', time: routeOptions.driving ? Math.round(routeOptions.driving.duration / 60) + ' m' : (isLoading ? '...' : '-') },
                ].map((mode) => (
                  <button
                    key={mode.id}
                    onClick={() => switchMode(mode.id as any)}
                    className={`flex-1 flex flex-col items-center py-2 rounded-lg transition-all ${travelMode === mode.id ? 'bg-slate-700 text-neon-mint shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    <mode.icon className="h-5 w-5 mb-1" />
                    <span className="text-[10px] uppercase font-bold tracking-wider">{mode.label}</span>
                    <span className="text-xs font-mono">{mode.time}</span>
                  </button>
                ))}
              </div>

              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">Safety Analysis</h3>
                  <div className="flex items-baseline space-x-2">
                    <span className={`text-4xl font-black ${analysis.score >= 8 ? 'text-neon-mint' : analysis.score >= 5 ? 'text-yellow-400' : 'text-red-500'}`}>
                      {analysis.score}
                    </span>
                    <span className="text-slate-400 text-sm">/ 10</span>
                  </div>
                  {/* Real-time vs Offline Badge */}
                  <div className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold mt-1 ${analysis.isMock ? 'bg-yellow-900/50 text-yellow-400 border border-yellow-700/50' : 'bg-green-900/50 text-green-400 border border-green-700/50'}`}>
                    {analysis.isMock ? '⚠️ EST' : '🟢 AI LIVE'}
                  </div>
                </div>
                <div className="p-3 bg-slate-700/50 rounded-2xl">
                  <Shield className={`h-8 w-8 ${analysis.score >= 8 ? 'text-neon-mint' : analysis.score >= 5 ? 'text-yellow-400' : 'text-red-500'}`} />
                </div>
              </div>
              <p className="mt-3 text-slate-300 text-sm leading-relaxed border-t border-slate-700 pt-3">
                <span className="text-neon-mint mr-2">Tip:</span>
                {analysis.tip}
              </p>
            </div>
          )}

          {/* SOS Button */}
          <div className="flex justify-center pt-2">
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
              aria-label="SOS Button"
            >
              {/* Ripple Effect Ring */}
              <div className={`absolute inset-0 rounded-full border-4 border-red-500/50 ${isHoldingSOS ? 'animate-ping' : 'opacity-0'}`}></div>

              <span className={`font-black text-white ${isHoldingSOS ? 'text-xs' : 'text-xl'}`}>
                {isHoldingSOS ? 'HOLD...' : 'SOS'}
              </span>
            </button>
          </div>
          <p className="text-center text-slate-500 text-xs mt-2">Hold 2s for Emergency</p>
        </div>
      </div>
    </main>
  );
}
