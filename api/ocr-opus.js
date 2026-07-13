// ═══════════════════════════════════════════════════════════════════════════
// api/ocr-opus.js — Vercel Edge Function, đọc số ống từ ảnh bằng Claude (Anthropic) — bản Opus
// Dùng cho tính năng "📷 Đọc số ống từ ảnh (AI)" trong NKT Inspect Pro (khâu Tiếp nhận
// và Đóng gói & Phân loại).
//
// v63: MỞ RỘNG — trước đây chỉ đọc SỐ HIỆU ỐNG. Từ bản này, khi gọi kèm tham số
// "stage" (khâu hiện tại, 0-4: Tiếp nhận/Khu rửa/Thông nòng/NDT/Sửa ren), AI sẽ
// ĐỌC LUÔN cả GHI CHÚ LỖI của từng ống trong ảnh sổ tay/bảng kiểm tra (nếu có) và
// tự ánh xạ sang đúng mã lỗi app đang dùng cho khâu đó — trả về thêm mảng "pipes"
// (số ống + lỗi) bên cạnh "numbers" (chỉ số ống, giữ để không phá cách dùng cũ).
// Khâu Đóng gói (6)/Ép thủy lực (5)/không gửi "stage" → hành vi CŨ Y NGUYÊN, chỉ đọc số.
//
// TẠI SAO ĐỔI TỪ CLOUDFLARE SANG VERCEL: bản chạy trên Cloudflare Worker bị Anthropic
// chặn với lỗi "403 forbidden — Request not allowed" — nhiều khả năng do lưu lượng gọi
// TỪ hạ tầng Cloudflare Workers bị nghi ngờ là bot/lạm dụng (vấn đề hạ tầng, không phải do
// key hay code sai). Vercel là nền tảng khác hẳn, không dính vấn đề này.
//
// FILE NÀY PHẢI NẰM ĐÚNG ĐƯỜNG DẪN: api/ocr-opus.js (cùng thư mục "api" với ocr.js) —
// đây là quy ước của Vercel để tự nhận diện thành 1 endpoint tại /api/ocr-opus.
// ═══════════════════════════════════════════════════════════════════════════
// HƯỚNG DẪN TRIỂN KHAI (không cần biết lập trình, không cần cài gì trên máy):
//
// BƯỚC 1 — Tạo tài khoản GitHub (nếu chưa có), tạo repo và thêm file này:
//   1. Vào https://github.com → đăng ký tài khoản miễn phí (nếu chưa có)
//   2. Bấm nút "+" góc trên phải → "New repository" → đặt tên (VD: nkt-ocr-proxy) →
//      chọn "Public" hoặc "Private" đều được → "Create repository"
//   3. Trong repo vừa tạo, bấm "Add file" → "Create new file"
//   4. Ở ô đặt tên file, gõ ĐÚNG: api/ocr-opus.js (gõ cả dấu / — GitHub tự hiểu là tạo
//      thêm file "ocr-opus.js" trong thư mục "api" đã có sẵn)
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
//   2. URL đầy đủ để dùng trong app (bản Opus) là:
//      https://nkt-ocr-proxy-xxxx.vercel.app/api/ocr-opus
//      (thêm "/api/ocr-opus" ở cuối — đây chính là đường dẫn tới file này)
//   3. Dùng đúng file NKT_Inspect_Pro_v59_opus.html đã cấu hình sẵn URL này —
//      không cần gửi lại cho tôi trừ khi domain gốc trên Vercel khác với domain đã cấu hình.
//
// AN TOÀN: File này KHÔNG đụng gì đến Google Sheets hay dữ liệu phiếu kiểm tra — chỉ
// nhận 1 ảnh, trả về 1 danh sách số. Không lưu trữ ảnh ở đâu cả (xử lý xong là bỏ).
//
// SO SÁNH ĐỘ CHÍNH XÁC: đây là bản Opus (input $5/MTok, output $25/MTok, giữ tới 4784 ô ảnh) — dùng để so sánh với bản Haiku
// (api/ocr.js, rẻ nhất) và bản còn lại. Cả 3 dùng chung CLAUDE_API_KEY đã cấu hình sẵn trong
// Vercel — không cần tạo thêm key hay project mới.
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
const STAGE_DEFECT_KEYS = {
  2: ['meo-bd', 'tac-nong', 'khac'],
  3: ['nut-than', 'an-mon', 'mo-thanh', 'khac'],
  4: ['hong-coupling', 'hong-ren', 'hong-ren-coupling', 'khac'],
};
function stageDefectKeys(stage) { return STAGE_DEFECT_KEYS[stage] || Object.keys(DEFECTS); }
const SUAREN_REPAIR = {
  'da-sua-ren': 'Đã sửa ren (tiện ren mới)',
  'da-thay-coupling': 'Đã thay Coupling mới',
  'da-sua-ca-hai': 'Đã sửa ren VÀ thay Coupling (cả hai)',
};

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

