# Implementation Plan — Discord Register Accounts

Kế hoạch nâng cấp / mở rộng toàn diện cho extension **Discord Register Accounts** (Chrome/Edge, Manifest V3).

Tài liệu này **không chứa code** — chỉ mô tả mục tiêu, phạm vi, thứ tự bước, tiêu chí hoàn thành, rủi ro và sprint. Bổ sung chi tiết cho `docs/UPGRADE_ROADMAP.md` (checklist trạng thái ngắn).

| Trường | Giá trị |
|---|---|
| Phiên bản hiện tại | `1.0.0` |
| Mục tiêu phiên bản | `1.1` → `1.2` → `1.3` → `1.4` (theo pha) |
| Ngày soạn | 2026-10-05 |
| Cập nhật | 2026-10-05 — thêm pha Browser Identity Lab (UA / header / cookie) |
| Nguyên tắc | User-gesture first · Schema an toàn · TDD cho logic thuần · Giữ design language Discord · MV3-honest |

---

## 0. Tóm tắt điều hành

### Vấn đề
Extension đã có generator, mailbox, autofill flow, token/profile, vault export — đủ dùng, nhưng còn thiếu:

- Feedback UI khi flow chạy nhiều bước (toast bị ghi đè)
- Import TXT / đồng bộ máy khác có mã hóa
- Theo dõi sức khỏe token tự động
- Wizard workflow rõ bước
- Dashboard thống kê
- Polish giao diện (motion, empty state, launcher sâu hơn)
- **Hồ sơ trình duyệt gắn account** (User-Agent, header, cookie jar, locale pack)
- Nền tảng test & release

### Mục tiêu sản phẩm
Biến tool thành **bộ quản lý đăng ký + vault + browser identity chuyên nghiệp**: workflow có checklist, dữ liệu an toàn, UI first-party Discord, mỗi account có “identity pack” nhất quán (UA / language / cookie / header template), chất lượng kỹ thuật đo được.

### Ngoài phạm vi (không làm)
- Canvas / WebGL / Audio / font fingerprint spoof (anti-detect browser giả)
- TLS / JA3 / HTTP/2 fingerprint spoof
- Auto-register hàng loạt không có user gesture
- Thay đổi thiết kế lệch Discord (theme “AI generic”)
- Viết lại toàn bộ architecture từ đầu
- Promise “qua mặt” hệ thống chống-bot của Discord — chỉ làm những gì **Chrome MV3 API công khai cho phép** và gắn với session/account **user sở hữu**

---

## 1. Hiện trạng baseline (không làm lại)

### Đã ship
| Lĩnh vực | Đã có |
|---|---|
| Identity | 5 display formats, 4 username styles, password policy, birthday, avatar seed, uniqueness registry |
| Mailbox | Domain pool, inbox, sanitizer, verification code extractor, alarms sync |
| Autofill | FieldMatcher, DomAutofillEngine, DiscordRegisterFlow (DOB/ToS/Continue/submit), popup dropdown engine |
| Token | iframe capture, vault fields, `/users/@me` profile, chips Live/Unverified/Phone locked/Dead |
| Vault | Search, multi-select, tags, JSON/CSV/TXT export, import JSON/CSV |
| UI surfaces | Popup, side panel, options, in-page launcher (shadow DOM) |
| DX | 3 Vite passes (UI / background / content), design tokens Discord Dark + Midnight |

### Gap đã ghi trong roadmap (⬜)
1. Toast stack  
2. Import TXT  
3. Encrypted cross-device sync  
4. Token health check cron  
5. Multi-session token  
6. Copy-token warning + Revoke session  
7. Biểu đồ thống kê  
8. Unit test FieldMatcher & exporter  
9. E2E extension  
10. Giảm bundle content script  

Kế hoạch dưới đây **bao gồm toàn bộ gap trên**, **pha P2X Browser Identity Lab** (UA / header / cookie / persona), và **mở rộng thêm** nhiều hạng mục UX / trang trí / tính năng mới.

---

## 2. Nguyên tắc triển khai

1. **User-gesture first** — mọi thao tác DOM trên Discord chỉ chạy sau click/hotkey của người dùng.  
2. **Schema forward-only** — field mới qua `SchemaMigrator` + `AccountRecordGuard`; không phá record cũ.  
3. **TDD cho pure logic** — matcher, exporter, migrator, scheduler: test trước, code sau; mục tiêu ≥ 80% coverage module đó.  
4. **Design system trước decoration** — mở rộng `Tokens.css` / primitives; không invent component lệch Discord.  
5. **Bảo mật vault > evasion** — ưu tiên mã hóa local, clipboard hygiene, redaction log.  
6. **Một PR = một slice** — mỗi mục có done criteria riêng; không gộp cả pha vào một PR khổng lồ.  
7. **Đo trước khi tối ưu** — bundle size / alarm cadence / storage footprint có số liệu trước–sau.

---

## 3. Phân pha & versioning

| Pha | Version gợi ý | Thời lượng | Chủ đề |
|---|---|---|---|
| **P1** | 1.1.0 | 1–1.5 tuần | Hoàn thiện gap roadmap + UX unblocker |
| **P2** | 1.2.0 | 1.5–2 tuần | Workflow thông minh + dashboard |
| **P2X** | 1.2.x / 1.3.0 | 1.5–2 tuần | Browser Identity Lab: UA · header · cookie · profile pack |
| **P3** | 1.3.0 | 1–1.5 tuần | Bảo mật vault + sync mã hóa (gồm cookie jar) |
| **P4** | 1.3.x | 1 tuần | Trang trí UI, motion, launcher 2.0 |
| **P5** | 1.4.0 | 1–1.5 tuần | Test, perf, release hygiene |
| **P6** | backlog | — | Nice-to-have lớn (làm sau khi P1–P5 + P2X ổn) |

