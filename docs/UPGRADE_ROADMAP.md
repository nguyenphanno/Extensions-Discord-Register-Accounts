# Lộ trình nâng cấp (Upgrade Roadmap)

Checklist trạng thái theo chủ đề. Kế hoạch chi tiết theo pha nằm ở `docs/IMPLEMENTATION_PLAN.md`.

| Trường | Giá trị |
|---|---|
| Phiên bản hiện tại | `1.0.0` |
| Cập nhật gần nhất | 2026-10-05 — P1 hoàn tất, một phần P2 |

---

## 1. Đăng ký tự động (Autofill + Flow)

| Mục | Trạng thái | Ghi chú |
|---|---|---|
| Điền Display Name (`global_name`) | ✅ | Rule `displayName` nhận thêm `globalname`/`global-name`; có test hồi quy. |
| Điền DOB dạng 3 `<select>` native | ✅ | `fillBirthdaySelects` chạy đồng bộ trong cả "Fill only". |
| Flow nhiều bước (pre-screen → submit) | ✅ | `DiscordRegisterFlow.ts`: DOB/ToS pre-screen, tick checkbox, Continue, submit. |
| Tự động bấm submit | ✅ | Nút chính "Auto-fill & submit" (`autofill/flow`). |
| Reset `_valueTracker` cho React | ✅ | Mọi đường ghi đều reset tracker rồi mới dispatch event. |
| Popup/custom dropdown engine | ✅ | Fallback khi Discord dùng dropdown không phải native select. |

## 2. Token & hồ sơ Discord

| Mục | Trạng thái | Ghi chú |
|---|---|---|
| Bắt token qua iframe same-origin | ✅ | `TokenCapture.ts` đọc `localStorage.token` từ iframe sạch. |
| Lưu token + trạng thái vào vault | ✅ | `token`, `tokenStatus`, `tokenCapturedAt`. |
| Gọi `/api/v9/users/@me` lấy hồ sơ | ✅ | Avatar, badges, Nitro, phone-lock, ngày tạo từ snowflake. |
| Nút "Capture token & profile" | ✅ | Ở VaultDetail và RegisterView. |
| Token health check định kỳ | ✅ | Alarm `dra:token-health`, mặc định 6h, bỏ qua token đã chết. |
| Revoke session (xoá token + profile) | ✅ | `vault/revokeToken`, chỉ xoá cục bộ, có confirm. |
| Cảnh báo khi copy token | ✅ | Toast nhấn mạnh: token là bearer credential, clipboard tự xoá theo setting. |
| Lưu thêm refresh token / nhiều session | ⬜ | Cần schema `sessions[]`, feature-flag. |

## 3. Xuất & nhập dữ liệu

| Mục | Trạng thái | Ghi chú |
|---|---|---|
| Export TXT (tokens / full) | ✅ | `txt-tokens`: 1 token/dòng; `txt-full`: 11 cột phân tách bằng ` \| `. |
| CSV thêm cột token/profile | ✅ | `token`, `token_status`, `discord_user_id`, `avatar_url`, `badges`, timestamps. |
| Nhập lại TXT | ✅ | Tự nhận diện JSON/TXT; dòng token trần được báo riêng, không tạo record rỗng. |
| Đồng bộ vault máy khác (mã hóa) | ⬜ | Web Crypto PBKDF2 + AES-GCM, file `.dra`. |

## 4. Giao diện

