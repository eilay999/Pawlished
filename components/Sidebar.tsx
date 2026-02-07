import React from 'react';
import { Calendar, Users, TrendingUp, Scissors, Plus } from 'lucide-react';
import { ViewType } from '../types';

interface SidebarProps {
  currentView: ViewType;
  onChangeView: (view: ViewType) => void;
  onQuickAdd: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, onChangeView, onQuickAdd }) => {
  
  const navItems = [
    { id: 'CALENDAR' as ViewType, label: 'יומן', icon: Calendar },
    { id: 'CUSTOMERS' as ViewType, label: 'לקוחות', icon: Users },
    { id: 'STATS' as ViewType, label: 'דוחות', icon: TrendingUp },
  ];

  return (
    <>
      {/* --- Desktop Sidebar (Hidden on Mobile) --- */}
      <div className="hidden md:flex w-64 bg-white h-screen flex-col shadow-lg z-10 border-l border-gray-100 shrink-0">
        {/* Logo Area */}
        <div className="h-24 flex items-center justify-center border-b border-gray-100 bg-white">
          <div className="flex items-center gap-2 text-2xl font-bold text-gray-800">
            <span>פוליש</span>
            <Scissors className="w-6 h-6 text-blue-600 transform -scale-x-100" />
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 py-8 px-4 space-y-3">
          {navItems.map((item) => {
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onChangeView(item.id)}
                className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all duration-200 group ${
                  isActive 
                    ? 'bg-gradient-to-l from-blue-50 to-emerald-50 text-blue-700 font-bold shadow-sm' 
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <item.icon className={`w-5 h-5 transition-colors ${isActive ? 'text-blue-600' : 'text-gray-400 group-hover:text-gray-600'}`} />
                <span className="text-base">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Quick Add Button */}
        <div className="p-6 border-t border-gray-100 bg-gray-50/50">
          <button 
            onClick={onQuickAdd}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-blue-200 transition-all active:scale-95 transform hover:-translate-y-0.5"
          >
            <Plus className="w-5 h-5" />
            <span>תור מהיר</span>
          </button>
        </div>
      </div>

      {/* --- Mobile Bottom Navigation (Visible only on Mobile) --- */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40 px-2 pb-safe safe-area-bottom shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <div className="flex justify-around items-center h-16">
            {navItems.map((item) => {
                const isActive = currentView === item.id;
                return (
                    <button
                        key={item.id}
                        onClick={() => onChangeView(item.id)}
                        className={`flex flex-col items-center justify-center w-full h-full gap-1 ${
                            isActive ? 'text-blue-600' : 'text-gray-400'
                        }`}
                    >
                        <div className={`p-1.5 rounded-xl transition-all ${isActive ? 'bg-blue-50' : ''}`}>
                            <item.icon className={`w-6 h-6 ${isActive ? 'fill-current' : ''}`} strokeWidth={isActive ? 2.5 : 2} />
                        </div>
                        <span className="text-[10px] font-medium">{item.label}</span>
                    </button>
                );
            })}
        </div>
      </div>

      {/* --- Mobile Floating Action Button (FAB) --- */}
      <button 
        onClick={onQuickAdd}
        className="md:hidden fixed bottom-20 left-4 z-50 bg-blue-600 text-white p-4 rounded-full shadow-xl shadow-blue-300 active:scale-90 transition-transform flex items-center justify-center"
        aria-label="תור חדש"
      >
        <Plus className="w-7 h-7" />
      </button>
    </>
  );
};
