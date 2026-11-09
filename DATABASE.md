# DATABASE SCHEMA — App Chấm Công USSH

> **Cập nhật:** 2026-11-09  
> **Supabase project:** `wosgbrafpbigmbhhodov`  
> **Timezone:** `Asia/Ho_Chi_Minh`

---

## 📦 Tables

### `employees` — Tài khoản nhân viên
| Column | Type | Null | Default |
|---|---|---|---|
| `id` | `uuid` PK | NO | `gen_random_uuid()` |
| `username` | `text` | NO | — |
| `password_hash` | `text` | NO | — (bcrypt cost 10) |
| `display_name` | `text` | NO | — |
| `phone` | `text` | YES | — |
| `active` | `boolean` | YES | `true` |
| `created_at` | `timestamptz` | YES | `now()` |

> ⚠️ **Thiếu `updated_at`** — nếu RPC `reset_employee_password` có set `updated_at` sẽ fail.  
> ✅ Nếu đổi password OK → không sao, coi như RPC không set.

### `attendance` — Bản ghi chấm công
| Column | Type | Null | Ghi chú |
|---|---|---|---|
| `id` | `bigint` PK | NO | auto-increment |
| `employee_id` | `text` | NO | = `employees.username` (KHÔNG phải FK) |
| `employee_name` | `text` | NO | snapshot |
| `work_date` | `date` | NO | theo giờ VN |
| `check_in_time` | `timestamptz` | NO | — |
| `check_out_time` | `timestamptz` | YES | — |
| `check_in_photo_url` | `text` | YES | public URL |
| `check_out_photo_url` | `text` | YES | public URL |
| `check_in_lat` / `check_in_lng` / `check_in_distance` | `double precision` | YES | **GPS — CHƯA DÙNG trong code JS** |
| `check_out_lat` / `check_out_lng` / `check_out_distance` | `double precision` | YES | **GPS — CHƯA DÙNG** |
| `created_at` | `timestamptz` | YES | `now()` |

> ⚠️ **Không có UNIQUE `(employee_id, work_date)`** — nhưng RPC check `IF FOUND` trước insert.

### `user_roles` — Phân quyền admin
| Column | Type | Null |
|---|---|---|
| `user_id` | `uuid` PK (FK `auth.users`) | NO |
| `role` | `text` | NO |
| `created_at` | `timestamptz` | YES |

### `settings` — Cấu hình (chưa dùng trong code JS)
| Column | Type | Default |
|---|---|---|
| `id` | `integer` PK | 1 |
| `university_lat` | `double precision` | — |
| `university_lng` | `double precision` | — |
| `radius_meters` | `integer` | 200 |
| `updated_at` | `timestamptz` | `now()` |

> 💡 Có sẵn hạ tầng cho GPS check-in, chưa kích hoạt.

---

## ⚙️ RPC Functions

| Function | Args | Returns | Mục đích |
|---|---|---|---|
| `verify_employee` | `(p_username text, p_password text)` | `TABLE(id uuid, username text, display_name text, phone text)` | Login nhân viên |
| `get_today_attendance` | `(p_username text, p_password text)` | `TABLE(id bigint, employee_name text, employee_id text, work_date date, check_in_time timestamptz, check_out_time timestamptz, check_in_photo_url text, check_out_photo_url text)` | Lấy record hôm nay |
| `employee_checkin` | `(p_username text, p_password text, p_photo_url text)` | `TABLE(status text, message text, record_id bigint, check_in_time timestamptz)` | Chấm công vào |
| `employee_checkout` | `(p_username text, p_password text, p_photo_url text)` | `TABLE(status text, message text, record_id bigint, check_out_time timestamptz)` | Chấm công ra |
| `create_employee` | `(p_username text, p_password text, p_display_name text, p_phone text)` | `uuid` | Admin tạo NV |
| `reset_employee_password` | `(p_id uuid, p_password text)` | `void` | Admin đổi pass |

**Status codes trả về:**
- `ok` — thành công
- `auth_failed` — sai username/password
- `already_in` / `already_out` — đã chấm rồi
- `not_checked_in` — checkout khi chưa checkin

---

## 🔒 RLS Policies (public schema)

| Table | Policy | Cmd | Điều kiện |
|---|---|---|---|
| `employees` | `admin manage employees` | ALL | `auth.uid()` role = `admin` |
| `attendance` | `admin can read attendance` | SELECT | `auth.uid()` role = `admin` |
| `attendance` | `admin can delete attendance` | DELETE | `auth.uid()` role = `admin` |
| `user_roles` | `self read role` | SELECT | `user_id = auth.uid()` |
| `settings` | `anyone read settings` | SELECT | `true` |
| `settings` | `admin update settings` | UPDATE | `auth.uid()` role = `admin` |

> Nhân viên chấm công đi qua **RPC SECURITY DEFINER** → bỏ qua RLS, không cần policy INSERT/UPDATE.

---

## 📁 Storage

| Bucket | Public | Dùng cho |
|---|---|---|
| `attendance-photos` | ✅ true | Ảnh chấm công |

**Path pattern:** `{username}/{YYYY-MM-DD}/{checkin|checkout}-{timestamp}.{webp|jpg}`

**Policies storage.objects:**
| Policy | Cmd | Điều kiện |
|---|---|---|
| `anyone can read attendance photos` | SELECT | public |
| `anyone can upload attendance photos` | INSERT | public |
| `admin can delete attendance photos` | DELETE | `auth.uid()` role = `admin` |

---

## 👤 Admin account

| Email | Password | Role |
|---|---|---|
| `admin@skyone.vn` | *(user tự biết)* | `admin` |

> Login username: `admin` → `auth.js` tự thêm `@skyone.vn`

---

## 📝 Notes cho AI khi đọc file này

1. **`attendance.employee_id` = `employees.username`** (TEXT, không phải UUID FK)
2. **Không có `employees.updated_at`** — đừng code INSERT/UPDATE cột này
3. **Không có UNIQUE `(employee_id, work_date)`** — RPC tự handle
4. **`settings` + cột `_lat/_lng/_distance` đã sẵn sàng cho GPS**, chưa dùng
5. **Đã có sẵn 6 RPC** — không cần tạo mới trừ khi thêm feature
6. **Bucket public** — ảnh xem qua `getPublicUrl()`, không cần signed URL
7. **Password hash bcrypt** qua `pgcrypto.crypt()` — không lưu plaintext
8. **Timezone VN** — `work_date` tính bằng `(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date`

---

## ❌ Không cần chạy SQL gì thêm

DB hiện tại **tương thích hoàn toàn** với code JS.  
Chỉ khi thêm feature mới (GPS, lịch sử NV...) mới cần migration.