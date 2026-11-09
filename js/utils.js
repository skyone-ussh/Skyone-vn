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

/* =========================================================
   WEBP SUPPORT DETECTION (cache 1 lần)
   ========================================================= */
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
   COMPRESS IMAGE — tối ưu: 800px + WebP 0.7
   → ~40-80KB (thay vì 200-300KB như trước)
   ========================================================= */
async function compressImage(file, maxDim = 800, quality = 0.7) {
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
      ctx.imageSmoothingQuality = 'medium'; // nhanh hơn 'high', chất lượng đủ tốt
      ctx.drawImage(img, 0, 0, width, height);

      const mimeType = supportsWebP() ? 'image/webp' : 'image/jpeg';

      canvas.toBlob(blob => {
        if (blob) {
          // blob.type sẽ là mimeType đã dùng
          resolve(blob);
        } else {
          reject(new Error('Không nén được ảnh.'));
        }
      }, mimeType, quality);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Không đọc được file ảnh.'));
    };

    img.src = url;
  });
}

/* =========================================================
   UPLOAD PHOTO — cache control 1 năm, giữ định dạng gốc
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
      cacheControl: '31536000', // 1 năm — CDN cache tốt hơn
    });

  if (error) throw error;

  const { data: urlData } = supabaseClient.storage
    .from(PHOTO_BUCKET)
    .getPublicUrl(data.path);

  return urlData.publicUrl;
}

/* =========================================================
   TRÍCH XUẤT STORAGE PATH TỪ PUBLIC URL
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