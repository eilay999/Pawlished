import { DEVICE_STORAGE_KEY } from './config';

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

export const clearDeviceToken = () => {
  try {
    window.localStorage.removeItem(DEVICE_STORAGE_KEY);
  } catch {
    // ignore
  }
};
