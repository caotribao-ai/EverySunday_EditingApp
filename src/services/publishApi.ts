export interface TikTokPublishResult {
  publishId: string;
  status: string;
  message: string;
  uploadUrl: string;
  captionSuggestion: string;
  downloadUrl: string;
}

export async function prepareTikTokPublish(
  payload: { downloadUrl: string; caption?: string; hashtags?: string[] },
  authHeaders: HeadersInit,
): Promise<TikTokPublishResult> {
  const res = await fetch('/api/publish/tiktok', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Không thể chuẩn bị publish TikTok.');
  return data as TikTokPublishResult;
}
