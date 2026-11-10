// Square share graphic. Band of the Week's "I voted" card and the Radio Share Kit
// both draw through here so the 1080×1080 canvas, cover crop, and centered type stay one path.
export const SHARE_CARD_SIZE = 1080;

function traceRoundRect(ctx, x, y, size, radius) {
  const r = Math.max(0, Math.min(radius || 0, size / 2));
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, size, size, r);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + size, y, x + size, y + size, r);
  ctx.arcTo(x + size, y + size, x, y + size, r);
  ctx.arcTo(x, y + size, x, y, r);
  ctx.arcTo(x, y, x + size, y, r);
  ctx.closePath();
}

function paintPhoto(ctx, image, photo) {
  const side = Math.min(image.width, image.height);
  ctx.save();
  traceRoundRect(ctx, photo.x, photo.y, photo.size, photo.radius || 0);
  ctx.clip();
  ctx.drawImage(
    image,
    (image.width - side) / 2,
    (image.height - side) / 2,
    side,
    side,
    photo.x,
    photo.y,
    photo.size,
    photo.size
  );
  ctx.restore();
  if (!photo.stroke) return;
  ctx.save();
  traceRoundRect(ctx, photo.x, photo.y, photo.size, photo.radius || 0);
  ctx.strokeStyle = photo.stroke;
  ctx.lineWidth = photo.strokeWidth || 8;
  ctx.stroke();
  ctx.restore();
}

function paintFallback(ctx, photo, monogram) {
  if (!photo) return;
  ctx.save();
  traceRoundRect(ctx, photo.x, photo.y, photo.size, photo.radius || 0);
  ctx.clip();
  ctx.fillStyle = '#10211e';
  ctx.fillRect(photo.x, photo.y, photo.size, photo.size);
  ctx.fillStyle = '#0ccfbd';
  ctx.font = '900 168px Arial, Helvetica, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(monogram || '♪', photo.x + photo.size / 2, photo.y + photo.size / 2 + 8);
  ctx.restore();
}

function loadImage(src, crossOrigin) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    if (crossOrigin) image.crossOrigin = crossOrigin;
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('image failed'));
    image.src = src;
  });
}

function paintLines(ctx, lines, width) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  for (const line of lines || []) {
    ctx.fillStyle = line.fill || '#fff';
    ctx.font = line.font || '700 32px Arial, Helvetica, sans-serif';
    ctx.fillText(line.text, line.x ?? width / 2, line.y);
  }
}

function paintMarks(ctx, marks) {
  for (const mark of marks || []) {
    if (mark.type !== 'rule') continue;
    ctx.save();
    ctx.strokeStyle = mark.color || '#0ccfbd';
    ctx.lineWidth = mark.width || 4;
    ctx.beginPath();
    ctx.moveTo(mark.x1, mark.y);
    ctx.lineTo(mark.x2, mark.y);
    ctx.stroke();
    ctx.restore();
  }
}

// crossOrigin "anonymous" keeps the canvas exportable. A blocked or missing
// photo resolves the card anyway (monogram unless fallback is false).
export async function drawShareCard(options = {}) {
  const width = options.width || SHARE_CARD_SIZE;
  const height = options.height || SHARE_CARD_SIZE;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const [top, bottom] = options.gradient || ['#2a0010', '#050505'];
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, top);
  gradient.addColorStop(1, bottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  let photo = null;
  if (options.image && options.photo) {
    try {
      photo = await loadImage(options.image, options.crossOrigin || '');
    } catch {
      photo = null;
    }
  }
  if (photo && options.photo) paintPhoto(ctx, photo, options.photo);
  else if (options.fallback !== false && options.photo) paintFallback(ctx, options.photo, options.monogram);
  paintMarks(ctx, options.marks);
  paintLines(ctx, options.lines, width);
  if (typeof options.after === 'function') options.after(ctx, canvas);
  return canvas;
}

export function canvasToPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('empty png'))), 'image/png');
    } catch (error) {
      reject(error);
    }
  });
}