---

## 4. Pha P1 — Nền vững (gap + unblocker)

### P1.1 Toast stack
**Vấn đề:** Một toast duy nhất bị ghi đè khi flow register cập nhật liên tục.  
**Bước chi tiết:**
1. Thiết kế model toast: `id`, `tone`, `title?`, `message`, `createdAt`, `ttlMs`, `sticky?`.  
2. Đổi `ToastStore` từ single → queue (max 3–5); API `push` / `dismiss` / `clearAll`.  
3. UI Feedback: stack góc (thường bottom), stagger animation, auto-dismiss theo TTL.  
4. Map lại mọi call-site (autofill progress, token capture, mailbox sync, errors).  
5. Tôn trọng `reduceMotion`.  
**Done khi:** ≥ 3 sự kiện liên tiếp hiển thị đồng thời/readable; không leak memory khi spam toast.  
**File chạm (dự kiến):** `ToastStore.ts`, `Feedback.tsx`, `Overlays.css`, call-sites hooks/features.

### P1.2 Import TXT (`txt-tokens` / `txt-full`)
**Bước:**
1. Viết spec format (1 token/dòng; full dùng delimiter ` | ` đúng thứ tự cột export).  
2. Parser + validation + báo dòng lỗi.  
3. Dedup strategy: theo `token` → `email` → `discordUsername`.  
4. Preview UI trước khi commit vào vault (số dòng hợp lệ / trùng / lỗi).  
5. Activity log: `import.txt` với counts.  
6. Unit test round-trip export → import.  
**Done khi:** export TXT rồi import lại không mất field quan trọng; dòng xấu không làm fail cả batch.  
**Phụ thuộc:** `VaultExporter`, vault import UI.

### P1.3 Token health check định kỳ
**Bước:**
1. Thêm setting: `tokenHealthCheckEnabled`, `tokenHealthCheckIntervalHours` (mặc định 6h).  
2. Đăng ký `chrome.alarms` trong background bootstrap.  
3. Quét accounts có `token` và `tokenStatus ≠ dead`.  
4. Gọi profile service; map HTTP/auth errors → `dead` / `phoneLocked` / `live` / `unverified`.  
5. Rate-limit giữa các account (tránh burst).  
6. Optional notification khi status chuyển sang `dead`.  
7. Ghi Activity + `updatedAt`.  
**Done khi:** token bị thu hồi tự chuyển chip Dead mà không cần mở UI.  
**Rủi ro:** SW sleep — dựa alarms; cold start MessageBus đã có.

### P1.4 Cảnh báo copy token + Revoke session
**Bước:**
1. Khi copy token: confirm nhẹ hoặc toast mạnh + nhắc clipboard clear countdown.  
2. Setting tùy chọn `warnOnTokenCopy` (default on).  
3. Nút **Revoke session** trong VaultDetail / Discord session section.  
4. Revoke: cố gắng logout remote (nếu endpoint khả dụng) → luôn wipe local `token` + profile fields liên quan → status `none`.  
5. Audit path xóa account: đảm bảo secret fields không còn trong storage.  
**Done khi:** copy token luôn có cảnh báo (khi bật); revoke để lại record sạch token.

### P1.5 Unit test nền (Vitest)
**Bước:**
1. Thêm Vitest + script `test`, `test:coverage`.  
2. Suite ưu tiên: `FieldMatcher`, `VaultExporter` (JSON/CSV/TXT), `AccountRecordGuard`, helpers birthday/select nếu pure.  
3. Coverage gate ≥ 80% cho các module pure trên.  
4. Tài liệu ngắn trong README: cách chạy test.  
**Done khi:** `npm test` xanh local; coverage báo cáo được.  
**Ghi chú:** Chưa cần E2E ở P1.

### P1.6 Checklist P1 (Definition of Done pha)
- [ ] Toast stack hoạt động trên popup + panel  
- [ ] Import TXT round-trip  
- [ ] Health check alarm + settings  
- [ ] Warn copy token + revoke  
- [ ] Vitest chạy được cho matcher/exporter  
- [ ] Cập nhật tick trong `UPGRADE_ROADMAP.md`

---

## 5. Pha P2 — Workflow & năng suất

### P2.1 Guided registration checklist (per account)
**Mục tiêu:** Status thủ công trở thành wizard rõ bước.  
**Các bước UI đề xuất:**
1. Draft → Generate / attach mailbox  
2. Open Discord register  
3. Auto-fill & submit  
4. Captcha (manual gate)  
5. Capture token & profile  
6. Inbox → Paste verification code  
7. Mark Verified  

**Bước triển khai:**
1. Model progress derived từ `AccountStatus` + token/mail fields (không invent status mới nếu có thể derive).  
2. Stepper component trong `VaultDetail` + `RegisterView`.  
3. Mỗi step có CTA đúng (Open page / Fill / Capture / Paste / Mark).  
4. Highlight bước đang kẹt.  
**Done khi:** user nhìn account là biết đang ở bước nào và bấm được hành động tiếp theo.

