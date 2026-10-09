import React, { useEffect, useRef, useState } from 'react';

const LENGTH = 6;

interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  onComplete: (value: string) => void;
  disabled?: boolean;
  hasError?: boolean;
}

export const OtpInput: React.FC<OtpInputProps> = ({ value, onChange, onComplete, disabled, hasError }) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [focused, setFocused] = useState(false);

  // Focus on mount and again whenever a verification attempt finishes (input was disabled).
  useEffect(() => {
    if (disabled) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => window.clearTimeout(timer);
  }, [disabled]);

  const activeIndex = Math.min(value.length, LENGTH - 1);

  return (
    <div className="bk-otp">
      <input
        ref={inputRef}
        className="bk-otp-input"
        value={value}
        disabled={disabled}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={LENGTH}
        aria-label="קוד אימות בן 6 ספרות"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(event) => {
          const digits = event.target.value.replace(/\D/g, '').slice(0, LENGTH);
          onChange(digits);
          if (digits.length === LENGTH) onComplete(digits);
        }}
      />
      <div className="bk-otp-boxes" aria-hidden="true">
        {Array.from({ length: LENGTH }, (_, index) => (
          <div
            key={index}
            className="bk-otp-box"
            data-active={focused && index === activeIndex}
            data-error={hasError && !value[index]}
          >
            {value[index] ?? ''}
          </div>
        ))}
      </div>
    </div>
  );
};
