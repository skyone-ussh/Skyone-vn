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

/**
 * Nén ảnh trước khi upload: max 1200px, JPEG 0.8
 */
async function compressImage(file, maxDim = 1200, quality = 0.8) {
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
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error('Không nén được ảnh.'));
      }, 'image/jpeg', quality);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Không đọc được file ảnh.'));
    };
    img.src = url;
  });
}

/**
 * Upload ảnh lên Supabase Storage. Trả về public URL.
 */
async function uploadPhoto(blob, username, type) {
  const date = todayISO();
  const path = `${username}/${date}/${type}-${Date.now()}.jpg`;

  const { data, error } = await supabaseClient.storage
    .from(PHOTO_BUCKET)
    .upload(path, blob, { contentType: 'image/jpeg', upsert: false });

  if (error) throw error;

  const { data: urlData } = supabaseClient.storage
    .from(PHOTO_BUCKET)
    .getPublicUrl(data.path);

  return urlData.publicUrl;
}

/**
 * Trích xuất storage path từ public URL.
 * VD: https://xxx.supabase.co/storage/v1/object/public/attendance-photos/user/2026-11-09/checkin-123.jpg
 *     → user/2026-11-09/checkin-123.jpg
 */
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