### P2.2 Smart Inbox → Paste latest code
**Bước:**
1. Khi có `lastVerificationCode` mới: toast + badge trên account/rail Inbox.  
2. Action **Paste latest code** (command palette + hotkey).  
3. Sau paste thành công: gợi ý cập nhật status / checklist step.  
4. Không auto-paste khi không có gesture.  
**Done khi:** từ “có mail” đến “đã paste” ≤ 2 click.

### P2.3 Batch register queue (user-paced)
**Bước:**
1. Filter/queue accounts `mailboxReady` (hoặc tag `queue`).  
2. UI “Next in queue”: chọn 1 → Fill & submit → đánh dấu tiến độ → Next.  
3. Không submit song song hàng loạt.  
4. Lưu `queueCursor` trong UI store (không bắt buộc persist).  
**Done khi:** làm N account liên tiếp không phải search vault mỗi lần.

### P2.4 Tags presets & saved filters
**Bước:**
1. Tag presets: `export-ready`, `retry`, `phone-lock`, `nitro`, `manual`.  
2. Saved filters: kết hợp `status` + `tokenStatus` + tags + text query.  
3. Chip row trên `VaultView`; lưu trong settings hoặc UI store persist.  
4. Command palette: “Filter: Live + Verified”.  
**Done khi:** lọc tổ hợp phổ biến trong 1 click.

### P2.5 Notes & per-account timeline
**Bước:**
1. Giữ `notes` plain (hoặc markdown rất nhẹ nếu đã có primitive).  
2. Timeline derived: `createdAt`, mailbox ready, `registeredAt`, `tokenCapturedAt`, `verifiedAt`, `profileFetchedAt`.  
3. Render dưới Discord session trong detail.  
**Done khi:** mọi mốc đọc được không cần Activity global.

### P2.6 Dashboard thống kê
**Bước:**
1. Rail item hoặc tab **Dashboard** (đầu panel).  
2. Cards: tổng accounts; breakdown theo `AccountStatus`; token live/dead/phoneLocked; verify rate 7/30 ngày.  
3. Chart đơn giản (SVG/CSS, tránh lib nặng): accounts created / verified theo ngày.  
4. Empty state khi vault trống.  
**Done khi:** mở panel thấy sức khỏe vault trong ~3 giây.  
**Khớp roadmap:** “Biểu đồ thống kê theo thời gian”.

### P2.7 Domain health hints (nhẹ)
**Bước:**
1. Đếm fail verify / mailbox errors theo domain (từ activity hoặc counters trên record).  
2. Generator ưu tiên domain healthy hơn trong lottery (không block domain).  
3. Settings: bật/tắt bias.  
**Done khi:** domain liên tục fail bị hạ ưu tiên có thể quan sát trong settings/debug.

### P2.8 Checklist P2
- [ ] Stepper checklist  
- [ ] Paste latest code  
- [ ] Queue user-paced  
- [ ] Saved filters + tag presets  
- [ ] Timeline + Dashboard  
- [ ] Roadmap/docs cập nhật

---

## 5X. Pha P2X — Browser Identity Lab (UA · Header · Cookie · Profile)

> **Mục tiêu:** mỗi `AccountRecord` mang theo một **Browser Identity Pack** nhất quán (User-Agent, Accept-Language, header templates, cookie jar, locale/timezone metadata) để quản lý session và request **trong giới hạn Chrome MV3**.  
> **Không phải** anti-detect browser đầy đủ — xem mục “Ranh giới kỹ thuật” bên dưới.

### Ranh giới kỹ thuật (đọc trước khi implement)

| Có thể làm (MV3-honest) | Không làm (ngoài phạm vi) |
|---|---|
| Lưu / gán UA string + Client Hints **metadata** per account | Spoof canvas / WebGL / Audio / font fingerprint |
| `declarativeNetRequest` modify **một số** request header trên host đã permission | Spoof TLS / JA3 / HTTP2 fingerprint |
| `chrome.cookies` đọc/ghi cookie trên domain Discord / temp-mail (đúng permission) | Inject cookie của session người khác / session hijack tooling |
| Custom headers cho `ApiClient` (temp-mail backend) | Promise “ẩn” khỏi Discord anti-bot |
| Align `locale` / `Accept-Language` / timezone label với identity generator | Giả navigator toàn cục cho mọi tab hệ thống ngoài scope extension |
| Export/import identity pack + cookie jar **đã mã hóa** (cùng P3) | Headless farm xoay fingerprint tự động |

**Manifest / permission dự kiến (khi implement):** rà soát thêm `declarativeNetRequest` (hoặc `declarativeNetRequestWithHostAccess`), xác nhận `cookies` nếu chưa có; mọi permission mới phải giải thích trong README + options “Privacy”.

---

### P2X.1 Mô hình dữ liệu — `BrowserIdentityPack`
**Bước:**
1. Thiết kế type gắn `AccountRecord` (nullable để tương thích ngược), ví dụ các nhóm field:
   - `profileId` / `presetName` — tham chiếu preset thư viện  
   - `userAgent` — string đầy đủ  
   - `secChUa`, `secChUaMobile`, `secChUaPlatform` — Client Hints **lưu trữ** (áp dụng nếu DNR cho phép)  
   - `acceptLanguage` — khớp `locale` của identity  
   - `accept` / `acceptEncoding` (optional templates)  
   - `timezoneLabel` (IANA, vd. `America/New_York`) + `timezoneOffsetMinutes` (metadata / UI)  
   - `platformLabel` (`Windows` / `macOS` / `Linux` / `Android` / `iOS`)  
   - `cookieJarRef` hoặc inline encrypted blob id  
   - `customHeaders: { name, value, enabled }[]` — whitelist tên header an toàn  
   - `appliedAt`, `source` (`preset` \| `captured` \| `manual`)  
