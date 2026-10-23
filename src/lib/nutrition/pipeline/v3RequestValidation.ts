const MAX_TEXT_LEN = 8_000;
const MAX_IMAGE_DATA_URL_LEN = 12_000_000;

export type V3ValidationError =
  | 'missing-input'
  | 'text-too-long'
  | 'image-too-large'
  | 'invalid-image-format';

export type V3ProcessBodyValidation =
  | { ok: true; text: string; imageDataUrl: string }
  | { ok: false; error: V3ValidationError };

export function validateV3ProcessBody(body: {
  text?: string;
  imageDataUrl?: string;
}): V3ProcessBodyValidation {
  const text = String(body.text ?? '').trim();
  const imageDataUrl = String(body.imageDataUrl ?? '').trim();
  if (!text && !imageDataUrl) return { ok: false as const, error: 'missing-input' };
  if (text.length > MAX_TEXT_LEN) return { ok: false as const, error: 'text-too-long' };
  if (imageDataUrl.length > MAX_IMAGE_DATA_URL_LEN) return { ok: false as const, error: 'image-too-large' };
  if (imageDataUrl && !/^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(imageDataUrl)) {
    return { ok: false as const, error: 'invalid-image-format' };
  }
  return { ok: true as const, text, imageDataUrl };
}
