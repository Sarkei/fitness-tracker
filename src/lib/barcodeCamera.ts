/**
 * Barcode-Kamera: ZXing (primär) + Native BarcodeDetector (iOS/Android).
 * html5-qrcode nur noch für Foto-Fallback — nicht für Live-Scan (1D-Barcodes unzuverlässig).
 */

import { BarcodeFormat, BrowserCodeReader, BrowserMultiFormatReader } from '@zxing/browser';
import {
  ChecksumException,
  DecodeHintType,
  FormatException,
  NotFoundException,
} from '@zxing/library';
import { Html5Qrcode } from 'html5-qrcode';

export const BARCODE_SCANNER_ELEMENT_ID = 'vrtx-barcode-scanner';

const EAN_FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
];

const NATIVE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'] as const;

const REAR_VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  facingMode: { ideal: 'environment' },
  width: { ideal: 1280 },
  height: { ideal: 720 },
};

let sharedCameraStream: MediaStream | null = null;

function isStreamLive(stream: MediaStream | null): boolean {
  if (!stream) return false;
  const track = stream.getVideoTracks()[0];
  return Boolean(track && track.readyState === 'live');
}

/** Ein getUserMedia pro App-Sitzung — vermeidet doppelte Browser-Dialoge (ZXing + Native). */
export async function acquireBarcodeCameraStream(): Promise<MediaStream> {
  if (isStreamLive(sharedCameraStream)) {
    return sharedCameraStream!;
  }
  if (sharedCameraStream) {
    sharedCameraStream.getTracks().forEach(t => t.stop());
    sharedCameraStream = null;
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    video: REAR_VIDEO_CONSTRAINTS,
    audio: false,
  });
  sharedCameraStream = stream;
  return stream;
}

export function releaseBarcodeCameraStream(): void {
  if (sharedCameraStream) {
    sharedCameraStream.getTracks().forEach(t => t.stop());
    sharedCameraStream = null;
  }
}

export type BarcodeScannerDebugEvent = {
  stage:
    | 'init'
    | 'engine'
    | 'camera_ready'
    | 'decode_success'
    | 'decode_error'
    | 'decode_tick';
  detail?: string;
};

export type BarcodeScannerHandle = {
  engine: 'zxing' | 'native';
  stop: () => Promise<void>;
};

type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
};

function getNativeBarcodeDetector(): BarcodeDetectorCtor | null {
  return (
    (globalThis as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector ?? null
  );
}

function normalizeBarcode(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length >= 8 && digits.length <= 14) return digits;
  return null;
}

function mountVideo(elementId: string): { container: HTMLElement; video: HTMLVideoElement } {
  const container = document.getElementById(elementId);
  if (!container) throw new DOMException('Scanner container missing', 'NotFoundError');
  container.innerHTML = '';
  const video = document.createElement('video');
  video.setAttribute('playsinline', 'true');
  video.setAttribute('webkit-playsinline', 'true');
  video.muted = true;
  video.autoplay = true;
  video.style.width = '100%';
  video.style.height = '100%';
  video.style.objectFit = 'cover';
  container.appendChild(video);
  return { container, video };
}

function waitForVideoReady(video: HTMLVideoElement, timeoutMs = 4000): Promise<void> {
  if (video.readyState >= 2 && video.videoWidth > 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('video metadata timeout')), timeoutMs);
    const done = () => {
      window.clearTimeout(timer);
      resolve();
    };
    video.addEventListener('loadedmetadata', done, { once: true });
    video.addEventListener('canplay', done, { once: true });
  });
}

