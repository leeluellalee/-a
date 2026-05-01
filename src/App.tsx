import React, { useState, useRef, useEffect, useMemo } from 'react';
import exifr from 'exifr';
import heic2any from 'heic2any';
import { get, set, clear } from 'idb-keyval';
import { Loader2, Edit3, Download, Upload as UploadIcon, Eye, EyeOff, Map as MapIcon, Menu, Globe } from 'lucide-react';
import PhotoMap from './components/PhotoMap';
import EditLocationModal from './components/EditLocationModal';
import { TranslatedText } from './components/TranslatedText';
import { LocationData } from './types';
import { translations, Language } from './translations';

export default function App() {
  const [locations, setLocations] = useState<LocationData[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<LocationData | null>(null);
  const [editingLocation, setEditingLocation] = useState<LocationData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoading, setIsLoading] = useState(true); // Loading state for initial data fetch
  const [dataVersion, setDataVersion] = useState(0); // Used to force-reset components
  const [toast, setToast] = useState<{message: string, type: 'error' | 'success' | 'warning'} | null>(null);
  const [isViewMode, setIsViewMode] = useState(true); // Default to view mode for publishing
  const [showMobileSidebar, setShowMobileSidebar] = useState(false); // Toggle for mobile view
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
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const showToast = (message: string, type: 'error' | 'success' | 'warning') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 6000);
  };

  const handleToggleVisited = (id: string, visited: boolean) => {
    setLocations(prev => {
      const newLocs = prev.map(loc => loc.id === id ? { ...loc, visited } : loc);
      return newLocs;
    });
    if (selectedLocation?.id === id) {
      setSelectedLocation(prev => prev ? { ...prev, visited } : prev);
    }
  };

  // Load data from local storage or static file on mount
  useEffect(() => {
    // Failsafe: ensure loading screen is hidden after a reasonable timeout
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
          
          console.log("Fetching static locations...");
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
                console.log(`Loaded ${staticData.length} static locations`);
              }
            }
          }
        } catch (error) {
          console.warn("No static locations.json found or fetch failed/timed out.", error);
        }

        let idbData: LocationData[] = [];
        try {
          const savedData = await Promise.race([
            get<LocationData[]>('pilgrimage_locations'),
            new Promise<any>((_, reject) => setTimeout(() => reject(new Error('IDB timeout')), 2500))
          ]);
          if (savedData && Array.isArray(savedData)) {
            idbData = savedData;
          }
        } catch (e) {
          console.error("Failed to parse saved locations from IndexedDB or timeout", e);
        }

        let oldLData: LocationData[] = [];
        const oldSavedData = localStorage.getItem('pilgrimage_locations');
        if (oldSavedData) {
          try {
            const parsed = JSON.parse(oldSavedData);
            if (parsed && Array.isArray(parsed)) {
              oldLData = parsed;
            }
          } catch (e) {
            console.error("Failed to parse old localStorage");
          }
        }

        // Merge them. Priority: IDB (User's latest manual work) > Static
        const locMap = new Map<string, LocationData>();
        
        // 1. Load static data first (as base)
        staticData.forEach(loc => { if(loc && loc.id) locMap.set(loc.id, loc); });
        
        // 2. Overwrite with LocalStorage (legacy fallback)
        oldLData.forEach(loc => { if(loc && loc.id) locMap.set(loc.id, loc); });
        
        // 3. Overwrite with IDB (the most reliable and current user state)
        idbData.forEach(loc => {
          if (loc && loc.id) {
            locMap.set(loc.id, loc);
          }
        });

        const merged = Array.from(locMap.values());
        if (merged.length > 0) {
          // Deduplicate by strict lat/lng matching to fix overlap issue
          const coordsMap = new Map<string, LocationData>();
          merged.forEach(loc => {
            const key = `${loc.lat},${loc.lng}`;
            const existing = coordsMap.get(key);
            // Use latest createdAt or just keep first if missing
            const currentCreated = loc.createdAt || 0;
            const existingCreated = existing?.createdAt || 0;
            if (!existing || currentCreated > existingCreated) {
              coordsMap.set(key, loc);
            }
          });
          const deduplicated = Array.from(coordsMap.values());
          setLocations(deduplicated.sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0)));
        }
      } finally {
        setIsLoading(false);
        clearTimeout(forceLoadTimer);
      }
    };

    loadInitialData();
    return () => clearTimeout(forceLoadTimer);
  }, []);

  // Save data to IndexedDB whenever it changes
  useEffect(() => {
    if (locations.length === 0) return; // Prevent overwriting with empty array on pure mount
    const saveData = async () => {
      try {
        await Promise.race([
          set('pilgrimage_locations', locations),
          new Promise((_, reject) => setTimeout(() => reject(new Error('IDB save timeout')), 2000))
        ]);
      } catch (error: any) {
        console.error("Failed to save to IndexedDB:", error);
      }
    };
    saveData();
  }, [locations]);

  const processFiles = async (files: File[]) => {
    setIsProcessing(true);
    setToast(null);
    showToast(t.toastReading.replace('{count}', files.length.toString()), 'warning');

    let successCount = 0;
    let noGpsCount = 0;
    let errorCount = 0;

    const newLocations: LocationData[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      // Allow if it starts with image/ or if the extension is an image extension
      const isImage = file.type.startsWith('image/') || /\.(jpg|jpeg|png|gif|heic|webp)$/i.test(file.name);
      
      if (!isImage) {
        console.warn(`Skipping ${file.name}: Not recognized as an image.`);
        continue;
      }

      try {
        const gps = await exifr.gps(file);
        if (!gps || !gps.latitude || !gps.longitude) {
          console.warn(`Skipping ${file.name}: No GPS data found.`);
          noGpsCount++;
          continue;
        }

        let imageFileToProcess = file;

        // Convert HEIC to JPEG because browsers cannot natively render HEIC to canvas
        if (file.name.toLowerCase().endsWith('.heic') || file.type === 'image/heic') {
          showToast(t.toastHeic.replace('{name}', file.name), 'warning');
          try {
            const convertedBlob = await heic2any({
              blob: file,
              toType: 'image/jpeg',
              quality: 0.8
            });
            const blob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
            imageFileToProcess = new File([blob], file.name.replace(/\.heic$/i, '.jpg'), { type: 'image/jpeg' });
          } catch (heicError) {
            console.error("HEIC conversion failed", heicError);
            throw new Error("HEIC conversion failed");
          }
        }

        // Resize and convert image to base64 for local storage to prevent quota limits
        const base64Image = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
              const canvas = document.createElement('canvas');
              const MAX_WIDTH = 1000; // Resize to max 1000px width to save space
              let width = img.width;
              let height = img.height;
              
              if (width > MAX_WIDTH) {
                height = Math.round((height * MAX_WIDTH) / width);
                width = MAX_WIDTH;
              }
              
              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext('2d');
              
              if (ctx) {
                ctx.drawImage(img, 0, 0, width, height);
                // Add watermark
                const fontSize = Math.max(16, Math.round(width * 0.03));
                ctx.font = `bold ${fontSize}px sans-serif`;
                ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
                ctx.textAlign = 'right';
                ctx.textBaseline = 'bottom';
                ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
                ctx.shadowBlur = 4;
                ctx.shadowOffsetX = 1;
                ctx.shadowOffsetY = 1;
                
                const padding = Math.max(10, Math.round(width * 0.02));
                ctx.fillText('羊卡普汀', width - padding, height - padding);
              }

              // Compress to JPEG with 80% quality
              resolve(canvas.toDataURL('image/jpeg', 0.8));
            };
            img.onerror = () => reject(new Error("Failed to load image for resizing"));
            img.src = e.target?.result as string;
          };
          reader.onerror = () => reject(new Error("Failed to read file"));
          reader.readAsDataURL(imageFileToProcess);
        });

        const newLoc: LocationData = {
          id: Math.random().toString(36).substring(7) + Date.now(),
          title: file.name.split('.')[0],
          lat: gps.latitude,
          lng: gps.longitude,
          realPhotoUrl: base64Image,
          copyright: `© Author - All rights reserved.`,
          createdAt: Date.now(),
          authorUid: 'local-user'
        };

        newLocations.push(newLoc);
        successCount++;
      } catch (error: any) {
        console.error('Error processing file', file.name, error);
        errorCount++;
      }
    }

    if (newLocations.length > 0) {
      setLocations(prev => {
        const updated = [...newLocations, ...prev];
        return updated.sort((a, b) => b.createdAt - a.createdAt);
      });
    }

    setIsProcessing(false);

    if (successCount > 0) {
      const skippedStr = noGpsCount > 0 ? t.toastSkipped.replace('{count}', noGpsCount.toString()) : '';
      showToast(t.toastSuccess.replace('{count}', successCount.toString()).replace('{skipped}', skippedStr), 'success');
    } else if (noGpsCount > 0 && errorCount === 0) {
      showToast(t.toastNoGps.replace('{count}', noGpsCount.toString()), 'warning');
    } else if (errorCount > 0) {
      showToast(t.toastError, 'error');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const filesArray = Array.from(e.target.files) as File[];
      processFiles(filesArray);
    }
    e.target.value = '';
  };

  const handleAddManualLocation = () => {
    const newLoc: LocationData = {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 11),
      title: t.newLocation,
      lat: 35.681236, // Default to Tokyo station coordinates as a starting point
      lng: 139.767125,
      realPhotoUrl: '',
      copyright: t.manualEntry,
      createdAt: Date.now(),
      authorUid: 'local',
      visited: false
    };
    setEditingLocation(newLoc);
  };

  const handleClearCache = async () => {
    try {
      showToast("Resetting everything...", 'warning');
      
      // Clear IndexedDB
      await Promise.race([
        clear(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('IDB clear timeout')), 2000))
      ]);
      
      // Clear all possible web storage
      localStorage.clear();
      sessionStorage.clear();
      
      // Clear app state
      setLocations([]);
      setDataVersion(v => v + 1);
      
      showToast(t.toastSuccess.replace('{count}', '0').replace('{skipped}', ''), 'success');
      
      // Final hard reload
      setTimeout(() => {
        window.location.href = window.location.origin + window.location.pathname + '?reset=' + Date.now();
      }, 1000);
    } catch (e) {
      console.error(e);
      showToast(t.toastError, 'error');
    }
  };

  const handleSaveLocation = (updatedLoc: LocationData) => {
    setLocations(prev => {
      if (!prev.find(loc => loc.id === updatedLoc.id)) {
        return [updatedLoc, ...prev];
      }
      return prev.map(loc => loc.id === updatedLoc.id ? updatedLoc : loc);
    });
    if (selectedLocation?.id === updatedLoc.id) {
      setSelectedLocation(updatedLoc);
    }
    setEditingLocation(null);
  };

  const handleDeleteLocation = (id: string) => {
    setLocations(prev => prev.filter(loc => loc.id !== id));
    if (selectedLocation?.id === id) {
      setSelectedLocation(null);
    }
    setEditingLocation(null);
  };

  const exportData = () => {
    const dataStr = JSON.stringify(locations);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const exportFileDefaultName = 'pilgrimage_map_data.json';

    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const importData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const importedLocations = JSON.parse(event.target?.result as string);
        if (Array.isArray(importedLocations)) {
          setLocations(importedLocations);
          setDataVersion(v => v + 1);
          setIsLoading(false); // Ensure loading screen is dismissed on manual import
          showToast(t.toastImportSuccess, 'success');
        }
      } catch (error) {
        showToast(t.toastImportError, 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

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
            <button
              onClick={() => setIsViewMode(!isViewMode)}
              className="text-[10px] uppercase tracking-wider flex items-center gap-1 px-2 py-1 rounded transition-colors bg-gray-100 text-gray-700 hover:bg-gray-200"
              title={isViewMode ? "Switch to Edit Mode" : "Switch to View Mode"}
            >
              {isViewMode ? <Eye className="w-3 h-3" /> : <Edit3 className="w-3 h-3" />}
              {isViewMode ? "VIEW" : "EDIT"}
            </button>
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
                         <TranslatedText text={loc.title} targetLang={language} />
                       </div>
                       {!isViewMode && (
                         <button 
                           onClick={(e) => { e.stopPropagation(); setEditingLocation(loc); }}
                           className="absolute top-3 right-3 bg-white/80 backdrop-blur-sm p-1 rounded shadow hover:bg-white text-[var(--color-ink)]"
                         >
                           <Edit3 className="w-3 h-3" />
                         </button>
                       )}
                     </div>
                   ))}
                 </div>
               </div>
             );
           })}
        </div>

        {/* Upload Buttons - Hidden in View Mode */}
        {!isViewMode && (
          <div className="p-[20px_40px_40px_40px] shrink-0 border-t border-black/5">
            <input
              type="file"
              id="upload-locations-input"
              onChange={handleFileChange}
              className="hidden"
              multiple
              accept="image/*,.heic,.HEIC"
            />
            <input
              type="file"
              id="import-data-input"
              onChange={importData}
              className="hidden"
              accept=".json"
            />
            <ul className="list-none flex flex-col gap-3">
              <li>
                <label 
                  htmlFor="upload-locations-input"
                  className="text-[13px] tracking-[1px] uppercase cursor-pointer hover:underline underline-offset-8 flex items-center gap-2"
                >
                  {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  <UploadIcon className="w-3 h-3" /> {t.uploadPhotos}
                </label>
              </li>
              <li>
                <button 
                  onClick={handleAddManualLocation}
                  className="text-[13px] tracking-[1px] uppercase cursor-pointer hover:underline underline-offset-8 flex items-center gap-2 text-left"
                >
                  <MapIcon className="w-3 h-3" /> {t.addManual}
                </button>
              </li>
              <li className="h-px bg-black/10 my-2"></li>
              <li 
                onClick={exportData}
                className="text-[11px] tracking-[1px] uppercase cursor-pointer hover:underline underline-offset-8 flex items-center gap-2 text-gray-500"
              >
                <Download className="w-3 h-3" /> {t.exportData}
              </li>
              <li>
                <label 
                  htmlFor="import-data-input"
                  className="text-[11px] tracking-[1px] uppercase cursor-pointer hover:underline underline-offset-8 flex items-center gap-2 text-gray-500"
                >
                  <UploadIcon className="w-3 h-3" /> {t.importData}
                </label>
              </li>
              <li>
                <button 
                  onClick={handleClearCache}
                  className="text-[11px] tracking-[1px] uppercase cursor-pointer hover:underline underline-offset-8 flex items-center gap-2 text-red-500 text-left"
                >
                  {t.clearCache || "CLEAR DB & RELOAD"}
                </button>
              </li>
            </ul>
          </div>
        )}
      </aside>

      {/* Main Content */}
      <main className="flex-1 relative bg-[#EBE7E0] flex items-center justify-center">
        <div className="absolute inset-0 opacity-20 pointer-events-none z-[400]" style={{ backgroundImage: 'radial-gradient(var(--color-accent) 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>
        
        {/* Global View/Edit Mode Toggle overlay */}
        <button
          onClick={() => setIsViewMode(!isViewMode)}
          className="absolute top-4 right-4 z-[2000] shadow-md text-[10px] uppercase tracking-wider flex items-center gap-2 px-3 py-2 rounded transition-colors bg-white/90 backdrop-blur-sm text-gray-700 hover:bg-white border border-gray-200"
          title={isViewMode ? "Switch to Edit Mode" : "Switch to View Mode"}
        >
          {isViewMode ? <Eye className="w-4 h-4 text-blue-500" /> : <Edit3 className="w-4 h-4 text-amber-500" />}
          <span className="font-bold">{isViewMode ? "VIEW MODE" : "EDIT MODE"}</span>
        </button>

        {isLoading ? (
          <div className="text-center text-[var(--color-ink)] opacity-50 z-10 flex flex-col items-center">
            <Loader2 className="w-8 h-8 animate-spin mb-4" />
            <p className="font-display italic">{t.loading}</p>
          </div>
        ) : locations.length > 0 ? (
          <PhotoMap
            key={`map-v${dataVersion}-${locations.length}`}
            locations={locations}
            selectedLocation={selectedLocation}
            onSelectLocation={setSelectedLocation}
            showToast={showToast}
            language={language}
            onToggleVisited={handleToggleVisited}
          />
        ) : (
          <div className="text-center text-[var(--color-ink)] opacity-50 z-10">
            <p className="font-display italic">No locations added yet.</p>
            <p className="text-xs mt-2">Data is saved locally in your browser.</p>
          </div>
        )}
      </main>

      {editingLocation && (
        <EditLocationModal 
          location={editingLocation} 
          onClose={() => setEditingLocation(null)}
          onSave={handleSaveLocation}
          onDelete={handleDeleteLocation}
          language={language}
        />
      )}

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
