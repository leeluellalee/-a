import React, { useState, useRef, useEffect } from 'react';
import exifr from 'exifr';
import heic2any from 'heic2any';
import { get, set } from 'idb-keyval';
import { Loader2, Edit3, Download, Upload as UploadIcon, Eye, EyeOff, Map as MapIcon, Menu, Globe } from 'lucide-react';
import PhotoMap from './components/PhotoMap';
import EditLocationModal from './components/EditLocationModal';
import { LocationData } from './types';
import { translations, Language } from './translations';

export default function App() {
  const [locations, setLocations] = useState<LocationData[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<LocationData | null>(null);
  const [editingLocation, setEditingLocation] = useState<LocationData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [toast, setToast] = useState<{message: string, type: 'error' | 'success' | 'warning'} | null>(null);
  const [isViewMode, setIsViewMode] = useState(true); // Toggle for public view simulation
  const [showMobileSidebar, setShowMobileSidebar] = useState(false); // Toggle for mobile view
  const [language, setLanguage] = useState<Language>('zh');

  const t = translations[language];
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const showToast = (message: string, type: 'error' | 'success' | 'warning') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 6000);
  };

  // Load data from local storage or static file on mount
  useEffect(() => {
    const loadInitialData = async () => {
      // For the public viewer, we want to try loading the static locations.json FIRST.
      // That way, if you upload a new locations.json, it will reflect immediately for visitors.
      let hasStaticData = false;
      try {
        const baseUrl = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : import.meta.env.BASE_URL + '/';
        const response = await fetch(baseUrl + 'locations.json?t=' + new Date().getTime()); // cache bust
        if (response.ok) {
          const text = await response.text();
          // Make sure it's not the Vite SPA fallback HTML
          if (!text.trim().startsWith('<')) {
            const staticData = JSON.parse(text);
            if (staticData && staticData.length > 0) {
              setLocations(staticData);
              hasStaticData = true;
            }
          }
        }
      } catch (error) {
        console.log("No static locations.json found or fetch failed.");
      }

      if (hasStaticData) return;

      // Fallbacks if locations.json is missing:
      // 1. Try to load from IndexedDB first (for active editing, much higher limits than localStorage)
      try {
        const savedData = await get<LocationData[]>('pilgrimage_locations');
        if (savedData && savedData.length > 0) {
          setLocations(savedData);
          return;
        }
      } catch (e) {
        console.error("Failed to parse saved locations from IndexedDB", e);
      }

      // 2. Fallback to older localStorage if they just updated
      const oldSavedData = localStorage.getItem('pilgrimage_locations');
      if (oldSavedData) {
        try {
          const parsed = JSON.parse(oldSavedData);
          if (parsed && parsed.length > 0) {
            setLocations(parsed);
            return;
          }
        } catch (e) {
          console.error("Failed to parse old localStorage");
        }
      }
    };

    loadInitialData();
  }, []);

  // Save data to IndexedDB whenever it changes
  useEffect(() => {
    if (locations.length === 0) return; // Prevent overwriting with empty array on pure mount
    const saveData = async () => {
      try {
        await set('pilgrimage_locations', locations);
      } catch (error: any) {
        console.error("Failed to save to IndexedDB:", error);
      }
    };
    saveData();
  }, [locations]);

  const processFiles = async (files: File[]) => {
    setIsProcessing(true);
    setToast(null);
    showToast(`正在读取 ${files.length} 张照片...`, 'warning');

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
          showToast(`正在转换 HEIC 格式: ${file.name}...`, 'warning');
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
      showToast(`成功上传 ${successCount} 个地点！${noGpsCount > 0 ? `（跳过 ${noGpsCount} 张无GPS照片）` : ''}`, 'success');
    } else if (noGpsCount > 0 && errorCount === 0) {
      showToast(`未找到位置信息：选中的 ${noGpsCount} 张照片都没有GPS数据。请确保上传的是手机拍摄的原图。`, 'warning');
    } else if (errorCount > 0) {
      showToast(`读取出错，请重试。`, 'error');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const filesArray = Array.from(e.target.files) as File[];
      processFiles(filesArray);
    }
    e.target.value = '';
  };

  const handleSaveLocation = (updatedLoc: LocationData) => {
    setLocations(prev => prev.map(loc => loc.id === updatedLoc.id ? updatedLoc : loc));
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
          showToast('数据导入成功！', 'success');
        }
      } catch (error) {
        showToast('导入失败：文件格式不正确', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
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
            <div className="relative group">
              <button className="text-[10px] uppercase tracking-wider flex items-center gap-1 px-2 py-1 rounded transition-colors bg-blue-50 text-blue-700 hover:bg-blue-100">
                <Globe className="w-3 h-3" />
                {language.toUpperCase()}
              </button>
              <div className="absolute top-full right-0 mt-1 mb-2 bg-white shadow-lg border border-gray-100 rounded overflow-hidden hidden group-hover:block z-50 min-w-[80px]">
                {(['zh', 'en', 'ja', 'ko'] as Language[]).map(lang => (
                  <button 
                    key={lang} 
                    onClick={() => setLanguage(lang)}
                    className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 ${language === lang ? 'font-bold bg-gray-50' : ''}`}
                  >
                    {lang === 'zh' ? '中文' : lang === 'en' ? 'ENG' : lang === 'ja' ? '日本語' : '한국어'}
                  </button>
                ))}
              </div>
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
        <div className="flex-1 overflow-y-auto px-[40px] py-[20px]">
           <div className="grid grid-cols-2 gap-4">
              {locations.map(loc => (
                <div
                  key={loc.id}
                  className={`relative bg-white p-2 pb-6 shadow-[0_10px_30px_rgba(0,0,0,0.1)] cursor-pointer transition-transform hover:-translate-y-1 ${
                    selectedLocation?.id === loc.id ? 'ring-1 ring-[var(--color-ink)]' : ''
                  }`}
                >
                  <img
                    src={loc.realPhotoUrl}
                    alt={loc.title}
                    onClick={() => {
                      setSelectedLocation(loc);
                      setShowMobileSidebar(false);
                    }}
                    className="w-full aspect-square object-cover bg-[#eee]"
                  />
                  <div className="absolute bottom-1 left-0 w-full text-center text-[10px] font-display italic truncate px-1">
                    {loc.title}
                  </div>
                  {!isViewMode && (
                    <button 
                      onClick={(e) => { e.stopPropagation(); setEditingLocation(loc); }}
                      className="absolute top-3 right-3 bg-white/80 backdrop-blur-sm p-1 rounded shadow hover:bg-white"
                    >
                      <Edit3 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
           </div>
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
                  {t.uploadPhotos}
                </label>
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
            </ul>
          </div>
        )}
      </aside>

      {/* Main Content */}
      <main className="flex-1 relative bg-[#EBE7E0] flex items-center justify-center">
        <div className="absolute inset-0 opacity-20 pointer-events-none z-[400]" style={{ backgroundImage: 'radial-gradient(var(--color-accent) 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>
        
        {locations.length > 0 ? (
          <PhotoMap
            locations={locations}
            selectedLocation={selectedLocation}
            onSelectLocation={setSelectedLocation}
            showToast={showToast}
            language={language}
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
    </div>
  );
}