export function canUseWebCamera(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

export function pickRearCameraId(cameras: { id: string; label: string }[]): string | undefined {
  if (!cameras.length) return undefined;
  const back = cameras.find(c => /back|rear|environment|rück|ruck|hinten/i.test(c.label));
  if (back) return back.id;
  if (cameras.length === 1) return cameras[0].id;
  return cameras[cameras.length - 1].id;
}

function createZxingReader(): BrowserMultiFormatReader {
  const reader = new BrowserMultiFormatReader();
  reader.possibleFormats = EAN_FORMATS;
  reader.hints.set(DecodeHintType.TRY_HARDER, true);
  return reader;
}

/** Normal bei Live-Scan: kein Barcode im Frame / schlechter Winkel — kein echter Fehler. */
function isExpectedScanMiss(err: unknown): boolean {
  return (
    err instanceof NotFoundException ||
    err instanceof ChecksumException ||
    err instanceof FormatException
  );
}

async function startZxingScanner(
  elementId: string,
  stream: MediaStream,
  onCode: (raw: string) => void,
  onDebugEvent?: (event: BarcodeScannerDebugEvent) => void,
): Promise<BarcodeScannerHandle> {
  onDebugEvent?.({ stage: 'engine', detail: 'zxing (EAN/UPC)' });
  const { container, video } = mountVideo(elementId);
  const deviceId = stream.getVideoTracks()[0]?.getSettings().deviceId;
  const reader = createZxingReader();
  let decodeBusy = false;
  let tick = 0;

  BrowserCodeReader.addVideoSource(video, stream);
  const playing = await BrowserCodeReader.tryPlayVideo(video);
  if (!playing) {
    throw new DOMException('Video play failed', 'NotReadableError');
  }

  const controls = reader.scan(video, (result, err) => {
    tick += 1;
    if (tick % 30 === 0) {
      onDebugEvent?.({ stage: 'decode_tick', detail: `zxing frames ${tick}` });
    }
    if (result) {
      const raw = result.getText();
      const code = normalizeBarcode(raw);
      onDebugEvent?.({
        stage: 'decode_success',
        detail: `zxing ${result.getBarcodeFormat()} raw=${raw.slice(0, 32)}`,
      });
      if (code && !decodeBusy) {
        decodeBusy = true;
        onCode(code);
      }
      return;
    }
    if (err && !isExpectedScanMiss(err)) {
      onDebugEvent?.({
        stage: 'decode_error',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  try {
    await waitForVideoReady(video);
  } catch {
    /* decodeFromVideoDevice may still work */
  }

  onDebugEvent?.({
    stage: 'camera_ready',
    detail: deviceId ? `zxing · ${deviceId.slice(0, 8)}…` : 'zxing · default cam',
  });

  return {
    engine: 'zxing',
    stop: async () => {
      controls.stop();
      BrowserCodeReader.cleanVideoSource(video);
      container.innerHTML = '';
    },
  };
}

async function startNativeScanner(
  elementId: string,
  stream: MediaStream,
  onCode: (raw: string) => void,
  onDebugEvent?: (event: BarcodeScannerDebugEvent) => void,
): Promise<BarcodeScannerHandle | null> {
  const DetectorCtor = getNativeBarcodeDetector();
  if (!DetectorCtor) return null;

  onDebugEvent?.({ stage: 'engine', detail: 'native BarcodeDetector' });
  const { container, video } = mountVideo(elementId);

  let detector: InstanceType<BarcodeDetectorCtor>;
  try {
    detector = new DetectorCtor({ formats: [...NATIVE_FORMATS] });
  } catch {
    try {
      detector = new DetectorCtor();
    } catch {
      return null;
    }
  }

  video.srcObject = stream;
  await video.play();
  await waitForVideoReady(video);

  onDebugEvent?.({ stage: 'camera_ready', detail: 'native · environment' });

  let cancelled = false;
  let decodeBusy = false;
  let scanInFlight = false;
  let ticks = 0;

  const scheduleNextScan = () => {
    if (cancelled) return;
    window.setTimeout(() => void runScanFrame(), 200);
  };

  const runScanFrame = async () => {
    if (cancelled || scanInFlight || decodeBusy || video.readyState < 2) {
      scheduleNextScan();
      return;
    }
    scanInFlight = true;
    ticks += 1;
    if (ticks % 8 === 0) {
      onDebugEvent?.({ stage: 'decode_tick', detail: `native scans ${ticks}` });
    }
    try {
      const hits = await detector.detect(video);
      const raw = hits.find(h => (h.rawValue || '').trim())?.rawValue?.trim();
      if (raw) {
        const code = normalizeBarcode(raw);
        onDebugEvent?.({ stage: 'decode_success', detail: `native raw=${raw.slice(0, 32)}` });
        if (code) {
          decodeBusy = true;
          onCode(code);
          return;
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/not\s*found/i.test(msg)) {
        onDebugEvent?.({ stage: 'decode_error', detail: msg.slice(0, 120) });
      }
    } finally {
      scanInFlight = false;
      scheduleNextScan();
    }
  };

  scheduleNextScan();

  return {
    engine: 'native',
    stop: async () => {
      cancelled = true;
      container.innerHTML = '';
    },
  };
}

export async function startBarcodeScanner(
  onCode: (raw: string) => void,
  onDebugEvent?: (event: BarcodeScannerDebugEvent) => void,
  elementId = BARCODE_SCANNER_ELEMENT_ID,
): Promise<BarcodeScannerHandle> {
  onDebugEvent?.({ stage: 'init' });

  const stream = await acquireBarcodeCameraStream();
  const errors: string[] = [];

  if (getNativeBarcodeDetector()) {
    try {
      const native = await startNativeScanner(elementId, stream, onCode, onDebugEvent);
      if (native) return native;
      errors.push('native: start failed');
    } catch (err) {
      errors.push(`native: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  try {
    return await startZxingScanner(elementId, stream, onCode, onDebugEvent);
  } catch (err) {
    errors.push(`zxing: ${err instanceof Error ? err.message : String(err)}`);
  }

  throw new Error(errors.join(' | ') || 'No barcode scanner available');
}

export async function stopBarcodeScanner(
  scanner: BarcodeScannerHandle | null | undefined,
  options?: { releaseCamera?: boolean },
): Promise<void> {
  if (!scanner) return;
  await scanner.stop();
  if (options?.releaseCamera) {
    releaseBarcodeCameraStream();
  }
}

async function scanWithNativeDetector(file: File): Promise<string | null> {
  const DetectorCtor = getNativeBarcodeDetector();
  if (!DetectorCtor) return null;
  let detector: InstanceType<BarcodeDetectorCtor>;
  try {
    detector = new DetectorCtor({ formats: [...NATIVE_FORMATS] });
  } catch {
    detector = new DetectorCtor();
  }

  const bitmap = await createImageBitmap(file);
  const canvases: HTMLCanvasElement[] = [];
  const base = document.createElement('canvas');
  base.width = bitmap.width;
  base.height = bitmap.height;
  const ctx = base.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0);
  canvases.push(base);

  for (const canvas of canvases) {
    const hits = await detector.detect(canvas);
    const raw = hits.find(h => (h.rawValue || '').trim())?.rawValue?.trim();
    if (raw) {
      const code = normalizeBarcode(raw);
      if (code) return code;
    }
  }
  return null;
}

async function scanWithZxing(file: File): Promise<string | null> {
  const reader = createZxingReader();
  const url = URL.createObjectURL(file);
  try {
    const result = await reader.decodeFromImageUrl(url);
    return normalizeBarcode(result.getText());
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function scanBarcodeFromFile(
  file: File,
  elementId = BARCODE_SCANNER_ELEMENT_ID,
): Promise<string> {
  const fromZxing = await scanWithZxing(file);
  if (fromZxing) return fromZxing;

  const fromNative = await scanWithNativeDetector(file);
  if (fromNative) return fromNative;

  const container = document.getElementById(elementId);
  if (container) container.innerHTML = '';
  const scanner = new Html5Qrcode(elementId, { useBarCodeDetectorIfSupported: true, verbose: false });
  try {
    const raw = await scanner.scanFile(file, true);
    const code = normalizeBarcode(raw);
    if (code) return code;
  } finally {
    try {
      scanner.clear();
    } catch {
      /* ignore */
    }
  }
  throw new Error('No barcode in image');
}

export function cameraFailureMessage(
  t: (key: string) => string,
  err: unknown,
): string {
  if (!canUseWebCamera()) {
    return t('nut.barcode.insecureContext');
  }
  const name = err instanceof DOMException ? err.name : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return t('nut.barcode.cameraDenied');
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return t('nut.barcode.noCamera');
  }
  if (name === 'NotSupportedError' || name === 'NotReadableError') {
    return t('nut.barcode.cameraUnavailable');
  }
  return t('nut.barcode.cameraDenied');
}
