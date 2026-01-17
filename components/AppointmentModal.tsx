
import React, { useState, useEffect, useRef } from 'react';
import { X, Calendar, Clock, Scissors, User, CircleDollarSign, Plus, Phone, Dog, History, AlertCircle, PenLine, List, Trash2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Customer, Appointment, AppointmentStatus } from '../types';
import { SERVICE_PRICES } from '../constants';

interface AppointmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (appointment: Appointment) => void;
  onDelete?: (appointmentId: string) => void;
  initialDate?: Date;
  customers: Customer[];
  preSelectedCustomerId?: string;
  onCreateNewCustomer: () => void;
  appointment?: Appointment | null;
}

// Generate Time Slots from 08:00 to 20:00
const generateTimeSlots = () => {
    const slots = [];
    for (let i = 8; i <= 20; i++) {
        slots.push(`${String(i).padStart(2, '0')}:00`);
        if (i !== 20) {
            slots.push(`${String(i).padStart(2, '0')}:30`);
        }
    }
    return slots;
};
const TIME_SLOTS = generateTimeSlots();

export const AppointmentModal: React.FC<AppointmentModalProps> = ({ 
  isOpen, 
  onClose, 
  onSave, 
  onDelete,
  initialDate, 
  customers,
  preSelectedCustomerId,
  onCreateNewCustomer,
  appointment
}) => {
  const [formData, setFormData] = useState({
    customerId: '',
    date: '',
    time: '09:00',
    service: 'תספורת מלאה',
    price: 250,
    status: AppointmentStatus.SCHEDULED,
    notes: ''
  });

  const [isCustomService, setIsCustomService] = useState(false);
  const [showError, setShowError] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  
  const timeSliderRef = useRef<HTMLDivElement>(null);

  const selectedCustomer = customers.find(c => c.id === formData.customerId);

  const toInputDate = (date: Date) => {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Helper to get next 30 min interval
  const getSmartDefaultTime = () => {
    const now = new Date();
    now.setMinutes(Math.ceil(now.getMinutes() / 30) * 30);
    now.setSeconds(0);
    // If rounded to next hour and it's 00 min, fine.
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  };

  useEffect(() => {
    if (isOpen) {
      setIsDeleteConfirmOpen(false);

      if (appointment) {
        const dateObj = new Date(appointment.date);
        const hours = String(dateObj.getHours()).padStart(2, '0');
        const minutes = String(dateObj.getMinutes()).padStart(2, '0');
        
        const isStandardService = Object.keys(SERVICE_PRICES).includes(appointment.service);
        setIsCustomService(!isStandardService);

        setFormData({
            customerId: appointment.customerId,
            date: toInputDate(dateObj),
            time: `${hours}:${minutes}`,
            service: appointment.service,
            price: appointment.price,
            status: appointment.status,
            notes: appointment.notes || ''
        });
      } else {
        // Create Mode
        setIsCustomService(false);
        
        // Smart time logic: if selected date is today, pick next slot. Else 09:00
        const isToday = initialDate && toInputDate(initialDate) === toInputDate(new Date());
        let defaultTime = isToday ? getSmartDefaultTime() : '09:00';
        
        // Validate if defaultTime exists in slots, if not find closest
        if (!TIME_SLOTS.includes(defaultTime)) {
            defaultTime = '09:00';
        }

        setFormData({
            customerId: preSelectedCustomerId || '',
            date: initialDate ? toInputDate(initialDate) : toInputDate(new Date()),
            time: defaultTime,
            service: 'תספורת מלאה',
            price: SERVICE_PRICES['תספורת מלאה'] || 0,
            status: AppointmentStatus.SCHEDULED,
            notes: ''
        });
        
        // If customer is pre-selected (e.g. from customer card), apply price logic
        if (preSelectedCustomerId) {
            const cust = customers.find(c => c.id === preSelectedCustomerId);
            if (cust && cust.defaultPrice) {
                 setFormData(prev => ({ ...prev, price: cust.defaultPrice! }));
            }
        }
      }
      setShowError(false);
      
      // Scroll to selected time in slider after render
      setTimeout(() => {
        if (timeSliderRef.current) {
            const selectedBtn = timeSliderRef.current.querySelector('[data-selected="true"]');
            if (selectedBtn) {
                selectedBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            }
        }
      }, 100);
    }
  }, [isOpen, initialDate, preSelectedCustomerId, appointment]);

  const handleCustomerChange = (newCustomerId: string) => {
      const cust = customers.find(c => c.id === newCustomerId);
      let newPrice = formData.price;
      
      if (cust && cust.defaultPrice) {
          // Priority: Customer Fixed Price
          newPrice = cust.defaultPrice;
      } else {
          // Fallback: Service Price
          newPrice = SERVICE_PRICES[formData.service] || 0;
      }

      setFormData({
          ...formData,
          customerId: newCustomerId,
          price: newPrice
      });
      setShowError(false);
  };

  const handleServiceChange = (serviceName: string) => {
    // Determine price:
    // If the currently selected customer has a fixed price, we MIGHT want to keep it.
    // However, usually changing service changes price. 
    // Logic: If user manually changes service, update price to service price. 
    // BUT, if we want strict "Fixed Price" policy, check customer first.
    // For now: Changing service updates price to Service Price standard.
    
    // Exception: If we wanted the customer price to persist, we would check 'selectedCustomer.defaultPrice' again.
    // Let's assume selecting a service resets to that service's price, 
    // unless the user manually overrides it afterwards.
    
    // BETTER UX for this request: If customer has default price, maybe don't change it automatically?
    // Let's stick to standard behavior: Service Change -> Update Price. 
    // The "Default Price" is mostly for initial selection.
    
    const newPrice = SERVICE_PRICES[serviceName];
    setFormData({
        ...formData,
        service: serviceName,
        price: newPrice !== undefined ? newPrice : formData.price
    });
  }

  const toggleCustomService = () => {
      const nextState = !isCustomService;
      setIsCustomService(nextState);
      if (!nextState && !Object.keys(SERVICE_PRICES).includes(formData.service)) {
          const defaultService = 'תספורת מלאה';
          setFormData({
              ...formData,
              service: defaultService,
              price: SERVICE_PRICES[defaultService]
          });
      }
  };

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.customerId) {
        setShowError(true);
        return;
    }

    if (!formData.date || !formData.time) return;

    const [year, month, day] = formData.date.split('-').map(Number);
    const [hours, minutes] = formData.time.split(':').map(Number);
    const appointmentDate = new Date(year, month - 1, day, hours, minutes);

    const newAppointment: Appointment = {
      id: appointment?.id || Math.random().toString(36).substr(2, 9),
      customerId: formData.customerId,
      date: appointmentDate,
      service: formData.service,
      status: formData.status,
      notes: formData.notes,
      price: Number(formData.price)
    };

    onSave(newAppointment);
    onClose();
  };

  const handleDelete = () => {
    if (appointment && onDelete) {
        onDelete(appointment.id);
    }
  };

  const isEditMode = !!appointment;

  const STATUS_LABELS: Record<string, string> = {
      [AppointmentStatus.SCHEDULED]: 'נקבע',
      [AppointmentStatus.COMPLETED]: 'בוצע',
      [AppointmentStatus.CANCELLED]: 'בוטל',
      [AppointmentStatus.LATE]: 'לא הגיע'
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
          <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-600" />
            {isEditMode ? 'עריכת פרטי תור' : 'קביעת תור חדש'}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full text-gray-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto custom-scrollbar">
          
          {/* Customer Selection */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700">
                לקוח <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
                <div className="relative flex-1">
                  <User className="absolute right-3 top-2.5 w-4 h-4 text-gray-400" />
                  <select
                    required
                    className={`w-full pr-10 pl-3 py-2.5 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white appearance-none ${showError && !formData.customerId ? 'border-red-500 bg-red-50' : 'border-gray-300'}`}
                    value={formData.customerId}
                    onChange={e => handleCustomerChange(e.target.value)}
                  >
                    <option value="">בחר לקוח מהרשימה...</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>{c.name} ({c.petName})</option>
                    ))}
                  </select>
                </div>
                {!isEditMode && (
                    <button 
                        type="button"
                        onClick={onCreateNewCustomer}
                        className="bg-blue-50 text-blue-600 p-2.5 rounded-xl hover:bg-blue-100 transition-colors border border-blue-200 flex items-center justify-center shrink-0"
                        title="לקוח חדש"
                    >
                        <Plus className="w-5 h-5" />
                    </button>
                )}
            </div>
            
            {showError && !formData.customerId && (
                <div className="flex items-center gap-1 text-xs text-red-500 font-medium animate-pulse">
                    <AlertCircle className="w-3 h-3" />
                    חובה לבחור לקוח כדי לקבוע תור
                </div>
            )}

            {/* Selected Customer Card */}
            {selectedCustomer && (
                <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 text-sm space-y-2 animate-in fade-in slide-in-from-top-2 relative">
                    {selectedCustomer.defaultPrice && (
                        <div className="absolute top-2 left-2 bg-green-100 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                            מחיר קבוע: ₪{selectedCustomer.defaultPrice}
                        </div>
                    )}
                    <div className="flex items-center gap-2 text-gray-700 font-medium border-b border-gray-200 pb-2">
                        <Dog className="w-4 h-4 text-blue-500" />
                        <span>{selectedCustomer.petName}</span>
                        <span className="text-gray-400 text-xs font-normal">({selectedCustomer.petType})</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                        <div className="flex items-center gap-1.5">
                            <Phone className="w-3 h-3 text-gray-400" />
                            {selectedCustomer.phone}
                        </div>
                        <div className="flex items-center gap-1.5">
                            <History className="w-3 h-3 text-gray-400" />
                             ביקור אחרון: {new Date(selectedCustomer.lastVisit).toLocaleDateString('he-IL')}
                        </div>
                    </div>
                </div>
            )}
          </div>

          <div className="border-t border-gray-100 my-4"></div>

          {/* Date & Time */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">תאריך <span className="text-red-500">*</span></label>
              <input 
                type="date" 
                required
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900 shadow-sm"
                value={formData.date}
                onChange={e => setFormData({...formData, date: e.target.value})}
              />
            </div>
            
            {/* Time Slider */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">שעה <span className="text-red-500">*</span></label>
              <div 
                ref={timeSliderRef}
                className="flex overflow-x-auto gap-2 pb-2 -mx-1 px-1 custom-scrollbar snap-x"
                style={{ scrollBehavior: 'smooth' }}
              >
                  {TIME_SLOTS.map((slot) => {
                      const isSelected = formData.time === slot;
                      return (
                        <button
                            key={slot}
                            type="button"
                            data-selected={isSelected}
                            onClick={() => setFormData({ ...formData, time: slot })}
                            className={`
                                flex-shrink-0 px-4 py-2 rounded-lg text-sm font-bold border transition-all snap-center
                                ${isSelected 
                                    ? 'bg-blue-600 text-white border-blue-600 shadow-md transform scale-105' 
                                    : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:bg-blue-50'}
                            `}
                        >
                            {slot}
                        </button>
                      );
                  })}
              </div>
            </div>
          </div>

          {/* Service and Price */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 md:col-span-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">סוג טיפול</label>
                <div className="relative flex items-center">
                    <button
                        type="button"
                        onClick={toggleCustomService}
                        className="absolute left-1 z-10 p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title={isCustomService ? "חזור לרשימה" : "הקלדה ידנית"}
                    >
                        {isCustomService ? <List className="w-4 h-4" /> : <PenLine className="w-4 h-4" />}
                    </button>
                    
                    {isCustomService ? (
                         <input 
                            type="text"
                            className="w-full pr-10 pl-10 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white transition-all animate-in fade-in"
                            placeholder="הקלד שם טיפול..."
                            value={formData.service}
                            onChange={e => setFormData({...formData, service: e.target.value})}
                        />
                    ) : (
                        <div className="relative w-full">
                            <Scissors className="absolute right-3 top-2.5 w-4 h-4 text-gray-400 transform -scale-x-100" />
                            <select 
                                className="w-full pr-10 pl-10 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white appearance-none"
                                value={formData.service}
                                onChange={e => handleServiceChange(e.target.value)}
                            >
                                {Object.keys(SERVICE_PRICES).map(s => (
                                    <option key={s} value={s}>{s}</option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>
            </div>
            <div className="col-span-2 md:col-span-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">מחיר (₪)</label>
                <div className="relative">
                    <CircleDollarSign className="absolute right-3 top-2.5 w-4 h-4 text-gray-400" />
                    <input 
                        type="number"
                        min="0"
                        className="w-full pr-10 pl-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white font-bold text-gray-800"
                        value={formData.price}
                        onChange={e => setFormData({...formData, price: Number(e.target.value)})}
                    />
                </div>
            </div>
          </div>

          {/* Status Field */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">סטטוס תור</label>
            <div className="relative">
                <CheckCircle2 className={`absolute right-3 top-2.5 w-4 h-4 
                    ${formData.status === AppointmentStatus.COMPLETED ? 'text-green-500' : 
                      formData.status === AppointmentStatus.CANCELLED ? 'text-red-500' : 'text-gray-400'}`} 
                />
                <select 
                    className={`w-full pr-10 pl-3 py-2.5 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white appearance-none font-medium
                        ${formData.status === AppointmentStatus.COMPLETED ? 'border-green-200 bg-green-50 text-green-700' : 
                          formData.status === AppointmentStatus.CANCELLED ? 'border-red-200 bg-red-50 text-red-700' : 'border-gray-300'}
                    `}
                    value={formData.status}
                    onChange={e => setFormData({...formData, status: e.target.value as AppointmentStatus})}
                >
                    {Object.values(AppointmentStatus).map(s => (
                        <option key={s} value={s}>{STATUS_LABELS[s] || s}</option>
                    ))}
                </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">הערות</label>
            <textarea
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white resize-none"
                rows={2}
                placeholder="הערות מיוחדות לטיפול..."
                value={formData.notes}
                onChange={e => setFormData({...formData, notes: e.target.value})}
            />
          </div>

          <div className="pt-2 sticky bottom-0 bg-white pb-2">
            {isDeleteConfirmOpen ? (
                 <div className="bg-red-50 p-3 rounded-xl border border-red-100 animate-in fade-in slide-in-from-bottom-2">
                    <div className="flex items-center gap-2 text-red-800 font-bold mb-3 justify-center">
                        <AlertTriangle className="w-4 h-4" />
                        <span>למחוק את התור הזה?</span>
                    </div>
                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={() => setIsDeleteConfirmOpen(false)}
                            className="flex-1 py-2 bg-white border border-red-200 text-gray-700 rounded-lg font-medium hover:bg-red-50 transition-colors"
                        >
                            ביטול
                        </button>
                        <button
                            type="button"
                            onClick={handleDelete}
                            className="flex-1 py-2 bg-red-600 text-white rounded-lg font-bold shadow-sm hover:bg-red-700 transition-colors"
                        >
                            כן, מחק
                        </button>
                    </div>
                 </div>
            ) : (
                <div className="flex gap-3">
                     {isEditMode && onDelete && (
                        <button 
                            type="button"
                            onClick={() => setIsDeleteConfirmOpen(true)}
                            className="px-5 bg-red-50 text-red-500 rounded-xl hover:bg-red-100 transition-colors flex items-center justify-center border border-red-100"
                            title="מחק תור"
                        >
                            <Trash2 className="w-5 h-5" />
                        </button>
                     )}
                    <button 
                        type="submit"
                        className={`flex-1 py-3.5 font-bold rounded-xl shadow-lg transition-all active:scale-95 flex justify-center items-center gap-2
                             ${formData.status === AppointmentStatus.CANCELLED 
                                ? 'bg-red-600 hover:bg-red-700 text-white shadow-red-200' 
                                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-200'
                             }
                        `}
                    >
                        <Calendar className="w-5 h-5" />
                        {isEditMode ? 'עדכן תור' : 'קבע תור'}
                    </button>
                </div>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
