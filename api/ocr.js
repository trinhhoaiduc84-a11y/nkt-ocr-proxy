// ═══════════════════════════════════════════════════════════════════════════
// api/ocr.js — Vercel Edge Function, đọc số ống (+ nhận diện lỗi từ v63) từ ảnh
// bằng Claude (Anthropic) — bản Haiku (rẻ nhất, mặc định).
// Dùng cho tính năng "📷 Đọc số ống từ ảnh (AI)" trong NKT Inspect Pro.
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

// Đoạn hướng dẫn đọc số hiệu ống — giữ NGUYÊN VĂN phần lõi so với bản trước (v59fix), đã kiểm
// chứng độ chính xác tốt. v63fix2: bổ sung mục 3c xử lý khoảng số VIẾT NGƯỢC (số đầu > số cuối)
// — thực tế sổ tay có kiểu ghi "7031 → 7026" (đếm lùi), bản trước chưa nói rõ nên model có thể
// bỏ sót/không mở rộng được, dẫn tới đọc thiếu hoặc trả lời rỗng.
const SERIAL_READING_STEPS =
  '1. Xác định từng số hiệu ống hoặc từng ký hiệu khoảng số xuất hiện trong ảnh, theo đúng thứ tự (trái sang phải, trên xuống dưới).\n' +
  '2. Với mỗi số, đọc CẨN THẬN từng chữ số một — đặc biệt chú ý các cặp chữ số dễ nhầm khi viết tay: ' +
  '1 và 7, 0 và 6, 3 và 8, 2 và 7, 5 và 6, 4 và 9. Nếu nét chữ không rõ, hãy dựa vào các số liền kề ' +
  'trong danh sách (thường có quy luật tăng/giảm dần hoặc gần nhau) để suy luận số hợp lý nhất.\n' +
  '3. LƯU Ý CÁC KÝ HIỆU RÚT GỌN sau — PHẢI MỞ RỘNG thành đầy đủ từng số riêng lẻ trong kết quả, ' +
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
  '4. Sau khi đọc và mở rộng hết các khoảng, đếm lại xem đã liệt kê đủ chưa — không bỏ sót, ' +
  'không thêm số không có thật, không để sót ký hiệu mũi tên/gạch ngang nào chưa mở rộng trong kết quả.';

// v63fix2: NDT hay dùng thuật ngữ tiếng Anh viết tắt "Cross"/"Line" (hướng vết nứt: ngang/dọc)
// — app hiện KHÔNG phân biệt 2 hướng này, cả 2 đều gộp vào "Nứt thân". Model không tự biết quy
// ước riêng của xưởng này nếu không được nói rõ — KTV đã nhắc lại yêu cầu này 2 lần nên hardcode
// thẳng vào prompt của khâu NDT, không phụ thuộc suy luận chung chung nữa.
const NDT_CROSS_LINE_NOTE =
  '\n\nLƯU Ý RIÊNG CHO KHÂU NDT: nếu ảnh ghi bằng thuật ngữ tiếng Anh viết tắt "Cross"/"Cross def." ' +
  '(vết nứt ngang) hoặc "Line"/"Line def." (vết nứt dọc) — CẢ HAI đều là vết nứt, LUÔN ánh xạ về mã ' +
  '"nut-than" (Nứt thân), không phân biệt ngang/dọc (app không có mã riêng cho từng hướng).';

