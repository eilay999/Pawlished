import React, { useMemo, useState } from 'react';
import { BookOpen, Download, FolderArchive, Paperclip, Plus, Trash2 } from 'lucide-react';
import { Appointment, Customer, Dog, TaxSettings } from '../types';
import {
  EXPENSE_CATEGORIES,
  availableYears,
  buildExpenseRows,
  buildReceiptRows,
  buildRefundRows,
  expensesToCsv,
  normalizeExpense,
  normalizeRefund,
  profitToCsv,
  refundsToCsv,
  rowsToCsv,
  sumBy,
  yearlyProfit
} from '../services/reports.js';

export interface BookkeepingActions {
  onSaveExpense: (expense: Record<string, unknown>, file: { name: string; dataBase64: string } | null) => Promise<void>;
  onDeleteExpense: (expenseId: string) => Promise<void>;
  onSaveRefund: (refund: Record<string, unknown>) => Promise<void>;
  onDeleteRefund: (refundId: string) => Promise<void>;
  onGetReceiptUrl: (expenseId: string) => Promise<string>;
}

interface BooksSectionProps {
  appointments: Appointment[];
  customers: Customer[];
  dogs: Dog[];
  taxSettings: TaxSettings;
  expenses: Record<string, unknown>[];
  refunds: Record<string, unknown>[];
  actions: BookkeepingActions;
}

type Tab = 'PROFIT' | 'EXPENSES' | 'REFUNDS';

const MAX_FILE_BYTES = 3 * 1024 * 1024;