2. `SchemaMigrator` + `AccountRecordGuard` validate độ dài, charset header, cấm header nguy hiểm (`Cookie`, `Host`, `Content-Length` tự set sai, …).  
3. Unit test guard + migrate record cũ → `browserIdentity: null`.  
**Done khi:** vault cũ mở được; record mới lưu/đọc pack tròn trịa.

### P2X.2 Thư viện preset User-Agent & Client Hints
**Bước:**
1. Curated preset (không random rác): Chrome Windows/macOS/Linux gần phiên bản hiện tại, Edge tương ứng, 1–2 mobile label (chỉ metadata nếu mobile UA không khớp thật).  
2. Generator: khi tạo identity, **optional** gán preset theo `locale` / platform preference trong Settings.  
3. Settings: `defaultBrowserPreset`, `autoAssignIdentityPackOnGenerate`.  
4. UI picker trong Generator + VaultDetail: đổi preset → re-roll UA trong cùng family.  
5. “Consistency check”: cảnh báo nếu `secChUaPlatform` ≠ `platformLabel` ≠ UA substring.  
**Done khi:** generate account có pack hợp lệ; user đổi preset trong 1 click; inconsistency hiện warning chip.

### P2X.3 Header Lab — template & áp dụng request
**Hai mặt trận tách bạch:**

**A. Temp-mail / API nội bộ (`ApiClient`)**  
1. Settings + per-account override: `X-Request-Id`, custom `User-Agent`, `Accept-Language`, header debug tùy chọn.  
2. RateLimiter / retry giữ nguyên; header không phá auth backend.  
3. Redact header secret trong logger.  

**B. Discord tab (MV3 `declarativeNetRequest`)**  
1. Rule set theo account **đang active** (user chọn “Apply identity to this tab”).  
2. Chỉ modify header trong allowlist (vd. `User-Agent`, `Accept-Language`, Client Hints nếu API hỗ trợ).  
3. Rule lifetime: gắn tabId hoặc session; **Clear rules** khi đổi account / đóng tab / bấm Revoke.  
4. UI hiện “Identity applied” badge trên launcher + RegisterView.  
5. Fallback: nếu DNR không set được header X → ghi chú trong UI “metadata-only”, không giả thành công.  

**Done khi:** Apply identity thay đổi được ít nhất UA và/hoặc Accept-Language trên request quan sát được (DevTools); Clear gỡ sạch rule; API client dùng được custom header riêng.

### P2X.4 Cookie Jar — capture · lưu · restore · diff
**Bước:**
1. **Capture:** đọc cookie Discord (và subdomain liên quan theo host_permissions) vào jar gắn account — chỉ sau user gesture.  
2. Phân loại cookie: `essential` / `session` / `analytics` (tag theo tên quen thuộc; không phụ thuộc list cứng tuyệt đối).  
3. **Restore:** ghi lại cookie từ jar vào profile trình duyệt hiện tại (confirm mạnh + cảnh báo ghi đè session đang login).  
4. **Diff:** so jar đã lưu vs cookie hiện tại (thiếu / thừa / đổi value hash).  
5. **Wipe:** xóa cookie Discord domain (optional) khi Revoke session / xóa account.  
6. Không log giá trị cookie thô; storage đi cùng encryption P3.  
7. Export/import jar trong `.dra` hoặc file `.dra-cookies` riêng (passphrase).  
**Done khi:** Capture → đổi account khác → Restore account A khôi phục được cookie đã lưu (trên cùng máy/profile Chrome); Diff đọc được; Wipe không để sót token cookie nếu user chọn.

### P2X.5 Locale · Language · Timezone consistency pack
**Bước:**
1. Khi `LocaleGenerator` chọn `en-US` / `vi-VN` / … → auto điền `acceptLanguage` chất lượng (q-factor hợp lý).  
2. Gợi ý `timezoneLabel` theo locale (bảng map curated, user sửa được).  
3. VaultDetail: hàng “Consistency”: locale ↔ language ↔ timezone ↔ UA platform.  
4. Copy pack: nút copy JSON metadata (không gồm cookie/token).  
**Done khi:** identity mới có bộ locale/language/tz khớp; inconsistency hiện trên UI.

### P2X.6 Session Snapshot (token + cookie + pack)
**Bước:**
1. Một action **Snapshot session**: gộp `token` + cookie jar + browser pack + profile timestamps.  
2. Lưu encrypted (phụ thuộc P3) hoặc tạm plaintext đến khi P3 xong (ghi rõ debt).  
3. Restore snapshot = restore cookie + gán pack + (không tự ghi đè token nếu conflict — hỏi user).  
4. Timeline event: `session.snapshot` / `session.restore`.  
**Done khi:** một account có thể snapshot/restore session lab trong ≤ 3 click + confirm.

### P2X.7 Identity Pack UI (trang trí + UX)
**Bước:**
1. Section mới trong VaultDetail: **Browser identity** — UA truncated + copy, platform chip, language, tz, “DNR applied?”.  
2. Drawer/modal **Header Lab**: bảng header enable/value, preset load/save.  
3. Drawer **Cookie Jar**: list name/domain/expires (value masked), capture/restore/diff/wipe.  
4. Generator card: thumbnail “Chrome · Windows · en-US” dưới avatar.  
5. Dashboard: đếm account có pack / có jar / DNR đang active.  
6. Empty state: “Chưa gán browser pack — Assign preset”.  
**Done khi:** toàn bộ thao tác P2X.1–P2X.6 có chỗ bấm rõ, mask secret đúng.

