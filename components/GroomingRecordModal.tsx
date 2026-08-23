import React, { useEffect, useState } from 'react';
import { X, Save, Scissors, Copy, Trash2, CheckCircle2 } from 'lucide-react';
import { Appointment, Dog, GroomingRecord } from '../types';

interface GroomingRecordModalProps {
  isOpen: boolean;
  appointment: Appointment | null;
  dog: Dog | null;
  record: GroomingRecord | null;
  groomingRecords: GroomingRecord[];
  onClose: () => void;
  onSave: (record: GroomingRecord) => void;
  onDelete?: (recordId: string) => void;
}

type FormState = Pick<
  GroomingRecord,
  'bodyNote' | 'legsNote' | 'faceNote' | 'headNote' | 'tailNote' | 'nailsDone' | 'earsCleaned' | 'note'
>;

const emptyForm: FormState = {
  bodyNote: '',
  legsNote: '',
  faceNote: '',
  headNote: '',
  tailNote: '',
  nailsDone: false,
  earsCleaned: false,
  note: ''
};

export const GroomingRecordModal: React.FC<GroomingRecordModalProps> = ({
  isOpen,
  appointment,
  dog,
  record,
  groomingRecords,
  onClose,
  onSave,
  onDelete
}) => {
  const [formData, setFormData] = useState<FormState>(emptyForm);

  useEffect(() => {
    if (record) {
      setFormData({
        bodyNote: record.bodyNote || '',
        legsNote: record.legsNote || '',
        faceNote: record.faceNote || '',
        headNote: record.headNote || '',
        tailNote: record.tailNote || '',
        nailsDone: record.nailsDone,
        earsCleaned: record.earsCleaned,
        note: record.note || ''
      });
    } else {
      setFormData(emptyForm);
    }
  }, [record, isOpen]);

  if (!isOpen || !appointment || !dog) return null;

  const previousRecord = groomingRecords
    .filter(r => r.dogId === dog.id && r.id !== record?.id)
    .sort((a, b) => b.visitDate.getTime() - a.visitDate.getTime())[0];

  const handleCopyPrevious = () => {
    if (!previousRecord) return;
    setFormData({
      bodyNote: previousRecord.bodyNote || '',
      legsNote: previousRecord.legsNote || '',
      faceNote: previousRecord.faceNote || '',
      headNote: previousRecord.headNote || '',
      tailNote: previousRecord.tailNote || '',
      nailsDone: previousRecord.nailsDone,
      earsCleaned: previousRecord.earsCleaned,
      note: previousRecord.note || ''
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      id: record?.id || crypto.randomUUID(),
      dogId: dog.id,
      appointmentId: appointment.id,
      visitDate: appointment.date,
      bodyNote: formData.bodyNote?.trim() || undefined,
      legsNote: formData.legsNote?.trim() || undefined,
      faceNote: formData.faceNote?.trim() || undefined,
      headNote: formData.headNote?.trim() || undefined,
      tailNote: formData.tailNote?.trim() || undefined,
      nailsDone: formData.nailsDone,
      earsCleaned: formData.earsCleaned,
      note: formData.note?.trim() || undefined
    });
  };

  const handleDelete = () => {
    if (!record || !onDelete) return;
    const confirmed = window.confirm('למחוק את פרטי התספורת של הביקור הזה?');
    if (!confirmed) return;
    onDelete(record.id);
  };

  return (
    <div className="fixed inset-0 bg-pink-500/20 z-[120] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 p-2 rounded-full">
              <Scissors className="w-5 h-5 text-blue-600 transform -scale-x-100" />
            </div>
            <div>
              <h3 className="font-bold text-xl text-gray-800">פרטי תספורת</h3>
              <p className="text-xs text-gray-500">
                {dog.name} • {new Date(appointment.date).toLocaleDateString('he-IL')}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full text-gray-500 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto custom-scrollbar">
          {previousRecord && (
            <button
              type="button"
              onClick={handleCopyPrevious}
              className="w-full flex items-center justify-center gap-2 text-sm font-bold text-blue-700 bg-blue-50 border border-blue-100 rounded-xl py-2.5 hover:bg-blue-100 transition-colors"
            >
              <Copy className="w-4 h-4" />
              העתק תספורת קודמת
            </button>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">גוף</label>
              <input
                type="text"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900 transition-all"
                placeholder="לדוגמה: מסרק 13 מ&quot;מ"
                value={formData.bodyNote}
                onChange={e => setFormData({ ...formData, bodyNote: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">רגליים</label>
              <input
                type="text"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900 transition-all"
                placeholder="לדוגמה: מספריים"
                value={formData.legsNote}
                onChange={e => setFormData({ ...formData, legsNote: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">פנים</label>
              <input
                type="text"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900 transition-all"
                placeholder="לדוגמה: פנים עגולות"
                value={formData.faceNote}
                onChange={e => setFormData({ ...formData, faceNote: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ראש</label>
              <input
                type="text"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900 transition-all"
                placeholder="לדוגמה: מספריים"
                value={formData.headNote}
                onChange={e => setFormData({ ...formData, headNote: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">זנב</label>
              <input
                type="text"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900 transition-all"
                placeholder="לדוגמה: קיצור קל"
                value={formData.tailNote}
                onChange={e => setFormData({ ...formData, tailNote: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setFormData({ ...formData, nailsDone: !formData.nailsDone })}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border font-medium text-sm transition-all ${
                formData.nailsDone
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              ציפורניים בוצע
            </button>
            <button
              type="button"
              onClick={() => setFormData({ ...formData, earsCleaned: !formData.earsCleaned })}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border font-medium text-sm transition-all ${
                formData.earsCleaned
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              אוזניים נוקו
            </button>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">הערה לפעם הבאה</label>
            <textarea
              className="w-full min-h-[80px] px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900 transition-all resize-y"
              placeholder="לדוגמה: הבעלים ביקש שנשאיר את הראש קצת יותר ארוך"
              value={formData.note}
              onChange={e => setFormData({ ...formData, note: e.target.value })}
            />
          </div>
        </form>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-between items-center gap-3">
          {record && onDelete ? (
            <button
              type="button"
              onClick={handleDelete}
              className="px-4 py-2 text-red-600 font-medium hover:bg-red-50 rounded-xl transition-colors flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              מחק
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
            שמור
          </button>
        </div>
      </div>
    </div>
  );
};
