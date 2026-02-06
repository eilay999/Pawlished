
import React, { useState, useEffect } from 'react';
import { X, Save, Dog, Calendar, User, Phone, Clock, CircleDollarSign, Trash2 } from 'lucide-react';
import { Customer } from '../types';

interface CustomerModalProps {
  customer?: Customer | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (customer: Customer) => void;
  onDelete?: (customerId: string) => void;
}

const FREQUENCY_OPTIONS = [
  { weeks: 2, label: 'שבועיים' },
  { weeks: 4, label: 'חודש' },
  { weeks: 6, label: 'חודש וחצי' },
  { weeks: 8, label: 'חודשיים' },
  { weeks: 10, label: 'חודשיים וחצי' },
  { weeks: 12, label: '3 חודשים' },
];

export const CustomerModal: React.FC<CustomerModalProps> = ({ customer, isOpen, onClose, onSave, onDelete }) => {
  const [formData, setFormData] = useState<Partial<Customer>>({
    name: '',
    phone: '',
    petName: '',
    petType: 'Dog',
    visitFrequencyWeeks: 4,
    lastVisit: new Date(),
    defaultPrice: undefined,
    notes: ''
  });

  useEffect(() => {
    if (customer) {
      setFormData({
        ...customer,
        lastVisit: new Date(customer.lastVisit) // Ensure date object
      });
    } else {
      // Reset for new customer
      setFormData({
        name: '',
        phone: '',
        petName: '',
        petType: 'Dog',
        visitFrequencyWeeks: 4,
        lastVisit: new Date(),
        defaultPrice: undefined,
        notes: ''
      });
    }
  }, [customer, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.petName) return;

    onSave({
      id: customer?.id || Math.random().toString(36).substr(2, 9),
      name: formData.name || '',
      phone: formData.phone || '',
      petName: formData.petName || '',
      petType: 'Dog', // Enforce Dog
      visitFrequencyWeeks: Number(formData.visitFrequencyWeeks) || 4,
      lastVisit: formData.lastVisit || new Date(),
      defaultPrice: formData.defaultPrice,
      notes: formData.notes?.trim() || undefined
    });
    onClose();
  };

  const handleDelete = () => {
    if (!customer || !onDelete) return;
    const confirmed = window.confirm('למחוק את הלקוח וכל התורים שלו?');
    if (!confirmed) return;
    onDelete(customer.id);
    onClose();
  };

  const toInputDate = (date: Date) => {
     if (!date) return '';
     const d = new Date(date);
     const year = d.getFullYear();
     const month = String(d.getMonth() + 1).padStart(2, '0');
     const day = String(d.getDate()).padStart(2, '0');
     return `${year}-${month}-${day}`;
  };

  return (
    // High Z-Index to ensure it covers other modals if needed
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
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
                            className="w-full pr-10 pl-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900 transition-all" 
                            placeholder="050-0000000"
                            value={formData.phone}
                            onChange={e => setFormData({...formData, phone: e.target.value})}
                        />
                    </div>
                </div>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4 space-y-4">
            <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider">פרטי הכלב ומחיר</h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">שם הכלב</label>
                    <div className="relative">
                        <Dog className="absolute right-3 top-2.5 w-4 h-4 text-gray-400" />
                        <input 
                            type="text" 
                            required
                            className="w-full pr-10 pl-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900 shadow-sm transition-all" 
                            placeholder="שם הכלב"
                            value={formData.petName}
                            onChange={e => setFormData({...formData, petName: e.target.value})}
                        />
                    </div>
                </div>

                {/* Default Price Input */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">מחיר קבוע (אופציונלי)</label>
                    <div className="relative">
                        <CircleDollarSign className="absolute right-3 top-2.5 w-4 h-4 text-gray-400" />
                        <input 
                            type="number" 
                            min="0"
                            className="w-full pr-10 pl-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900 shadow-sm transition-all font-medium" 
                            placeholder="לדוגמה: 200"
                            value={formData.defaultPrice || ''}
                            onChange={e => setFormData({...formData, defaultPrice: Number(e.target.value)})}
                        />
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">יופיע אוטומטית בקביעת תור</p>
                </div>
            </div>
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

          <div className="border-t border-gray-100 pt-4 space-y-4 bg-blue-50 -mx-6 px-6 py-6 mt-2">
            <h4 className="text-sm font-bold text-blue-800 uppercase tracking-wider flex items-center gap-2">
                <Clock className="w-4 h-4" />
                תזמון ותדירות
            </h4>
            
            {/* Added Last Visit Field */}
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">תאריך ביקור אחרון</label>
                <div className="relative">
                    <Calendar className="absolute right-3 top-2.5 w-4 h-4 text-blue-500" />
                    <input 
                        type="date"
                        required
                        className="w-full pr-10 pl-3 py-2.5 border border-blue-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                        value={formData.lastVisit ? toInputDate(formData.lastVisit) : ''}
                        onChange={e => {
                            if (e.target.value) {
                                setFormData({...formData, lastVisit: new Date(e.target.value)})
                            }
                        }}
                    />
                </div>
            </div>
            
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">כל כמה זמן הכלב מגיע?</label>
                <div className="grid grid-cols-3 gap-2">
                  {FREQUENCY_OPTIONS.map((option) => (
                    <button
                      key={option.weeks}
                      type="button"
                      onClick={() => setFormData({...formData, visitFrequencyWeeks: option.weeks})}
                      className={`
                        py-2 px-2 text-sm font-medium rounded-lg transition-all border
                        ${formData.visitFrequencyWeeks === option.weeks 
                          ? 'bg-blue-600 text-white border-blue-600 shadow-md' 
                          : 'bg-white text-gray-600 border-blue-100 hover:bg-blue-50'}
                      `}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-2">המערכת תתריע אוטומטית כשהמועד יתקרב.</p>
            </div>
          </div>

        </form>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-between items-center gap-3">
          {customer && onDelete ? (
            <button
              type="button"
              onClick={handleDelete}
              className="px-4 py-2 text-red-600 font-medium hover:bg-red-50 rounded-xl transition-colors flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              מחק לקוח
            </button>
          ) : (
            <span />
          )}
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
