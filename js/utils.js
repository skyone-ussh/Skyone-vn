const $ = (id) => document.getElementById(id);

function showAlert(el, msg, type) {
  if (!el) return;
  el.textContent = msg;
  el.className = 'alert show alert-' + (type || 'error');
}
function hideAlert(el) {
  if (el) el.className = 'alert';
}

function todayISO() {
  const now = new Date();
  const vn = new Date(now.getTime() + (now.getTimezoneOffset() + 420) * 60000);
  return `${vn.getFullYear()}-${String(vn.getMonth()+1).padStart(2,'0')}-${String(vn.getDate()).padStart(2,'0')}`;
}

/* Parse an toàn cho cả 'YYYY-MM-DD' và ISO có giờ */
function formatDateVN(iso) {
  if (!iso) return '—';
  const datePart = String(iso).split('T')[0];
  const parts = datePart.split('-');
  if (parts.length !== 3) return '—';
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

/* "Thứ 2, 09/11/2026" */
function formatDateFullVN(iso) {
  if (!iso) return '—';
  const datePart = String(iso).split('T')[0];
  const [y, m, d] = datePart.split('-').map(Number);
  if (!y || !m || !d) return '—';
  const date = new Date(y, m - 1, d);
  const dow = ['CN', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'][date.getDay()];
  return `${dow}, ${String(d).padStart(2,'0')}/${String(m).padStart(2,'0')}/${y}`;
}

function formatTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function formatDuration(ms) {
  if (!ms || ms < 0) return '—';
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} phút`;
  if (m === 0) return `${h} giờ`;
  return `${h} giờ ${m} phút`;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, m => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[m]));
}

/* ============ WEBP DETECTION ============ */
let _webpSupport = null;
function supportsWebP() {
  if (_webpSupport !== null) return _webpSupport;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    _webpSupport = canvas.toDataURL('image/webp').startsWith('data:image/webp');
  } catch {
    _webpSupport = false;
  }
  return _webpSupport;
}

/* =========================================================
   VẼ ROUNDED RECT (fallback cho Safari cũ)
   ========================================================= */
function roundRectPath(ctx, x, y, w, h, r) {
  if (typeof r === 'number') r = [r, r, r, r];
  const [tl, tr, br, bl] = r;
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + tr);
  ctx.lineTo(x + w, y + h - br);
  ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
  ctx.lineTo(x + bl, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - bl);
  ctx.lineTo(x, y + tl);
  ctx.quadraticCurveTo(x, y, x + tl, y);
  ctx.closePath();
}

/* =========================================================
   VẼ WATERMARK LÊN CANVAS
   - Thanh accent trái: xanh lá (Vào) / xanh dương (Ra)
   - Nền đen mờ
   - Text: "{Tên} • HH:MM DD/MM/YYYY • VÀO|RA"
   ========================================================= */
function drawWatermark(ctx, canvasW, canvasH, { name, type, timeISO }) {
  const typeLabel = (type || 'Vào').toUpperCase();
  const accentColor = typeLabel === 'VÀO' ? '#10B981' : '#0EA5E9';

  const safeName = (name || '').trim() || 'Nhân viên';
  const timeStr = formatTime(timeISO);
  const dateStr = formatDateVN(timeISO);
  const text = `${safeName} • ${timeStr} ${dateStr} • ${typeLabel}`;

  const fontSize = Math.max(12, Math.round(canvasW * 0.026));
  const padding = Math.round(canvasW * 0.025);
  const barWidth = Math.max(4, Math.round(canvasW * 0.012));
  const radius = Math.round(fontSize * 0.4);

  ctx.font = `bold ${fontSize}px "Be Vietnam Pro", Arial, sans-serif`;
  const textWidth = ctx.measureText(text).width;

  const boxW = textWidth + padding * 2 + barWidth + fontSize * 0.4;
  const boxH = fontSize * 2.2;
  const boxX = padding;
  const boxY = canvasH - boxH - padding;

  // Nền
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  roundRectPath(ctx, boxX, boxY, boxW, boxH, radius);
  ctx.fill();

  // Thanh accent (bo tròn bên trái)
  ctx.fillStyle = accentColor;
  roundRectPath(ctx, boxX, boxY, barWidth + 4, boxH, [radius, 0, 0, radius]);
  ctx.fill();

  // Text
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(text, boxX + barWidth + padding, boxY + boxH / 2);
}

/* =========================================================
   LOAD IMAGE ELEMENT (fallback khi không có createImageBitmap)
   ========================================================= */
function loadImageElement(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Không đọc được ảnh'));
    img.src = URL.createObjectURL(file);
  });
}

/* =========================================================
   COMPRESS IMAGE + WATERMARK
   - createImageBitmap (imageOrientation: 'from-image') để xử lý EXIF
   - OffscreenCanvas nếu có
   - WebP 600px @0.65 → ~30-50KB
   - Watermark vẽ sau khi resize
   ========================================================= */
async function compressImageWithWatermark(file, opts = {}) {
  const {
    maxDim = 600,
    quality = 0.65,
    name = '',
    type = 'Vào',
    timeISO = new Date().toISOString(),
  } = opts;

  const mime = supportsWebP() ? 'image/webp' : 'image/jpeg';

  // 1) Load ảnh
  let source = null;
  let isBitmap = false;
  try {
    if (typeof createImageBitmap === 'function') {
      try {
        source = await createImageBitmap(file, { imageOrientation: 'from-image' });
        isBitmap = true;
      } catch {
        source = await createImageBitmap(file);
        isBitmap = true;
      }
    }
  } catch (err) {
    console.warn('createImageBitmap failed, fallback:', err);
  }
  if (!source) {
    source = await loadImageElement(file);
  }

  // 2) Tính kích thước
  let width = source.width || source.naturalWidth;
  let height = source.height || source.naturalHeight;
  if (width > height && width > maxDim) {
    height = Math.round((height * maxDim) / width);
    width = maxDim;
  } else if (height > maxDim) {
    width = Math.round((width * maxDim) / height);
    height = maxDim;
  }

  // 3) Canvas
  let canvas, ctx;
  if (typeof OffscreenCanvas === 'function') {
    canvas = new OffscreenCanvas(width, height);
    ctx = canvas.getContext('2d');
  } else {
    canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    ctx = canvas.getContext('2d');
  }

  ctx.drawImage(source, 0, 0, width, height);

  if (isBitmap && source.close) source.close();
  else if (source.src) URL.revokeObjectURL(source.src);

  // 4) Watermark
  drawWatermark(ctx, width, height, { name, type, timeISO });

  // 5) Export
  if (canvas.convertToBlob) {
    return await canvas.convertToBlob({ type: mime, quality });
  }
  return await new Promise((resolve, reject) => {
    canvas.toBlob(
      b => b ? resolve(b) : reject(new Error('Nén thất bại')),
      mime, quality
    );
  });
}

/* =========================================================
   COMPRESS IMAGE (giữ lại — không watermark, dùng làm fallback)
   ========================================================= */
async function compressImage(file, maxDim = 600, quality = 0.65) {
  const mime = supportsWebP() ? 'image/webp' : 'image/jpeg';

  if (typeof createImageBitmap === 'function') {
    let bitmap = null;
    try {
      bitmap = await createImageBitmap(file);
      let { width, height } = bitmap;
      if (width > height && width > maxDim) {
        height = Math.round((height * maxDim) / width);
        width = maxDim;
      } else if (height > maxDim) {
        width = Math.round((width * maxDim) / height);
        height = maxDim;
      }

      if (typeof OffscreenCanvas === 'function') {
        const off = new OffscreenCanvas(width, height);
        const ctx = off.getContext('2d');
        ctx.drawImage(bitmap, 0, 0, width, height);
        bitmap.close();
        const blob = await off.convertToBlob({ type: mime, quality });
        if (blob) return blob;
      } else {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0, width, height);
        bitmap.close();
        return await new Promise((resolve, reject) => {
          canvas.toBlob(
            b => b ? resolve(b) : reject(new Error('Nén thất bại')),
            mime, quality
          );
        });
      }
    } catch (err) {
      if (bitmap) { try { bitmap.close(); } catch {} }
      console.warn('Fast compress failed, fallback:', err);
    }
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > height && width > maxDim) {
        height = Math.round((height * maxDim) / width);
        width = maxDim;
      } else if (height > maxDim) {
        width = Math.round((width * maxDim) / height);
        height = maxDim;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'medium';
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error('Không nén được ảnh.'));
      }, mime, quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Không đọc được file ảnh.')); };
    img.src = url;
  });
}

/* =========================================================
   UPLOAD PHOTO
   ========================================================= */
async function uploadPhoto(blob, username, type) {
  const date = todayISO();
  const ext = (blob.type || '').includes('webp') ? 'webp' : 'jpg';
  const path = `${username}/${date}/${type}-${Date.now()}.${ext}`;

  const { data, error } = await supabaseClient.storage
    .from(PHOTO_BUCKET)
    .upload(path, blob, {
      contentType: blob.type || 'image/jpeg',
      upsert: false,
      cacheControl: '31536000',
    });

  if (error) throw error;

  const { data: urlData } = supabaseClient.storage
    .from(PHOTO_BUCKET)
    .getPublicUrl(data.path);

  return urlData.publicUrl;
}

/* =========================================================
   EXTRACT STORAGE PATH
   ========================================================= */
function extractStoragePath(publicUrl) {
  if (!publicUrl) return null;
  const marker = `/${PHOTO_BUCKET}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(publicUrl.substring(idx + marker.length).split('?')[0]);
}

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = $('screen-' + name);
  if (target) target.classList.add('active');
}