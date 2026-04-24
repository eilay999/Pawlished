
import React, { useState, useEffect } from 'react';
import { X, Calendar, Clock, Scissors, User, CircleDollarSign, Plus, Phone, Dog, History, AlertCircle, PenLine, List, Trash2, AlertTriangle, CheckCircle2, Search } from 'lucide-react';
import { Customer, Appointment, AppointmentStatus } from '../types';
import { APPOINTMENT_DURATION_MINUTES, SERVICE_PRICES } from '../constants';
import { normalizeDigits, normalizePhoneForCompare } from '../utils';

interface AppointmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (appointment: Appointment) => void;
  onUpdateCustomerNotes?: (customerId: string, notes: string) => void;
  onDelete?: (appointmentId: string) => void;
  initialDate?: Date;
  customers: Customer[];
  appointments: Appointment[];
  preSelectedCustomerId?: string;
  onCreateNewCustomer: () => void;
  appointment?: Appointment | null;
}

export const AppointmentModal: React.FC<AppointmentModalProps> = ({ 
  isOpen, 
  onClose, 
  onSave,
  onUpdateCustomerNotes,
  onDelete,
  initialDate, 
  customers,
  appointments,
  preSelectedCustomerId,
  onCreateNewCustomer,
  appointment
}) => {
  const [formData, setFormData] = useState({
      customerId: '',
    date: '',
    time: '07:00',
    service: 'תספורת מלאה',
    price: 250,
    status: AppointmentStatus.SCHEDULED,
    notes: ''
  });
  const [customerNotes, setCustomerNotes] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [isCustomerMenuOpen, setIsCustomerMenuOpen] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  const [isCustomService, setIsCustomService] = useState(false);
  const [showError, setShowError] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  const selectedCustomer = customers.find(c => c.id === formData.customerId);
  const estimatedEndTimeLabel = (() => {
    const dateMatch = String(formData.date || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const timeMatch = String(formData.time || '').match(/^(\d{1,2}):(\d{2})$/);
    if (!dateMatch || !timeMatch) return null;
    const year = Number(dateMatch[1]);
    const month = Number(dateMatch[2]);
    const day = Number(dateMatch[3]);
    const hours = Number(timeMatch[1]);
    const minutes = Number(timeMatch[2]);

    const start = new Date(year, month - 1, day, hours, minutes, 0, 0);
    if (Number.isNaN(start.getTime())) return null;
    const end = new Date(start.getTime() + APPOINTMENT_DURATION_MINUTES * 60 * 1000);
    return end.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  })();
  const formatCustomerOption = (c: Customer) =>
    `${c.name} (${c.petName})${c.lifecycleStatus === 'ON_HOLD' ? ' • בהמתנה' : ''}`;
  const normalizedCustomerSearch = customerSearch.trim().toLowerCase();
  const normalizedCustomerSearchDigits = normalizeDigits(customerSearch);
  const normalizedCustomerPhoneSearch =
    normalizedCustomerSearchDigits.length >= 4 ? normalizePhoneForCompare(normalizedCustomerSearchDigits) : '';
  const filteredCustomers = customers.filter(c => {
    if (!normalizedCustomerSearch) return true;
    const haystack = `${c.name} ${c.petName} ${c.phone} ${c.petType}`.toLowerCase();
    if (haystack.includes(normalizedCustomerSearch)) return true;
    if (!normalizedCustomerPhoneSearch) return false;
    return normalizePhoneForCompare(c.phone).includes(normalizedCustomerPhoneSearch);
  });
  const customerOptions =
    selectedCustomer && !filteredCustomers.some(c => c.id === selectedCustomer.id)
      ? [selectedCustomer, ...filteredCustomers]
      : filteredCustomers;

  const toInputDate = (date: Date) => {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const buildRangeForDateTime = (dateValue: string, timeValue: string) => {
    const dateMatch = String(dateValue || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const timeMatch = String(timeValue || '').match(/^(\d{1,2}):(\d{2})$/);
    if (!dateMatch || !timeMatch) return null;

    const year = Number(dateMatch[1]);
    const month = Number(dateMatch[2]);
    const day = Number(dateMatch[3]);
    const hours = Number(timeMatch[1]);
    const minutes = Number(timeMatch[2]);

    const start = new Date(year, month - 1, day, hours, minutes, 0, 0);
    if (Number.isNaN(start.getTime())) return null;
    const end = new Date(start.getTime() + APPOINTMENT_DURATION_MINUTES * 60 * 1000);
    return { start, end };
  };

  const findScheduleConflict = (range: { start: Date; end: Date }) => {
    const editedAppointmentId = appointment?.id;
    return (
      appointments
        .filter(a => a.status !== AppointmentStatus.CANCELLED)
        .filter(a => (editedAppointmentId ? a.id !== editedAppointmentId : true))
        .map(a => ({
          appointment: a,
          start: new Date(a.date),
          end: new Date(new Date(a.date).getTime() + APPOINTMENT_DURATION_MINUTES * 60 * 1000)
        }))
        .find(other => range.start.getTime() < other.end.getTime() && range.end.getTime() > other.start.getTime()) ||
      null
    );
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
        const editCustomer = customers.find(c => c.id === appointment.customerId);
        setCustomerSearch(editCustomer ? formatCustomerOption(editCustomer) : '');
      } else {
        // Create Mode
        setIsCustomService(false);

        const initialDateValue = initialDate ? toInputDate(initialDate) : toInputDate(new Date());

        setFormData({
            customerId: preSelectedCustomerId || '',
            date: initialDateValue,
            time: '07:00',
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
            setCustomerSearch(cust ? formatCustomerOption(cust) : '');
        } else {
            setCustomerSearch('');
        }
      }
      setShowError(false);
      setScheduleError(null);
      setIsCustomerMenuOpen(false);
    }
  }, [isOpen, initialDate, preSelectedCustomerId, appointment]);

  useEffect(() => {
    if (!isOpen) return;
    if (!formData.date || !formData.time) {
      setScheduleError(null);
      return;
    }

    const range = buildRangeForDateTime(formData.date, formData.time);
    if (!range) {
      setScheduleError(null);
      return;
    }

    const conflict = findScheduleConflict(range);
    if (!conflict) {
      setScheduleError(null);
      return;
    }

    const startLabel = conflict.start.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
    const endLabel = conflict.end.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
    setScheduleError(`השעה תפוסה (יש תור מ-${startLabel} עד ${endLabel}). בחר שעה אחרת.`);
  }, [isOpen, formData.date, formData.time, appointments, appointment?.id]);

  useEffect(() => {
    if (!selectedCustomer) {
      setCustomerNotes('');
      return;
    }
    setCustomerNotes(selectedCustomer.notes || '');
  }, [selectedCustomer?.id]);

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

      setFormData(prev => ({
          ...prev,
          customerId: newCustomerId,
          price: newPrice
      }));
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

    const conflict = findScheduleConflict({
      start: appointmentDate,
      end: new Date(appointmentDate.getTime() + APPOINTMENT_DURATION_MINUTES * 60 * 1000)
    });
    if (conflict) {
      const startLabel = conflict.start.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
      const endLabel = conflict.end.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
      setScheduleError(`השעה תפוסה (יש תור מ-${startLabel} עד ${endLabel}). בחר שעה אחרת.`);
      return;
    }

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

  const isEditMode = Boolean(appointment);

  const STATUS_LABELS: Record<string, string> = {
      [AppointmentStatus.SCHEDULED]: 'נקבע',
      [AppointmentStatus.COMPLETED]: 'בוצע',
      [AppointmentStatus.CANCELLED]: 'בוטל',
      [AppointmentStatus.LATE]: 'לא הגיע'
  };

  return (
    <div className="fixed inset-0 bg-pink-500/20 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
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
            <div className="flex gap-2 items-start">
                <div className="relative flex-1">
                    <Search className="absolute right-3 top-2.5 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={customerSearch}
                      onFocus={() => setIsCustomerMenuOpen(true)}
                      onBlur={() => {
                        setTimeout(() => setIsCustomerMenuOpen(false), 120);
                      }}
                      onChange={e => {
                        const nextValue = e.target.value;
                        setCustomerSearch(nextValue);
                        setIsCustomerMenuOpen(true);
                        if (formData.customerId) {
                          const currentLabel = selectedCustomer ? formatCustomerOption(selectedCustomer) : '';
                          if (nextValue !== currentLabel) {
                            setFormData(prev => ({ ...prev, customerId: '' }));
                          }
                        }
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (customerOptions.length === 1) {
                            const only = customerOptions[0];
                            handleCustomerChange(only.id);
                            setCustomerSearch(formatCustomerOption(only));
                            setIsCustomerMenuOpen(false);
                          }
                        }
                      }}
                      className={`w-full pr-10 pl-3 py-2.5 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white ${showError && !formData.customerId ? 'border-red-500 bg-red-50' : 'border-gray-300'}`}
                      placeholder="חפש ובחר לקוח..."
                    />

                    <User className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />

                    {isCustomerMenuOpen && (
                      <div className="absolute z-30 mt-1 w-full max-h-56 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg">
                        {customerOptions.length === 0 ? (
                          <div className="px-3 py-2 text-sm text-gray-500">לא נמצאו לקוחות</div>
                        ) : (
                          customerOptions.map(c => (
                            <button
                              key={c.id}
                              type="button"
                              onMouseDown={e => e.preventDefault()}
                              onClick={() => {
                                handleCustomerChange(c.id);
                                setCustomerSearch(formatCustomerOption(c));
                                setIsCustomerMenuOpen(false);
                              }}
                              className={`w-full text-right px-3 py-2 text-sm hover:bg-blue-50 transition-colors ${
                                formData.customerId === c.id ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-700'
                              }`}
                            >
                              <div>{c.name}</div>
                              <div className="text-xs text-gray-500">{c.petName} • {c.phone}</div>
                            </button>
                          ))
                        )}
                      </div>
                    )}
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
                    <div className="text-xs text-gray-600">
                        <div className="flex items-center justify-between mb-1"><label className="block text-[11px] font-semibold text-gray-700">הערות לקוח</label><button type="button" className="text-[10px] text-red-500 hover:text-red-600 font-semibold" onClick={() => setCustomerNotes('')} disabled={!customerNotes.trim()}>מחק הערות</button></div>
                        <textarea
                          className="w-full min-h-[70px] px-2.5 py-2 border border-gray-200 rounded-lg bg-white resize-y focus:ring-2 focus:ring-blue-500 outline-none"
                          placeholder="אפשר לכתוב כאן הערות על הלקוח..."
                          value={customerNotes}
                          onChange={e => setCustomerNotes(e.target.value)}
                        />
                    </div>

                    </div>
                    {selectedCustomer.notes && (
                        <div className="text-xs text-gray-600 bg-white border border-gray-200 rounded-lg p-2">
                            <span className="font-semibold text-gray-700">הערות לקוח:</span>{' '}
                            <span className="text-gray-600">{selectedCustomer.notes}</span>
                        </div>
                    )}

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
                onChange={e => {
                  const nextDate = e.target.value;
                  setFormData(previous => ({ ...previous, date: nextDate }));
                }}
              />
            </div>
            
            {/* Time */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">שעה <span className="text-red-500">*</span></label>
              <div className="relative">
                <Clock className="absolute right-3 top-2.5 w-4 h-4 text-gray-400" />
                <input
                  type="time"
                  step={60 * 60}
                  required
                  className="w-full pr-10 pl-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900 shadow-sm font-bold"
                  value={formData.time}
                  onChange={(e) => {
                    setFormData(previous => ({ ...previous, time: e.target.value }));
                  }}
                />
              </div>

              {estimatedEndTimeLabel && (
                <div className="mt-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 flex items-center justify-between text-xs text-gray-700">
                  <span className="font-semibold">סיום משוער (3 שעות)</span>
                  <span className="font-mono text-gray-900">{estimatedEndTimeLabel}</span>
                </div>
              )}
              {scheduleError && (
                <div className="mt-2 text-xs text-red-600 font-medium flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {scheduleError}
                </div>
              )}
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
