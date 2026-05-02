import React, { useState, useRef, useEffect, useMemo } from 'react';
import { get, set } from 'idb-keyval';
import { Loader2, Eye, Map as MapIcon, Menu, Globe } from 'lucide-react';
import PhotoMap from './components/PhotoMap';
import { TranslatedText } from './components/TranslatedText';
import { LocationData } from './types';
import { translations, Language } from './translations';

export default function App() {
  const [locations, setLocations] = useState<LocationData[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<LocationData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState<{message: string, type: 'error' | 'success' | 'warning'} | null>(null);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [language, setLanguage] = useState<Language>('zh');
  const [longPressMenu, setLongPressMenu] = useState<{ loc: LocationData, x: number, y: number } | null>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handlePointerDown = (e: React.PointerEvent, loc: LocationData) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const x = e.clientX;
    const y = e.clientY;
    longPressTimerRef.current = setTimeout(() => {
      setLongPressMenu({ loc, x, y });
    }, 600);
  };

  const handlePointerUpOrLeave = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleContextMenu = (e: React.MouseEvent, loc: LocationData) => {
    e.preventDefault();
    setLongPressMenu({ loc, x: e.clientX, y: e.clientY });
  };

  const t = translations[language];

  const showToast = (message: string, type: 'error' | 'success' | 'warning') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 6000);
  };

  const handleToggleVisited = async (id: string, visited: boolean) => {
    setLocations(prev => prev.map(loc => loc.id === id ? { ...loc, visited } : loc));
    if (selectedLocation?.id === id) {
      setSelectedLocation(prev => prev ? { ...prev, visited } : prev);
    }
    try {
      const visitedState = (await get<Record<string, boolean>>('visited_state')) || {};
      if (visited) visitedState[id] = true;
      else delete visitedState[id];
      await set('visited_state', visitedState);
    } catch (e) {
      console.error('Failed to save visited state', e);
    }
  };

  // Load static locations.json + apply visited overlay from IDB.
  // Why static-only: editing is disabled in the public build, so any IDB-cached
  // location data would just be stale and shadow the deployed locations.json.
  useEffect(() => {
    const forceLoadTimer = setTimeout(() => {
      setIsLoading(prev => {
        if (prev) console.warn("Initial load timed out, forcing UI show");
        return false;
      });
    }, 6000);

    const loadInitialData = async () => {
      try {
        let staticData: LocationData[] = [];
        try {
          const envBaseUrl = import.meta.env.BASE_URL || '/';
          const baseUrl = envBaseUrl.endsWith('/') ? envBaseUrl : envBaseUrl + '/';
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 4000);

          const response = await fetch(baseUrl + 'locations.json?t=' + Date.now(), {
            signal: controller.signal,
            cache: 'no-store'
          });

          clearTimeout(timeoutId);
          if (response.ok) {
            const text = await response.text();
            if (text && !text.trim().startsWith('<')) {
              const parsed = JSON.parse(text);
              if (parsed && Array.isArray(parsed)) {
                staticData = parsed;
              }
            }
          }
        } catch (error) {
          console.warn("Failed to fetch locations.json", error);
        }

        let visitedMap: Record<string, boolean> = {};
        try {
          visitedMap = (await Promise.race([
            get<Record<string, boolean>>('visited_state'),
            new Promise<any>((_, reject) => setTimeout(() => reject(new Error('IDB timeout')), 2500))
          ])) || {};
        } catch (e) {
          console.warn("Failed to load visited state", e);
        }

        if (staticData.length > 0) {
          const coordsMap = new Map<string, LocationData>();
          staticData.forEach(loc => {
            if (!loc || !loc.id) return;
            const key = `${loc.lat},${loc.lng}`;
            const existing = coordsMap.get(key);
            const currentCreated = loc.createdAt || 0;
            const existingCreated = existing?.createdAt || 0;
            if (!existing || currentCreated > existingCreated) {
              coordsMap.set(key, { ...loc, visited: visitedMap[loc.id] === true });
            }
          });
          const deduplicated = Array.from(coordsMap.values());
          setLocations(deduplicated.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
        }
      } finally {
        setIsLoading(false);
        clearTimeout(forceLoadTimer);
      }
    };

    loadInitialData();
    return () => clearTimeout(forceLoadTimer);
  }, []);

  const groupedLocations = useMemo(() => {
    const groups: Record<string, LocationData[]> = {
      KARUMAI: [],
      SENDAI: [],
      TOKYO: [],
      JAPAN_OTHER: [],
      OTHER: []
    };
    
    locations.forEach(loc => {
      const lat = loc.lat;
      const lng = loc.lng;
      if (lat >= 40.2 && lat <= 40.45 && lng >= 141.3 && lng <= 141.65) {
        groups.KARUMAI.push(loc);
      } else if (lat >= 38.1 && lat <= 38.5 && lng >= 140.4 && lng <= 141.2) {
        groups.SENDAI.push(loc);
      } else if (lat >= 35.4 && lat <= 36.0 && lng >= 139.4 && lng <= 140.0) {
        groups.TOKYO.push(loc);
      } else if (lat >= 24.0 && lat <= 46.0 && lng >= 122.0 && lng <= 146.0) {
        groups.JAPAN_OTHER.push(loc);
      } else {
        groups.OTHER.push(loc);
      }
    });
    
    return groups;
  }, [locations]);

  const getRegionName = (region: string) => {
    switch(region) {
      case 'KARUMAI': return t.regionKarumai;
      case 'SENDAI': return t.regionSendai;
      case 'TOKYO': return t.regionTokyo;
      case 'JAPAN_OTHER': return t.regionJapanOther;
      case 'OTHER': return t.regionOther;
      default: return region;
    }
  };

  return (
    <div className="flex w-screen h-screen bg-[var(--color-bg)] text-[var(--color-ink)] font-sans overflow-hidden relative">
      
      {/* Mobile Toggle Button */}
      <button
        onClick={() => setShowMobileSidebar(!showMobileSidebar)}
        className="md:hidden fixed bottom-6 left-1/2 -translate-x-1/2 z-[2000] bg-black text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-2 font-display tracking-wider text-sm transition-transform active:scale-95"
      >
        {showMobileSidebar ? <MapIcon className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
        {showMobileSidebar ? 'SHOW MAP' : 'SHOW LIST'}
      </button>

      {/* Mobile Overlay */}
      {showMobileSidebar && (
        <div 
          className="fixed inset-0 bg-black/20 z-[1000] md:hidden backdrop-blur-sm"
          onClick={() => setShowMobileSidebar(false)}
        />
      )}

      {/* Sidebar Navigation */}
      <aside className={`
        fixed md:relative z-[1500] md:z-10
        w-[85%] max-w-[320px] md:w-[380px] md:max-w-none h-full
        bg-[var(--color-bg)] border-r border-black/10
        flex flex-col shrink-0
        transition-transform duration-300 ease-in-out
        ${showMobileSidebar ? 'translate-x-0 shadow-2xl' : '-translate-x-full md:translate-x-0 shadow-none'}
      `}>
        {/* Brand & Stats */}
        <div className="p-[40px_40px_20px_40px] flex flex-col shrink-0 relative">
          <div className="absolute top-4 right-4 flex items-center gap-2">
            <div className="relative">
              <button className="text-[10px] uppercase tracking-wider flex items-center gap-1 px-2 py-1 rounded transition-colors bg-blue-50 text-blue-700 hover:bg-blue-100">
                <Globe className="w-3 h-3" />
                {language.toUpperCase()}
              </button>
              <select 
                value={language}
                onChange={(e) => setLanguage(e.target.value as Language)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                aria-label="Select Language"
              >
                <option value="zh">中文</option>
                <option value="en">ENG</option>
                <option value="ja">日本語</option>
                <option value="ko">한국어</option>
              </select>
            </div>
          </div>

          <div className="mb-[40px] mt-4">
            <h1 
              className="font-display text-[32px] sm:text-[42px] leading-[1.1] sm:leading-[0.9] font-normal mb-5"
              dangerouslySetInnerHTML={{ __html: t.title }}
            />
            <p className="italic font-display text-[14px] text-[var(--color-accent)] tracking-[1px]">
              {t.subtitle}
            </p>
          </div>

          <div className="flex flex-col gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-[2px] opacity-50 mb-1">{t.listTitle}</div>
              <div className="font-display text-[24px]">{locations.length} {t.spotsCount}</div>
            </div>
          </div>
        </div>

        {/* Gallery */}
        <div className="flex-1 overflow-y-auto px-[40px] py-[20px] flex flex-col gap-8">
           {['KARUMAI', 'SENDAI', 'TOKYO', 'JAPAN_OTHER', 'OTHER'].map(regionKey => {
             const regionLocs = groupedLocations[regionKey];
             if (!regionLocs || regionLocs.length === 0) return null;
             
             return (
               <div key={regionKey} className="flex flex-col gap-4">
                 <h3 className="font-display text-[18px] border-b border-black/10 pb-2">
                   {getRegionName(regionKey)} ({regionLocs.length})
                 </h3>
                 <div className="grid grid-cols-2 gap-4">
                   {regionLocs.map(loc => (
                     <div
                       key={loc.id}
                       onContextMenu={(e) => handleContextMenu(e, loc)}
                       onPointerDown={(e) => handlePointerDown(e, loc)}
                       onPointerUp={handlePointerUpOrLeave}
                       onPointerLeave={handlePointerUpOrLeave}
                       className={`relative p-2 pb-6 shadow-[0_10px_30px_rgba(0,0,0,0.1)] cursor-pointer transition-transform hover:-translate-y-1 ${
                         loc.visited ? 'bg-[#3b82f6] text-white' : 'bg-white text-[var(--color-ink)]'
                       } ${selectedLocation?.id === loc.id ? 'ring-2 ring-[var(--color-ink)]' : ''}`}
                     >
                       {(loc.realPhotoUrl || loc.refPhotoUrl) && (loc.realPhotoUrl || loc.refPhotoUrl) !== "" ? (
                         <img
                           src={loc.realPhotoUrl || loc.refPhotoUrl}
                           alt={loc.title}
                           loading="lazy"
                           decoding="async"
                           onClick={() => {
                             setSelectedLocation(loc);
                             setShowMobileSidebar(false);
                           }}
                           className="w-full aspect-square object-cover bg-[#eee]"
                         />
                       ) : (
                         <div 
                           onClick={() => {
                             setSelectedLocation(loc);
                             setShowMobileSidebar(false);
                           }}
                           className={`w-full aspect-square flex items-center justify-center font-display text-[12px] opacity-70 ${
                             loc.visited ? 'bg-[#2563eb] text-white/70' : 'bg-[#eee] text-gray-500'
                           }`}
                         >
                           <span>{t.noPhoto}</span>
                         </div>
                       )}
                       <div className="absolute bottom-1 left-0 w-full text-center text-[10px] font-display italic truncate px-1">
                         <TranslatedText text={loc.title} translations={loc.titles} targetLang={language} />
                       </div>
                     </div>
                   ))}
                 </div>
               </div>
             );
           })}
        </div>

      </aside>

      {/* Main Content */}
      <main className="flex-1 relative bg-[#EBE7E0] flex items-center justify-center">
        <div className="absolute inset-0 opacity-20 pointer-events-none z-[400]" style={{ backgroundImage: 'radial-gradient(var(--color-accent) 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>

        {isLoading ? (
          <div className="text-center text-[var(--color-ink)] opacity-50 z-10 flex flex-col items-center">
            <Loader2 className="w-8 h-8 animate-spin mb-4" />
            <p className="font-display italic">{t.loading}</p>
          </div>
        ) : locations.length > 0 ? (
          <PhotoMap
            key={`map-${locations.length}`}
            locations={locations}
            selectedLocation={selectedLocation}
            onSelectLocation={setSelectedLocation}
            showToast={showToast}
            language={language}
            onToggleVisited={handleToggleVisited}
          />
        ) : (
          <div className="text-center text-[var(--color-ink)] opacity-50 z-10">
            <p className="font-display italic">No locations available.</p>
          </div>
        )}
      </main>

      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-6 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full shadow-lg z-[3000] text-sm font-medium transition-all max-w-[90vw] text-center ${
          toast.type === 'error' ? 'bg-red-500 text-white' :
          toast.type === 'warning' ? 'bg-amber-500 text-white' :
          'bg-green-500 text-white'
        }`}>
          {toast.message}
        </div>
      )}

      {/* Long Press Menu */}
      {longPressMenu && (
        <>
          <div 
            className="fixed inset-0 z-[4000]" 
            onClick={() => setLongPressMenu(null)}
          />
          <div 
            className="fixed z-[4001] bg-white rounded-lg shadow-xl border border-gray-100 py-1 min-w-[150px] overflow-hidden animate-in fade-in zoom-in duration-200"
            style={{
              left: Math.min(longPressMenu.x, window.innerWidth - 160),
              top: Math.min(longPressMenu.y, window.innerHeight - 100),
            }}
          >
            <a 
              href={`https://www.google.com/maps/dir/?api=1&destination=${longPressMenu.loc.lat},${longPressMenu.loc.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setLongPressMenu(null)}
              className="block w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
            >
              <MapIcon className="w-4 h-4" />
              {t.navigate}
            </a>
            <div className="h-[1px] bg-gray-100" />
            <button 
              onClick={() => {
                handleToggleVisited(longPressMenu.loc.id, !longPressMenu.loc.visited);
                setLongPressMenu(null);
              }}
              className={`block w-full text-left px-4 py-3 text-sm flex items-center gap-2 ${
                longPressMenu.loc.visited ? 'text-[#3b82f6] hover:bg-blue-50' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Eye className="w-4 h-4" />
              {longPressMenu.loc.visited ? t.markVisited : t.markUnvisited}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
