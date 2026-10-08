import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { DogInput, DogSex } from './api';
import { COMMON_BREEDS } from './config';

interface DogSheetProps {
  title: string;
  initial?: Partial<DogInput>;
  submitLabel: string;
  onSubmit: (dog: DogInput) => Promise<void> | void;
  onClose: () => void;
}

const EMPTY: DogInput = { name: '', breed: '', sex: '', allergies: '', notes: '' };

export const DogSheet: React.FC<DogSheetProps> = ({ title, initial, submitLabel, onSubmit, onClose }) => {
  const [dog, setDog] = useState<DogInput>({ ...EMPTY, ...initial });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timer = window.setTimeout(() => nameRef.current?.focus(), 120);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const set = <K extends keyof DogInput>(key: K, value: DogInput[K]) => setDog((current) => ({ ...current, [key]: value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!dog.name.trim()) {
      setError('איך קוראים לכלב?');
      nameRef.current?.focus();
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onSubmit({ ...dog, name: dog.name.trim(), breed: dog.breed.trim() });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'השמירה נכשלה. נסו שוב.');
      setSaving(false);
    }
  };

  const sexOptions: Array<{ value: DogSex; label: string }> = [
    { value: 'MALE', label: 'זכר' },
    { value: 'FEMALE', label: 'נקבה' }
  ];

  return (
    <div className="bk-sheet-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="bk-sheet" role="dialog" aria-modal="true" aria-label={title} onSubmit={submit} noValidate>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h2 className="bk-h1" style={{ margin: 0, fontSize: '1.25rem' }}>{title}</h2>
          <button type="button" className="bk-icon-btn" aria-label="סגירה" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div style={{ display: 'grid', gap: 16 }}>
          <div>
            <label className="bk-label" htmlFor="dog-name">שם הכלב *</label>
            <input
              id="dog-name"
              ref={nameRef}
              className="bk-input"
              value={dog.name}
              maxLength={40}
              autoComplete="off"
              onChange={(event) => set('name', event.target.value)}
            />
          </div>

          <div>
            <label className="bk-label" htmlFor="dog-breed">גזע</label>
            <input
              id="dog-breed"
              className="bk-input"
              list="dog-breeds"
              value={dog.breed}
              maxLength={60}
              autoComplete="off"
              placeholder="לדוגמה: פודל טוי"
              onChange={(event) => set('breed', event.target.value)}
            />
            <datalist id="dog-breeds">
              {COMMON_BREEDS.map((breed) => (
                <option key={breed} value={breed} />
              ))}
            </datalist>
          </div>

          <div>
            <span className="bk-label">מין</span>
            <div className="bk-chips" role="radiogroup" aria-label="מין הכלב">
              {sexOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={dog.sex === option.value}
                  className="bk-chip"
                  onClick={() => set('sex', dog.sex === option.value ? '' : option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="bk-label" htmlFor="dog-allergies">רגישויות או בעיות בריאות</label>
            <textarea
              id="dog-allergies"
              className="bk-input"
              value={dog.allergies}
              maxLength={300}
              placeholder="לא חובה"
              onChange={(event) => set('allergies', event.target.value)}
            />
          </div>

          <div>
            <label className="bk-label" htmlFor="dog-notes">משהו שכדאי שנדע על הכלב או על התספורת?</label>
            <textarea
              id="dog-notes"
              className="bk-input"
              value={dog.notes}
              maxLength={500}
              placeholder="לא חובה"
              onChange={(event) => set('notes', event.target.value)}
            />
          </div>

          {error && <div className="bk-error" role="alert">{error}</div>}

          <div style={{ display: 'grid', gap: 10 }}>
            <button type="submit" className="bk-btn bk-btn-primary" disabled={saving}>
              {saving ? 'שומרים…' : submitLabel}
            </button>
            <button type="button" className="bk-btn bk-btn-ghost" onClick={onClose} disabled={saving}>
              ביטול
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