| Mục | Trạng thái | Ghi chú |
|---|---|---|
| Avatar thật từ Discord CDN | ✅ | `Avatar` nhận `imageUrl`, fallback về avatar sinh sẵn. |
| Chip trạng thái token | ✅ | Live / Unverified / Phone locked / Dead. |
| Section "Discord session" | ✅ | Token, badges, Nitro, avatar decoration, ID + ngày tạo. |
| Stepper "Next steps" | ✅ | Bước suy ra từ record, kèm nút hành động cho bước đang kẹt. |
| Bộ lọc + thống kê token | ✅ | Chip lọc trạng thái token, stat card Live/Dead/Verified. |
| Toast stack | ✅ | Tối đa 5 card; cùng `key` thì refresh 1 card; stagger + reduced-motion. |
| Biểu đồ thống kê theo thời gian | ⬜ | Accounts/verified theo ngày, vẽ SVG/CSS, không thêm lib. |
| Dashboard riêng (tab) | ⬜ | Tổng hợp vault health, hiện mới là stat card trong Vault. |
| Batch queue (user-paced) | ⬜ | Hàng đợi `mailboxReady`, không submit song song. |
| Saved filters + tag presets mới | ⬜ | Kết hợp status + tokenStatus + tag + query. |
| Launcher 2.0 / popup polish | ⬜ | Quick actions trong launcher, popup copy stack. |
| Onboarding first-run | ⬜ | 3–4 bước, có thể mở lại từ Settings. |

## 5. Kỹ thuật & kiểm thử

| Mục | Trạng thái | Ghi chú |
|---|---|---|
| Tách `ContentBridge` dùng chung | ✅ | AutofillHandler và VaultHandler dùng chung đường gửi message. |
| Sanitize record cũ lúc đọc | ✅ | `AccountVault.list()` migrate tường minh, không phá vault cũ. |
| Vitest + nunit test nền | ✅ | 34 test cho FieldMatcher / VaultExporter / AccountRecordGuard. |
| Coverage gate cho module thuần | ✅ | `npm run test:coverage`: lines ≥ 80, branches ≥ 75, functions ≥ 80. |
| Integration test (MessageRouter, storage mock) | ⬜ | Cần mock `chrome.storage` + `chrome.alarms`. |
| E2E smoke (Playwright + load extension) | ⬜ | Mock form Discord, không phụ thuộc DOM production. |
| Giảm dung lượng content script | ⬜ | Tách popup engine sang chunk on-demand. |
| Release packaging (`npm run release`) | ⬜ | Zip `dist-release/` + changelog + screenshot store. |



## 6. Browser Identity Lab — ranh giới

Kế hoạch gốc đề xuất gắn mỗi account một "identity pack" (User-Agent, Client Hints, cookie jar)
và áp dụng qua `declarativeNetRequest` lên request Discord. **Phần này không được triển khai**, và
đây là quyết định có chủ đích, không phải phần việc bị bỏ sót:

- Giả User-Agent / Client Hints và ghi cookie session lên domain Discord để *tránh bị Discord phát
  hiện là tự động hóa* là cơ chế né tránh hệ thống chống lạm dụng. Extension này đã tự động hoá
  đăng ký; thêm lớp giả danh tính chỉ phục vụ mục đích đó.
- Nó cũng là mối rủi ro thực tế: cookie jar restore có thể ghi đè session đang đăng nhập, và
  `declarativeNetRequest` mở thêm quyền mạnh mà không cần cho chức năng cốt lõi
  (generator → autofill → token → vault).

Những phần **có thể làm an toàn** (chưa triển khai, ghi nhận để sau này chọn):
metadata pack chỉ để hiển thị/đối chiếu (không áp vào request), header tùy chỉnh cho
`ApiClient` của backend temp-mail (không đụng Discord), và bảng capability trung thực trong UI.

## 7. Luồng công việc lý tưởng (hiện tại đã đạt)

1. Tạo danh tính → cấp mailbox.
2. Mở `discord.com/register` → **Auto-fill & submit** → giải captcha (nếu có).
3. Flow tự điền email/username/password/display name/DOB, tick ToS, bấm Continue, submit.
4. Token tự bắt → lưu vault → fetch hồ sơ (avatar, badges, Nitro, ngày tạo).
5. Vào Inbox lấy mã → **Paste code** → đánh dấu Verified.
6. Export `txt-tokens` / `txt-full` khi cần đưa sang công cụ khác.

Token bị Discord thu hồi sẽ tự chuyển chip **Dead** nhờ health check, không cần mở UI.

---

*Cập nhật lần cuối: 2026-10-05.*
