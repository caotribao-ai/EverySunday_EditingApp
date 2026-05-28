import { useState } from 'react';
import { ExternalLink, X } from 'lucide-react';
import { motion } from 'motion/react';
import { prepareTikTokPublish } from '../services/publishApi';

type Props = {
  open: boolean;
  onClose: () => void;
  downloadUrl: string;
  defaultCaption?: string;
  getAuthHeaders: () => Promise<HeadersInit>;
  notify: (message: string, type?: 'success' | 'error' | 'info') => void;
};

export function TikTokPublishModal({ open, onClose, downloadUrl, defaultCaption = '', getAuthHeaders, notify }: Props) {
  const [caption, setCaption] = useState(defaultCaption);
  const [hashtags, setHashtags] = useState('viral, everysunday, shorts');
  const [uploadUrl, setUploadUrl] = useState('https://www.tiktok.com/upload');
  const [loading, setLoading] = useState(false);

  if (!open) return null;

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
        <h2 className="text-xl font-bold text-zinc-900 mb-1">Publish TikTok</h2>
        <p className="text-sm text-zinc-500 mb-6">
          MVP: tải video đã export, mở TikTok Upload và dán caption gợi ý. OAuth API sẽ bật khi có TikTok App ID.
        </p>
        <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">Caption</label>
        <textarea className="w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm min-h-[80px] mb-3" value={caption} onChange={(e) => setCaption(e.target.value)} />
        <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">Hashtags (phân tách bằng dấu phẩy)</label>
        <input className="w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm mb-4" value={hashtags} onChange={(e) => setHashtags(e.target.value)} />
        <div className="flex gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={async () => {
              setLoading(true);
              try {
                const result = await prepareTikTokPublish(
                  {
                    downloadUrl,
                    caption,
                    hashtags: hashtags.split(',').map((h) => h.trim()).filter(Boolean),
                  },
                  await getAuthHeaders(),
                );
                setUploadUrl(result.uploadUrl);
                navigator.clipboard?.writeText(result.captionSuggestion);
                notify('Đã copy caption. Mở TikTok để upload video.', 'success');
              } catch (err: any) {
                notify(err.message || 'Publish thất bại.', 'error');
              } finally {
                setLoading(false);
              }
            }}
            className="flex-1 py-3 rounded-xl bg-zinc-900 text-white text-sm font-bold disabled:opacity-50"
          >
            {loading ? 'Đang chuẩn bị...' : 'Chuẩn bị & copy caption'}
          </button>
          <a
            href={uploadUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 px-4 py-3 rounded-xl border border-zinc-200 text-sm font-bold text-zinc-800 hover:bg-zinc-50"
          >
            <ExternalLink className="w-4 h-4" />
            TikTok
          </a>
        </div>
      </motion.div>
    </div>
  );
}
