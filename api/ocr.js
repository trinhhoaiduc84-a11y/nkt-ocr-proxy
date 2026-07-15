// ═══════════════════════════════════════════════════════════════════════════
// api/ocr.js — Vercel Edge Function, đọc số ống (+ nhận diện lỗi từ v63) từ ảnh
// bằng Claude (Anthropic) — bản Haiku (rẻ nhất, mặc định).
// Dùng cho tính năng "📷 Đọc số ống từ ảnh (AI)" trong NKT Inspect Pro.
//
// v63: MỞ RỘNG — trước đây chỉ đọc SỐ HIỆU ỐNG. Từ bản này, khi gọi kèm tham số
// "stage" (khâu hiện tại), AI sẽ ĐỌC LUÔN cả GHI CHÚ LỖI của từng ống trong ảnh sổ
// tay/bảng kiểm tra (nếu có) — trả về thêm mảng "pipes" (số ống + lỗi) bên cạnh
// "numbers" (chỉ số ống, giữ để không phá cách dùng cũ).
//
// v64-v66: mở rộng hướng dẫn đọc số, thêm cơ chế cứu dữ liệu JSON bị cắt giữa chừng,
// thêm thuật ngữ riêng từng khâu, và (v64) THÊM quy tắc "không chắc thì bỏ qua" để
// tránh AI tự tick sai. HỆ QUẢ NGOÀI Ý MUỐN (KTV phản ánh 2026-07-15, có ảnh chụp thật
// kèm theo): quy tắc "không chắc thì bỏ qua" bắt AI tự phán đoán "chắc chắn hay không"
// rồi tự quyết định tick/bỏ — với ảnh sổ tay viết tay thực tế (nét mờ, nhiều cột), AI
// bỏ qua GẦN NHƯ TOÀN BỘ dù nhiều ống có dấu rất rõ, vì lẫn vào các trường hợp thực sự
// mập mờ. Điều tra kỹ cho thấy: ống có ĐỦ 2 cột lỗi rõ nét (VD "Hỏng ren"+"Hỏng CL" đều
// có dấu X) vẫn bị bỏ qua — không phải vì ảnh mờ, mà vì tổ hợp đó không được hướng dẫn
// rõ trong prompt cũ (chỉ có ví dụ đơn lẻ), khiến AI coi là "trường hợp lạ" rồi áp dụng
// quy tắc an toàn "không chắc thì bỏ qua" cho CẢ pipe đó.
//
// v67: ĐỔI HẲN KIẾN TRÚC — không còn bắt AI tự phán đoán "chắc chắn hay không" rồi tự
// quyết định tick/bỏ nữa. AI giờ CHỈ làm 1 việc thuần túy MÔ TẢ: với mỗi ống có đánh dấu
// ở các cột tình trạng, liệt kê ĐÚNG cột nào có dấu (không tự kết luận lỗi cuối cùng,
// không tự đánh giá độ tin cậy — việc mô tả lại 1 tấm ảnh đơn giản/đáng tin cậy hơn nhiều
// so với việc tự phán đoán). Việc "tổ hợp cột nào → lỗi gì, có đủ tin cậy để tự tick hay
// chỉ nên gợi ý cho KTV xem lại" chuyển hẳn sang CODE thuần túy bên dưới (resolveMarksForStage
// và processDefectObservations) — logic này được unit-test đầy đủ trước khi triển khai
// (xem /tmp/test_defect_mapping.js), không phụ thuộc hành vi khó đoán của model nữa.
// Đúng 6 tổ hợp KTV xác nhận cho khâu Sửa ren (2026-07-15) là closed-set — tổ hợp nào
// không khớp đúng 1 trong 6 (kể cả tổ hợp "hợp lý" như Hỏng ren+Tiện ren mới cùng lúc)
// đều bị hạ xuống "uncertain" (trả về nhưng KHÔNG tự tick, hiện cho KTV xem lại), KHÔNG
// còn bị mất trắng không dấu vết như trước. Ống bị lệch 1 chữ số giữa lệnh đọc số và lệnh
// đọc lỗi (2 lệnh AI độc lập, đọc lại ảnh 2 lần) giờ cũng được GIỮ LẠI trong "uncertain"
// thay vì bị lọc chéo âm thầm mất trắng (xem matchSerial — khớp gần đúng, Levenshtein<=1).
// Mở rộng thêm khâu Ép thủy lực (stage=5) vào diện có AI nhận diện lỗi (trước đây chỉ
// 2-4); khâu Thông nòng (stage=2) NGƯỢC LẠI bị RÚT khỏi diện này — nay chỉ đọc số, giống
// Tiếp nhận/Khu rửa/Đóng gói (theo đúng yêu cầu KTV 2026-07-15). Từ v67, việc BẬT nhận
// diện lỗi cho NDT/Sửa ren/Ép thủy lực là LỰA CHỌN TƯỜNG MINH của KTV mỗi lần chụp (nút
// "① Chỉ đọc số"/"② Đọc số + Tick lỗi" ở app), không còn tự động theo khâu nữa — backend
// vẫn giữ nguyên quy ước cũ: CHỈ bật khi client gửi kèm "stage" hợp lệ.
//
// v68 (2026-07-15, KTV đối chiếu thêm với ảnh thật ống 7139/7140/7141): sau khi triển khai
// v67, KTV vẫn phát hiện vài ống bị GÁN NHẦM SANG HÀNG KẾ BÊN (không phải sai vì "không thấy
// dấu" hay "tổ hợp cột lạ" — 2 lỗi đã xử lý ở v67 — mà là AI gán ĐÚNG loại dấu nhưng SAI SỐ
// ỐNG, vì ảnh chụp sổ tay bị nghiêng + các hàng kẻ quá sát nhau khiến 1 dấu X nằm gần đường kẻ
// ngang phân cách 2 hàng có thể bị hiểu nhầm là thuộc hàng liền kề). Trước v68, cơ chế
// "uncertain" CHƯA có cách nào bắt được lỗi này — nó chỉ xét TỔ HỢP CỘT có hợp lệ hay không,
// không xét ĐỘ TIN CẬY VỀ VỊ TRÍ HÀNG của từng dấu. v68 thêm hẳn 1 trục kiểm tra mới, độc lập
// với trục "tổ hợp cột": prompt giờ yêu cầu AI, với MỖI dấu tìm thấy, tự kiểm tra xem dấu đó
// có nằm sát đường kẻ ngang trên/dưới của ô hay không (dấu chạm/gần chạm 1 trong 2 đường kẻ,
// hoặc ảnh bị nghiêng khiến khó xác định chắc chắn dấu thuộc hàng nào) — nếu CÓ nghi ngờ, AI
// đặt "rowUncertain": true cho quan sát đó. Ở lớp code thuần túy (processDefectObservations),
// bất kỳ quan sát nào có rowUncertain=true đều bị CHẶN không cho vào "confident" dù tổ hợp cột
// có khớp đúng 1 trong các quy tắc hay không — luôn hạ xuống "uncertain" với lý do mới
// "dau_gan_ranh_gioi_hang" để KTV tự xác nhận đúng ống. Đây là lớp phòng vệ THỨ 2, độc lập với
// lớp "tổ hợp cột lạ" đã có — 2 lớp không thay thế nhau, ống có thể bị hạ uncertain vì 1 trong
// 2 lý do (hoặc cả 2).
//
// TẠI SAO ĐỔI TỪ CLOUDFLARE SANG VERCEL: bản chạy trên Cloudflare Worker bị Anthropic
// chặn với lỗi "403 forbidden — Request not allowed" — nhiều khả năng do lưu lượng gọi
// TỪ hạ tầng Cloudflare Workers bị nghi ngờ là bot/lạm dụng (vấn đề hạ tầng, không phải do
// key hay code sai). Vercel là nền tảng khác hẳn, không dính vấn đề này.
//
// FILE NÀY PHẢI NẰM ĐÚNG ĐƯỜNG DẪN: api/ocr.js (thư mục "api", file "ocr.js" bên trong) —
// đây là quy ước của Vercel để tự nhận diện thành 1 endpoint tại /api/ocr.
// ═══════════════════════════════════════════════════════════════════════════
// HƯỚNG DẪN TRIỂN KHAI (không cần biết lập trình, không cần cài gì trên máy):
//
// BƯỚC 1 — Tạo tài khoản GitHub (nếu chưa có), tạo repo và thêm file này:
//   1. Vào https://github.com → đăng ký tài khoản miễn phí (nếu chưa có)
//   2. Bấm nút "+" góc trên phải → "New repository" → đặt tên (VD: nkt-ocr-proxy) →
//      chọn "Public" hoặc "Private" đều được → "Create repository"
//   3. Trong repo vừa tạo, bấm "Add file" → "Create new file"
//   4. Ở ô đặt tên file, gõ ĐÚNG: api/ocr.js (gõ cả dấu / — GitHub tự hiểu là tạo
//      thư mục "api" rồi tạo file "ocr.js" bên trong)
//   5. Dán TOÀN BỘ nội dung file này vào ô nội dung bên dưới
//   6. Kéo xuống cuối trang, bấm "Commit changes"
//
// BƯỚC 2 — Deploy lên Vercel:
//   1. Vào https://vercel.com → "Sign Up" → chọn "Continue with GitHub" (đăng nhập
//      luôn bằng tài khoản GitHub vừa tạo, không cần mật khẩu riêng)
//   2. Sau khi vào Dashboard → "Add New..." → "Project"
//   3. Tìm repo "nkt-ocr-proxy" vừa tạo trong danh sách → bấm "Import"
//   4. Không cần đổi gì trong phần cấu hình → bấm "Deploy"
//   5. Đợi khoảng 30 giây tới khi thấy "Congratulations!" — vậy là xong
//
// BƯỚC 3 — Gắn API key Claude (Environment Variable, giữ kín, không lộ trong code):
//   1. Trong project vừa tạo trên Vercel → "Settings" → "Environment Variables"
//   2. Thêm biến: Key = CLAUDE_API_KEY, Value = dán API key Anthropic (dạng
//      sk-ant-api03-...) → chọn cả 3 môi trường (Production/Preview/Development nếu có
//      hỏi) → "Save"
//   3. Vào tab "Deployments" → bấm vào bản deploy mới nhất → bấm nút "..." (3 chấm) →
//      "Redeploy" → xác nhận — bước này BẮT BUỘC để biến môi trường mới thêm có hiệu lực.
//
// BƯỚC 4 — Lấy URL và gắn vào app:
//   1. Trên trang chính của project Vercel, copy domain hiện ra (dạng
//      https://nkt-ocr-proxy-xxxx.vercel.app)
//   2. URL đầy đủ để dùng trong app là: https://nkt-ocr-proxy-xxxx.vercel.app/api/ocr
//      (thêm "/api/ocr" ở cuối — đây chính là đường dẫn tới file này)
//   3. Gửi URL đầy đủ đó (có "/api/ocr" ở cuối) cho tôi, tôi sẽ gắn vào app.
//
// AN TOÀN: File này KHÔNG đụng gì đến Google Sheets hay dữ liệu phiếu kiểm tra — chỉ
// nhận 1 ảnh (+ tên khâu nếu có), trả về danh sách số/lỗi. Không lưu trữ ảnh ở đâu cả
// (xử lý xong là bỏ).
//
// SO SÁNH ĐỘ CHÍNH XÁC: file này dùng model Haiku (rẻ nhất). Có 2 file song song để so sánh
// độ chính xác đọc số — ocr-sonnet.js (model Sonnet 5, endpoint /api/ocr-sonnet) và
// ocr-opus.js (model Opus 4.8, endpoint /api/ocr-opus). Cả 3 dùng chung CLAUDE_API_KEY đã
// cấu hình, không cần tạo thêm key hay project Vercel mới — chỉ cần thêm 2 file đó vào cùng
// thư mục api/ trong repo GitHub hiện có.
// ═══════════════════════════════════════════════════════════════════════════

