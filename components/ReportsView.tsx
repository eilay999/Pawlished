import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileText, Printer } from 'lucide-react';
import { Appointment, Customer, Dog, TaxSettings } from '../types';
import {
  availableYears,
  buildPrintableHtml,
  buildReceiptRows,
  ceilingStatus,
  monthlySummary,
  rowsToCsv,
  summarizeRows,
  trailingTurnover
} from '../services/reports.js';

interface ReportsViewProps {
  appointments: Appointment[];
  customers: Customer[];
  dogs: Dog[];
  taxSettings: TaxSettings;
  onSaveTaxSettings: (payload: Partial<TaxSettings>) => Promise<void>;
}

type RangeKey = 'THIS_MONTH' | 'LAST_MONTH' | 'THIS_YEAR' | 'LAST_12' | 'CUSTOM';

const RANGE_LABELS: Array<{ key: RangeKey; label: string }> = [
  { key: 'THIS_MONTH', label: 'החודש' },
  { key: 'LAST_MONTH', label: 'חודש קודם' },
  { key: 'THIS_YEAR', label: 'השנה' },
  { key: 'LAST_12', label: '12 חודשים אחרונים' },
  { key: 'CUSTOM', label: 'טווח מותאם' }
];

const toInputDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const startOfDay = (value: string) => new Date(`${value}T00:00:00`);
const endOfDay = (value: string) => new Date(`${value}T23:59:59.999`);

const presetRange = (key: RangeKey, now: Date): { from: Date; to: Date } => {
  const year = now.getFullYear();
  const month = now.getMonth();
  switch (key) {
    case 'LAST_MONTH':
      return { from: new Date(year, month - 1, 1), to: new Date(year, month, 0, 23, 59, 59, 999) };
    case 'THIS_YEAR':
      return { from: new Date(year, 0, 1), to: new Date(year, 11, 31, 23, 59, 59, 999) };
    case 'LAST_12':
      return { from: new Date(year - 1, month, now.getDate() + 1), to: now };
    default:
      return { from: new Date(year, month, 1), to: new Date(year, month + 1, 0, 23, 59, 59, 999) };
  }
};

