import React, { useEffect, useMemo, useState } from 'react';
import { X, Search, Dog as DogIcon, Phone, CalendarClock, History } from 'lucide-react';
import { Appointment, Customer, Dog } from '../types';
import { analyzeDogStatus, normalizeDigits, normalizePhoneForCompare } from '../utils';

interface SmartSearchModalProps {
  isOpen: boolean;
  dogs: Dog[];
  customers: Customer[];
  appointments: Appointment[];
  onClose: () => void;
  onOpenDog: (dogId: string) => void;
}

export const SmartSearchModal: React.FC<SmartSearchModalProps> = ({
  isOpen,
  dogs,
  customers,
  appointments,
  onClose,
  onOpenDog
}) => {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (isOpen) setQuery('');
  }, [isOpen]);

  const customersById = useMemo(() => {
    const map = new Map<string, Customer>();
    customers.forEach(c => map.set(c.id, c));
    return map;
  }, [customers]);

  const normalizedQuery = query.trim().toLowerCase();
  const normalizedQueryDigits = normalizeDigits(query);
  const normalizedQueryPhone = normalizedQueryDigits.length >= 4 ? normalizePhoneForCompare(normalizedQueryDigits) : '';

  const results = useMemo(() => {
    if (!normalizedQuery) return [];

    return dogs
      .map(dog => {
        const customer = customersById.get(dog.customerId);
        return { dog, customer };
      })
      .filter(({ dog, customer }) => {
        const haystack = `${dog.name} ${dog.breed || ''} ${customer?.name || ''}`.toLowerCase();
        if (haystack.includes(normalizedQuery)) return true;
        if (normalizedQueryPhone && customer) {
          return normalizePhoneForCompare(customer.phone).includes(normalizedQueryPhone);
        }
        return false;
      })
      .slice(0, 20);
  }, [dogs, customersById, normalizedQuery, normalizedQueryPhone]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-pink-500/20 z-[140] flex items-start justify-center p-4 pt-20 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh]">

        {/* Header / search input */}
        <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center gap-3">
          <Search className="w-5 h-5 text-gray-400 shrink-0" />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="חפש כלב, בעלים או טלפון..."
            className="flex-1 bg-transparent outline-none text-gray-900 placeholder:text-gray-400"
          />
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full text-gray-500 transition-colors shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {!normalizedQuery ? (
            <div className="text-center py-16 text-gray-400">
              <Search className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p className="text-sm">התחילו להקליד כדי לחפש</p>
            </div>
          ) : results.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <p className="text-sm">לא נמצאו תוצאות עבור "{query}"</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {results.map(({ dog, customer }) => {
                const analysis = analyzeDogStatus(dog, appointments);
                return (
                  <button
                    key={dog.id}
                    type="button"
                    onClick={() => {
                      onOpenDog(dog.id);
                      onClose();
                    }}
                    className="w-full text-right p-4 hover:bg-blue-50/40 transition-colors flex items-start gap-3"
                  >
                    <div className="bg-blue-50 p-2 rounded-full shrink-0">
                      <DogIcon className="w-4 h-4 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-gray-800">{dog.name}</span>
                        {dog.breed && <span className="text-xs text-gray-400">({dog.breed})</span>}
                      </div>
                      <div className="text-sm text-gray-600 mt-0.5">{customer?.name || 'בעלים לא ידוע'}</div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-gray-500">
                        {customer?.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3 text-gray-400" />
                            {customer.phone}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <History className="w-3 h-3 text-gray-400" />
                          טיפול אחרון: {analysis.lastEffectiveVisit.toLocaleDateString('he-IL')}
                        </span>
                        {analysis.nextAppointment ? (
                          <span className="flex items-center gap-1 text-emerald-600 font-medium">
                            <CalendarClock className="w-3 h-3" />
                            תור הבא: {analysis.nextAppointment.toLocaleDateString('he-IL')}
                          </span>
                        ) : (
                          <span className="text-gray-400">אין תור עתידי</span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
