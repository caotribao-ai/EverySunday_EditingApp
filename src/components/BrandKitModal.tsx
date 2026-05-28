import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { motion } from 'motion/react';
import { BRAND } from '../lib/brand';
import { BrandKit, fetchBrandKit, saveBrandKit } from '../services/brandApi';

type Props = {
  open: boolean;
  onClose: () => void;
  getAuthHeaders: () => Promise<HeadersInit>;
  plan: 'FREE' | 'BASIC' | 'PRO';
  onSaved?: (kit: BrandKit) => void;
  notify: (message: string, type?: 'success' | 'error' | 'info') => void;
};

export function BrandKitModal({ open, onClose, getAuthHeaders, plan, onSaved, notify }: Props) {
  const [kit, setKit] = useState<BrandKit>({
    displayName: BRAND.name,
    primaryColor: '#18181b',
    accentColor: '#f97316',
    watermarkText: BRAND.watermark,
    fontFamily: 'SF Pro Display',
    logoUrl: '',
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const headers = await getAuthHeaders();
        if (!('Authorization' in headers)) return;
        const data = await fetchBrandKit(headers);
        setKit(data);
      } catch {
        /* keep defaults */
      }
    })();
  }, [open, getAuthHeaders]);

  if (!open) return null;

  const locked = plan === 'FREE';

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-lg bg-white rounded-3xl border border-zinc-100 shadow-2xl p-8"
      >
        <button type="button" onClick={onClose} className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-zinc-900">
          <X className="w-5 h-5" />
        </button>
        <h2 className="text-xl font-bold text-zinc-900 mb-1">Brand Kit</h2>
        <p className="text-sm text-zinc-500 mb-6">Watermark và màu thương hiệu khi export video.</p>
        {locked ? (
          <p className="text-sm text-orange-600 bg-orange-50 border border-orange-100 rounded-xl p-4 mb-4">
            Brand Kit dành cho gói Basic trở lên. Hãy nâng cấp để lưu cấu hình.
          </p>
        ) : null}
        <div className="space-y-4">
          <label className="block text-xs font-bold text-zinc-500 uppercase">Tên hiển thị</label>
          <input className="w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm" value={kit.displayName} onChange={(e) => setKit({ ...kit, displayName: e.target.value })} disabled={locked} />
          <label className="block text-xs font-bold text-zinc-500 uppercase">Watermark export</label>
          <input className="w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm" value={kit.watermarkText} onChange={(e) => setKit({ ...kit, watermarkText: e.target.value })} disabled={locked} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">Màu chính</label>
              <input type="color" className="w-full h-10 rounded-lg border border-zinc-200" value={kit.primaryColor} onChange={(e) => setKit({ ...kit, primaryColor: e.target.value })} disabled={locked} />
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">Màu nhấn</label>
              <input type="color" className="w-full h-10 rounded-lg border border-zinc-200" value={kit.accentColor} onChange={(e) => setKit({ ...kit, accentColor: e.target.value })} disabled={locked} />
            </div>
          </div>
        </div>
        <button
          type="button"
          disabled={locked || loading}
          onClick={async () => {
            setLoading(true);
            try {
              const saved = await saveBrandKit(kit, await getAuthHeaders());
              onSaved?.(saved);
              notify('Đã lưu Brand Kit.', 'success');
              onClose();
            } catch (err: any) {
              notify(err.message || 'Lưu thất bại.', 'error');
            } finally {
              setLoading(false);
            }
          }}
          className="mt-6 w-full py-3 rounded-xl bg-zinc-900 text-white text-sm font-bold disabled:opacity-50"
        >
          {loading ? 'Đang lưu...' : 'Lưu Brand Kit'}
        </button>
      </motion.div>
    </div>
  );
}