const money = (value: number) =>
  `₪${Number(value).toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const dateLabel = (date: Date) =>
  new Intl.DateTimeFormat('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);

export const ReportsView: React.FC<ReportsViewProps> = ({
  appointments,
  customers,
  dogs,
  taxSettings,
  onSaveTaxSettings
}) => {
  const now = useMemo(() => new Date(), []);
  const [rangeKey, setRangeKey] = useState<RangeKey>('THIS_MONTH');
  const [customFrom, setCustomFrom] = useState(toInputDate(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [customTo, setCustomTo] = useState(toInputDate(now));
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [ceilingInput, setCeilingInput] = useState(String(taxSettings.exemptCeiling));
  const [vatInput, setVatInput] = useState(String(Math.round(taxSettings.vatRate * 100)));
  const [confirmingSwitch, setConfirmingSwitch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const licensed = taxSettings.taxStatus === 'LICENSED';

  const range = useMemo(() => {
    if (rangeKey === 'CUSTOM') {
      return { from: startOfDay(customFrom), to: endOfDay(customTo) };
    }
    return presetRange(rangeKey, now);
  }, [rangeKey, customFrom, customTo, now]);

  const rows = useMemo(
    () => buildReceiptRows({ appointments, customers, dogs, from: range.from, to: range.to, tax: taxSettings }),
    [appointments, customers, dogs, range, taxSettings]
  );
  const totals = useMemo(() => summarizeRows(rows), [rows]);

  const years = useMemo(() => availableYears(appointments, now), [appointments, now]);
  const yearMonths = useMemo(
    () => monthlySummary({ appointments, customers, dogs, year: selectedYear, tax: taxSettings }),
    [appointments, customers, dogs, selectedYear, taxSettings]
  );
  const yearTotals = useMemo(
    () =>
      yearMonths.reduce(
        (acc, month) => ({
          count: acc.count + month.count,
          gross: acc.gross + month.gross,
          net: acc.net + month.net,
          vat: acc.vat + month.vat
        }),
        { count: 0, gross: 0, net: 0, vat: 0 }
      ),
    [yearMonths]
  );
  const turnover = useMemo(() => trailingTurnover({ appointments, now }), [appointments, now]);
  const ceiling = ceilingStatus(turnover, taxSettings.exemptCeiling);

  const save = async (payload: Partial<TaxSettings>, success: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await onSaveTaxSettings(payload);
      setMessage({ kind: 'ok', text: success });
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'השמירה נכשלה. נסה שוב.' });
    } finally {
      setBusy(false);
    }
  };

  const handleExportCsv = () => {
    const csv = rowsToCsv(rows, taxSettings);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `pawlished-receipts-${toInputDate(range.from)}_${toInputDate(range.to)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // "Save as PDF": opens a clean print view; choose "Save as PDF" in the browser print dialog.
  const handlePrint = () => {
    const html = buildPrintableHtml({
      rows,
      tax: taxSettings,
      fromLabel: dateLabel(range.from),
      toLabel: dateLabel(range.to)
    });
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      setMessage({ kind: 'error', text: 'הדפדפן חסם את החלון. אפשר חלונות קופצים לאתר ונסה שוב.' });
      return;
    }
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    window.setTimeout(() => printWindow.print(), 300);
  };

  const barColor = ceiling.level === 'over' ? 'bg-rose-600' : ceiling.level === 'warn' ? 'bg-amber-500' : 'bg-emerald-500';

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-8 bg-gray-50" dir="rtl">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="flex items-center gap-3">
          <FileText className="w-7 h-7 text-blue-600" aria-hidden="true" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">דוחות וקבלות</h1>
            <p className="text-sm text-gray-600">
              הכנסות לפי תקופה, ייצוא לרואה חשבון, ומצב העוסק ({licensed ? 'עוסק מורשה' : 'עוסק פטור'}).
            </p>
          </div>
        </header>

        {message && (
          <div
            role={message.kind === 'error' ? 'alert' : 'status'}
            className={`rounded-xl border px-4 py-3 text-sm ${
              message.kind === 'error'
                ? 'bg-rose-50 border-rose-200 text-rose-800'
                : 'bg-emerald-50 border-emerald-200 text-emerald-800'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Tax status */}
        <section className="rounded-2xl bg-white border border-gray-200 p-5 shadow-sm space-y-4" aria-labelledby="tax-heading">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="tax-heading" className="text-lg font-bold text-gray-900">
              מצב עוסק
            </h2>
            <span
              className={`text-xs font-semibold px-3 py-1 rounded-full border ${
                licensed ? 'bg-blue-50 text-blue-800 border-blue-200' : 'bg-gray-50 text-gray-700 border-gray-200'
              }`}
            >
              {licensed ? `עוסק מורשה · מע"מ ${Math.round(taxSettings.vatRate * 100)}%` : 'עוסק פטור · ללא מע"מ'}
            </span>
          </div>

          {!licensed && (
            <>
              <div>
                <div className="flex items-center justify-between text-sm text-gray-700 mb-1">
                  <span>מחזור 12 חודשים אחרונים מול תקרת עוסק פטור</span>
                  <span className="font-semibold">
                    {money(turnover)} מתוך {money(taxSettings.exemptCeiling)} ({ceiling.percent}%)
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-label="מחזור מול תקרת עוסק פטור"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.min(100, ceiling.percent)}
                  className="h-3 w-full rounded-full bg-gray-100 overflow-hidden"
                >
                  <div className={`h-full ${barColor}`} style={{ width: `${Math.min(100, ceiling.percent)}%` }} />
                </div>
                {ceiling.level !== 'ok' && (
                  <p className={`mt-2 text-sm flex items-start gap-2 ${ceiling.level === 'over' ? 'text-rose-700' : 'text-amber-700'}`}>
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                    {ceiling.level === 'over'
                      ? 'המחזור עבר את התקרה שהוגדרה. יש לפנות לרואה חשבון לגבי מעבר לעוסק מורשה.'
                      : `המחזור מתקרב לתקרה (נותרו ${money(ceiling.remaining)}). כדאי להיערך למעבר לעוסק מורשה.`}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label htmlFor="ceiling-input" className="block text-xs text-gray-600 mb-1">
                    תקרת עוסק פטור (₪ לשנה, לאמת מול רו"ח)
                  </label>
                  <input
                    id="ceiling-input"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={ceilingInput}
                    onChange={(event) => setCeilingInput(event.target.value)}
                    className="w-40 rounded-xl border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <button
                  type="button"
                  disabled={busy || Number(ceilingInput) === taxSettings.exemptCeiling}
                  onClick={() => void save({ exemptCeiling: Number(ceilingInput) }, 'התקרה נשמרה.')}
                  className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                >
                  שמור תקרה
                </button>
              </div>

              {!confirmingSwitch ? (
                <button
                  type="button"
                  onClick={() => setConfirmingSwitch(true)}
                  className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  הכן מעבר לעוסק מורשה
                </button>
              ) : (
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-3">
                  <p className="text-sm font-semibold text-blue-900">לפני ההחלפה, לוודא שבוצעו:</p>
                  <ol className="list-decimal pr-5 text-sm text-blue-900 space-y-1">
                    <li>פתיחת תיק עוסק מורשה ברשות המסים (דרך רואה חשבון).</li>
                    <li>עדכון ספק החשבוניות (Morning/Grow) להפקת חשבונית מס קבלה.</li>
                    <li>עדכון הכיתוב בתקנון ובמדיניות הפרטיות מ"עוסק פטור" ל"עוסק מורשה", ומחירים כולל מע"מ.</li>
                    <li>עדכון תבנית הוואטסאפ מ"הקבלה" ל"החשבונית".</li>
                  </ol>
                  <p className="text-xs text-blue-900">
                    מרגע ההחלפה הדוחות יחשבו מע"מ, והמחירים הקיימים ייחשבו ככוללים מע"מ. כדאי לבדוק עם רו"ח אם לעדכן מחירים.
                    אפשר לחזור לעוסק פטור בכל עת.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void save({ taxStatus: 'LICENSED' }, 'עברת למצב עוסק מורשה. הדוחות והמסמכים מתעדכנים.').then(() =>
                          setConfirmingSwitch(false)
                        )
                      }
                      className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
                    >
                      החלף עכשיו לעוסק מורשה
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingSwitch(false)}
                      className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm text-gray-800"
                    >
                      ביטול
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {licensed && (
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label htmlFor="vat-input" className="block text-xs text-gray-600 mb-1">
                  שיעור מע"מ (%)
                </label>
                <input
                  id="vat-input"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={30}
                  value={vatInput}
                  onChange={(event) => setVatInput(event.target.value)}
                  className="w-28 rounded-xl border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <button
                type="button"
                disabled={busy || Number(vatInput) / 100 === taxSettings.vatRate}
                onClick={() => void save({ vatRate: Number(vatInput) / 100 }, 'שיעור המע"מ נשמר.')}
                className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
              >
                שמור מע"מ
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void save({ taxStatus: 'EXEMPT' }, 'חזרת למצב עוסק פטור.')}
                className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm text-gray-800 hover:bg-gray-50 disabled:opacity-50"
              >
                חזרה לעוסק פטור
              </button>
            </div>
          )}
        </section>

        {/* Yearly summary */}
        <section className="rounded-2xl bg-white border border-gray-200 p-5 shadow-sm space-y-4" aria-labelledby="year-heading">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="year-heading" className="text-lg font-bold text-gray-900">
              סיכום שנתי לפי חודשים
            </h2>
            <div className="flex items-end gap-2">
              <div>
                <label htmlFor="year-select" className="block text-xs text-gray-600 mb-1">
                  שנה
                </label>
                <select
                  id="year-select"
                  value={selectedYear}
                  onChange={(event) => setSelectedYear(Number(event.target.value))}
                  className="rounded-xl border border-gray-300 px-3 py-2 text-sm bg-white"
                >
                  {years.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCustomFrom(`${selectedYear}-01-01`);
                  setCustomTo(`${selectedYear}-12-31`);
                  setRangeKey('CUSTOM');
                }}
                className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 hover:bg-gray-50"
              >
                טען את כל השנה לדוח
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">הכנסות לפי חודש בשנת {selectedYear}</caption>
              <thead>
                <tr className="bg-gray-50 text-gray-700">
                  <th scope="col" className="px-3 py-2 text-right">חודש</th>
                  <th scope="col" className="px-3 py-2 text-left">רשומות</th>
                  <th scope="col" className="px-3 py-2 text-left">סה"כ</th>
                  {licensed && <th scope="col" className="px-3 py-2 text-left">לפני מע"מ</th>}
                  {licensed && <th scope="col" className="px-3 py-2 text-left">מע"מ</th>}
                </tr>
              </thead>
              <tbody>
                {yearMonths.map((month) => (
                  <tr key={month.month} className="border-t border-gray-100">
                    <td className="px-3 py-2">
                      {new Intl.DateTimeFormat('he-IL', { month: 'long' }).format(new Date(selectedYear, month.month - 1, 1))}
                    </td>
                    <td className="px-3 py-2 text-left">{month.count}</td>
                    <td className="px-3 py-2 text-left font-medium">{month.gross ? money(month.gross) : '-'}</td>
                    {licensed && <td className="px-3 py-2 text-left">{month.net ? money(month.net) : '-'}</td>}
                    {licensed && <td className="px-3 py-2 text-left">{month.vat ? money(month.vat) : '-'}</td>}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-300 bg-gray-50 font-bold">
                  <td className="px-3 py-2">סה"כ {selectedYear}</td>
                  <td className="px-3 py-2 text-left">{yearTotals.count}</td>
                  <td className="px-3 py-2 text-left">{money(yearTotals.gross)}</td>
                  {licensed && <td className="px-3 py-2 text-left">{money(yearTotals.net)}</td>}
                  {licensed && <td className="px-3 py-2 text-left">{money(yearTotals.vat)}</td>}
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        {/* Report */}
        <section className="rounded-2xl bg-white border border-gray-200 p-5 shadow-sm space-y-4" aria-labelledby="report-heading">
          <h2 id="report-heading" className="text-lg font-bold text-gray-900">
            דוח קבלות והכנסות
          </h2>

          <div className="flex flex-wrap gap-2" role="group" aria-label="בחירת תקופה">
            {RANGE_LABELS.map((item) => (
              <button
                key={item.key}
                type="button"
                aria-pressed={rangeKey === item.key}
                onClick={() => setRangeKey(item.key)}
                className={`rounded-full border px-4 py-1.5 text-sm ${
                  rangeKey === item.key
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {rangeKey === 'CUSTOM' && (
            <div className="flex flex-wrap gap-3">
              <div>
                <label htmlFor="from-date" className="block text-xs text-gray-600 mb-1">
                  מתאריך
                </label>
                <input
                  id="from-date"
                  type="date"
                  value={customFrom}
                  onChange={(event) => setCustomFrom(event.target.value)}
                  className="rounded-xl border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="to-date" className="block text-xs text-gray-600 mb-1">
                  עד תאריך
                </label>
                <input
                  id="to-date"
                  type="date"
                  value={customTo}
                  onChange={(event) => setCustomTo(event.target.value)}
                  className="rounded-xl border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-800">
            <span>
              {dateLabel(range.from)} עד {dateLabel(range.to)}
            </span>
            <span className="font-semibold">{totals.count} רשומות</span>
            <span className="font-semibold">סה"כ {money(totals.gross)}</span>
            {licensed && (
              <span>
                לפני מע"מ {money(totals.net)} · מע"מ {money(totals.vat)}
              </span>
            )}
            {totals.withoutReceipt > 0 && (
              <span className="text-amber-700">{totals.withoutReceipt} ללא מסמך שהופק</span>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handlePrint}
              disabled={rows.length === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <Printer className="w-4 h-4" aria-hidden="true" />
              שמור כ-PDF / הדפס
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={rows.length === 0}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              ייצוא Excel (CSV)
            </button>
          </div>
          <p className="text-xs text-gray-600">
            ב"שמור כ-PDF" נפתח חלון הדפסה: בחר "שמירה כ-PDF" כיעד ההדפסה. ה-CSV נפתח באקסל ומתאים לרואה חשבון.
          </p>

          {rows.length === 0 ? (
            <div role="status" className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-6 text-center text-sm text-gray-600">
              אין הכנסות בתקופה שנבחרה. טיפולים שהושלמו ודמי ביטול שנגבו יופיעו כאן.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">דוח הכנסות וקבלות לתקופה שנבחרה</caption>
                <thead>
                  <tr className="bg-gray-50 text-gray-700">
                    <th scope="col" className="px-3 py-2 text-right">תאריך</th>
                    <th scope="col" className="px-3 py-2 text-right">לקוח</th>
                    <th scope="col" className="px-3 py-2 text-right">כלב</th>
                    <th scope="col" className="px-3 py-2 text-right">תיאור</th>
                    <th scope="col" className="px-3 py-2 text-left">סכום</th>
                    {licensed && <th scope="col" className="px-3 py-2 text-left">מע"מ</th>}
                    <th scope="col" className="px-3 py-2 text-right">מסמך</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-t border-gray-100">
                      <td className="px-3 py-2 whitespace-nowrap">{dateLabel(row.date)}</td>
                      <td className="px-3 py-2">{row.customerName}</td>
                      <td className="px-3 py-2">{row.dogName}</td>
                      <td className="px-3 py-2">{row.description}</td>
                      <td className="px-3 py-2 text-left font-medium">{money(row.gross)}</td>
                      {licensed && <td className="px-3 py-2 text-left">{money(row.vat)}</td>}
                      <td className="px-3 py-2">
                        {row.receiptUrl && /^https:\/\//i.test(row.receiptUrl) ? (
                          <a
                            href={row.receiptUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-700 underline"
                          >
                            {row.receiptNumber || 'פתח'}
                          </a>
                        ) : row.hasReceipt ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700">
                            <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                            {row.receiptNumber || 'הופקה'}
                          </span>
                        ) : (
                          <span className="text-amber-700">לא הופקה</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