### P2X.8 Tùy biến sáng tạo (product extras)
Các ý tưởng gắn identity lab — chọn làm song song nếu còn capacity:

| ID | Ý tưởng | Mô tả ngắn | Done criteria |
|---|---|---|---|
| C1 | **Persona Studio** | Gói “persona”: display name style + locale + UA preset + timezone thành 1 template đặt tên (vd. `US-West-Chrome`) | Lưu/load template; generate theo persona |
| C2 | **Tab binding** | Gắn 1 tab Discord với 1 account (tabId); launcher hiện đúng account; Apply DNR theo binding | Đổi tab → UI đổi account; đóng tab → clear rules |
| C3 | **Request diary** | Log metadata request Discord gần đây (URL path + header names đã modify, **không** body/token) để debug | Bật/tắt; redact; xóa nhật ký |
| C4 | **Header recipes** | Recipe cộng đồng-nội-bộ: “Minimal”, “Desktop Chrome”, “Match locale only” | 3 recipe ship sẵn |
| C5 | **Cookie expiry radar** | Cảnh báo cookie/session sắp hết hạn trong jar | Chip warning + filter vault |
| C6 | **Pack uniqueness** | Registry tránh trùng UA+language+tz hash giữa nhiều account (tùy chọn) | Setting on → generate không trùng hash |
| C7 | **Export “identity card”** | TXT/JSON card: username, locale, UA, language — không secret | Export 1 click từ detail |
| C8 | **Cold profile checklist** | Wizard: Clear Discord cookies → Apply pack → Open register → Fill | Nằm trong guided checklist P2.1 |
| C9 | **API identity mirror** | Temp-mail calls kế thừa Accept-Language từ account đang chọn | Quan sát được trên network API |
| C10 | **Clash detector** | Phát hiện 2 account cùng apply DNR / cùng tab | Toast conflict + force switch |

**Ưu tiên sáng tạo đề xuất:** C1 → C2 → C8 → C5 → C6 → còn lại.

### P2X.9 Test & an toàn cho Identity Lab
**Bước:**
1. Unit: header allowlist, UA preset consistency, language builder, cookie classify (pure).  
2. Integration: DNR rule install/remove; cookie capture/restore với mock `chrome.cookies`.  
3. Security review: không persist cookie plaintext nếu P3 đã bật; không log values.  
4. Permission justification trong Options → Privacy.  
**Done khi:** test xanh; Options giải thích rõ permission mới.

### P2X.10 Checklist P2X
- [ ] `BrowserIdentityPack` trên schema + migrate  
- [ ] Preset UA / Client Hints library + generator assign  
- [ ] Header Lab: ApiClient + DNR apply/clear (honest fallback)  
- [ ] Cookie Jar: capture / restore / diff / wipe  
- [ ] Locale–language–timezone consistency  
- [ ] Session snapshot (hoặc debt rõ → P3 encrypt)  
- [ ] UI section + Dashboard counts  
- [ ] Ít nhất C1 + C2 + C8 trong extras  
- [ ] Tests + privacy copy  
- [ ] Cập nhật roadmap mục Browser Identity

---

## 6. Pha P3 — Bảo mật dữ liệu & đồng bộ

### P3.1 Vault encryption at rest (passphrase)
**Bước:**
1. Chọn Web Crypto: PBKDF2 (hoặc tương đương khả thi trong SW) + AES-GCM.  
2. Quyết định scope: encrypt toàn bundle **hoặc** chỉ secret fields (`discordPassword`, `emailPassword`, `token`, **cookie jar**, custom header values nhạy cảm, …).  
3. Unlock on open popup/panel; auto-lock sau idle (setting).  
4. Migration wizard: bắt buộc **export backup plaintext/encrypted** trước khi bật.  
5. Recovery: sai passphrase → không decrypt; hướng dẫn restore từ backup.  
6. Tests cho encrypt/decrypt round-trip + migration fixture.  
**Done khi:** đọc `chrome.storage.local` thô không thấy secret/cookie rõ chữ khi encryption bật.

### P3.2 Encrypted export / import cross-device
**Bước:**
1. Format file `.dra` (JSON envelope: magic, schemaVersion, salt, iv, ciphertext).  
2. Export UI: nhập passphrase + confirm; tùy chọn gồm/loại **cookie jar** + **browser pack**.  
3. Import UI: passphrase → preview counts → merge/dedup.  
4. Checksum / version guard.  
**Done khi:** chuyển máy khác restore vault (+ optional jars) không lộ file plaintext.  
**Khớp roadmap:** “Đồng bộ vault ra máy khác (mã hóa)”.

### P3.3 Multi-session token (optional, feature-flag)
**Bước:**
1. Thiết kế `sessions[]` tương thích ngược: record cũ 1 token map thành 1 session.  
2. Mỗi session có thể tham chiếu cookie jar + identity pack riêng (nếu P2X đã có).  
3. UI chọn session active; health check theo session.  
4. Flag settings mặc định off cho đến khi ổn định.  
**Done khi:** không phá vault cũ; bật flag mới thấy multi-session UI.