export const config = { runtime: 'edge' };

// ── v63: Danh sách mã lỗi + tên khâu — PHẢI khớp với DEFECTS/STAGE_DEFECT_KEYS/
// SUAREN_REPAIR_INFO trong file app chính (NKT_Inspect_Pro_*.html). Nhân bản (không
// import) vì đây là Edge Function độc lập, không dùng chung file với app.
const DEFECTS = {
  'hong-coupling': 'Hỏng Coupling',
  'hong-ren': 'Hỏng ren',
  'hong-ren-coupling': 'Hỏng ren + Coupling (cả 2)',
  'nut-than': 'Nứt thân',
  'meo-bd': 'Méo / Biến dạng (BD)',
  'an-mon': 'Ăn mòn',
  'mo-thanh': 'Mỏng thành (độ dày không đạt)',
  'hong-dau': 'Hỏng đầu nối',
  'tac-nong': 'Tắc nòng',
  'khac': 'Lỗi khác (rõ ràng có vấn đề nhưng không khớp mã nào ở trên)',
};
const STAGE_NAMES = ['Tiếp nhận', 'Khu rửa', 'Thông nòng', 'Kiểm tra NDT', 'Sửa ren', 'Ép thủy lực', 'Đóng gói & Phân loại'];
const SUAREN_REPAIR = {
  'da-sua-ren': 'Đã sửa ren (tiện ren mới)',
  'da-thay-coupling': 'Đã thay Coupling mới',
  'da-sua-ca-hai': 'Đã sửa ren VÀ thay Coupling (cả hai)',
};
// v67: trạng thái riêng của khâu Ép thủy lực (KHÁC hẳn defects/repair của Sửa ren/NDT) —
// PHẢI khớp đúng key với EP_PIPE_STATUS_INFO trong app. Chỉ nhận diện các trạng thái XÌ/LOẠI
// từ ảnh sổ tay — KHÔNG suy luận trạng thái "Đạt sau xử lý" (ok_suaren/ok_coupling/ok_both)
// vì việc này cần xác nhận thực tế đã ép lại đạt, vượt quá khả năng đọc 1 ảnh sổ tay đơn
// thuần — để KTV tự xác nhận tay các trạng thái đó.
const EPTL_STATUS_NAMES = { xi_pin: 'Xì Pin', xi_coupling: 'Xì Coupling', xi_both: 'Xì Pin + Xì Coupling', loai: 'Loại' };

