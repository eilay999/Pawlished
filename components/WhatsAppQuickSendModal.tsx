import React, { useEffect, useState } from 'react';
import { X, Send, MessageCircle, AlertCircle, CalendarClock, PackageCheck, Wallet, CalendarX2, CalendarPlus, Star } from 'lucide-react';
import { Appointment, Customer, Dog } from '../types';

interface WhatsAppQuickSendModalProps {
  isOpen: boolean;
  customer: Customer | null;
  dog?: Dog | null;
  nextAppointment?: Appointment | null;
  onClose: () => void;
  onSend: (phone: string, body: string) => Promise<void>;
}

const BUSINESS_NAME = 'פוליש';

export const WhatsAppQuickSendModal: React.FC<WhatsAppQuickSendModalProps> = ({
  isOpen,
  customer,
  dog,
  nextAppointment,
  onClose,
  onSend
}) => {
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setDraft('');
      setSendError(null);
    }
  }, [isOpen, customer?.id, dog?.id]);

  if (!isOpen || !customer) return null;

  const dogName = dog?.name || customer.petName || 'הכלב';
  const apptLabel = nextAppointment
    ? `${new Date(nextAppointment.date).toLocaleDateString('he-IL')} בשעה ${new Date(nextAppointment.date).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`
    : null;

  const templates = [
    {
      label: 'תזכורת לתור',
      icon: CalendarClock,
      text: apptLabel
        ? `שלום ${customer.name} 😊 תזכורת לתור של ${dogName} ב-${apptLabel} במספרת ${BUSINESS_NAME}.`
        : `שלום ${customer.name} 😊 תזכורת שיש תור קרוב ל-${dogName} במספרת ${BUSINESS_NAME}.`
    },
    {
      label: 'הכלב מוכן',
      icon: PackageCheck,
      text: `${dogName} מוכן/ה לאיסוף! אפשר להגיע מתי שנוח 🐾`
    },
    {
      label: 'בקשת תשלום',
      icon: Wallet,
      text: `שלום ${customer.name}, יש יתרה לתשלום עבור הטיפול של ${dogName}. אפשר להעביר כשנוח, תודה!`
    },
    {
      label: 'ביטול תור',
      icon: CalendarX2,
      text: apptLabel
        ? `היי ${customer.name}, התור של ${dogName} ב-${apptLabel} בוטל. נשמח לקבוע תור חדש כשנוח.`
        : `היי ${customer.name}, התור של ${dogName} בוטל. נשמח לקבוע תור חדש כשנוח.`
    },
    {
      label: 'קביעת תור חדש',
      icon: CalendarPlus,
      text: `שלום ${customer.name}, רוצים לקבוע תור חדש ל-${dogName}? תגידו לי מתי נוח ואשריין 😊`
    },
    {
      label: 'בקשה לביקורת',
      icon: Star,
      text: `תודה שהגעתם עם ${dogName}! נשמח מאוד אם תוכלו להשאיר לנו ביקורת קטנה 🐾`
    }
  ];

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || isSending) return;
    setIsSending(true);
    setSendError(null);
    try {
      await onSend(customer.phone, text);
      onClose();
    } catch (error) {
      setSendError(error instanceof Error ? error.message : 'שליחת הודעה נכשלה.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-pink-500/20 z-[130] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-100 p-2 rounded-full">
              <MessageCircle className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h3 className="font-bold text-xl text-gray-800">שליחת WhatsApp</h3>
              <p className="text-xs text-gray-500">{customer.name} • {customer.phone}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full text-gray-500 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto custom-scrollbar">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">הודעות מוכנות</label>
            <div className="grid grid-cols-2 gap-2">
              {templates.map(template => (
                <button
                  key={template.label}
                  type="button"
                  onClick={() => setDraft(template.text)}
                  className="flex items-center gap-2 text-xs font-medium text-gray-700 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 hover:border-emerald-300 hover:bg-emerald-50 transition-colors text-right"
                >
                  <template.icon className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  {template.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">תוכן ההודעה</label>
            <textarea
              className="w-full min-h-[110px] px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none bg-white text-gray-900 transition-all resize-y"
              placeholder="בחר/י תבנית למעלה או כתוב/י הודעה..."
              value={draft}
              onChange={e => setDraft(e.target.value)}
            />
          </div>

          {sendError && (
            <div className="flex items-center gap-2 text-xs text-red-600 font-medium">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {sendError}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 text-gray-600 font-medium hover:bg-gray-200 rounded-xl transition-colors"
          >
            בטל
          </button>
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={!draft.trim() || isSending}
            className="px-8 py-2.5 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 shadow-lg shadow-emerald-200 transition-all active:scale-95 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" />
            {isSending ? 'שולח…' : 'שלח'}
          </button>
        </div>
      </div>
    </div>
  );
};
