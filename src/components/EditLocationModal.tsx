import { useState, useEffect } from 'react';
import { LocationData } from '../types';
import { translations, Language } from '../translations';
import { X, Trash2, AlertTriangle } from 'lucide-react';
import heic2any from 'heic2any';

interface EditLocationModalProps {
  location: LocationData;
  onClose: () => void;
  onSave: (location: LocationData) => void;
  onDelete: (id: string) => void;
  language: Language;
}

export default function EditLocationModal({ location, onClose, onSave, onDelete, language }: EditLocationModalProps) {
  const t = translations[language];
  const [title, setTitle] = useState(location.title || '');
  const [description, setDescription] = useState(location.description || '');
  const [refFile, setRefFile] = useState<File | null>(null);
  const [refPreview, setRefPreview] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (refFile) {
      const objectUrl = URL.createObjectURL(refFile);
      setRefPreview(objectUrl);
      return () => URL.revokeObjectURL(objectUrl);
    } else {
      setRefPreview(null);
    }
  }, [refFile]);

  const handleSave = async () => {
    setIsSaving(true);
    let refPhotoUrl = location.refPhotoUrl;

    if (refFile) {
      try {
        let fileToProcess = refFile;
        
        // Convert HEIC to JPEG because browsers cannot natively render HEIC to canvas
        if (refFile.name.toLowerCase().endsWith('.heic') || refFile.type === 'image/heic') {
          const convertedBlob = await heic2any({
            blob: refFile,
            toType: 'image/jpeg',
            quality: 0.8
          });
          const blob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
          fileToProcess = new File([blob], refFile.name.replace(/\.heic$/i, '.jpg'), { type: 'image/jpeg' });
        }

        // Resize and convert reference image to base64 for local storage
        const base64Promise = new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
              const canvas = document.createElement('canvas');
              const MAX_WIDTH = 800; // Smaller max width for reference images
              let width = img.width;
              let height = img.height;
              
              if (width > MAX_WIDTH) {
                height = Math.round((height * MAX_WIDTH) / width);
                width = MAX_WIDTH;
              }
              
              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext('2d');
              ctx?.drawImage(img, 0, 0, width, height);
              resolve(canvas.toDataURL('image/jpeg', 0.8));
            };
            img.onerror = () => reject(new Error("Failed to load image for resizing"));
            img.src = e.target?.result as string;
          };
          reader.onerror = () => reject(new Error("Failed to read file"));
          reader.readAsDataURL(fileToProcess);
        });
        
        refPhotoUrl = await base64Promise;
      } catch (error) {
        console.error("Failed to process reference image", error);
        alert("处理参考图失败，请尝试使用 JPG/PNG 格式的图片。");
      }
    }

    onSave({
      ...location,
      title,
      description,
      refPhotoUrl
    });
    setIsSaving(false);
  };

  const handleDelete = () => {
    if (showDeleteConfirm) {
      onDelete(location.id);
    } else {
      setShowDeleteConfirm(true);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[1000] flex items-center justify-center p-4">
      <div className="bg-white rounded-lg w-full max-w-md p-6 relative max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-black">
          <X className="w-5 h-5" />
        </button>
        
        <h2 className="text-xl font-display mb-4">Edit Location</h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-wider text-gray-500 mb-1">Location Name</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full border border-gray-300 rounded p-2 text-sm"
              placeholder="Enter location name..."
            />
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wider text-gray-500 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full border border-gray-300 rounded p-2 text-sm h-24"
              placeholder="Describe this location..."
            />
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wider text-gray-500 mb-1">{t.animeRef}</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setRefFile(e.target.files?.[0] || null)}
              className="w-full text-sm mb-2"
            />
            
            {(refPreview || location.refPhotoUrl) && (
              <div className="relative inline-block">
                <img 
                  src={refPreview || location.refPhotoUrl} 
                  alt="Reference preview" 
                  className="h-24 object-cover rounded border border-gray-200" 
                />
                {refPreview && (
                  <span className="absolute top-1 right-1 bg-green-500 text-white text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wider">
                    New
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="mt-8 flex justify-between items-center pt-4 border-t border-gray-100">
          {showDeleteConfirm ? (
            <button
              onClick={handleDelete}
              className="flex items-center gap-1 text-white bg-red-600 hover:bg-red-700 px-3 py-1.5 rounded text-sm font-medium transition-colors"
            >
              <AlertTriangle className="w-4 h-4" />
              Confirm Delete
            </button>
          ) : (
            <button
              onClick={handleDelete}
              className="flex items-center gap-2 text-red-500 hover:text-red-700 text-sm transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          )}
          
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2 px-4 py-2 bg-[var(--color-ink)] text-white rounded text-sm hover:bg-black transition-colors disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