// v64rev1: KTV dò tay 1 lượt kết quả thật, phát hiện thêm 3 cặp chữ số hay bị đọc nhầm mà bản v64
// CHƯA liệt kê: "1 và 4", "5 và 8", "2 và 3" (trước đó chỉ có 1&7, 0&6, 3&8, 2&7, 5&6, 4&9). Gộp
// chung thành 1 danh sách đầy đủ DÙNG CHUNG cho cả SERIAL_READING_STEPS (đọc số) và
// buildDefectsOnlyPrompt (đọc số của ống lỗi) để không bị lệch nhau giữa 2 nơi.
// v64rev1: NGOÀI liệt kê cặp dễ nhầm, còn thêm HÌNH DẠNG NÉT CHỮ đặc trưng để phân biệt từng cặp —
// model nhỏ/nhanh như Haiku ít khả năng tự suy luận "vì sao dễ nhầm" nếu chỉ nêu tên số, nhưng nếu
// được cho ĐẶC ĐIỂM HÌNH DẠNG cụ thể để so khớp trực tiếp với nét chữ trong ảnh thì dễ áp dụng hơn
// nhiều so với chỉ dựa vào ngữ cảnh số liền kề (vốn chỉ có tác dụng khi danh sách có quy luật rõ).
const DIGIT_CONFUSION_PAIRS = '1 và 7, 1 và 4, 0 và 6, 3 và 8, 2 và 7, 2 và 3, 5 và 6, 5 và 8, 4 và 9';
const DIGIT_SHAPE_HINTS =
  'Đặc điểm hình dạng để phân biệt từng cặp (dùng để soi trực tiếp vào nét chữ trong ảnh, không chỉ ' +
  'đoán theo ngữ cảnh):\n' +
  '   - "1" và "7": số 1 thường là 1 nét thẳng đơn giản (có thể có gạch chân nhỏ dưới đáy); số 7 có ' +
  'nét ngang ở đỉnh rồi chéo xuống, KHÔNG có gạch chân.\n' +
  '   - "1" và "4": số 1 vẫn là nét thẳng đơn; số 4 có 1 góc nhọn hoặc 2 nét giao nhau tạo hình tam ' +
  'giác hở/chữ V ngược ở phần trên, không phải 1 nét thẳng đơn thuần.\n' +
  '   - "0" và "6": số 0 là vòng tròn/oval khép kín đều 2 bên; số 6 có móc cong ở phía trên nối ' +
  'xuống 1 vòng tròn nhỏ ở đáy — hình dạng KHÔNG đối xứng, phần trên gầy hơn phần dưới.\n' +
  '   - "3" và "8": số 3 gồm 2 nét cong hở về bên phải (không khép kín); số 8 gồm 2 vòng tròn khép ' +
  'kín nối chồng lên nhau.\n' +
  '   - "2" và "7": số 2 có nét cong ở trên và 1 đáy NGANG PHẲNG rõ ràng; số 7 có nét ngang ở ĐỈNH ' +
  'rồi 1 nét chéo xuống, KHÔNG có đáy ngang phẳng.\n' +
  '   - "2" và "3": số 2 có đáy ngang phẳng rõ (như nêu trên); số 3 gồm 2 nét cong liên tiếp, hoàn ' +
  'toàn KHÔNG có đáy ngang phẳng nào.\n' +
  '   - "5" và "6": số 5 có nét ngang ở đỉnh và móc cong HỞ ở phía dưới; số 6 có móc cong ở trên nối ' +
  'xuống vòng tròn KHÉP KÍN ở đáy.\n' +
  '   - "5" và "8": số 5 hở (không khép vòng kín nào); số 8 khép kín 2 vòng tròn chồng lên nhau.\n' +
  '   - "4" và "9": số 4 có góc nhọn/nét giao nhau như mô tả trên; số 9 có 1 vòng tròn khép kín ở ' +
  'phía trên và 1 đuôi thẳng/hơi cong kéo xuống phía dưới.';

// Đoạn hướng dẫn đọc số hiệu ống — lõi giữ từ v59fix/v63fix2 (đã kiểm chứng tốt), v64 ĐI SÂU
// THÊM theo yêu cầu KTV ("đi sâu vào phân tích, nhận diện, đọc số chính xác, đọc được các dãy số
// dài"): thêm bước QUÉT TOÀN ẢNH trước khi đọc (không bỏ sót góc/mép/dòng chen), thêm ĐỌC 2 LƯỢT
// (lượt 1 đọc thô, lượt 2 rà lại đối chiếu từng số với số liền kề), và nói RÕ RÀNG là danh sách dù
// dài bao nhiêu (hàng chục/hàng trăm số) cũng PHẢI liệt kê đủ, không được tóm tắt/rút gọn/chỉ nêu
// đại diện — đây là điểm quan trọng vì khâu Sửa ren và các khâu có dải số lớn từng bị nghi ngờ đọc
// thiếu khi danh sách quá dài.
const SERIAL_READING_STEPS =
  '1. QUÉT TOÀN BỘ ẢNH trước khi đọc số nào — kiểm tra hết các góc, mép ảnh, các dòng viết chen/viết ' +
  'thêm ngoài lề, các cột phụ nếu có, để chắc chắn không bỏ sót bất kỳ số hiệu ống hay ký hiệu khoảng ' +
  'số nào xuất hiện trong ảnh (kể cả những chỗ mờ, bị che một phần, hoặc viết nhỏ ở rìa).\n' +
  '2. Xác định từng số hiệu ống hoặc từng ký hiệu khoảng số, theo đúng thứ tự xuất hiện (trái sang ' +
  'phải, trên xuống dưới, hết cột này sang cột khác nếu ảnh có nhiều cột).\n' +
  '3. ĐỌC 2 LƯỢT cho MỖI số: lượt 1 đọc thô toàn bộ chữ số; lượt 2 rà lại từng chữ số một lần nữa, ' +
  'đối chiếu với các số liền kề trong danh sách (thường tăng/giảm dần hoặc gần nhau) để phát hiện chỗ ' +
  'khả năng đọc nhầm — đặc biệt chú ý các cặp chữ số dễ nhầm khi viết tay: ' + DIGIT_CONFUSION_PAIRS + '.\n' +
  DIGIT_SHAPE_HINTS + '\n' +
  'Nếu nét chữ không rõ, ƯU TIÊN so khớp hình dạng nét chữ thực tế trong ảnh với đặc điểm ở trên ' +
  'TRƯỚC, sau đó mới dùng thêm quy luật của các số liền kề (nếu có) để chọn chữ số hợp lý nhất — ' +
  'LUÔN đưa ra số cụ thể (không được bỏ trống một số chỉ vì không chắc 100%, đây là việc khác với ' +
  'việc nhận diện lỗi — số ống thì luôn phải có kết quả, dù là suy luận tốt nhất).\n' +
  '4. LƯU Ý CÁC KÝ HIỆU RÚT GỌN sau — PHẢI MỞ RỘNG thành đầy đủ từng số riêng lẻ trong kết quả, ' +
  'không được giữ nguyên dạng rút gọn:\n' +
  '   a. Hai số nối bằng MŨI TÊN (→, ->) hoặc DẤU GẠCH NGANG (-) nghĩa là một KHOẢNG liên tục — ' +
  'liệt kê TẤT CẢ các số nguyên từ số đầu đến số cuối, bao gồm cả 2 đầu mút. ' +
  'Ví dụ: "7246 → 7260" nghĩa là 15 số: 7246,7247,7248,...,7260. ' +
  'Ví dụ: "7261-7275" nghĩa là 15 số: 7261,7262,...,7275.\n' +
  '   b. Danh sách cách nhau bằng dấu phẩy có thể TRỘN LẪN số đơn lẻ và khoảng (dùng gạch ngang). ' +
  'Ví dụ: "7276-7280,7291,7295,7298-7305" nghĩa là: khoảng 7276-7280 (5 số: 7276,7277,7278,7279,7280), ' +
  'số đơn 7291, số đơn 7295, khoảng 7298-7305 (8 số: 7298,7299,7300,7301,7302,7303,7304,7305) — ' +
  'tổng cộng 15 số riêng lẻ.\n' +
  '   c. Nếu số ĐẦU LỚN HƠN số CUỐI (khoảng viết ngược/đếm lùi, VD "7031 → 7026"), vẫn PHẢI mở ' +
  'rộng đủ theo chiều giảm dần: "7031 → 7026" nghĩa là 6 số: 7031,7030,7029,7028,7027,7026. ' +
  'KHÔNG được bỏ qua hay để trống chỉ vì khoảng viết theo chiều giảm.\n' +
  '5. DANH SÁCH DÀI (vài chục đến vài trăm số, nhiều khoảng nối tiếp nhau): PHẢI liệt kê ĐẦY ĐỦ TỪNG ' +
  'SỐ MỘT trong kết quả cuối cùng, TUYỆT ĐỐI KHÔNG được tóm tắt, viết tắt, chỉ nêu vài số đại diện, ' +
  'hay dừng giữa chừng vì danh sách dài — cứ tiếp tục liệt kê cho tới khi hết toàn bộ số có trong ảnh, ' +
  'dù kết quả cuối cùng có nhiều phần tử.\n' +
  '6. Sau khi đọc và mở rộng hết các khoảng, đếm lại xem đã liệt kê đủ chưa — không bỏ sót, ' +
  'không thêm số không có thật, không để sót ký hiệu mũi tên/gạch ngang nào chưa mở rộng trong kết quả.';

