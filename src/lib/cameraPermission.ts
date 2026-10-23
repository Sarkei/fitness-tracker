/**
 * Merkt sich, dass der Nutzer den Barcode-Scanner mindestens einmal erfolgreich
 * mit Kamera genutzt hat. Die echte Kamera-Freigabe liegt beim Browser (nicht in Cookies).
 */

const STORAGE_KEY = 'vrtx_barcode_camera_ok_v1';

export function hasBarcodeCameraConsent(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function markBarcodeCameraConsent(): void {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    /* private mode / quota */
  }
}

export function clearBarcodeCameraConsent(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export type CameraPermissionState = 'granted' | 'denied' | 'prompt' | 'unknown';

export async function queryCameraPermission(): Promise<CameraPermissionState> {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
    return 'unknown';
  }
  try {
    const status = await navigator.permissions.query({ name: 'camera' as PermissionName });
    return status.state as CameraPermissionState;
  } catch {
    return 'unknown';
  }
}

/** Kamera direkt starten (ohne In-App-Tap), wenn Browser schon erlaubt hat oder Nutzer es schon einmal geschafft hat. */
export async function shouldAutoStartBarcodeCamera(): Promise<boolean> {
  const perm = await queryCameraPermission();
  if (perm === 'granted') return true;
  if (perm === 'denied') return false;
  return hasBarcodeCameraConsent();
}

export function subscribeCameraPermission(
  onChange: (state: CameraPermissionState) => void,
): () => void {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
    return () => {};
  }
  let status: PermissionStatus | null = null;
  const handler = () => {
    if (status) onChange(status.state as CameraPermissionState);
  };
  void navigator.permissions
    .query({ name: 'camera' as PermissionName })
    .then(s => {
      status = s;
      s.addEventListener('change', handler);
      onChange(s.state as CameraPermissionState);
    })
    .catch(() => {});
  return () => {
    status?.removeEventListener('change', handler);
  };
}
