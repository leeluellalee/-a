import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LocationData } from '../types';
import { translations, Language } from '../translations';
import { Navigation, LocateFixed } from 'lucide-react';

// Fix Leaflet's default icon path issues in Vite/React
// @ts-ignore
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
// @ts-ignore
import markerIcon from 'leaflet/dist/images/marker-icon.png';
// @ts-ignore
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

function MapUpdater({ selectedLocation }: { selectedLocation: LocationData | null }) {
  const map = useMap();
  
  useEffect(() => {
    if (selectedLocation?.lat && selectedLocation?.lng) {
      map.flyTo([selectedLocation.lat, selectedLocation.lng], 15, {
        animate: true,
        duration: 1.5
      });
    }
  }, [selectedLocation, map]);
  
  return null;
}

function CustomControls({ showToast }: { showToast: (msg: string, type: 'error' | 'success' | 'warning') => void }) {
  const map = useMap();
  const [position, setPosition] = useState<[number, number] | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  useEffect(() => {
    // Try to get initial location
    map.locate().on("locationfound", function (e) {
      setPosition([e.latlng.lat, e.latlng.lng]);
    });

    // Watch position
    const watchId = navigator.geolocation.watchPosition(
      (pos) => setPosition([pos.coords.latitude, pos.coords.longitude]),
      (err) => console.error("Geolocation error:", err),
      { enableHighAccuracy: true }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [map]);

  const handleLocate = () => {
    if (position) {
      map.flyTo(position, 15, { animate: true });
    } else {
      setIsLocating(true);
      map.locate({ setView: true, maxZoom: 15 }).on("locationfound", function (e) {
        setPosition([e.latlng.lat, e.latlng.lng]);
        setIsLocating(false);
      }).on("locationerror", function (e) {
        showToast("无法获取位置。请在系统和浏览器设置中，允许本网站访问您的地理位置。", "error");
        setIsLocating(false);
      });
    }
  };

  return (
    <>
      {position && (
        <Marker 
          position={position} 
          icon={L.divIcon({
            className: 'custom-user-location',
            html: `
              <div class="relative flex items-center justify-center w-4 h-4">
                <div class="absolute w-8 h-8 bg-blue-500/40 rounded-full animate-ping"></div>
                <div class="relative w-4 h-4 bg-blue-500 border-2 border-white rounded-full shadow-[0_2px_4px_rgba(0,0,0,0.3)]"></div>
              </div>
            `,
            iconSize: [16, 16],
            iconAnchor: [8, 8],
          })} 
        />
      )}
      <div style={{ position: 'absolute', zIndex: 1000, bottom: '40px', right: '10px' }}>
        <div className="leaflet-control leaflet-bar" style={{ border: 'none', margin: 0, boxShadow: '0 1px 5px rgba(0,0,0,0.65)' }}>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleLocate();
            }}
            className="flex items-center justify-center w-[34px] h-[34px] bg-white hover:bg-gray-100 text-black transition-colors rounded"
            title="定位到我的位置"
            style={{ borderRadius: '4px' }}
          >
            <LocateFixed size={20} className={isLocating ? 'animate-pulse text-blue-500' : 'text-gray-700'} />
          </button>
        </div>
      </div>
    </>
  );
}

interface PhotoMapProps {
  locations: LocationData[];
  selectedLocation: LocationData | null;
  onSelectLocation: (loc: LocationData) => void;
  showToast: (msg: string, type: 'error' | 'success' | 'warning') => void;
  language: Language;
}

export default function PhotoMap({ locations, selectedLocation, onSelectLocation, showToast, language }: PhotoMapProps) {
  const t = translations[language];
  const centerLoc = locations[0];
  const defaultCenter: [number, number] = centerLoc 
    ? [centerLoc.lat, centerLoc.lng] 
    : [35.8617, 104.1954];

  const defaultZoom = centerLoc ? 10 : 4;

  return (
    <MapContainer 
      center={defaultCenter} 
      zoom={defaultZoom} 
      className="w-full h-full z-0"
      zoomControl={true}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapUpdater selectedLocation={selectedLocation} />
      <CustomControls showToast={showToast} />
      
      {locations.map(loc => {
        const customIcon = L.divIcon({
          className: 'custom-photo-marker',
          html: `
            <div class="photo-marker-inner">
              <img src="${loc.realPhotoUrl}" alt="${loc.title}" />
            </div>
          `,
          iconSize: [60, 75],
          iconAnchor: [30, 75],
          popupAnchor: [0, -75]
        });

        return (
          <Marker
            key={loc.id}
            position={[loc.lat, loc.lng]}
            icon={customIcon}
            eventHandlers={{
              click: () => onSelectLocation(loc),
            }}
          >
            <Popup className="custom-popup">
              <div>
                <h2 className="font-display font-normal text-[18px] mb-2 truncate">{loc.title}</h2>
                
                <div className="flex flex-col gap-3 mb-3">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider mb-1 text-gray-500">{t.realLife}</div>
                    <img 
                      src={loc.realPhotoUrl} 
                      alt="Real" 
                      className="w-full h-auto max-h-48 object-contain bg-[#eee] rounded" 
                    />
                  </div>
                  {loc.refPhotoUrl && (
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider mb-1 text-gray-500">{t.animeRef}</div>
                      <img 
                        src={loc.refPhotoUrl} 
                        alt="Reference" 
                        className="w-full h-auto max-h-48 object-contain bg-[#eee] rounded" 
                      />
                    </div>
                  )}
                </div>

                {loc.description && (
                  <p className="text-[12px] leading-[1.6] text-[#666] mb-2 max-h-24 overflow-y-auto">
                    {loc.description}
                  </p>
                )}

                <a 
                  href={`https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-2 bg-[var(--color-ink)] text-white text-[12px] tracking-wider uppercase hover:bg-black transition-colors"
                >
                  <Navigation className="w-3 h-3" />
                  {t.navigate}
                </a>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