// v63fix4: prompt đọc số giờ CHỈ có 1 bản DUY NHẤT, dùng cho MỌI trường hợp (có nhận diện lỗi
// hay không) — không còn "trộn" thêm yêu cầu lỗi vào chung 1 lượt gọi nữa (xem giải thích đầy đủ
// ở buildDefectsOnlyPrompt() và trong handler). Giữ tham số withDefects cho tương thích ngược
// nhưng thực chất giờ luôn trả về prompt giống nhau.
function buildPrompt(stageNum, withDefects) {
  return (
    'Đây là ảnh chụp danh sách số hiệu ống (pipe serial number), viết tay hoặc in, của một xưởng kiểm tra ống thép.\n\n' +
    'Hãy đọc theo các bước sau:\n' + SERIAL_READING_STEPS + '\n\n' +
    'CHỈ trả lời bằng một mảng JSON thuần các chuỗi số (mỗi số 1 phần tử, đã mở rộng hết khoảng), ' +
    'không kèm bất kỳ chữ giải thích, markdown, hay ký tự nào khác.\n' +
    'Ví dụ đúng định dạng: ["7115","7136","7113"]\n' +
    'Nếu không đọc được số nào, trả lời: []'
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// v67: CẤU HÌNH "CỘT TÌNH TRẠNG" THEO TỪNG KHÂU — dùng chung cho cả prompt (mô tả cho AI
// biết cần tìm cột nào) VÀ hàm suy luận thuần túy resolveMarksForStage() bên dưới (dùng
// đúng những mã "tag" này để tra bảng quy tắc đóng — closed-set rules).
// ═══════════════════════════════════════════════════════════════════════════

// Khâu Sửa ren (stage=4) — 4 cột thực tế theo đúng mẫu sổ tay KTV gửi (2026-07-15):
// "Đạt / Hỏng ren / Tiện ren mới / Hỏng CL / Thay CL mới / Loại NDT".
const SUAREN_TAG_DESC = [
  { tag: 'hong-ren', desc: 'cột "Hỏng ren" có dấu (tick/X/gạch chéo/khoanh tròn/chữ viết) — ghi tắt có thể là "hư ren", "ren hỏng", "ren hư"' },
  { tag: 'hong-cl', desc: 'cột "Hỏng CL" có dấu — "CL" là viết tắt "Coupling", ghi tắt có thể là "CL hỏng", "hư CL"' },
  { tag: 'tien-ren-moi', desc: 'cột "Tiện ren mới" có dấu — ghi tắt có thể là "đã tiện ren", "tiện lại ren", "tiện ren"' },
  { tag: 'thay-cl-moi', desc: 'cột "Thay CL mới" có dấu — ghi tắt có thể là "đã thay CL", "thay coupling mới", "thay CL"' },
];
// Đúng 6 tổ hợp KTV xác nhận (2026-07-15) — CHỈ 6 tổ hợp NÀY được tự tick (xem hàm
// resolveSuarenMarks). Mọi tổ hợp khác (kể cả tổ hợp "hợp lý" như Hỏng ren+Tiện ren mới
// cùng lúc) đều bị coi là NGOÀI QUY TẮC → gắn cờ "cần KTV xem lại", không tự tick.
const SUAREN_RULES = [
  { marks: ['hong-ren'], defects: ['hong-ren'], repair: null },
  { marks: ['hong-cl'], defects: ['hong-coupling'], repair: null },
  { marks: ['hong-ren', 'hong-cl'], defects: ['hong-ren-coupling'], repair: null },
  { marks: ['tien-ren-moi'], defects: ['hong-ren'], repair: 'da-sua-ren' },
  { marks: ['thay-cl-moi'], defects: ['hong-coupling'], repair: 'da-thay-coupling' },
  { marks: ['tien-ren-moi', 'thay-cl-moi'], defects: ['hong-ren-coupling'], repair: 'da-sua-ca-hai' },
];

// Khâu NDT (stage=3) — 4 nhãn ĐỘC LẬP (không có trục "xử lý" gây mập mờ như Sửa ren) nên
// KHÔNG cần bảng quy tắc đóng riêng — mọi tổ hợp con khác rỗng của 4 nhãn này đều hợp lệ
// (xem resolveNdtMarks). "Cross"/"Line" (tiếng Anh viết tắt hướng vết nứt ngang/dọc) đều gộp
// vào "nut-than"; "Thk"/"THK" (viết tắt "Thickness") gộp vào "mo-thanh".
const NDT_TAG_DESC = [
  { tag: 'nut-than', desc: 'ghi "nứt thân", hoặc viết tắt tiếng Anh "Cross"/"Cross def." (nứt ngang) hoặc "Line"/"Line def." (nứt dọc) — CẢ HAI đều map về "nut-than"' },
  { tag: 'an-mon', desc: 'ghi "ăn mòn"' },
  { tag: 'mo-thanh', desc: 'ghi "mỏng thành" (độ dày không đạt), hoặc viết tắt tiếng Anh "Thk"/"THK" (Thickness)' },
  { tag: 'khac', desc: 'có ghi chú/dấu hiệu RÕ RÀNG là có vấn đề/loại/reject nhưng KHÔNG khớp 3 loại trên (VD chữ "loại", "reject", dấu gạch chéo không kèm ghi chú cụ thể)' },
];
const NDT_TAGS = NDT_TAG_DESC.map(t => t.tag);

// Khâu Ép thủy lực (stage=5) — CHƯA có mẫu sổ tay thật để đối chiếu (khác Sửa ren đã có 2 ảnh
// thật KTV gửi) — dùng thuật ngữ phổ biến nhất theo tên trạng thái đã có sẵn trong app, KTV cần
// kiểm tra lại khi dùng thử, báo lại nếu cách ghi thực tế ở xưởng khác đi.
const EPTL_TAG_DESC = [
  { tag: 'xi-pin', desc: 'ghi nhận ống bị xì tại đầu Pin khi ép thử — có thể ghi "Xì Pin", "Xì đầu Pin", "Pin", hoặc chỉ "Pin" kèm dấu X/tick' },
  { tag: 'xi-cl', desc: 'ghi nhận ống bị xì tại Coupling khi ép thử — có thể ghi "Xì CL", "Xì Coupling", "CL" kèm dấu X/tick' },
  { tag: 'loai', desc: 'ghi chú/dấu hiệu RÕ RÀNG ống bị loại bỏ hẳn (không chỉ xì mà loại hẳn) — VD "loại", "reject", khoanh đỏ' },
];
const EPTL_TAGS = EPTL_TAG_DESC.map(t => t.tag);
const EPTL_RULES = [
  { marks: ['xi-pin'], status: 'xi_pin' },
  { marks: ['xi-cl'], status: 'xi_coupling' },
  { marks: ['xi-pin', 'xi-cl'], status: 'xi_both' },
  { marks: ['loai'], status: 'loai' },
];

const STAGE_TAG_CONFIG = {
  3: { name: 'NDT', tagDesc: NDT_TAG_DESC, kind: 'ndt' },
  4: { name: 'Sửa ren', tagDesc: SUAREN_TAG_DESC, kind: 'suaren' },
  5: { name: 'Ép thủy lực', tagDesc: EPTL_TAG_DESC, kind: 'eptl' },
};

function sameSet(a, b) {
  if (a.length !== b.length) return false;
  const as = [...a].sort(), bs = [...b].sort();
  return as.every((v, i) => v === bs[i]);
}

// ── v67 LÕI SUY LUẬN THUẦN TÚY (deterministic, đã unit-test — xem /tmp/test_defect_mapping.js
// lúc phát triển) — nhận vào danh sách "marks" (cột nào AI thấy có dấu cho 1 ống), trả về
// {tier:'confident', defects, repair} | {tier:'confident', status} | {tier:'uncertain', ...} | null
function resolveSuarenMarks(rawMarks) {
  const marks = [...new Set(rawMarks)].filter(Boolean);
  if (!marks.length) return null;
  const rule = SUAREN_RULES.find(r => sameSet(r.marks, marks));
  if (rule) return { tier: 'confident', defects: rule.defects, repair: rule.repair };
  return { tier: 'uncertain', rawMarks: marks, reason: 'to_hop_ngoai_6_quy_tac' };
}
function resolveNdtMarks(rawMarks) {
  if (rawMarks.includes('unclear')) {
    const known = rawMarks.filter(k => NDT_TAGS.includes(k));
    return { tier: 'uncertain', rawMarks: known, reason: 'dau_khong_ro_thuoc_cot_nao' };
  }
  const marks = [...new Set(rawMarks)].filter(k => NDT_TAGS.includes(k));
  if (!marks.length) return null;
  return { tier: 'confident', defects: marks, repair: null };
}
function resolveEptlMarks(rawMarks) {
  if (rawMarks.includes('unclear')) {
    const known = rawMarks.filter(k => EPTL_TAGS.includes(k));
    return { tier: 'uncertain', rawMarks: known, reason: 'dau_khong_ro_thuoc_cot_nao' };
  }
  const marks = [...new Set(rawMarks)].filter(Boolean);
  if (!marks.length) return null;
  const rule = EPTL_RULES.find(r => sameSet(r.marks, marks));
  if (rule) return { tier: 'confident', status: rule.status };
  return { tier: 'uncertain', rawMarks: marks, reason: 'to_hop_ngoai_quy_tac_eptl' };
}
function resolveMarksForStage(stage, rawMarks) {
  if (stage === 4) return resolveSuarenMarks(rawMarks || []);
  if (stage === 3) return resolveNdtMarks(rawMarks || []);
  if (stage === 5) return resolveEptlMarks(rawMarks || []);
  return null;
}

// ── Khớp số ống GẦN ĐÚNG giữa lệnh đọc số (numbers) và lệnh đọc lỗi (defects) — 2 lệnh AI
// độc lập, mỗi lệnh tự đọc lại số ống 1 lần, có thể lệch 1 chữ số do ảnh mờ/nén nhỏ. Trước v67,
// lệch 1 ký tự làm MẤT TRẮNG cả kết quả lỗi của ống đó (lọc chính xác tuyệt đối, không báo gì) —
// từ v67 vẫn giữ (không tự tick khi chỉ khớp gần đúng) nhưng KHÔNG còn mất trắng, đưa vào uncertain.
function levenshtein(a, b) {
  a = String(a); b = String(b);
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}
function matchSerial(candidate, numbersList) {
  const c = String(candidate).trim();
  if (!c) return { serial: c, matchType: 'none' };
  if (numbersList.includes(c)) return { serial: c, matchType: 'exact' };
  let best = null, bestDist = Infinity;
  for (const n of numbersList) {
    if (Math.abs(n.length - c.length) > 1) continue;
    const d = levenshtein(c, n);
    if (d < bestDist) { bestDist = d; best = n; }
  }
  if (best !== null && bestDist <= 1) return { serial: best, matchType: 'fuzzy', rawSerial: c };
  return { serial: c, matchType: 'none' };
}

// ── Hàm chính: nhận "observations" thô AI trả về (mỗi phần tử {serial, marks:[...],
// rowUncertain?:boolean}) + danh sách numbers đã đọc riêng (đáng tin cậy hơn) →
// {confident:[...], uncertain:[...]}
// v68: THÊM trục kiểm tra "rowUncertain" — ĐỘC LẬP với trục "tổ hợp cột có hợp lệ hay không".
// Dù tổ hợp cột khớp đúng 1 trong các quy tắc (đủ điều kiện "confident" về mặt Ý NGHĨA dấu),
// nếu AI tự báo nghi ngờ VỊ TRÍ HÀNG của dấu đó (dấu nằm sát ranh giới 2 hàng/ảnh nghiêng khó
// xác định), vẫn phải hạ xuống "uncertain" — vì tick sai SỐ ỐNG (đúng loại lỗi nhưng gán nhầm
// ống) nguy hiểm không kém tick sai LOẠI LỖI, và trục "tổ hợp cột" cũ không có cách nào bắt
// được kiểu lỗi này.
function processDefectObservations(stage, observations, numbersList) {
  const confident = [];
  const uncertain = [];
  (observations || []).forEach(obs => {
    if (!obs || !obs.serial) return;
    const resolved = resolveMarksForStage(stage, obs.marks || []);
    if (!resolved) return;
    const sm = matchSerial(obs.serial, numbersList);
    if (sm.matchType === 'none') {
      uncertain.push({ serial: obs.serial, rawMarks: obs.marks || [], reason: 'so_ong_khong_khop_danh_sach_da_doc', ...resolved });
      return;
    }
    if (obs.rowUncertain === true) {
      uncertain.push({
        serial: sm.serial,
        rawMarks: obs.marks || [],
        reason: 'dau_gan_ranh_gioi_hang',
        matchType: sm.matchType,
      });
      return;
    }
    if (resolved.tier === 'confident' && sm.matchType === 'exact') {
      const entry = { serial: sm.serial };
      if (resolved.defects) entry.defects = resolved.defects;
      if (resolved.repair) entry.repair = resolved.repair;
      if (resolved.status) entry.status = resolved.status;
      confident.push(entry);
    } else {
      uncertain.push({
        serial: sm.serial,
        rawMarks: obs.marks || [],
        reason: resolved.tier === 'uncertain' ? resolved.reason : 'so_ong_chi_khop_gan_dung',
        matchType: sm.matchType,
      });
    }
  });
  return { confident, uncertain };
}

// v67: prompt đọc "quan sát thô" — CHỈ yêu cầu AI MÔ TẢ LẠI cột nào có dấu, KHÔNG còn yêu cầu
// tự kết luận mã lỗi cuối cùng, KHÔNG còn yêu cầu tự đánh giá "chắc chắn hay không" rồi tự
// quyết định tick/bỏ (đây chính là quy tắc gây bỏ sót tràn lan ở v64-v66). Việc map "tổ hợp cột
// nào → lỗi gì, đủ tin cậy để tick hay chỉ nên gợi ý" nay do CODE (resolveMarksForStage) quyết
// định sau khi nhận kết quả — nhiệm vụ của AI đơn giản, mang tính "chép lại" hơn là "phán đoán".
function buildDefectsOnlyPrompt(stageNum) {
  const cfg = STAGE_TAG_CONFIG[stageNum];
  if (!cfg) return null;
  const tagListTxt = cfg.tagDesc.map(t => `  - "${t.tag}": ${t.desc}`).join('\n');
  return (
    `Đây là ảnh chụp SỔ/BẢNG GHI CHÉP kiểm tra ống thép tại khâu "${cfg.name}" của một xưởng kiểm tra ống. ` +
    'Sổ có thể ở BẤT KỲ định dạng nào — bảng kẻ ô in sẵn, sổ tay viết tay tự do, danh sách đơn giản, ảnh chụp ' +
    'Excel, v.v. Hãy TỰ THÍCH ỨNG với định dạng thực tế trong ảnh, KHÔNG giả định trước cấu trúc cột.\n\n' +
    'NHIỆM VỤ DUY NHẤT của bạn là MÔ TẢ LẠI những gì thấy trong ảnh — KHÔNG tự kết luận ống đó bị lỗi gì, ' +
    'KHÔNG tự đánh giá "chắc chắn hay không chắc chắn" rồi tự quyết định có nên báo cáo hay không. Chỉ cần ' +
    'ống đó có BẤT KỲ dấu hiệu nào (tick/X/gạch chéo/khoanh tròn/chữ viết) ở 1 trong các cột dưới đây, hãy ' +
    'đưa vào kết quả và ghi lại ĐÚNG cột nào có dấu — việc quyết định cuối cùng do hệ thống khác xử lý, ' +
    'không phải việc của bạn. BỎ QUA HẲN những ống hoàn toàn không có dấu gì (Đạt/bình thường, không cần ' +
    'liệt kê hết mọi ống trong ảnh).\n\n' +
    'Danh sách cột cần tìm dấu, dùng ĐÚNG mã sau khi báo cáo (1 ống có thể có NHIỀU mã cùng lúc nếu nhiều ' +
    'cột đều có dấu):\n' + tagListTxt + '\n\n' +
    'Với MỖI ống có ít nhất 1 cột có dấu:\n' +
    '1. Đọc số hiệu ống đó CẨN THẬN từng chữ số một — đặc biệt chú ý các cặp chữ số dễ nhầm khi viết tay: ' +
    DIGIT_CONFUSION_PAIRS + '.\n' +
    '2. Liệt kê ĐẦY ĐỦ và CHÍNH XÁC mọi cột có dấu cho đúng ống đó (không bỏ sót cột nào có dấu, không thêm ' +
    'cột nào không có dấu).\n' +
    '3. CHỈ trong trường hợp hiếm — dấu mực nằm giữa ranh giới 2 cột, hoặc bị nhòe/che khuất tới mức KHÔNG ' +
    'THỂ xác định thuộc cột nào — thêm "unclear" vào danh sách marks của ống đó thay vì đoán bừa 1 cột. Đây ' +
    'là trường hợp NGOẠI LỆ hiếm, không áp dụng cho các dấu bình thường dù nét có hơi mờ (vẫn cố xác định ' +
    'đúng cột nếu còn nhận ra được vị trí tương đối trong bảng).\n' +
    '4. KIỂM TRA RIÊNG VỀ HÀNG (khác với kiểm tra về CỘT ở bước 3) — đây là bước BẮT BUỘC cho MỌI dấu, ' +
    'không phải trường hợp hiếm: sổ tay viết tay thường có các hàng kẻ RẤT SÁT NHAU, và ảnh chụp có thể hơi ' +
    'nghiêng (các đường kẻ ngang không thẳng hàng với mép ảnh) — cả 2 điều này khiến 1 dấu X/tick nằm gần ' +
    'đường kẻ ngang phía trên hoặc phía dưới của ô RẤT DỄ bị nhìn nhầm là thuộc về hàng (tức ống) liền kề ' +
    'thay vì đúng hàng của nó. Với MỖI dấu, hãy tự hỏi: dấu này có nằm SÁT (chạm hoặc gần chạm) đường kẻ ' +
    'ngang trên/dưới của ô không? Ảnh có bị nghiêng đủ nhiều khiến việc bám theo đúng 1 đường kẻ ngang từ ' +
    'số ống sang tới cột đánh dấu trở nên khó khăn không? Nếu CÓ MỘT TRONG HAI dấu hiệu trên khiến bạn ' +
    'không chắc chắn dấu đó thuộc đúng hàng của số ống bạn vừa đọc (dù bạn vẫn chọn 1 số ống cụ thể để báo ' +
    'cáo), hãy thêm "rowUncertain": true vào quan sát đó. Nếu dấu nằm rõ ràng giữa ô, cách xa cả 2 đường kẻ ' +
    'trên/dưới, không cần thêm trường này (coi như false, không cần ghi tường minh).\n\n' +
    'CHỈ trả lời bằng 1 object JSON DUY NHẤT theo đúng định dạng sau, không kèm chữ giải thích, không markdown:\n' +
    '{"observations":[{"serial":"7115","marks":["' + cfg.tagDesc[0].tag + '"]},' +
    '{"serial":"7140","marks":["' + cfg.tagDesc[0].tag + '"],"rowUncertain":true}]}\n' +
    '(ví dụ trên: ống 7140 có dấu nhưng dấu đó nằm sát ranh giới hàng nên kèm "rowUncertain":true)\n' +
    'Không có ống nào có dấu: {"observations":[]}'
  );
}

// v63fix2: trích riêng 1 trường mảng (VD "numbers" hoặc "observations") từ text trả về, có khả
// năng "cứu" dữ liệu khi JSON bị CẮT GIỮA CHỪNG (model bị dừng khi chạm max_tokens hoặc kết nối bị
// ngắt giữa chừng vì gần chạm giới hạn 25s của Vercel Edge Function) — thay vì phải JSON.parse
// nguyên khối rồi mất trắng cả object nếu chỉ 1 ký tự cuối bị thiếu. Theo dõi độ sâu ngoặc
// []/{} và trạng thái trong-chuỗi để tìm đúng dấu ']' khớp; nếu không tìm thấy (bị cắt), cắt bớt
// về phần tử hoàn chỉnh gần cuối cùng rồi tự đóng ']' lại để JSON.parse phần còn cứu được.
// v64: logic salvage dùng chung, tách khỏi extractArrayField() để tái dùng cho cả trường hợp không
// có "key" bao ngoài (VD "numbers" giờ cũng cần cứu dữ liệu khi bị cắt — trước v64 chỉ áp dụng cho
// "pipes"/"observations", nhưng numbers còn quan trọng hơn nên cũng cần cơ chế này).
function extractArraySliceFrom(rawText, bracketIdx) {
  if (bracketIdx === -1) return null;
  let depth = 0, inStr = false, esc = false, endIdx = -1;
  for (let i = bracketIdx; i < rawText.length; i++) {
    const ch = rawText[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '[' || ch === '{') depth++;
    else if (ch === ']' || ch === '}') {
      depth--;
      if (depth === 0 && ch === ']') { endIdx = i; break; }
    }
  }
  let slice;
  if (endIdx !== -1) {
    slice = rawText.slice(bracketIdx, endIdx + 1);
  } else {
    // Bị cắt giữa chừng — tìm điểm cắt AN TOÀN gần cuối nhất ở độ sâu 1 (ngay trong mảng ngoài
    // cùng, không nằm giữa 1 object/chuỗi con dở dang) rồi tự đóng ']'.
    slice = rawText.slice(bracketIdx);
    let d = 0, si = false, es = false, cut = -1;
    for (let i = 0; i < slice.length; i++) {
      const ch = slice[i];
      if (si) {
        if (es) es = false;
        else if (ch === '\\') es = true;
        else if (ch === '"') si = false;
        continue;
      }
      if (ch === '"') { si = true; continue; }
      if (ch === '[' || ch === '{') d++;
      else if (ch === ']' || ch === '}') { d--; if (d === 1 && ch === '}') cut = i; }
      else if (ch === ',' && d === 1) cut = i - 1;
    }
    slice = (cut !== -1) ? (slice.slice(0, cut + 1) + ']') : '[]';
  }
  try { return JSON.parse(slice); } catch (e) { return null; }
}
function extractArrayField(rawText, key) {
  const keyIdx = rawText.indexOf('"' + key + '"');
  if (keyIdx === -1) return null;
  const bracketIdx = rawText.indexOf('[', keyIdx);
  return extractArraySliceFrom(rawText, bracketIdx);
}
// v64: prompt đọc số trả về 1 mảng JSON THUẦN (không bọc trong object/key) — tìm dấu '[' đầu tiên
// trong text rồi áp dụng đúng cơ chế salvage như extractArrayField() để cứu dữ liệu nếu bị cắt
// giữa chừng (model chạm max_tokens hoặc mất kết nối giữa chừng), thay vì mất trắng cả danh sách
// số chỉ vì thiếu 1 ký tự cuối.
function extractBareJsonArray(rawText) {
  const bracketIdx = rawText.indexOf('[');
  return extractArraySliceFrom(rawText, bracketIdx);
}

// v63fix4: gọi Claude 1 lần, trả về text thuần (throw kèm .detail/.status khi lỗi để handler
// dựng đúng response lỗi như trước — tách ra thành hàm riêng vì giờ handler gọi hàm này 2 LẦN
// song song khi có nhận diện lỗi, xem giải thích trong handler).
async function callClaude(apiKey, model, prompt, image, mime, maxTokens) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: model,
      max_tokens: maxTokens,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mime || 'image/jpeg', data: image } },
          { type: 'text', text: prompt },
        ],
      }],
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    const err = new Error('Lỗi gọi Claude: ' + res.status);
    err.detail = errText;
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  return (data?.content || []).filter(b => b && b.type === 'text').map(b => b.text).join('\n');
}