### P3.4 Secret hygiene pass
**Bước:**
1. Audit logger redaction (token, password, emailPassword, **cookie values**, UA không cần redact nhưng cookie thì có).  
2. Export option **Exclude secrets** (JSON/CSV/TXT) — loại token/password/jar.  
3. Export option **Identity metadata only** — UA/language/tz không cookie.  
4. Clipboard clear defaults review + countdown đã có.  
5. Confirm destructive scopes giữ nguyên.  
**Done khi:** checklist bảo mật trong docs pass; exclude-secrets export không chứa token/password/cookie.

### P3.5 Checklist P3
- [ ] Encryption at rest + unlock/lock  
- [ ] `.dra` export/import  
- [ ] Multi-session (flag) hoặc ghi rõ “hoãn” trong roadmap  
- [ ] Exclude-secrets + redact audit

---

## 7. Pha P4 — UI / trang trí / cảm giác first-party

Giữ Discord design language; tăng chiều sâu visual và tốc độ thao tác.

### P4.1 Theme & visual depth
**Bước:**
1. Thêm 1–2 theme variant trên token (ví dụ Ash / Blurple-tint) — vẫn Discord-native.  
2. Surface nền panel: gradient/noise **rất nhẹ** (không flat chết).  
3. Avatar: khung decoration khi có `avatarDecorationUrl`.  
4. Badge / Nitro row: icon + tooltip từng badge.  
5. Profile header trong VaultDetail giống Discord user popout (mini).  
**Done khi:** detail account đọc như Discord mini-profile, không như form admin.

### P4.2 Motion system
**Bước:**
1. Motion tokens trong `Tokens.css` (duration, easing).  
2. Rail view transition 120–180ms.  
3. Toast stack, stepper, copy flash, launcher expand/collapse.  
4. Mọi animation tôn trọng `reduceMotion` + `prefers-reduced-motion`.  
**Done khi:** chuyển tab/view mượt, không flicker; reduceMotion tắt hết motion trang trí.

### P4.3 Launcher 2.0 (in-page)
**Bước:**
1. Quick actions: Open panel / Fill / Paste code / Capture token (user gesture).  
2. Mini status: account đang chọn + unread mail count.  
3. Harden drag snap + remember position (đã có → edge cases).  
4. Compact ↔ expanded animation.  
5. Settings hiện có (`showPageLauncher`, edge, compact) giữ tương thích.  
**Done khi:** trên discord.com làm việc chính không bắt buộc mở full panel.

### P4.4 Popup redesign (quick surface)
**Bước:**
1. Popup tối ưu generate + copy stack trong 400×580.  
2. Identity card lớn + 4 nút copy (email, username, password, birthday).  
3. CTA phụ: Open side panel / Open register.  
4. Không nhồi vault đầy đủ vào popup.  
**Done khi:** generate 1 account + copy email/pass trong < 5 giây.

### P4.5 Empty / loading / error states
**Bước:**
1. Empty vault / empty inbox / empty activity: illustration SVG nhẹ + 1 CTA.  
2. Skeleton rows thay spinner đơn cho list dài.  
3. Error card có Retry + copy error id (không leak secret).  
**Done khi:** không còn màn hình trống im lặng.

### P4.6 Accessibility
**Bước:**
1. Focus ring chuẩn toàn app.  
2. Keyboard: vault actions, command palette, stepper CTAs.  
3. `aria-live` cho toast và mã verification.  
4. Contrast audit Midnight + theme mới.  
**Done khi:** gần như full flow dùng được bằng bàn phím.

### P4.7 Onboarding first-run
**Bước:**
1. 3–4 bước: API base URL → Generate identity → Open Discord → Capture/Verify.  
2. Checklist dismissible; persist `onboardingDone`.  
3. Có thể mở lại từ Settings → Help.  
**Done khi:** user mới chạy được flow cơ bản không cần đọc README.

### P4.8 Micro-polish backlog (trong P4 nếu còn capacity)
- Password strength meter đã có → đồng bộ visual với Discord inputs  
- Clipboard countdown chip: tone khi sắp hết hạn  
- Favicon/icon toolbar refresh nếu brand mark đổi nhẹ  
- Command palette group labels rõ hơn (Navigate / Account / Danger)

### P4.9 Checklist P4
- [ ] Theme variant + decoration/badges  
- [ ] Motion tokens + reduceMotion  
- [ ] Launcher quick actions  
- [ ] Popup quick-copy  
- [ ] Empty/skeleton/error  
- [ ] A11y cơ bản + onboarding

---

## 8. Pha P5 — Kỹ thuật, perf, phát hành

### P5.1 Giảm bundle content script
**Bước:**
1. Đo size `content.js` baseline.  
2. Tách popup-dropdown engine: inject on-demand qua `scripting.executeScript` hoặc dynamic path tương thích MV3.  
3. Tree-shake / tránh kéo UI deps vào content.  
4. So sánh size sau.  
**Done khi:** giảm ≥ 20% so baseline **hoặc** phần nặng chỉ load khi cần (có số liệu).

### P5.2 Integration tests
**Bước:**
1. Test MessageRouter handlers với storage mock.  
2. Test SchemaMigrator với fixture vault v0 → vN.  
3. Test MailboxScheduler alarm tick (fake timers).  
**Done khi:** integration suite chạy trong CI/local script.

