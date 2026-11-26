/**
 * A photo made small enough to send quickly: at most `max` pixels on its long side, re-encoded
 * as JPEG (which also turns an iPhone's HEIC into something Gemini reads). The browser applies the
 * photo's EXIF rotation when it draws it, so receipts arrive upright.
 */
export async function shrinkPhoto(file: Blob, max = 1600): Promise<{ mimeType: 'image/jpeg'; data: string }> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * k));
    const h = Math.max(1, Math.round(img.naturalHeight * k));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No canvas.');
    ctx.fillStyle = '#fff'; // transparent screenshots stay readable as JPEG
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (!blob) throw new Error('Couldn’t encode the photo.');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { mimeType: 'image/jpeg', data: btoa(s) };
  } finally {
    URL.revokeObjectURL(url);
  }
}
