import { Link } from 'react-router-dom';
import { BRAND } from '../lib/brand';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
          <img src={BRAND.logoSrc} alt={BRAND.name} className="h-8 object-contain" />
          <Link to="/" className="text-sm font-medium text-zinc-600 hover:text-zinc-900">← Về app</Link>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-12 prose prose-zinc">
        <h1>Điều khoản sử dụng</h1>
        <p>Cập nhật: {new Date().toLocaleDateString('vi-VN')}</p>
        <p>
          Khi sử dụng {BRAND.name}, bạn đồng ý tuân thủ các điều khoản dưới đây và chịu trách nhiệm về
          nội dung video bạn tải lên.
        </p>
        <h2>Gói dịch vụ</h2>
        <p>Giới hạn video, credits và tính năng export phụ thuộc gói Miễn phí / Basic / Pro đã công bố trong app.</p>
        <h2>Nội dung người dùng</h2>
        <p>Bạn cam kết có quyền sử dụng nội dung video, nhạc và hình ảnh. Không đăng tải nội dung vi phạm pháp luật.</p>
        <h2>Thanh toán</h2>
        <p>Nâng cấp gói qua chuyển khoản/SePay được kích hoạt sau khi hệ thống xác nhận giao dịch.</p>
        <h2>Giới hạn trách nhiệm</h2>
        <p>Dịch vụ cung cấp “như hiện có”. Chúng tôi không chịu trách nhiệm cho gián đoạn do bên thứ ba (OpenAI, Pexels, TikTok).</p>
      </main>
    </div>
  );
}