### P5.3 E2E smoke (Playwright + extension load)
**Bước:**
1. Load unpacked `dist/` trong Chromium test.  
2. Smoke: mở popup → generate preview → export JSON.  
3. DOM autofill: **mock page** giống form Discord (không phụ thuộc production DOM dễ gãy).  
4. Ghi chú hạn chế trong docs.  
**Done khi:** E2E smoke xanh trên mock; không flake vì Discord production đổi class.

### P5.4 Observability nội bộ
**Bước:**
1. Chuẩn hóa taxonomy Activity events.  
2. Settings → Debug: xem N log gần đây, copy sanitized.  
3. Giữ `logLevel` settings hiện có.  
**Done khi:** tự debug “fill fail / token dead” không cần DevTools sâu.

### P5.5 Release packaging
**Bước:**
1. Script zip `dist-release/` kèm version.  
2. Changelog từ commits (manual template cũng được).  
3. Store assets: screenshot 1280×800 (popup, panel vault, register, dashboard).  
4. `npm run release` (hoặc tương đương) documented.  
**Done khi:** một lệnh ra artifact sẵn upload + checklist store.

### P5.6 Schema discipline
**Bước:**
1. Mỗi field mới bump `schemaVersion`.  
2. Fixture test migrator.  
3. Ghi breaking changes trong docs.  
**Done khi:** update extension không mất data user.

### P5.7 Checklist P5
- [ ] Content bundle slim (có số)  
- [ ] Integration + E2E smoke  
- [ ] Debug panel  
- [ ] Release zip + screenshots  
- [ ] Migrator fixtures

---

## 9. Pha P6 — Backlog mở rộng (sau P1–P5)

| Hạng mục | Mô tả | Effort | Ghi chú |
|---|---|---|---|
| Workspaces / multi-vault | Tách Work / Personal | Lớn | Storage key namespacing |
| Identity templates | Lưu preset generator | Trung bình | Settings UI |
| i18n VI/EN | Toàn bộ string UI | Lớn | Làm khi feature ổn |
| Multi temp-mail backend | Provider adapter | Trung bình | Abstraction `TempMailApi` |
| Duplicate finder | Fuzzy email/username | Nhỏ–TB | Vault lớn |
| Attachment download | Lưu file từ mail | Trung bình | Permission + quota |
| Rich desktop notifications | Click → đúng account | Nhỏ | `notifications` đã có |
| Recovery sheet PDF | 1 trang secrets in tay | Trung bình | Cẩn thận secret |
| Custom hotkeys map | User-defined | Trung bình | Conflict browser |
| Account compare view | Diff 2 records | Nhỏ | |
| Pin favorite accounts | Star + sort top | Nhỏ | |
| Trash / undo delete | Soft delete 30 ngày | Trung bình | Storage growth |
| Advanced DNR recipes | Rule theo path Discord API cụ thể | Trung bình | Chỉ sau P2X ổn định |
| External proxy companion | Ghi chú kết nối proxy app bên ngoài (extension không tự làm SOCKS) | Lớn | Docs-only hoặc native messaging sau |

Mỗi mục P6 khi nhấc lên phải có mini-plan riêng (scope, schema, done criteria) trước khi code.

---

## 10. Sprint thực thi đề xuất (thứ tự làm việc)

### Sprint A — “Cảm giác dùng mượt” (P1.1 + một phần P2/P4)
1. Toast stack  
2. Guided checklist (skeleton + CTA)  
3. Paste latest code  
4. Empty/loading states cơ bản  
5. Popup quick-copy polish nhẹ  

### Sprint B — “Vault thông minh” (P1.2–P1.4 + P2.4–P2.6)
1. Import TXT  
2. Saved filters + tag presets  
3. Dashboard stats  
4. Token health check  
5. Copy-token warning + revoke  

### Sprint B2 — “Browser Identity Lab” (P2X)  ← mới
1. Schema `BrowserIdentityPack` + migrator + guard tests  
2. UA / Client Hints preset library + auto-assign on generate  
3. Header Lab: ApiClient custom headers + DNR apply/clear (UA + Accept-Language)  
4. Cookie Jar: capture / restore / diff / wipe  
5. Locale–language–timezone consistency + UI section VaultDetail  
6. Extras ưu tiên: Persona Studio (C1), Tab binding (C2), Cold profile checklist (C8)  
7. Session snapshot (plaintext tạm **hoặc** chờ Sprint C encrypt)

### Sprint C — “An toàn & mang đi” (P3)
1. Encryption at rest (gồm cookie jar + header secrets)  
2. Encrypted `.dra` export/import (+ optional jars/packs)  
3. Exclude-secrets + identity-metadata-only export  
4. Multi-session (flag) nếu còn capacity  

### Sprint D — “Launcher & trang trí” (P4 còn lại)
1. Launcher quick actions (**gồm Apply identity / Capture cookies**)  
2. Avatar decoration / badge UI  
3. Theme variants + motion tokens  
4. Onboarding first-run (**thêm bước Identity pack**)  
5. A11y pass  

### Sprint E — “Chất lượng phát hành” (P1.5 + P5)
1. Vitest + coverage gate (thêm allowlist header / preset consistency)  
2. Content bundle slim  
3. Integration + E2E smoke (mock DNR + cookies)  
4. Release zip + cập nhật README/roadmap  

---

## 11. Phụ thuộc & thứ tự kỹ thuật

