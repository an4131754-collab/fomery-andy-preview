export async function preparePhoto(file, camera) {
  if (file.size > 30 * 1024 * 1024) throw Error('請選擇小於 30 MB 的照片。');
  const addedAt = Date.now();
  const takenAt = await photoCaptureTime(file);
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.src = url;
  try {
    await image.decode().catch(() => { throw Error('這張照片無法讀取，請改選 JPG 或 PNG。'); });
    const canvas = document.createElement('canvas');
    for (const size of [1000, 720, 480]) {
      const scale = Math.min(1, size / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const ctx = canvas.getContext('2d', { alpha: false });
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const src = canvas.toDataURL('image/jpeg', .82);
      if (src.length <= 350000 && src.startsWith('data:image/jpeg;base64,')) {
        return { src, takenAt, modifiedAt: file.lastModified, addedAt, original: camera ? file : undefined };
      }
    }
    throw Error('這張照片太大，請選另一張。');
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function photoCaptureTime(file) {
  try {
    await import('./vendor/exif-reader.js');
    const { exif } = await globalThis.ExifReader.load(file, {
      expanded: true, includeTags: { exif: ['DateTimeOriginal', 'DateTimeDigitized'] },
    });
    const value = exif?.DateTimeOriginal?.description || exif?.DateTimeDigitized?.description;
    const stamp = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}:\d{2}:\d{2})/.exec(value);
    return stamp ? `${stamp[1]}-${stamp[2]}-${stamp[3]}T${stamp[4]}` : '';
  } catch {
    return '';
  }
}

export async function sharePhoto(file) {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (error) {
      if (error.name === 'AbortError') return;
    }
  }
  const link = document.createElement('a');
  link.download = file.name;
  link.href = URL.createObjectURL(file);
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 60_000);
}

export function mealCard(image, restaurant) {
  if (!image?.naturalWidth) throw Error('請等封面載入後再分享。');
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1140;
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.fillStyle = '#f7f2e9';
  ctx.fillRect(0, 0, 1080, 1140);
  const size = Math.min(image.naturalWidth, image.naturalHeight);
  ctx.beginPath();
  ctx.roundRect(64, 64, 952, 952, 24);
  ctx.save();
  ctx.clip();
  ctx.drawImage(image, (image.naturalWidth - size) / 2, (image.naturalHeight - size) / 2, size, size, 64, 64, 952, 952);
  ctx.restore();
  ctx.fillStyle = '#173c44';
  ctx.font = '600 48px Georgia, "Noto Serif TC", serif';
  ctx.fillText(restaurant, 64, 1095, 952);
  const encoded = canvas.toDataURL('image/jpeg', .92).split(',')[1];
  return new File([Uint8Array.from(atob(encoded), byte => byte.charCodeAt(0))], 'Fomery-餐照.jpg', { type: 'image/jpeg' });
}
