USSH Attendance — DB Schema

Supabase wosgbrafpbigmbhhodov · TZ Asia/Ho_Chi_Minh · updated 2026-11-10

Tables

employees — id uuid PK · username text · password_hash text (SHA-256 hex, 64 ký tự) · display_name text · phone text? · active bool=true · created_at timestamptz

attendance — id bigint PK · employee_id text (= username, KHÔNG phải FK) · employee_name text · work_date date · check_in_time timestamptz · check_out_time timestamptz? · check_in_photo_url text? · check_out_photo_url text? · check_in_lat/lng/distance float? · check_out_lat/lng/distance float? · created_at timestamptz

user_roles — user_id uuid PK→auth.users · role text · created_at timestamptz

settings — id int PK=1 · university_lat float? · university_lng float? · radius_meters int=200 · updated_at timestamptz

timesheet — bảng công do admin tạo và cập nhật. Các cột đã xác nhận qua RPC: employee_id text (= username) · work_date date · work_days numeric · overtime_hours numeric. Có thể có thêm cột khác; cần đối chiếu schema thực tế trước khi code INSERT/UPDATE.

complaints — bảng khiếu nại. Các cột đã xác nhận qua RPC: id bigint · employee_id text (= username) · work_date date · reporter · content · area · created_at. Cần đối chiếu schema thực tế trước khi code INSERT/UPDATE.

RPC

Function	Args	Returns
verify_employee	p_username, p_password	id uuid, username, display_name, phone
get_today_attendance	p_username, p_password	id, employee_name, employee_id, work_date, check_in_time, check_out_time, check_in_photo_url, check_out_photo_url
employee_checkin	p_username, p_password, p_photo_url	status, message, record_id, check_in_time
employee_checkout	p_username, p_password, p_photo_url	status, message, record_id, check_out_time
create_employee	p_username, p_password, p_display_name, p_phone	uuid
reset_employee_password	p_id uuid, p_password	void
get_my_month_timesheet	p_username, p_password, p_year, p_month	work_date date, work_days numeric, overtime_hours numeric, complaint_count integer
get_my_complaints	p_username, p_password, p_work_date	id bigint, reporter text, content text, area text

Status: ok · auth_failed · already_in · already_out · not_checked_in

Authentication

* verify_employee xác thực bằng SHA-256:
    encode(digest(p_password, 'sha256'), 'hex')
* employees.password_hash lưu chuỗi SHA-256 hex, không lưu plaintext.
* get_my_month_timesheet và get_my_complaints phải dùng cùng cơ chế SHA-256.
* Không dùng crypt() để xác thực các tài khoản này.
* Chuẩn hóa username bằng lower(trim(username)) trong hai RPC lấy bảng công và khiếu nại.

RLS (tóm tắt)

* employees / attendance → chỉ admin (auth.uid() role = admin)
* user_roles → self read
* settings → read public, update admin
* Nhân viên chấm công qua RPC SECURITY DEFINER (bỏ qua RLS theo quyền owner, trừ trường hợp FORCE ROW LEVEL SECURITY hoặc cấu hình đặc biệt).
* timesheet / complaints → RLS bật; policy admin quản lý dữ liệu. Nhân viên đọc dữ liệu qua RPC SECURITY DEFINER, không mở quyền SELECT trực tiếp cho nhân viên.

Storage

Bucket attendance-photos public · path {username}/{YYYY-MM-DD}/{checkin|checkout}-{ts}.{webp|jpg} · read public · insert public · delete admin-only

Admin

admin@skyone.vn — login bằng username admin (auth.js tự thêm @skyone.vn)

⚠️ Gotchas

1. attendance.employee_id = employees.username (TEXT, không FK).
2. employees KHÔNG có updated_at — đừng code INSERT/UPDATE cột này.
3. attendance KHÔNG có UNIQUE (employee_id, work_date) — RPC check IF FOUND.
4. Cột _lat/_lng/_distance + bảng settings đã sẵn sàng cho GPS nhưng code JS chưa dùng.
5. 6 RPC chấm công cũ đã tồn tại — không cần tạo mới trừ khi thêm feature.
6. Bucket public — ảnh qua getPublicUrl(), không cần signed URL.
7. Password lưu SHA-256 hex qua digest() và encode(), không phải bcrypt/crypt().
8. work_date = (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date.
9. get_my_month_timesheet tạo một dòng cho mỗi ngày trong tháng; nếu xác thực thành công, tháng 30 ngày trả 30 dòng kể cả ngày chưa có bảng công.
10. Nếu RPC xác thực thất bại, hàm RETURN; và trả mảng rỗng [].
11. Khi JOIN bảng công, chuẩn hóa employee_id và username bằng lower(trim(...)) để tránh lệch chữ hoa/thường hoặc khoảng trắng.
12. Không thay đổi cơ chế xác thực SHA-256 nếu chưa cập nhật đồng bộ toàn bộ RPC và luồng đăng nhập.

Fix log — 2026-11-10

Lỗi: Nhân viên đăng nhập thành công nhưng không xem được bảng công admin tạo.

Nguyên nhân: verify_employee dùng SHA-256 nhưng hai RPC get_my_month_timesheet và get_my_complaints dùng crypt(). Hai cơ chế không tương thích.

Đã cập nhật:

* Đổi kiểm tra mật khẩu trong hai RPC sang:
    e.password_hash = encode(digest(p_password, 'sha256'), 'hex')
* Chuẩn hóa username bằng lower(trim(...)).
* Đặt alias cho generate_series và các cột truy vấn để tránh lỗi column reference "work_date" is ambiguous.
* Giữ nguyên chữ ký hàm, kiểu dữ liệu trả về và SECURITY DEFINER.

SQL kiểm tra sau cập nhật:

SELECT COUNT(*) AS total_days
FROM public.get_my_month_timesheet(
  'test02',
  'MAT_KHAU_TEST02',
  2026,
  11
);

Kết quả mong đợi: 30.

Lưu ý trạng thái: Đã cung cấp SQL cập nhật hai RPC; cần xác nhận truy vấn kiểm tra thành công trên database thực tế trước khi đánh dấu lỗi đã khắc phục hoàn toàn.