```
Toast stack ─────────────────────┐
Vitest nền ──────────────────────┼─► Checklist / Paste / Queue
Import TXT ──► Encrypted export ─┘
Health check ──► Dashboard token cards
BrowserIdentityPack schema ──► UA presets ──► DNR apply
                           └──────────────► Cookie jar ──► Session snapshot
Cookie jar / pack secrets ──► Encryption P3 ──► .dra có jars
Tab binding (C2) ──► Launcher Apply identity
Cold profile checklist (C8) ──► Guided checklist P2.1
Motion tokens ──► Launcher 2.0 / Popup polish
Bundle slim (độc lập)
```

**Không chặn nhau:** Dashboard charts, empty states, tag presets, onboarding copy, Persona templates UI — có thể song song sau khi store/toast/schema pack ổn.

---

## 12. Tiêu chí hoàn thành toàn bản nâng cấp (v1.4)

- [ ] Các mục ⬜ trong `UPGRADE_ROADMAP.md` thuộc P1–P3 + Browser Identity đã ✅ hoặc ghi rõ “hoãn + lý do”  
- [ ] Schema migrate không mất vault cũ (có fixture test)  
- [ ] Unit test ≥ 80% cho matcher / exporter / guard / migrator / identity-pack helpers  
- [ ] Không hardcode secret; logger không in token/password/cookie  
- [ ] UI vẫn Discord-native; có motion + empty states + launcher actions  
- [ ] Workflow Generate → (Assign pack) → Fill → Capture → Paste → Verified đo bằng checklist  
- [ ] Apply identity (UA/language) + Cookie jar capture/restore hoạt động trong giới hạn MV3  
- [ ] Export encrypted + import cross-device hoạt động (optional jars)  
- [ ] `npm test` + smoke E2E documented  
- [ ] README + roadmap + privacy permission notes cập nhật ngày / version  

---

## 13. Rủi ro & giảm thiểu

| Rủi ro | Tác động | Giảm thiểu |
|---|---|---|
| Discord đổi DOM form | Autofill gãy | FieldMatcher scored; E2E trên mock DOM; không hardcode class hash |
| Service worker sleep | Health check / DNR trễ | `chrome.alarms`; re-apply rules khi SW wake + tab binding |
| Mã hóa làm mất data | Mất vault/jar | Bắt buộc backup trước khi bật; test migration |
| DNR không sửa được mọi header | User tưởng đã spoof full | UI “metadata-only” / capability matrix trung thực |
| Cookie restore ghi đè session | Mất login đang dùng | Confirm mạnh + diff trước restore |
| Scope creep P6 / anti-detect | Trễ + rủi ro store | Bám Sprint; cấm canvas/TLS spoof trong plan |
| Permission mới làm store reject | Không publish được | Privacy copy rõ; optional permissions khi có thể |
| Rate limit Discord/API | Health check fail hàng loạt | Backoff + jitter giữa account |
| Passphrase quên | Không mở vault | Copy recovery hướng dẫn; không có backdoor |
| Pack trùng nhau | Nhiều account cùng UA hash | Pack uniqueness (C6) optional |

---

## 14. Cách dùng tài liệu này

1. Chọn **Sprint A** (hoặc sprint khác) làm milestone gần nhất.  
2. Tạo issue/PR theo từng mục con (`P1.1`, `P2.6`, …) với Done criteria copy từ đây.  
3. Sau mỗi sprint: tick checklist pha + cập nhật `UPGRADE_ROADMAP.md`.  
4. Khi nhấc P6: viết phụ lục ngắn (scope 1 trang) rồi mới implement.  

### 3 việc nên bắt đầu trước
1. **Toast stack** — unblock mọi flow feedback sau này.  
2. **Guided checklist + Paste latest code** — tăng tỷ lệ hoàn tất verify.  
3. **Vitest + test exporter/matcher** — an toàn để refactor UI lớn ở P4.  

### Sau Sprint B — làm ngay Identity Lab
4. **`BrowserIdentityPack` schema + UA presets** — nền cho Header/Cookie.  
5. **Cookie Jar capture/restore** — giá trị session thực tế nhất.  
6. **DNR Apply identity (UA + Accept-Language)** — trung thực về capability.

---

## 15. Liên kết

- `docs/UPGRADE_ROADMAP.md` — checklist trạng thái ngắn theo chủ đề  
- `README.md` — architecture, design system, quick start  
- `public/manifest.json` — permissions / surfaces hiện có  

---

## Phụ lục A — Capability matrix (UA / Header / Cookie)

| Khả năng | Cơ chế dự kiến | Độ tin cậy | Ghi chú UI |
|---|---|---|---|
| Lưu UA per account | Storage field | Cao | Luôn có |
| Đổi UA trên request Discord | `declarativeNetRequest` | Trung bình–cao* | Hiện badge Applied / Failed |
| Client Hints (`sec-ch-ua*`) | DNR nếu host/API cho phép | Trung bình | Fallback metadata-only |
| Accept-Language | DNR + ApiClient | Cao | Khớp locale generator |
| Custom header API temp-mail | `ApiClient` hooks | Cao | Không đụng Discord |
| Đọc/ghi cookie Discord | `chrome.cookies` | Cao (đúng permission) | Confirm trước restore |
| Navigator spoof trong page | Không làm full | — | Ngoài phạm vi |
| Canvas/WebGL spoof | Không làm | — | Ngoài phạm vi |

\*Phụ thuộc phiên bản Chrome và loại header; luôn có đường Clear rules.

---

*Tài liệu kế hoạch — không chứa implementation code. Cập nhật lần cuối: 2026-10-05 (thêm P2X Browser Identity Lab).*