// v63fix2: NDT hay dùng thuật ngữ tiếng Anh viết tắt "Cross"/"Line" (hướng vết nứt: ngang/dọc)
// — app hiện KHÔNG phân biệt 2 hướng này, cả 2 đều gộp vào "Nứt thân". Model không tự biết quy
// ước riêng của xưởng này nếu không được nói rõ — KTV đã nhắc lại yêu cầu này 2 lần nên hardcode
// thẳng vào prompt của khâu NDT, không phụ thuộc suy luận chung chung nữa.
const NDT_CROSS_LINE_NOTE =
  '\n\nLƯU Ý RIÊNG CHO KHÂU NDT: nếu ảnh ghi bằng thuật ngữ tiếng Anh viết tắt "Cross"/"Cross def." ' +
  '(vết nứt ngang) hoặc "Line"/"Line def." (vết nứt dọc) — CẢ HAI đều là vết nứt, LUÔN ánh xạ về mã ' +
  '"nut-than" (Nứt thân), không phân biệt ngang/dọc (app không có mã riêng cho từng hướng).';

// v64: KTV chỉ rõ sổ tay khâu Sửa ren hay dùng thuật ngữ/viết tắt riêng của xưởng cho cả LỖI lẫn
// TRẠNG THÁI XỬ LÝ — model không tự biết quy ước này nếu không nói rõ, nên hardcode thẳng vào
// prompt, tương tự cách đã làm với NDT_CROSS_LINE_NOTE ở trên.
const SUAREN_TERMINOLOGY_NOTE =
  '\n\nLƯU Ý THUẬT NGỮ RIÊNG CHO KHÂU SỬA REN — sổ tay xưởng hay ghi tắt, PHẢI ánh xạ ĐÚNG như sau ' +
  '(ưu tiên các quy ước này hơn suy đoán chung chung):\n' +
  '  - Ghi "hỏng ren" (hoặc "hư ren", "ren hỏng", "ren hư") cho 1 ống → mã lỗi "hong-ren" (Hỏng ren).\n' +
  '  - Ghi "hỏng CL" (hoặc "CL hỏng", "hư CL" — "CL" là viết tắt của "Coupling") → mã lỗi ' +
  '"hong-coupling" (Hỏng Coupling).\n' +
  '  - Ghi CẢ HAI cho cùng 1 ống ("hỏng ren + CL", "hỏng ren, hỏng CL", "hỏng ren và coupling") → ' +
  'mã lỗi "hong-ren-coupling".\n' +
  '  - Ghi "tiện ren mới" (hoặc "đã tiện ren", "tiện lại ren", "tiện ren") → mã TRẠNG THÁI XỬ LÝ ' +
  '(repair) "da-sua-ren" (Đã sửa ren — tiện ren mới).\n' +
  '  - Ghi "thay CL mới" (hoặc "đã thay CL", "thay coupling mới", "thay CL") → mã TRẠNG THÁI XỬ LÝ ' +
  '(repair) "da-thay-coupling" (Đã thay Coupling mới).\n' +
  '  - Ghi CẢ HAI việc xử lý cho cùng 1 ống → mã TRẠNG THÁI XỬ LÝ "da-sua-ca-hai".\n' +
  '  - LƯU Ý: mã LỖI (defects) và mã TRẠNG THÁI XỬ LÝ (repair) là 2 TRƯỜNG KHÁC NHAU trong kết quả ' +
  '— "hỏng ren"/"hỏng CL" LUÔN là lỗi (defects), "tiện ren mới"/"thay CL mới" LUÔN là trạng thái xử ' +
  'lý (repair), KHÔNG được lẫn lộn 2 loại này với nhau.';

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