function buildPrompt(stageNum, withDefects) {
  if (!withDefects) {
    // Hành vi CŨ y nguyên (dùng cho khâu Đóng gói hoặc khi không gửi "stage").
    return (
      'Đây là ảnh chụp danh sách số hiệu ống (pipe serial number), viết tay hoặc in, của một xưởng kiểm tra ống thép.\n\n' +
      'Hãy đọc theo các bước sau:\n' + SERIAL_READING_STEPS + '\n\n' +
      'CHỈ trả lời bằng một mảng JSON thuần các chuỗi số (mỗi số 1 phần tử, đã mở rộng hết khoảng), ' +
      'không kèm bất kỳ chữ giải thích, markdown, hay ký tự nào khác.\n' +
      'Ví dụ đúng định dạng: ["7115","7136","7113"]\n' +
      'Nếu không đọc được số nào, trả lời: []'
    );
  }
  const stageName = STAGE_NAMES[stageNum] || '';
  const allowedDefects = stageDefectKeys(stageNum);
  const defectListTxt = allowedDefects.map(k => `  - "${k}": ${DEFECTS[k]}`).join('\n');
  const repairSection = (stageNum === 4)
    ? ('\n\nBƯỚC 3 (CHỈ áp dụng vì đây là khâu Sửa ren) — với mỗi ống, nếu ảnh có ghi rõ TRẠNG THÁI ĐÃ ' +
       'XỬ LÝ (VD cột "đã sửa"/"kết quả xử lý"/dấu tick riêng biệt với lỗi), ánh xạ sang ĐÚNG MỘT mã sau ' +
       '(hoặc để null nếu ảnh không ghi rõ trạng thái xử lý cho ống đó):\n' +
       Object.entries(SUAREN_REPAIR).map(([k, v]) => `  - "${k}": ${v}`).join('\n'))
    : '';
  const ndtNote = (stageNum === 3) ? NDT_CROSS_LINE_NOTE : '';
  // v63fix2: TÁCH "numbers" (đầy đủ, mọi ống đọc được) ra khỏi "pipes" (CHỈ ống có lỗi/đã xử lý)
  // — 2 lý do: (1) an toàn — nếu phần "pipes" bị lỗi định dạng/bị cắt giữa chừng (ảnh nhiều ống,
  // model sinh chữ dài dễ vượt giới hạn thời gian 25s của Vercel Edge Function), "numbers" vẫn
  // đứng riêng nên KHÔNG bị mất theo, ít nhất vẫn đọc được số ống như tính năng gốc; (2) nhanh
  // hơn — đa số ống trong 1 ảnh thường "Đạt", liệt kê cả những ống đó vào "pipes" là dư thừa,
  // chỉ cần liệt kê ống có vấn đề giúp model trả lời ngắn hơn nhiều → ít khả năng bị cắt/timeout.
  return (
    `Đây là ảnh chụp SỔ/BẢNG GHI CHÉP kiểm tra ống thép tại khâu "${stageName}" của một xưởng kiểm tra ống. ` +
    'Sổ có thể ở BẤT KỲ định dạng nào — bảng kẻ ô in sẵn, sổ tay viết tay tự do, danh sách đơn giản, ảnh chụp ' +
    'Excel, v.v. Hãy TỰ THÍCH ỨNG với định dạng thực tế trong ảnh, KHÔNG giả định trước cấu trúc cột.\n\n' +
    'Thực hiện theo đúng các bước sau:\n\n' +
    'BƯỚC 1 — ĐỌC SỐ HIỆU ỐNG (TOÀN BỘ, kể cả ống không có lỗi gì):\n' + SERIAL_READING_STEPS + '\n\n' +
    'BƯỚC 2 — CHỈ với những ống THỰC SỰ có ghi chú/lỗi (bỏ qua hoàn toàn ống bình thường/"Đạt"/không ' +
    'có ghi chú gì), xác định ghi chú đó là gì rồi ánh xạ sang mã lỗi trong danh sách sau (CHỈ được dùng ' +
    'đúng mã trong danh sách, KHÔNG tự bịa mã khác, một ống có thể có NHIỀU mã cùng lúc nếu ảnh ghi rõ ' +
    'nhiều vấn đề):\n' +
    defectListTxt + '\n\n' +
    'Quy tắc ánh xạ lỗi (RẤT QUAN TRỌNG):\n' +
    '  - Chỉ gán lỗi cho ống nếu ảnh THỰC SỰ có ghi chú/ký hiệu/dấu tick/khoanh tròn/gạch chéo/chữ viết tay ' +
    'chỉ rõ vấn đề cho đúng ống đó — TUYỆT ĐỐI KHÔNG suy đoán hay gán lỗi cho ống không có ghi chú gì.\n' +
    '  - Nếu ghi chú rõ ràng có ý nghĩa "có vấn đề/lỗi/loại/reject" (VD dấu X, gạch chéo, khoanh đỏ, chữ ' +
    '"hỏng"/"loại"/"reject"...) nhưng KHÔNG xác định được đúng loại lỗi cụ thể trong danh sách, dùng mã ' +
    '"khac" NẾU danh sách trên có mã đó; nếu danh sách không có "khac" thì bỏ qua, không gán mã nào.\n' +
    '  - Ống KHÔNG có ghi chú đặc biệt gì → BỎ QUA HẲN, không thêm vào "pipes" (xem định dạng JSON bên dưới).' +
    repairSection + ndtNote + '\n\n' +
    'CHỈ trả lời bằng một object JSON DUY NHẤT theo đúng định dạng sau, không kèm chữ giải thích, không ' +
    'markdown. Trả "numbers" TRƯỚC (đầy đủ mọi ống đọc được ở Bước 1), rồi mới tới "pipes" (CHỈ ống có ' +
    'lỗi/đã xử lý xác định được ở Bước 2' + (stageNum === 4 ? '/Bước 3' : '') + ' — ống bình thường KHÔNG liệt kê vào đây):\n' +
    '{"numbers":["7113","7114","7115"],"pipes":[{"serial":"7115","defects":["' + (allowedDefects[0] || 'khac') + '"]' +
    (stageNum === 4 ? ',"repair":"da-sua-ren"' : '') + '}]}\n' +
    '("numbers" ở ví dụ trên có 3 ống nhưng "pipes" chỉ có 1 — vì chỉ ống 7115 có lỗi, 7113/7114 bình thường nên không liệt kê.)\n' +
    'Nếu không đọc được số ống nào: {"numbers":[],"pipes":[]}'
  );
}

