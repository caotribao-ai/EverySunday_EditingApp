import { Link } from 'react-router-dom';
import { BRAND } from '../lib/brand';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
          <img src={BRAND.logoSrc} alt={BRAND.name} className="h-8 object-contain" />
          <Link to="/" className="text-sm font-medium text-zinc-600 hover:text-zinc-900">← Về app</Link>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-12 prose prose-zinc">
        <h1>Chính sách quyền riêng tư</h1>
        <p>Cập nhật: {new Date().toLocaleDateString('vi-VN')}</p>
        <p>
          {BRAND.name} thu thập email tài khoản Google, video bạn tải lên, metadata dự án và log kỹ thuật
          để vận hành dịch vụ chỉnh sửa video AI.
        </p>
        <h2>Dữ liệu chúng tôi xử lý</h2>
        <ul>
          <li>Thông tin đăng nhập (Firebase Auth)</li>
          <li>File video/audio tải lên để transcribe và export</li>
          <li>Cấu hình Brand Kit, phụ đề, B-roll và lịch sử job</li>
        </ul>
        <h2>Lưu trữ & bảo mật</h2>
        <p>
          Dữ liệu được lưu trên Firebase/Google Cloud. Video export có thể được lưu tạm trên server
          trong quá trình xử lý FFmpeg và tự xóa sau khi hoàn tất.
        </p>
        <h2>Quyền của bạn</h2>
        <p>Bạn có thể yêu cầu xóa tài khoản và dữ liệu liên quan bằng cách liên hệ support.</p>
        <h2>Liên hệ</h2>
        <p>Email: privacy@everysunday.app</p>
      </main>
    </div>
  );
}
