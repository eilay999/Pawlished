import { DEVICE_STORAGE_KEY, PHONE_STORAGE_KEY } from './config';

// Only a signed, expiring device token is kept in this browser. No tracking or ad cookies.
export const loadDeviceToken = (): string => {
  try {
    return window.localStorage.getItem(DEVICE_STORAGE_KEY) || '';
  } catch {
    return '';
  }
};

export const saveDeviceToken = (token: string) => {
  try {
    window.localStorage.setItem(DEVICE_STORAGE_KEY, token);
  } catch {
    // Private mode / blocked storage: the customer simply gets a code next time.
  }
};

// The last phone the customer verified, so the field is already filled next time (even after the
// device token has expired). Kept on this browser only.
export const loadLastPhone = (): string => {
  try {
    return window.localStorage.getItem(PHONE_STORAGE_KEY) || '';
  } catch {
    return '';
  }
};

export const saveLastPhone = (phone: string) => {
  try {
    window.localStorage.setItem(PHONE_STORAGE_KEY, phone);
  } catch {
    // ignore
  }
};

export const clearLastPhone = () => {
  try {
    window.localStorage.removeItem(PHONE_STORAGE_KEY);
  } catch {
    // ignore
  }
};

export const clearDeviceToken = () => {
  try {
    window.localStorage.removeItem(DEVICE_STORAGE_KEY);
  } catch {
    // ignore
  }
};