// v63fix4: TÁCH RIÊNG hẳn phần "tìm ống có lỗi" ra thành 1 prompt độc lập, KHÔNG còn gộp chung
// với việc đọc số (xem giải thích trong handler — nghi vấn việc bắt AI làm nhiều việc 1 lúc làm
// giảm độ chính xác đọc số, nhất là khâu Sửa ren vốn có thêm cả mục "đã xử lý"). Prompt này không
// cần yêu cầu liệt kê MỌI số ống — chỉ cần đọc đúng số của những ống THỰC SỰ có vấn đề, vì "numbers"
// đầy đủ đã có sẵn từ lệnh gọi riêng (buildPrompt) — 2 lệnh chạy song song, không tăng thời gian chờ.
function buildDefectsOnlyPrompt(stageNum) {
  const stageName = STAGE_NAMES[stageNum] || '';
  const allowedDefects = stageDefectKeys(stageNum);
  const defectListTxt = allowedDefects.map(k => `  - "${k}": ${DEFECTS[k]}`).join('\n');
  const repairSection = (stageNum === 4)
    ? ('\n\nVới mỗi ống có lỗi ở trên, NẾU ảnh có ghi rõ TRẠNG THÁI ĐÃ XỬ LÝ RIÊNG (VD cột "đã sửa"/' +
       '"kết quả xử lý"/dấu tick tách biệt với cột lỗi), ánh xạ THÊM sang ĐÚNG MỘT mã sau:\n' +
       Object.entries(SUAREN_REPAIR).map(([k, v]) => `  - "${k}": ${v}`).join('\n') +
       '\nNẾU ảnh KHÔNG ghi rõ ràng trạng thái xử lý, hoặc không chắc chắn đúng mã nào trong 3 mã trên ' +
       '— để "repair" là null, TUYỆT ĐỐI KHÔNG tự đoán đại 1 mã.')
    : '';
  const ndtNote = (stageNum === 3) ? NDT_CROSS_LINE_NOTE : '';
  const suarenNote = (stageNum === 4) ? SUAREN_TERMINOLOGY_NOTE : '';
  return (
    `Đây là ảnh chụp SỔ/BẢNG GHI CHÉP kiểm tra ống thép tại khâu "${stageName}" của một xưởng kiểm tra ống. ` +
    'Sổ có thể ở BẤT KỲ định dạng nào — bảng kẻ ô in sẵn, sổ tay viết tay tự do, danh sách đơn giản, ảnh chụp ' +
    'Excel, v.v. Hãy TỰ THÍCH ỨNG với định dạng thực tế trong ảnh, KHÔNG giả định trước cấu trúc cột.\n\n' +
    'NHIỆM VỤ DUY NHẤT của bạn: tìm CÁC ỐNG CÓ LỖI/GHI CHÚ VẤN ĐỀ RÕ RÀNG trong ảnh — bỏ qua HẲN những ' +
    'ống bình thường/"Đạt"/không có ghi chú gì (KHÔNG cần liệt kê hết mọi ống trong ảnh, chỉ cần những ' +
    'ống có vấn đề).\n\n' +
    'Với MỖI ống có vấn đề đó, thực hiện theo đúng thứ tự:\n' +
    '1. Đọc số hiệu ống đó CẨN THẬN từng chữ số một — đặc biệt chú ý các cặp chữ số dễ nhầm khi viết tay: ' +
    DIGIT_CONFUSION_PAIRS + '.\n' +
    '2. Xác định ghi chú/lỗi mà ảnh THỰC SỰ ghi cho đúng ống đó, rồi ánh xạ sang mã lỗi trong danh sách sau ' +
    '(CHỈ dùng đúng mã trong danh sách, KHÔNG tự bịa mã khác, 1 ống có thể có NHIỀU mã cùng lúc):\n' +
    defectListTxt + '\n\n' +
    'QUAN TRỌNG NHẤT — QUY TẮC "KHÔNG CHẮC THÌ BỎ QUA" (đọc kỹ trước khi làm bước dưới):\n' +
    'NẾU KHÔNG CHẮC CHẮN — dù là không chắc ống đó có thực sự lỗi hay không, không chắc đúng lỗi nào trong ' +
    'các mã ở trên, hay (với khâu Sửa ren) không chắc trạng thái xử lý là gì — THÌ TUYỆT ĐỐI KHÔNG được tự ' +
    'đoán, KHÔNG tự chọn đại một mã nào, và BỎ QUA HẲN ống đó (không đưa vào kết quả "pipes"), để KTV tự ' +
    'xem ảnh gốc và chọn tay. Thà bỏ sót còn hơn tự tick sai — tick sai KTV dễ không để ý mà bỏ qua luôn, ' +
    'còn bỏ sót thì KTV vẫn thấy ống đó cần xem lại khi rà danh sách.\n\n' +
    'Quy tắc ánh xạ lỗi (RẤT QUAN TRỌNG):\n' +
    '  - Chỉ gán lỗi khi ảnh THỰC SỰ có ghi chú/ký hiệu/dấu tick/khoanh tròn/gạch chéo/chữ viết tay chỉ RÕ ' +
    'RÀNG, KHÔNG MẬP MỜ vấn đề cho đúng ống đó — TUYỆT ĐỐI KHÔNG suy đoán (xem quy tắc "không chắc thì bỏ ' +
    'qua" ở trên).\n' +
    '  - Ghi chú rõ ràng có ý nghĩa "có vấn đề/lỗi/loại/reject" (dấu X, gạch chéo, khoanh đỏ, chữ ' +
    '"hỏng"/"loại"/"reject"...) nhưng KHÔNG xác định được đúng loại cụ thể → dùng mã "khac" NẾU danh sách ' +
    'trên có mã đó; nếu không có "khac" thì bỏ qua ống đó, không đưa vào kết quả.' +
    repairSection + ndtNote + suarenNote + '\n\n' +
    'CHỈ trả lời bằng 1 object JSON DUY NHẤT theo đúng định dạng sau, không kèm chữ giải thích, không markdown:\n' +
    '{"pipes":[{"serial":"7115","defects":["' + (allowedDefects[0] || 'khac') + '"]' +
    (stageNum === 4 ? ',"repair":"da-sua-ren"' : '') + '}]}\n' +
    'Không có ống nào có vấn đề: {"pipes":[]}'
  );
}

