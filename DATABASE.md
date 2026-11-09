# USSH Attendance — DB Schema
Supabase `wosgbrafpbigmbhhodov` · TZ `Asia/Ho_Chi_Minh` · updated 2026-11-09

## Tables

**employees** — `id uuid PK` · `username text` · `password_hash text` (bcrypt) · `display_name text` · `phone text?` · `active bool=true` · `created_at timestamptz`

**attendance** — `id bigint PK` · `employee_id text` (= username, KHÔNG phải FK) · `employee_name text` · `work_date date` · `check_in_time timestamptz` · `check_out_time timestamptz?` · `check_in_photo_url text?` · `check_out_photo_url text?` · `check_in_lat/lng/distance float?` · `check_out_lat/lng/distance float?` · `created_at timestamptz`

**user_roles** — `user_id uuid PK→auth.users` · `role text` · `created_at timestamptz`

**settings** — `id int PK=1` · `university_lat float?` · `university_lng float?` · `radius_meters int=200` · `updated_at timestamptz`

## RPC

| Function | Args | Returns |
|---|---|---|
| `verify_employee` | `p_username, p_password` | `id uuid, username, display_name, phone` |
| `get_today_attendance` | `p_username, p_password` | `id, employee_name, employee_id, work_date, check_in_time, check_out_time, check_in_photo_url, check_out_photo_url` |
| `employee_checkin` | `p_username, p_password, p_photo_url` | `status, message, record_id, check_in_time` |
| `employee_checkout` | `p_username, p_password, p_photo_url` | `status, message, record_id, check_out_time` |
| `create_employee` | `p_username, p_password, p_display_name, p_phone` | `uuid` |
| `reset_employee_password` | `p_id uuid, p_password` | `void` |

**Status:** `ok` · `auth_failed` · `already_in` · `already_out` · `not_checked_in`

## RLS (tóm tắt)
- `employees` / `attendance` → chỉ admin (`auth.uid()` role = `admin`)
- `user_roles` → self read
- `settings` → read public, update admin
- Nhân viên chấm công qua **RPC SECURITY DEFINER** (bỏ qua RLS)

## Storage
Bucket `attendance-photos` public · path `{username}/{YYYY-MM-DD}/{checkin|checkout}-{ts}.{webp|jpg}` · read public · insert public · delete admin-only

## Admin
`admin@skyone.vn` — login bằng username `admin` (auth.js tự thêm `@skyone.vn`)

## ⚠️ Gotchas
1. `attendance.employee_id` = `employees.username` (TEXT, không FK)
2. `employees` **KHÔNG có `updated_at`** — đừng code INSERT/UPDATE cột này
3. `attendance` **KHÔNG có UNIQUE** `(employee_id, work_date)` — RPC check `IF FOUND`
4. Cột `_lat/_lng/_distance` + bảng `settings` **đã sẵn sàng cho GPS nhưng code JS chưa dùng**
5. 6 RPC đã tồn tại — không cần tạo mới trừ khi thêm feature
6. Bucket public — ảnh qua `getPublicUrl()`, không cần signed URL
7. Password bcrypt qua `pgcrypto.crypt()` — không plaintext
8. `work_date` = `(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date`