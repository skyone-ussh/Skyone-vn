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

function formatDateVN(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}

function formatTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
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
   COMPRESS IMAGE — fast path:
   - createImageBitmap (decode nhanh hơn Image 2x)
   - OffscreenCanvas (convert không block main thread)
   - 600px @ 0.65 → ~25-50KB
   Fallback: Image + Canvas cũ nếu trình duyệt không hỗ trợ
   ========================================================= */
async function compressImage(file, maxDim = 600, quality = 0.65) {
  const mime = supportsWebP() ? 'image/webp' : 'image/jpeg';

  // ===== FAST PATH: createImageBitmap + OffscreenCanvas =====
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

      // OffscreenCanvas (fast, off main thread)
      if (typeof OffscreenCanvas === 'function') {
        const off = new OffscreenCanvas(width, height);
        const ctx = off.getContext('2d');
        ctx.drawImage(bitmap, 0, 0, width, height);
        bitmap.close();

        const blob = await off.convertToBlob({ type: mime, quality });
        if (blob) return blob;
      } else {
        // Regular canvas fallback
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0, width, height);
        bitmap.close();

        return await new Promise((resolve, reject) => {
          canvas.toBlob(
            b => b ? resolve(b) : reject(new Error('Nén thất bại')),
            mime,
            quality
          );
        });
      }
    } catch (err) {
      if (bitmap) { try { bitmap.close(); } catch {} }
      console.warn('Fast compress failed, fallback:', err);
    }
  }

  // ===== FALLBACK: Image + Canvas =====
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

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Không đọc được file ảnh.'));
    };

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