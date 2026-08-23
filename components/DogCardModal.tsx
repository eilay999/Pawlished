import React, { useEffect, useState } from 'react';
import {
  X,
  Save,
  Dog as DogIcon,
  User,
  Phone,
  Clock,
  CircleDollarSign,
  Trash2,
  AlertTriangle,
  CalendarClock,
  Scissors,
  Plus,
} from 'lucide-react';
import { Appointment, AppointmentStatus, Customer, Dog, DogSex, DogSize, GroomingRecord } from '../types';
import { analyzeDogStatus } from '../utils';

interface DogCardModalProps {
  isOpen: boolean;
  dog: Dog | null;
  customerId: string;
  customer: Customer | null;
  appointments: Appointment[];
  groomingRecords: GroomingRecord[];
  onClose: () => void;
  onSave: (dog: Dog) => void;
  onDelete?: (dogId: string) => void;
  onOpenGroomingRecord: (appointmentId: string) => void;
}

const FREQUENCY_OPTIONS = [
  { weeks: 2, label: 'שבועיים' },
  { weeks: 4, label: 'חודש' },
  { weeks: 6, label: 'חודש וחצי' },
  { weeks: 8, label: 'חודשיים' },
  { weeks: 10, label: 'חודשיים וחצי' },
  { weeks: 12, label: '3 חודשים' },
];

const SEX_OPTIONS: Array<{ value: DogSex; label: string }> = [
  { value: 'MALE', label: 'זכר' },
  { value: 'FEMALE', label: 'נקבה' },
];

const SIZE_OPTIONS: Array<{ value: DogSize; label: string }> = [
  { value: 'SMALL', label: 'קטן' },
  { value: 'MEDIUM', label: 'בינוני' },
  { value: 'LARGE', label: 'גדול' },
];

const emptyForm = (customerId: string): Partial<Dog> => ({
  customerId,
  name: '',
  breed: '',
  sex: undefined,
  sizeCategory: undefined,
  weightKg: undefined,
  allergies: '',
  medicalNotes: '',
  behaviorNotes: '',
  notes: '',
  visitFrequencyWeeks: 4,
  lifecycleStatus: 'ACTIVE',
  lastVisit: new Date(),
  defaultPrice: undefined,
});