const money = (value: number) =>
  `₪${Number(value).toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const dateLabel = (date: Date) =>
  new Intl.DateTimeFormat('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);

const todayInput = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const MONTH_NAMES = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const csvBlob = (csv: string) => new Blob([csv], { type: 'text/csv;charset=utf-8' });

const readBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
    reader.onerror = () => reject(new Error('קריאת הקובץ נכשלה.'));
    reader.readAsDataURL(file);
  });

const inputClass =
  'w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300';

export const BooksSection: React.FC<BooksSectionProps> = ({
  appointments,
  customers,
  dogs,
  taxSettings,
  expenses: rawExpenses,
  refunds: rawRefunds,
  actions
}) => {
  const now = useMemo(() => new Date(), []);
  const [tab, setTab] = useState<Tab>('PROFIT');
  const [year, setYear] = useState(now.getFullYear());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const expenses = useMemo(() => rawExpenses.map(normalizeExpense), [rawExpenses]);
  const refunds = useMemo(() => rawRefunds.map(normalizeRefund), [rawRefunds]);

  const years = useMemo(() => {
    const set = new Set<number>(availableYears(appointments, now));
    [...expenses, ...refunds].forEach((row) => {
      const y = row.date.getFullYear();
      if (!Number.isNaN(y)) set.add(y);
    });
    return Array.from(set).sort((a, b) => b - a);
  }, [appointments, expenses, refunds, now]);

  const from = useMemo(() => new Date(year, 0, 1), [year]);
  const to = useMemo(() => new Date(year, 11, 31, 23, 59, 59, 999), [year]);
  const yearExpenses = useMemo(() => buildExpenseRows({ expenses, from, to }), [expenses, from, to]);
  const yearRefunds = useMemo(() => buildRefundRows({ refunds, from, to }), [refunds, from, to]);
  const profit = useMemo(
    () => yearlyProfit({ appointments, customers, dogs, expenses, refunds, year, tax: taxSettings }),
    [appointments, customers, dogs, expenses, refunds, year, taxSettings]
  );

  const run = async (task: () => Promise<void>, success: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await task();
      setMessage({ kind: 'ok', text: success });
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'הפעולה נכשלה. נסה שוב.' });
    } finally {
      setBusy(false);
    }
  };

  // --- expense form ---
  const [expDate, setExpDate] = useState(todayInput());
  const [expCategory, setExpCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [expVendor, setExpVendor] = useState('');
  const [expDesc, setExpDesc] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expVat, setExpVat] = useState('');
  const [expFile, setExpFile] = useState<File | null>(null);
  const licensed = taxSettings.taxStatus === 'LICENSED';

  const submitExpense = (event: React.FormEvent) => {
    event.preventDefault();
    if (expFile && expFile.size > MAX_FILE_BYTES) {
      setMessage({ kind: 'error', text: 'הקובץ גדול מ־3MB. צמצם/י אותו ונסה שוב.' });
      return;
    }
    void run(async () => {
      const file = expFile ? { name: expFile.name, dataBase64: await readBase64(expFile) } : null;
      await actions.onSaveExpense(
        {
          id: crypto.randomUUID(),
          date: expDate,
          category: expCategory,
          vendor: expVendor,
          description: expDesc,
          amount: Number(expAmount),
          vatAmount: expVat ? Number(expVat) : 0
        },
        file
      );
      setExpVendor('');
      setExpDesc('');
      setExpAmount('');
      setExpVat('');
      setExpFile(null);
    }, 'ההוצאה נשמרה.');
  };

  // --- refund form ---
  const [refDate, setRefDate] = useState(todayInput());
  const [refCustomer, setRefCustomer] = useState('');
  const [refAmount, setRefAmount] = useState('');
  const [refReason, setRefReason] = useState('');

  const submitRefund = (event: React.FormEvent) => {
    event.preventDefault();
    void run(async () => {
      await actions.onSaveRefund({
        id: crypto.randomUUID(),
        date: refDate,
        customerName: refCustomer,
        amount: Number(refAmount),
        reason: refReason
      });
      setRefCustomer('');
      setRefAmount('');
      setRefReason('');
    }, 'ההחזר נשמר.');
  };

  const confirmAndDelete = (label: string, task: () => Promise<void>) => {
    if (!window.confirm(`למחוק ${label}? אי אפשר לשחזר.`)) return;
    void run(task, 'נמחק.');
  };

  const openReceipt = (id: string) =>
    void run(async () => {
      const url = await actions.onGetReceiptUrl(id);
      if (!url) throw new Error('לא נמצא קישור לקבלה.');
      window.open(url, '_blank', 'noopener');
    }, 'הקבלה נפתחה בלשונית חדשה (הקישור תקף ל־2 דקות).');

  // "Folder" export: one ZIP with a folder per year, tables inside.
  const exportYearFolder = (targetYear: number) =>
    void run(async () => {
      const { default: JSZip } = await import('jszip');
      const yFrom = new Date(targetYear, 0, 1);
      const yTo = new Date(targetYear, 11, 31, 23, 59, 59, 999);
      const incomeRows = buildReceiptRows({ appointments, customers, dogs, from: yFrom, to: yTo, tax: taxSettings });
      const summary = yearlyProfit({ appointments, customers, dogs, expenses, refunds, year: targetYear, tax: taxSettings });
      const zip = new JSZip();
      const folder = zip.folder(String(targetYear));
      if (!folder) throw new Error('יצירת הקובץ נכשלה.');
      folder.file('הכנסות-וקבלות.csv', rowsToCsv(incomeRows, taxSettings));
      folder.file('הוצאות.csv', expensesToCsv(buildExpenseRows({ expenses, from: yFrom, to: yTo })));
      folder.file('החזרים.csv', refundsToCsv(buildRefundRows({ refunds, from: yFrom, to: yTo })));
      folder.file('סיכום-חודשי.csv', profitToCsv(summary, targetYear));
      const blob = await zip.generateAsync({ type: 'blob' });
      downloadBlob(blob, `Pawlished-${targetYear}.zip`);
    }, `תיקיית ${year} ירדה כקובץ ZIP. פתח/י אותה ואז גרור/י ל־Google Drive לתיקיית Pawlished.`);

  const tabButton = (key: Tab, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === key}
      onClick={() => setTab(key)}
      className={`px-4 py-2 rounded-xl text-sm font-semibold border transition ${
        tab === key ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
      }`}
    >
      {label}
    </button>
  );

  const th = 'px-3 py-2 text-right font-semibold text-gray-700 bg-gray-50 whitespace-nowrap';
  const td = 'px-3 py-2 text-gray-800 whitespace-nowrap';

  return (
    <section className="rounded-2xl bg-white border border-gray-200 p-5 shadow-sm space-y-4" aria-labelledby="books-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-blue-600" aria-hidden="true" />
          <h2 id="books-heading" className="text-lg font-bold text-gray-900">
            הנהלת חשבונות לפי שנה
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="books-year" className="text-sm text-gray-700">
            שנה
          </label>
          <select id="books-year" value={year} onChange={(e) => setYear(Number(e.target.value))} className={`${inputClass} w-auto`}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy}
            onClick={() => exportYearFolder(year)}
            className="inline-flex items-center gap-2 rounded-xl bg-gray-900 text-white px-4 py-2 text-sm font-semibold hover:bg-gray-800 disabled:opacity-60"
          >
            <FolderArchive className="w-4 h-4" aria-hidden="true" />
            ייצוא תיקיית {year} (ZIP)
          </button>
        </div>
      </div>

      {message && (
        <div
          role={message.kind === 'error' ? 'alert' : 'status'}
          className={`rounded-xl border px-4 py-3 text-sm ${
            message.kind === 'error' ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          }`}
        >
          {message.text}
        </div>
      )}

      <div role="tablist" aria-label="סוג טבלה" className="flex flex-wrap gap-2">
        {tabButton('PROFIT', 'סיכום שנתי')}
        {tabButton('EXPENSES', `הוצאות (${yearExpenses.length})`)}
        {tabButton('REFUNDS', `החזרים (${yearRefunds.length})`)}
      </div>

      {tab === 'PROFIT' && (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm border border-gray-200 rounded-xl overflow-hidden">
            <caption className="sr-only">סיכום חודשי לשנת {year}</caption>
            <thead>
              <tr>
                <th scope="col" className={th}>חודש</th>
                <th scope="col" className={th}>הכנסות</th>
                <th scope="col" className={th}>החזרים</th>
                <th scope="col" className={th}>הוצאות</th>
                <th scope="col" className={th}>רווח</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {profit.months.map((m) => (
                <tr key={m.month}>
                  <th scope="row" className={`${td} text-right font-medium`}>{MONTH_NAMES[m.month - 1]}</th>
                  <td className={td}>{money(m.income)}</td>
                  <td className={td}>{money(m.refunds)}</td>
                  <td className={td}>{money(m.expenses)}</td>
                  <td className={`${td} font-semibold ${m.profit < 0 ? 'text-rose-700' : ''}`}>{money(m.profit)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 font-bold">
                <th scope="row" className={`${td} text-right`}>סה״כ {year}</th>
                <td className={td}>{money(profit.totals.income)}</td>
                <td className={td}>{money(profit.totals.refunds)}</td>
                <td className={td}>{money(profit.totals.expenses)}</td>
                <td className={`${td} ${profit.totals.profit < 0 ? 'text-rose-700' : ''}`}>{money(profit.totals.profit)}</td>
              </tr>
            </tfoot>
          </table>
          <p className="mt-2 text-xs text-gray-600">
            הכנסות = טיפולים שהושלמו + דמי ביטול שנגבו{licensed ? ' (לפני מע״מ)' : ''}. זה כלי עזר — הדוח הרשמי מכין רואה החשבון.
          </p>
          <button
            type="button"
            onClick={() => downloadBlob(csvBlob(profitToCsv(profit, year)), `pawlished-summary-${year}.csv`)}
            className="mt-2 inline-flex items-center gap-2 text-sm text-blue-700 underline"
          >
            <Download className="w-4 h-4" aria-hidden="true" /> הורד סיכום (CSV)
          </button>
        </div>
      )}

      {tab === 'EXPENSES' && (
        <div className="space-y-4">
          <form onSubmit={submitExpense} className="grid grid-cols-1 md:grid-cols-3 gap-3 rounded-xl border border-gray-200 p-4">
            <div>
              <label htmlFor="exp-date" className="block text-xs font-medium text-gray-700 mb-1">תאריך</label>
              <input id="exp-date" type="date" required value={expDate} onChange={(e) => setExpDate(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="exp-cat" className="block text-xs font-medium text-gray-700 mb-1">קטגוריה</label>
              <select id="exp-cat" value={expCategory} onChange={(e) => setExpCategory(e.target.value)} className={inputClass}>
                {EXPENSE_CATEGORIES.map((c: string) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="exp-vendor" className="block text-xs font-medium text-gray-700 mb-1">ספק</label>
              <input id="exp-vendor" maxLength={120} value={expVendor} onChange={(e) => setExpVendor(e.target.value)} className={inputClass} />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="exp-desc" className="block text-xs font-medium text-gray-700 mb-1">תיאור</label>
              <input id="exp-desc" maxLength={300} value={expDesc} onChange={(e) => setExpDesc(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="exp-amount" className="block text-xs font-medium text-gray-700 mb-1">סכום כולל (₪)</label>
              <input id="exp-amount" type="number" required min="0.01" step="0.01" inputMode="decimal" value={expAmount} onChange={(e) => setExpAmount(e.target.value)} className={inputClass} />
            </div>
            {licensed && (
              <div>
                <label htmlFor="exp-vat" className="block text-xs font-medium text-gray-700 mb-1">מתוכו מע״מ (₪)</label>
                <input id="exp-vat" type="number" min="0" step="0.01" inputMode="decimal" value={expVat} onChange={(e) => setExpVat(e.target.value)} className={inputClass} />
              </div>
            )}
            <div className="md:col-span-2">
              <label htmlFor="exp-file" className="block text-xs font-medium text-gray-700 mb-1">קבלה / חשבונית (JPG, PNG, PDF עד 3MB)</label>
              <input id="exp-file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setExpFile(e.target.files?.[0] || null)} className="block w-full text-sm" />
            </div>
            <div className="md:col-span-3">
              <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 text-white px-4 py-2 text-sm font-semibold hover:bg-blue-700 disabled:opacity-60">
                <Plus className="w-4 h-4" aria-hidden="true" /> הוסף הוצאה
              </button>
            </div>
          </form>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm border border-gray-200 rounded-xl overflow-hidden">
              <caption className="sr-only">הוצאות {year}</caption>
              <thead>
                <tr>
                  <th scope="col" className={th}>תאריך</th>
                  <th scope="col" className={th}>קטגוריה</th>
                  <th scope="col" className={th}>ספק</th>
                  <th scope="col" className={th}>תיאור</th>
                  <th scope="col" className={th}>סכום</th>
                  <th scope="col" className={th}>קבלה</th>
                  <th scope="col" className={th}><span className="sr-only">פעולות</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {yearExpenses.length === 0 && (
                  <tr><td colSpan={7} className="px-3 py-4 text-center text-gray-600">אין הוצאות בשנה הזו.</td></tr>
                )}
                {yearExpenses.map((e) => (
                  <tr key={e.id}>
                    <td className={td}>{dateLabel(e.date)}</td>
                    <td className={td}>{e.category}</td>
                    <td className={td}>{e.vendor}</td>
                    <td className={td}>{e.description}</td>
                    <td className={td}>{money(e.amount)}</td>
                    <td className={td}>
                      {e.receiptPath ? (
                        <button type="button" onClick={() => openReceipt(e.id)} className="inline-flex items-center gap-1 text-blue-700 underline">
                          <Paperclip className="w-4 h-4" aria-hidden="true" /> פתח
                        </button>
                      ) : (
                        <span className="text-gray-500">—</span>
                      )}
                    </td>
                    <td className={td}>
                      <button
                        type="button"
                        aria-label={`מחק הוצאה ${e.description || e.vendor || e.category}`}
                        onClick={() => confirmAndDelete('את ההוצאה', () => actions.onDeleteExpense(e.id))}
                        className="text-rose-700 hover:text-rose-900"
                      >
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-bold">
                  <th scope="row" colSpan={4} className={`${td} text-right`}>סה״כ</th>
                  <td className={td}>{money(sumBy(yearExpenses, 'amount'))}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
          <button
            type="button"
            onClick={() => downloadBlob(csvBlob(expensesToCsv(yearExpenses)), `pawlished-expenses-${year}.csv`)}
            className="inline-flex items-center gap-2 text-sm text-blue-700 underline"
          >
            <Download className="w-4 h-4" aria-hidden="true" /> הורד הוצאות (CSV)
          </button>
        </div>
      )}

      {tab === 'REFUNDS' && (
        <div className="space-y-4">
          <form onSubmit={submitRefund} className="grid grid-cols-1 md:grid-cols-4 gap-3 rounded-xl border border-gray-200 p-4">
            <div>
              <label htmlFor="ref-date" className="block text-xs font-medium text-gray-700 mb-1">תאריך</label>
              <input id="ref-date" type="date" required value={refDate} onChange={(e) => setRefDate(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="ref-customer" className="block text-xs font-medium text-gray-700 mb-1">לקוח</label>
              <input id="ref-customer" maxLength={120} value={refCustomer} onChange={(e) => setRefCustomer(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="ref-amount" className="block text-xs font-medium text-gray-700 mb-1">סכום (₪)</label>
              <input id="ref-amount" type="number" required min="0.01" step="0.01" inputMode="decimal" value={refAmount} onChange={(e) => setRefAmount(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="ref-reason" className="block text-xs font-medium text-gray-700 mb-1">סיבה</label>
              <input id="ref-reason" maxLength={300} value={refReason} onChange={(e) => setRefReason(e.target.value)} className={inputClass} />
            </div>
            <div className="md:col-span-4">
              <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 text-white px-4 py-2 text-sm font-semibold hover:bg-blue-700 disabled:opacity-60">
                <Plus className="w-4 h-4" aria-hidden="true" /> הוסף החזר
              </button>
            </div>
          </form>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm border border-gray-200 rounded-xl overflow-hidden">
              <caption className="sr-only">החזרים {year}</caption>
              <thead>
                <tr>
                  <th scope="col" className={th}>תאריך</th>
                  <th scope="col" className={th}>לקוח</th>
                  <th scope="col" className={th}>סכום</th>
                  <th scope="col" className={th}>סיבה</th>
                  <th scope="col" className={th}><span className="sr-only">פעולות</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {yearRefunds.length === 0 && (
                  <tr><td colSpan={5} className="px-3 py-4 text-center text-gray-600">אין החזרים בשנה הזו.</td></tr>
                )}
                {yearRefunds.map((r) => (
                  <tr key={r.id}>
                    <td className={td}>{dateLabel(r.date)}</td>
                    <td className={td}>{r.customerName}</td>
                    <td className={td}>{money(r.amount)}</td>
                    <td className={td}>{r.reason}</td>
                    <td className={td}>
                      <button
                        type="button"
                        aria-label={`מחק החזר ${r.customerName}`}
                        onClick={() => confirmAndDelete('את ההחזר', () => actions.onDeleteRefund(r.id))}
                        className="text-rose-700 hover:text-rose-900"
                      >
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-bold">
                  <th scope="row" colSpan={2} className={`${td} text-right`}>סה״כ</th>
                  <td className={td}>{money(sumBy(yearRefunds, 'amount'))}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
          <button
            type="button"
            onClick={() => downloadBlob(csvBlob(refundsToCsv(yearRefunds)), `pawlished-refunds-${year}.csv`)}
            className="inline-flex items-center gap-2 text-sm text-blue-700 underline"
          >
            <Download className="w-4 h-4" aria-hidden="true" /> הורד החזרים (CSV)
          </button>
        </div>
      )}
    </section>
  );
};
