// ═══════════════════════════════════════════════════════════════════════════
// api/ocr-sonnet.js — Vercel Edge Function, đọc số ống từ ảnh bằng Claude (Anthropic) — bản Sonnet
// Dùng cho tính năng "📷 Đọc số ống từ ảnh (AI)" trong NKT Inspect Pro (khâu Tiếp nhận
// và Đóng gói & Phân loại).
//
// TẠI SAO ĐỔI TỪ CLOUDFLARE SANG VERCEL: bản chạy trên Cloudflare Worker bị Anthropic
// chặn với lỗi "403 forbidden — Request not allowed" — nhiều khả năng do lưu lượng gọi
// TỪ hạ tầng Cloudflare Workers bị nghi ngờ là bot/lạm dụng (vấn đề hạ tầng, không phải do
// key hay code sai). Vercel là nền tảng khác hẳn, không dính vấn đề này.
//
// FILE NÀY PHẢI NẰM ĐÚNG ĐƯỜNG DẪN: api/ocr-sonnet.js (cùng thư mục "api" với ocr.js) —
// đây là quy ước của Vercel để tự nhận diện thành 1 endpoint tại /api/ocr-sonnet.
// ═══════════════════════════════════════════════════════════════════════════
// HƯỚNG DẪN TRIỂN KHAI (không cần biết lập trình, không cần cài gì trên máy):
//
// BƯỚC 1 — Tạo tài khoản GitHub (nếu chưa có), tạo repo và thêm file này:
//   1. Vào https://github.com → đăng ký tài khoản miễn phí (nếu chưa có)
//   2. Bấm nút "+" góc trên phải → "New repository" → đặt tên (VD: nkt-ocr-proxy) →
//      chọn "Public" hoặc "Private" đều được → "Create repository"
//   3. Trong repo vừa tạo, bấm "Add file" → "Create new file"
//   4. Ở ô đặt tên file, gõ ĐÚNG: api/ocr-sonnet.js (gõ cả dấu / — GitHub tự hiểu là tạo
//      thêm file "ocr-sonnet.js" trong thư mục "api" đã có sẵn)
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
//   2. URL đầy đủ để dùng trong app (bản Sonnet) là:
//      https://nkt-ocr-proxy-xxxx.vercel.app/api/ocr-sonnet
//      (thêm "/api/ocr-sonnet" ở cuối — đây chính là đường dẫn tới file này)
//   3. Dùng đúng file NKT_Inspect_Pro_v59_sonnet.html đã cấu hình sẵn URL này —
//      không cần gửi lại cho tôi trừ khi domain gốc trên Vercel khác với domain đã cấu hình.
//
// AN TOÀN: File này KHÔNG đụng gì đến Google Sheets hay dữ liệu phiếu kiểm tra — chỉ
// nhận 1 ảnh, trả về 1 danh sách số. Không lưu trữ ảnh ở đâu cả (xử lý xong là bỏ).
//
// SO SÁNH ĐỘ CHÍNH XÁC: đây là bản Sonnet (input $2/MTok, output $10/MTok, giữ tới 4784 ô ảnh) — dùng để so sánh với bản Haiku
// (api/ocr.js, rẻ nhất) và bản còn lại. Cả 3 dùng chung CLAUDE_API_KEY đã cấu hình sẵn trong
// Vercel — không cần tạo thêm key hay project mới.
// ═══════════════════════════════════════════════════════════════════════════

export const config = { runtime: 'edge' };

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
    const { image, mime } = await request.json();
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

    // v59fix: bổ sung xử lý ký hiệu RÚT GỌN mà KTV hay ghi tay (mũi tên/gạch ngang chỉ khoảng
    // số liên tiếp, danh sách trộn số đơn lẻ và khoảng) — yêu cầu model MỞ RỘNG đầy đủ từng số
    // trước khi trả lời, không giữ nguyên dạng rút gọn. Vẫn giữ nguyên phần đọc cẩn thận từng
    // chữ số (v58) và định dạng JSON trả về (an toàn cho phần app đang ăn theo định dạng cũ).
    const prompt =
      'Đây là ảnh chụp danh sách số hiệu ống (pipe serial number), viết tay hoặc in, của một xưởng kiểm tra ống thép.\n\n' +
      'Hãy đọc theo các bước sau:\n' +
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
      '4. Sau khi đọc và mở rộng hết các khoảng, đếm lại xem đã liệt kê đủ chưa — không bỏ sót, ' +
      'không thêm số không có thật, không để sót ký hiệu mũi tên/gạch ngang nào chưa mở rộng trong kết quả.\n\n' +
      'CHỈ trả lời bằng một mảng JSON thuần các chuỗi số (mỗi số 1 phần tử, đã mở rộng hết khoảng), ' +
      'không kèm bất kỳ chữ giải thích, markdown, hay ký tự nào khác.\n' +
      'Ví dụ đúng định dạng: ["7115","7136","7113"]\n' +
      'Nếu không đọc được số nào, trả lời: []';

    const model = 'claude-sonnet-5'; // bản so sánh Sonnet — input $2/MTok, output $10/MTok, giữ tới 4784 ô ảnh

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: model,
        max_tokens: 2048, // v59fix: tăng từ 1024 — danh sách có thể dài hơn nhiều sau khi mở rộng các khoảng số
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

    // Trích mảng JSON từ text trả về (phòng khi model kèm ```json ... ``` hoặc chữ thừa)
    let numbers = [];
    const match = rawText.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed)) {
          numbers = parsed.map(String).map(s => s.trim()).filter(Boolean);
        }
      } catch (e) {
        // để numbers rỗng nếu model trả về sai định dạng — app sẽ báo "không đọc được"
      }
    }

    return new Response(JSON.stringify({ numbers }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: 'Lỗi xử lý: ' + err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