const toInputDate = (date: Date) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const DogCardModal: React.FC<DogCardModalProps> = ({
  isOpen,
  dog,
  customerId,
  customer,
  appointments,
  groomingRecords,
  onClose,
  onSave,
  onDelete,
  onOpenGroomingRecord,
}) => {
  const [formData, setFormData] = useState<Partial<Dog>>(() => emptyForm(customerId));

  useEffect(() => {
    if (dog) {
      setFormData({ ...dog, lastVisit: new Date(dog.lastVisit) });
    } else {
      setFormData(emptyForm(customerId));
    }
  }, [dog, customerId, isOpen]);

  if (!isOpen) return null;

  const redFlagText = [formData.allergies, formData.medicalNotes, formData.behaviorNotes]
    .map(v => v?.trim())
    .filter(Boolean);

  const dogAppointments = dog
    ? appointments
        .filter(a => a.dogId === dog.id)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    : [];

  const analysis = dog ? analyzeDogStatus(dog, appointments) : null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return;

    onSave({
      id: dog?.id || crypto.randomUUID(),
      customerId,
      name: formData.name || '',
      breed: formData.breed?.trim() || undefined,
      sex: formData.sex,
      sizeCategory: formData.sizeCategory,
      weightKg: formData.weightKg,
      allergies: formData.allergies?.trim() || undefined,
      medicalNotes: formData.medicalNotes?.trim() || undefined,
      behaviorNotes: formData.behaviorNotes?.trim() || undefined,
      notes: formData.notes?.trim() || undefined,
      photoUrl: formData.photoUrl,
      visitFrequencyWeeks: Number(formData.visitFrequencyWeeks) || 4,
      lifecycleStatus: formData.lifecycleStatus || 'ACTIVE',
      lastVisit: formData.lastVisit || new Date(),
      defaultPrice: formData.defaultPrice,
    });
  };

  const handleDelete = () => {
    if (!dog || !onDelete) return;
    const confirmed = window.confirm('למחוק את כרטיס הכלב וכל היסטוריית התורים שלו?');
    if (!confirmed) return;
    onDelete(dog.id);
  };

  return (
    <div className="fixed inset-0 bg-pink-500/20 z-[110] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 p-2 rounded-full">
              <DogIcon className="w-5 h-5 text-blue-600" />
            </div>
            <h3 className="font-bold text-xl text-gray-800">
              {dog ? 'כרטיס כלב' : 'כלב חדש'}
            </h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full text-gray-500 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto custom-scrollbar">

          {/* Red-flag banner */}
          {redFlagText.length > 0 && (
            <div className="bg-white p-3 rounded-xl border border-red-100 shadow-sm relative overflow-hidden">
              <span className="absolute top-0 right-0 w-1 h-full bg-red-500" />
              <div className="flex items-center gap-2 mb-1 pr-1">
                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                <h4 className="text-xs font-bold text-red-700 uppercase tracking-wider">שים לב</h4>
              </div>
              <ul className="text-sm text-red-700 space-y-0.5 pr-1">
                {redFlagText.map((text, index) => (
                  <li key={index}>• {text}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Owner */}
          {customer && (
            <div className="border-b border-gray-100 pb-4 flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 text-gray-700 font-medium">
                <User className="w-4 h-4 text-gray-400" />
                {customer.name}
              </div>
              <div className="flex items-center gap-2 text-gray-500">
                <Phone className="w-3.5 h-3.5 text-gray-400" />
                {customer.phone}
              </div>
            </div>
          )}

          {/* Dog info */}
          <div className="space-y-4">
            <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider">פרטי הכלב</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">שם הכלב</label>
                <div className="relative">
                  <DogIcon className="absolute right-3 top-2.5 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    required
                    className="w-full pr-10 pl-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900 transition-all"
                    placeholder="שם הכלב"
                    value={formData.name || ''}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">גזע</label>
                <input
                  type="text"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900 transition-all"
                  placeholder="לדוגמה: פודל טוי"
                  value={formData.breed || ''}
                  onChange={e => setFormData({ ...formData, breed: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">מין</label>
                <div className="grid grid-cols-2 gap-2">
                  {SEX_OPTIONS.map(option => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, sex: option.value })}
                      className={`py-2 px-2 text-sm font-medium rounded-lg transition-all border ${
                        formData.sex === option.value
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-600 border-gray-200 hover:bg-blue-50'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">גודל</label>
                <div className="grid grid-cols-3 gap-2">
                  {SIZE_OPTIONS.map(option => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, sizeCategory: option.value })}
                      className={`py-2 px-1 text-xs font-medium rounded-lg transition-all border ${
                        formData.sizeCategory === option.value
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-600 border-gray-200 hover:bg-blue-50'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">משקל (ק"ג)</label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900 transition-all"
                  value={formData.weightKg ?? ''}
                  onChange={e => setFormData({ ...formData, weightKg: e.target.value ? Number(e.target.value) : undefined })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">מחיר קבוע (אופציונלי)</label>
                <div className="relative">
                  <CircleDollarSign className="absolute right-3 top-2.5 w-4 h-4 text-gray-400" />
                  <input
                    type="number"
                    min="0"
                    className="w-full pr-10 pl-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900 transition-all"
                    value={formData.defaultPrice ?? ''}
                    onChange={e => setFormData({ ...formData, defaultPrice: e.target.value ? Number(e.target.value) : undefined })}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Medical / behavior */}
          <div className="border-t border-gray-100 pt-4 space-y-3">
            <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider">אלרגיות, רגישויות והתנהגות</h4>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">אלרגיות</label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900 transition-all"
                placeholder="לדוגמה: אלרגיה לשמפו מסוים"
                value={formData.allergies || ''}
                onChange={e => setFormData({ ...formData, allergies: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">בעיות רפואיות</label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900 transition-all"
                placeholder="לדוגמה: רגיש באוזן שמאל"
                value={formData.medicalNotes || ''}
                onChange={e => setFormData({ ...formData, medicalNotes: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">הערות התנהגות</label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900 transition-all"
                placeholder="לדוגמה: לא אוהב שנוגעים ברגליים האחוריות"
                value={formData.behaviorNotes || ''}
                onChange={e => setFormData({ ...formData, behaviorNotes: e.target.value })}
              />
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4 space-y-2">
            <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider">הערות כלליות</h4>
            <textarea
              className="w-full min-h-[70px] px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900 transition-all resize-y"
              placeholder="הערות נוספות..."
              value={formData.notes || ''}
              onChange={e => setFormData({ ...formData, notes: e.target.value })}
            />
          </div>

          <div className="border-t border-gray-100 pt-4 space-y-4 bg-blue-50 -mx-6 px-6 py-6 mt-2">
            <h4 className="text-sm font-bold text-blue-800 uppercase tracking-wider flex items-center gap-2">
              <Clock className="w-4 h-4" />
              תזמון ותדירות
            </h4>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">תאריך ביקור אחרון</label>
              <input
                type="date"
                required
                className="w-full px-3 py-2.5 border border-blue-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                value={formData.lastVisit ? toInputDate(formData.lastVisit) : ''}
                onChange={e => {
                  if (e.target.value) setFormData({ ...formData, lastVisit: new Date(e.target.value) });
                }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">כל כמה זמן הכלב מגיע?</label>
              <div className="grid grid-cols-3 gap-2">
                {FREQUENCY_OPTIONS.map(option => (
                  <button
                    key={option.weeks}
                    type="button"
                    onClick={() => setFormData({ ...formData, visitFrequencyWeeks: option.weeks })}
                    className={`py-2 px-2 text-sm font-medium rounded-lg transition-all border ${
                      formData.visitFrequencyWeeks === option.weeks
                        ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                        : 'bg-white text-gray-600 border-blue-100 hover:bg-blue-50'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            {analysis?.nextAppointment && (
              <div className="flex items-center gap-2 text-sm text-blue-800 bg-white/70 rounded-xl px-3 py-2">
                <CalendarClock className="w-4 h-4" />
                תור הבא: {analysis.nextAppointment.toLocaleDateString('he-IL')}
              </div>
            )}
          </div>

          {/* History */}
          {dog && (
            <div className="border-t border-gray-100 pt-4 space-y-2">
              <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider">היסטוריית תורים</h4>
              {dogAppointments.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-3 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                  אין עדיין תורים לכלב הזה
                </p>
              ) : (
                <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                  {dogAppointments.map(a => {
                    const hasRecord = groomingRecords.some(r => r.appointmentId === a.id);
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => onOpenGroomingRecord(a.id)}
                        className="w-full flex items-center justify-between text-xs bg-gray-50 rounded-lg px-3 py-2 hover:bg-blue-50 hover:border-blue-200 border border-transparent transition-colors text-right"
                      >
                        <span className="text-gray-700 font-medium flex items-center gap-1.5">
                          <Scissors className="w-3 h-3 text-gray-400 shrink-0 transform -scale-x-100" />
                          {a.service}
                        </span>
                        <span className="flex items-center gap-2">
                          {hasRecord ? (
                            <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-md">
                              יש פרטי תספורת
                            </span>
                          ) : (
                            <span className="text-[10px] font-medium text-gray-400 flex items-center gap-0.5">
                              <Plus className="w-3 h-3" />
                              הוסף פרטים
                            </span>
                          )}
                          <span className="text-gray-500">
                            {new Date(a.date).toLocaleDateString('he-IL')}
                            {a.status === AppointmentStatus.CANCELLED ? ' (בוטל)' : ''}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-between items-center gap-3">
          {dog && onDelete ? (
            <button
              type="button"
              onClick={handleDelete}
              className="px-4 py-2 text-red-600 font-medium hover:bg-red-50 rounded-xl transition-colors flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              מחק כלב
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