// v63fix2: trích riêng 1 trường mảng (VD "numbers" hoặc "pipes") từ text trả về, có khả năng
// "cứu" dữ liệu khi JSON bị CẮT GIỮA CHỪNG (model bị dừng khi chạm max_tokens hoặc kết nối bị
// ngắt giữa chừng vì gần chạm giới hạn 25s của Vercel Edge Function) — thay vì phải JSON.parse
// nguyên khối rồi mất trắng cả object nếu chỉ 1 ký tự cuối bị thiếu. Theo dõi độ sâu ngoặc
// []/{} và trạng thái trong-chuỗi để tìm đúng dấu ']' khớp; nếu không tìm thấy (bị cắt), cắt bớt
// về phần tử hoàn chỉnh gần cuối cùng rồi tự đóng ']' lại để JSON.parse phần còn cứu được.
// v64: logic salvage dùng chung, tách khỏi extractArrayField() để tái dùng cho cả trường hợp không
// có "key" bao ngoài (VD "numbers" giờ cũng cần cứu dữ liệu khi bị cắt — trước v64 chỉ áp dụng cho
// "pipes", nhưng numbers còn quan trọng hơn nên cũng cần cơ chế này, xem extractBareJsonArray()).
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

    // v63: chỉ bật nhận diện lỗi khi "stage" hợp lệ VÀ trong khoảng 0-4 (Tiếp nhận..Sửa ren).
    // Khâu Đóng gói (6)/Ép thủy lực (5)/không gửi stage → giữ hành vi cũ (chỉ đọc số).
    const stageNum = Number.isInteger(stage) ? stage : parseInt(stage, 10);
    const withDefects = Number.isFinite(stageNum) && stageNum >= 0 && stageNum <= 4;
    const model = 'claude-opus-4-8'; // model Opus — so sánh độ chính xác với Haiku (ocr.js) / Sonnet (ocr-sonnet.js)

    // v63fix4: GỌI RIÊNG 2 LỆNH ĐỘC LẬP SONG SONG khi có nhận diện lỗi — 1 lệnh CHỈ đọc số (dùng
    // ĐÚNG prompt đơn giản, ổn định từ trước, không đổi 1 chữ), 1 lệnh RIÊNG chỉ tìm ống có lỗi.
    // LÝ DO: KTV phản ánh khâu Sửa ren (prompt dài/phức tạp nhất vì có thêm mục "đã xử lý") đọc SỐ
    // kém hẳn so với khâu khác dù cùng model — nghi vấn hợp lý là bắt AI làm nhiều việc cùng lúc
    // (đọc số + phân loại nhiều mã lỗi + xác định trạng thái xử lý) trong 1 lượt duy nhất làm GIẢM
    // độ tập trung cho từng việc, nhất là việc ĐỌC SỐ — vốn quan trọng nhất (sai số ống ảnh hưởng
    // cả phiếu, còn sai/thiếu lỗi thì KTV vẫn xem lại và tự chọn được). Tách riêng để việc đọc số
    // LUÔN dùng đúng 1 prompt đơn giản, không lẫn yêu cầu nào khác, bất kể khâu nào. Chạy song song
    // (Promise.allSettled) nên KHÔNG tăng thời gian chờ so với trước; nếu lệnh lỗi thất bại, số ống
    // đọc được ở lệnh kia VẪN giữ nguyên — chỉ mất phần tự động tích lỗi round đó.
    const numbersPrompt = buildPrompt(stageNum, false);
    let numbersRawText, defectsRawText = null;

    if (withDefects) {
      const defectsPrompt = buildDefectsOnlyPrompt(stageNum);
      const [numResult, defResult] = await Promise.allSettled([
        // v64: bump 2048→4096 cho lệnh đọc số — danh sách rất dài (nhiều khoảng nối tiếp, hàng
        // trăm số) có thể vượt 2048 token và bị CẮT GIỮA CHỪNG trước đây. Chạy song song với lệnh
        // lỗi (không tăng thời gian chờ), và sinh ra dãy số thuần (rẻ/nhanh) nên tăng token không
        // đáng kể tới độ trễ thực tế trong hầu hết trường hợp.
        callClaude(apiKey, model, numbersPrompt, image, mime, 4096),
        callClaude(apiKey, model, defectsPrompt, image, mime, 2048),
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
        numbersRawText = await callClaude(apiKey, model, numbersPrompt, image, mime, 4096); // v64: xem giải thích ở nhánh withDefects
      } catch (e) {
        const keyInfo = 'Key hiện dùng: ' + apiKey.length + ' ký tự, bắt đầu bằng "' + apiKey.slice(0, 12) + '..."';
        return new Response(JSON.stringify({ error: (e && e.message) || 'Lỗi gọi Claude', detail: ((e && e.detail) || '') + ' | ' + keyInfo }), {
          status: (e && e.status) || 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Trích "numbers" — LUÔN từ 1 mảng JSON thuần (prompt đọc số không đổi bất kể withDefects).
    // v64: thử parse thẳng trước (đường nhanh, đủ dùng khi JSON nguyên vẹn); nếu lỗi (JSON bị cắt
    // giữa chừng vì chạm max_tokens hay mất kết nối) → rơi xuống extractBareJsonArray() để CỨU phần
    // danh sách đã đọc được thay vì trả về rỗng hoàn toàn (đặc biệt quan trọng với danh sách dài).
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
    const numbersSet = new Set(numbers);

    // Trích "pipes" từ lệnh gọi RIÊNG (defectsRawText) — dùng extractArrayField() để cứu dữ liệu
    // nếu bị cắt giữa chừng, giống cơ chế v63fix2 trước đây nhưng giờ áp dụng cho lệnh gọi độc lập.
    let pipesOut = [];
    if (withDefects && defectsRawText) {
      let pipesRaw = null;
      const objMatch = defectsRawText.match(/\{[\s\S]*\}/);
      if (objMatch) {
        try {
          const parsed = JSON.parse(objMatch[0]);
          pipesRaw = Array.isArray(parsed.pipes) ? parsed.pipes : null;
        } catch (e) { /* rơi xuống trích riêng bên dưới */ }
      }
      if (pipesRaw === null) pipesRaw = extractArrayField(defectsRawText, 'pipes');
      if (Array.isArray(pipesRaw)) {
        const allowedDefects = stageDefectKeys(stageNum);
        pipesRaw.forEach(p => {
          if (!p || !p.serial) return;
          const serial = String(p.serial).trim();
          if (!serial) return;
          // v63fix4: CHỈ giữ ống có mặt trong "numbers" (lệnh đọc số riêng, đáng tin cậy hơn vì
          // không bị lẫn việc khác) — phòng khi lệnh tìm lỗi đọc nhầm 1 số không khớp ống nào thật;
          // ống bị loại ở đây vẫn không mất gì vì KTV luôn xem lại danh sách trước khi lưu.
          if (!numbersSet.has(serial)) return;
          const defects = Array.isArray(p.defects)
            ? [...new Set(p.defects.map(String).filter(k => allowedDefects.includes(k)))]
            : [];
          let repair = null;
          if (stageNum === 4 && p.repair && Object.prototype.hasOwnProperty.call(SUAREN_REPAIR, String(p.repair))) {
            repair = String(p.repair);
          }
          if (!defects.length && !repair) return;
          pipesOut.push({ serial, defects, repair });
        });
      }
    }

    return new Response(JSON.stringify({ numbers, pipes: pipesOut }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: 'Lỗi xử lý: ' + err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
