
import React, { useState, useEffect } from 'react';
import { X, Save, Dog as DogIcon, Plus, User, Phone, Trash2, MessageCircle } from 'lucide-react';
import { Customer, CustomerLifecycleStatus, Dog } from '../types';
import { normalizePhoneForCompare } from '../utils';

interface CustomerModalProps {
  customer?: Customer | null;
  dogs?: Dog[];
  isOpen: boolean;
  prefillPhone?: string;
  onClose: () => void;
  onSave: (customer: Customer) => void;
  onDelete?: (customerId: string) => void;
  onOpenDog?: (dogId: string) => void;
  onAddDog?: (customerId: string) => void;
  onOpenWhatsApp?: (customerId: string) => void;
}

const LIFECYCLE_OPTIONS: Array<{
  value: CustomerLifecycleStatus;
  label: string;
  description: string;
}> = [
  {
    value: 'ACTIVE',
    label: 'פעיל',
    description: 'ממשיך להופיע בהתראות, באיחורים ובמעקב השוטף.'
  },
  {
    value: 'ON_HOLD',
    label: 'בהמתנה',
    description: 'לא יופיע בלקוחות מאחרים, מתקרבים או בתזכורות.'
  }
];

export const CustomerModal: React.FC<CustomerModalProps> = ({
  customer,
  dogs = [],
  isOpen,
  prefillPhone,
  onClose,
  onSave,
  onDelete,
  onOpenDog,
  onAddDog,
  onOpenWhatsApp
}) => {
  const [formData, setFormData] = useState<Partial<Customer>>({
    name: '',
    phone: '',
    lifecycleStatus: 'ACTIVE',
    notes: ''
  });
  useEffect(() => {
    if (customer) {
      setFormData({ ...customer });
    } else {
      const normalizedPrefillPhone = prefillPhone ? normalizePhoneForCompare(prefillPhone) : '';
      // Reset for new customer
      setFormData({
        name: '',
        phone: normalizedPrefillPhone,
        lifecycleStatus: 'ACTIVE',
        notes: ''
      });
    }
  }, [customer, isOpen, prefillPhone]);


  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedPhone = normalizePhoneForCompare(formData.phone || '');
    if (!formData.name || !normalizedPhone) return;

    onSave({
      id: customer?.id || Math.random().toString(36).substr(2, 9),
      name: formData.name || '',
      phone: normalizedPhone,
      // Pet fields live on `dogs` now; these are kept only as inert legacy columns.
      petName: customer?.petName || '',
      petType: customer?.petType || '',
      visitFrequencyWeeks: customer?.visitFrequencyWeeks || 4,
      lastVisit: customer?.lastVisit || new Date(),
      defaultPrice: customer?.defaultPrice,
      lifecycleStatus: formData.lifecycleStatus || 'ACTIVE',
      notes: formData.notes?.trim() || undefined
    });
    onClose();
  };

  const handleDelete = () => {
    if (!customer || !onDelete) return;
    const confirmed = window.confirm('למחוק את הלקוח, כל הכלבים שלו וכל התורים שלו?');
    if (!confirmed) return;
    onDelete(customer.id);
    onClose();
  };

  return (
    // High Z-Index to ensure it covers other modals if needed
    <div className="fixed inset-0 bg-pink-500/20 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 p-2 rounded-full">
                <User className="w-5 h-5 text-blue-600" />
            </div>
            <h3 className="font-bold text-xl text-gray-800">
              {customer ? 'עריכת כרטיס לקוח' : 'לקוח חדש'}
            </h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full text-gray-500 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto custom-scrollbar">
          
          {/* Personal Info */}
          <div className="space-y-4">
            <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider">פרטים אישיים</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">שם מלא</label>
                    <div className="relative">
                        <User className="absolute right-3 top-2.5 w-4 h-4 text-gray-400" />
                        <input 
                            type="text" 
                            required
                            className="w-full pr-10 pl-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900 transition-all" 
                            placeholder="שם הלקוח"
                            value={formData.name}
                            onChange={e => setFormData({...formData, name: e.target.value})}
                        />
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">טלפון</label>
                    <div className="relative">
                        <Phone className="absolute right-3 top-2.5 w-4 h-4 text-gray-400" />
                        <input 
                            type="tel" 
                            required
                            className="w-full pr-10 pl-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900 transition-all" 
                            placeholder="050-0000000"
                            value={formData.phone}
                            onChange={e => setFormData({...formData, phone: e.target.value})}
                        />
                    </div>
                </div>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider">כלבים</h4>
              <button
                type="button"
                disabled={!customer || !onAddDog}
                onClick={() => customer && onAddDog?.(customer.id)}
                className="text-xs font-bold text-blue-600 hover:bg-blue-50 rounded-lg px-2 py-1 flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Plus className="w-3.5 h-3.5" />
                הוסף כלב
              </button>
            </div>
            {!customer && (
              <p className="text-[11px] text-gray-400">שמור/י את הלקוח קודם כדי להוסיף כלב.</p>
            )}
            {customer && dogs.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-3 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                עדיין אין כלבים ללקוח הזה
              </p>
            )}
            {dogs.length > 0 && (
              <div className="space-y-2">
                {dogs.map(dog => (
                  <button
                    key={dog.id}
                    type="button"
                    onClick={() => onOpenDog?.(dog.id)}
                    className="w-full text-right flex items-center justify-between px-3 py-2.5 border border-gray-200 rounded-xl hover:border-blue-300 hover:bg-blue-50/50 transition-colors"
                  >
                    <span className="flex items-center gap-2 font-medium text-gray-800">
                      <DogIcon className="w-4 h-4 text-gray-400" />
                      {dog.name}
                      {dog.breed ? ` · ${dog.breed}` : ''}
                    </span>
                    <span className="text-[11px] text-gray-400">כרטיס הכלב ←</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-gray-100 pt-4 space-y-2">
            <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider">הערות</h4>
            <textarea
              className="w-full min-h-[90px] px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900 transition-all resize-y"
              placeholder="הערות על הלקוח..."
              value={formData.notes || ''}
              onChange={e => setFormData({ ...formData, notes: e.target.value })}
            />
          </div>

          <div className="border-t border-gray-100 pt-4 space-y-3">
            <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider">סטטוס מעקב</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {LIFECYCLE_OPTIONS.map(option => {
                const isSelected = (formData.lifecycleStatus || 'ACTIVE') === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setFormData({ ...formData, lifecycleStatus: option.value })}
                    className={`
                      rounded-2xl border p-4 text-right transition-all
                      ${isSelected
                        ? 'border-blue-500 bg-blue-50 shadow-sm'
                        : 'border-gray-200 bg-white hover:border-blue-200 hover:bg-gray-50'}
                    `}
                  >
                    <div className="font-bold text-gray-800 mb-1">{option.label}</div>
                    <div className="text-xs leading-5 text-gray-500">{option.description}</div>
                  </button>
                );
              })}
            </div>
          </div>

        </form>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-between items-center gap-3">
          <div className="flex items-center gap-2">
            {customer && onOpenWhatsApp && (
              <button
                type="button"
                onClick={() => onOpenWhatsApp(customer.id)}
                className="px-4 py-2 text-emerald-600 font-medium hover:bg-emerald-50 rounded-xl transition-colors flex items-center gap-2"
              >
                <MessageCircle className="w-4 h-4" />
                שלח WhatsApp
              </button>
            )}
            {customer && onDelete && (
              <button
                type="button"
                onClick={handleDelete}
                className="px-4 py-2 text-red-600 font-medium hover:bg-red-50 rounded-xl transition-colors flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                מחק לקוח
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onClose} 
            className="px-6 py-2.5 text-gray-600 font-medium hover:bg-gray-200 rounded-xl transition-colors"
          >
            בטל
          </button>
          <button 
            onClick={handleSubmit}
            className="px-8 py-2.5 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all active:scale-95 flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            שמור כרטיס
          </button>
        </div>
      </div>
    </div>
  );
};
