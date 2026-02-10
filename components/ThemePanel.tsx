import React, { useEffect, useState } from 'react';
import { Palette, RotateCcw, X } from 'lucide-react';
import { applyTheme, DEFAULT_THEME, loadTheme, saveTheme, ThemeSettings } from '../theme';

interface ThemePanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ThemePanel: React.FC<ThemePanelProps> = ({ isOpen, onClose }) => {
  const [theme, setTheme] = useState<ThemeSettings>(DEFAULT_THEME);

  useEffect(() => {
    if (isOpen) {
      const stored = loadTheme();
      setTheme(stored);
      applyTheme(stored);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      applyTheme(theme);
    }
  }, [theme, isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    saveTheme(theme);
    applyTheme(theme);
    onClose();
  };

  const handleReset = () => {
    setTheme(DEFAULT_THEME);
    saveTheme(DEFAULT_THEME);
    applyTheme(DEFAULT_THEME);
  };

  return (
    <div className="fixed inset-0 z-[220] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-100">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
          <div className="flex items-center gap-2 text-gray-800 font-bold">
            <Palette className="w-5 h-5 text-blue-600" />
            עיצוב וצבעים
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-gray-200 text-gray-500"
            aria-label="סגור"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 gap-4">
            <label className="flex items-center justify-between gap-3 text-sm font-medium text-gray-700">
              צבע ראשי
              <input
                type="color"
                value={theme.primary}
                onChange={(e) => setTheme({ ...theme, primary: e.target.value })}
                className="h-9 w-16 rounded-lg border border-gray-200 bg-white"
              />
            </label>

            <label className="flex items-center justify-between gap-3 text-sm font-medium text-gray-700">
              צבע משני (ירוק/דגש)
              <input
                type="color"
                value={theme.accent}
                onChange={(e) => setTheme({ ...theme, accent: e.target.value })}
                className="h-9 w-16 rounded-lg border border-gray-200 bg-white"
              />
            </label>

            <label className="flex items-center justify-between gap-3 text-sm font-medium text-gray-700">
              צבע רקע כללי
              <input
                type="color"
                value={theme.background}
                onChange={(e) => setTheme({ ...theme, background: e.target.value })}
                className="h-9 w-16 rounded-lg border border-gray-200 bg-white"
              />
            </label>
          </div>

          <div className="rounded-xl border border-gray-200 p-3 text-xs text-gray-600 bg-gray-50">
            טיפ: אחרי שינוי צבעים אפשר ללחוץ על "שמירה" כדי לשמור למכשיר.
          </div>
        </div>

        <div className="px-5 pb-5 flex items-center gap-3">
          <button
            type="button"
            onClick={handleReset}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            איפוס
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 transition-colors"
          >
            שמירה
          </button>
        </div>
      </div>
    </div>
  );
};