// v63fix2: trích riêng 1 trường mảng (VD "numbers" hoặc "pipes") từ text trả về, có khả năng
// "cứu" dữ liệu khi JSON bị CẮT GIỮA CHỪNG (model bị dừng khi chạm max_tokens hoặc kết nối bị
// ngắt giữa chừng vì gần chạm giới hạn 25s của Vercel Edge Function) — thay vì phải JSON.parse
// nguyên khối rồi mất trắng cả object nếu chỉ 1 ký tự cuối bị thiếu. Theo dõi độ sâu ngoặc
// []/{} và trạng thái trong-chuỗi để tìm đúng dấu ']' khớp; nếu không tìm thấy (bị cắt), cắt bớt
// về phần tử hoàn chỉnh gần cuối cùng rồi tự đóng ']' lại để JSON.parse phần còn cứu được.
function extractArrayField(rawText, key) {
  const keyIdx = rawText.indexOf('"' + key + '"');
  if (keyIdx === -1) return null;
  const bracketIdx = rawText.indexOf('[', keyIdx);
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

    const prompt = buildPrompt(stageNum, withDefects);
    const model = 'claude-haiku-4-5-20251001'; // rẻ + nhanh — bản so sánh: ocr-sonnet.js / ocr-opus.js

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: model,
        // v63fix2: hạ từ 4096 xuống 3072 — từ khi "pipes" chỉ liệt kê ống có lỗi (không liệt kê
        // hết mọi ống nữa), nhu cầu thực tế thấp hơn nhiều; hạ giới hạn giúp giảm rủi ro chạm mốc
        // 25s timeout cứng của Vercel Edge Function (xem ghi chú ở buildPrompt).
        max_tokens: withDefects ? 3072 : 2048,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mime || 'image/jpeg', data: image },
            },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      // Kèm thông tin độ dài + vài ký tự đầu của key (KHÔNG lộ toàn bộ key) để biết ngay key
      // đang dùng có đúng dạng "sk-ant-api03-..." và độ dài hợp lý (~100+ ký tự) hay không,
      // phòng trường hợp key bị cắt/thiếu ký tự khi copy-paste vào Vercel.
      const keyInfo = 'Key hiện dùng: ' + apiKey.length + ' ký tự, bắt đầu bằng "' + apiKey.slice(0, 12) + '..."';
      return new Response(JSON.stringify({ error: 'Lỗi gọi Claude: ' + claudeRes.status, detail: errText + ' | ' + keyInfo }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const claudeData = await claudeRes.json();
    const rawText = (claudeData?.content || [])
      .filter(b => b && b.type === 'text')
      .map(b => b.text)
      .join('\n');

    // v63fix2: "numbers" và "pipes" giờ ĐỘC LẬP với nhau — trích riêng từng trường thay vì phải
    // JSON.parse trọn 1 object rồi mất trắng cả hai nếu chỉ 1 phần bị lỗi/bị cắt. Thử JSON.parse
    // nguyên khối trước (đường nhanh, đa số trường hợp); nếu hỏng mới rơi xuống trích riêng từng
    // trường bằng extractArrayField() (có khả năng cứu dữ liệu khi bị cắt giữa chừng).
    let numbersRaw = null, pipesRaw = null;
    if (withDefects) {
      const objMatch = rawText.match(/\{[\s\S]*\}/);
      let wholeOk = false;
      if (objMatch) {
        try {
          const parsed = JSON.parse(objMatch[0]);
          numbersRaw = Array.isArray(parsed.numbers) ? parsed.numbers : null;
          pipesRaw = Array.isArray(parsed.pipes) ? parsed.pipes : null;
          wholeOk = true;
        } catch (e) { /* rơi xuống trích riêng từng trường bên dưới */ }
      }
      if (!wholeOk || numbersRaw === null) numbersRaw = extractArrayField(rawText, 'numbers');
      if (!wholeOk || pipesRaw === null) pipesRaw = extractArrayField(rawText, 'pipes');
    } else {
      // Hành vi CŨ y nguyên: model trả về 1 mảng JSON thuần các số (không có "pipes").
      const arrMatch = rawText.match(/\[[\s\S]*\]/);
      if (arrMatch) {
        try {
          const parsed = JSON.parse(arrMatch[0]);
          if (Array.isArray(parsed)) numbersRaw = parsed;
        } catch (e) { /* để null — numbers rỗng, app báo "không đọc được" */ }
      }
    }

    const numbers = Array.isArray(numbersRaw)
      ? [...new Set(numbersRaw.map(String).map(s => s.trim()).filter(Boolean))]
      : [];

    let pipesOut = [];
    if (withDefects && Array.isArray(pipesRaw)) {
      const allowedDefects = stageDefectKeys(stageNum);
      pipesRaw.forEach(p => {
        if (!p || !p.serial) return;
        const serial = String(p.serial).trim();
        if (!serial) return;
        const defects = Array.isArray(p.defects)
          ? [...new Set(p.defects.map(String).filter(k => allowedDefects.includes(k)))]
          : [];
        let repair = null;
        if (stageNum === 4 && p.repair && Object.prototype.hasOwnProperty.call(SUAREN_REPAIR, String(p.repair))) {
          repair = String(p.repair);
        }
        if (!defects.length && !repair) return; // phòng khi model lỡ liệt kê cả ống bình thường — vẫn lọc bỏ ở tầng proxy
        pipesOut.push({ serial, defects, repair });
      });
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