export default async function handler(request) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Chỉ nhận POST' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { image, mime, stage } = await request.json();
    if (!image) {
      return new Response(JSON.stringify({ error: 'Thiếu dữ liệu ảnh' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Loại bỏ MỌI khoảng trắng/tab/xuống dòng ở bất kỳ vị trí nào trong key (không chỉ đầu/cuối)
    // — key API không bao giờ chứa khoảng trắng, nên xoá hết là an toàn. .trim() ở bản trước
    // chỉ xoá đầu/cuối nên không đủ nếu ký tự lạ nằm ở giữa (VD: dán từ nguồn bị ngắt dòng).
    const apiKey = (process.env.CLAUDE_API_KEY || '').replace(/\s+/g, '');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Chưa cấu hình CLAUDE_API_KEY trong Vercel Environment Variables (xem Bước 3 hướng dẫn ở đầu file)' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Kiểm tra ký tự hợp lệ cho header HTTP (chỉ ký tự ASCII hiển thị được, không dấu, không
    // ký tự ẩn). Nếu key vẫn còn ký tự lạ sau khi đã xoá khoảng trắng, báo rõ vị trí/độ dài để
    // biết chính xác chỗ sai thay vì đoán mò lần nữa.
    const badCharMatch = apiKey.match(/[^\x21-\x7E]/);
    if (badCharMatch) {
      const pos = apiKey.search(/[^\x21-\x7E]/);
      const code = badCharMatch[0].charCodeAt(0);
      return new Response(JSON.stringify({
        error: 'CLAUDE_API_KEY chứa ký tự không hợp lệ',
        detail: 'Độ dài key hiện tại: ' + apiKey.length + ' ký tự. Ký tự lạ ở vị trí ' + pos + ' (mã Unicode: ' + code + '). Hãy xoá biến CLAUDE_API_KEY trong Vercel, tạo lại và dán key mới trực tiếp từ trang console.anthropic.com (tránh gõ tay hoặc dán qua ứng dụng chat/ghi chú).',
      }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // v63: chỉ bật nhận diện lỗi khi "stage" hợp lệ VÀ nằm trong danh sách khâu có cấu hình
    // (STAGE_TAG_CONFIG). v67: danh sách đổi từ {2,3,4} (Thông nòng/NDT/Sửa ren) sang {3,4,5}
    // (NDT/Sửa ren/Ép thủy lực) theo đúng yêu cầu KTV 2026-07-15 — Thông nòng rút khỏi diện
    // này (chỉ đọc số), Ép thủy lực được thêm vào. Việc app có gửi "stage" hay không giờ do
    // KTV chủ động chọn ("① Chỉ đọc số"/"② Đọc số + Tick lỗi") mỗi lần chụp, không còn tự
    // động theo khâu như trước.
    const stageNum = Number.isInteger(stage) ? stage : parseInt(stage, 10);
    const withDefects = Number.isFinite(stageNum) && !!STAGE_TAG_CONFIG[stageNum];
    const model = 'claude-haiku-4-5-20251001'; // rẻ + nhanh — bản so sánh: ocr-sonnet.js / ocr-opus.js

    // v63fix4: GỌI RIÊNG 2 LỆNH ĐỘC LẬP SONG SONG khi có nhận diện lỗi — 1 lệnh CHỈ đọc số (dùng
    // ĐÚNG prompt đơn giản, ổn định từ trước, không đổi 1 chữ), 1 lệnh RIÊNG chỉ tìm ống có dấu
    // (v67: giờ chỉ MÔ TẢ cột nào có dấu, không tự kết luận lỗi/độ tin cậy nữa — xem
    // buildDefectsOnlyPrompt). LÝ DO tách riêng: bắt AI làm nhiều việc cùng lúc (đọc số + phân
    // loại lỗi) trong 1 lượt duy nhất làm GIẢM độ tập trung cho từng việc, nhất là việc ĐỌC SỐ —
    // vốn quan trọng nhất. Chạy song song (Promise.allSettled) nên KHÔNG tăng thời gian chờ so
    // với trước; nếu lệnh lỗi thất bại, số ống đọc được ở lệnh kia VẪN giữ nguyên.
    const numbersPrompt = buildPrompt(stageNum, false);
    let numbersRawText, defectsRawText = null;

    if (withDefects) {
      const defectsPrompt = buildDefectsOnlyPrompt(stageNum);
      const [numResult, defResult] = await Promise.allSettled([
        // v64: bump 2048→4096 cho lệnh đọc số — danh sách rất dài (nhiều khoảng nối tiếp, hàng
        // trăm số) có thể vượt 2048 token và bị CẮT GIỮA CHỪNG trước đây.
        callClaude(apiKey, model, numbersPrompt, image, mime, 4096),
        // v67: bump 3072→4096 — nhiệm vụ MÔ TẢ (không còn tự lọc theo "chắc chắn") có thể liệt
        // kê nhiều ống hơn hẳn trước (mọi ống có dấu, kể cả dấu mờ/tổ hợp lạ), cần thêm khoảng
        // trống token để không bị cắt giữa chừng với danh sách dài.
        callClaude(apiKey, model, defectsPrompt, image, mime, 4096),
      ]);
      if (numResult.status === 'rejected') {
        const e = numResult.reason;
        const keyInfo = 'Key hiện dùng: ' + apiKey.length + ' ký tự, bắt đầu bằng "' + apiKey.slice(0, 12) + '..."';
        return new Response(JSON.stringify({ error: (e && e.message) || 'Lỗi gọi Claude', detail: ((e && e.detail) || '') + ' | ' + keyInfo }), {
          status: (e && e.status) || 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      numbersRawText = numResult.value;
      if (defResult.status === 'fulfilled') defectsRawText = defResult.value;
      // defResult bị lỗi (mạng/timeout riêng lệnh lỗi) → defectsRawText giữ null, coi như "không
      // tìm được ống lỗi nào" — numbers vẫn trả về đầy đủ, KTV chọn lỗi tay bình thường.
    } else {
      try {
        numbersRawText = await callClaude(apiKey, model, numbersPrompt, image, mime, 4096);
      } catch (e) {
        const keyInfo = 'Key hiện dùng: ' + apiKey.length + ' ký tự, bắt đầu bằng "' + apiKey.slice(0, 12) + '..."';
        return new Response(JSON.stringify({ error: (e && e.message) || 'Lỗi gọi Claude', detail: ((e && e.detail) || '') + ' | ' + keyInfo }), {
          status: (e && e.status) || 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Trích "numbers" — LUÔN từ 1 mảng JSON thuần (prompt đọc số không đổi bất kể withDefects).
    let numbersRaw = null;
    const arrMatch = numbersRawText.match(/\[[\s\S]*\]/);
    if (arrMatch) {
      try {
        const parsed = JSON.parse(arrMatch[0]);
        if (Array.isArray(parsed)) numbersRaw = parsed;
      } catch (e) { /* rơi xuống salvage bên dưới */ }
    }
    if (numbersRaw === null) {
      const salvaged = extractBareJsonArray(numbersRawText);
      if (Array.isArray(salvaged)) numbersRaw = salvaged;
    }
    const numbers = Array.isArray(numbersRaw)
      ? [...new Set(numbersRaw.map(String).map(s => s.trim()).filter(Boolean))]
      : [];

    // v67: trích "observations" (quan sát thô) rồi CHẠY QUA LÕI SUY LUẬN THUẦN TÚY
    // (processDefectObservations) để tách thành "pipes" (đủ tin cậy, tự tick) và "uncertain"
    // (không tự tick, chỉ gợi ý cho KTV xem lại) — thay cho việc nhận thẳng "pipes" đã được
    // chính AI tự lọc như trước (nguồn gốc lỗi bỏ sót tràn lan).
    let pipesOut = [];
    let uncertainOut = [];
    if (withDefects && defectsRawText) {
      let obsRaw = null;
      const objMatch = defectsRawText.match(/\{[\s\S]*\}/);
      if (objMatch) {
        try {
          const parsed = JSON.parse(objMatch[0]);
          obsRaw = Array.isArray(parsed.observations) ? parsed.observations : null;
        } catch (e) { /* rơi xuống trích riêng bên dưới */ }
      }
      if (obsRaw === null) obsRaw = extractArrayField(defectsRawText, 'observations');
      if (Array.isArray(obsRaw)) {
        const cleaned = obsRaw
          .filter(o => o && o.serial)
          .map(o => ({
            serial: String(o.serial).trim(),
            marks: Array.isArray(o.marks) ? o.marks.map(String) : [],
            rowUncertain: o.rowUncertain === true,
          }))
          .filter(o => o.serial);
        const { confident, uncertain } = processDefectObservations(stageNum, cleaned, numbers);
        pipesOut = confident;
        uncertainOut = uncertain;
      }
    }

    return new Response(JSON.stringify({ numbers, pipes: pipesOut, uncertain: uncertainOut }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: 'Lỗi xử lý: ' + err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
