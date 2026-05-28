export interface BrandKit {
  displayName: string;
  primaryColor: string;
  accentColor: string;
  watermarkText: string;
  fontFamily: string;
  logoUrl: string;
}

export async function fetchBrandKit(authHeaders: HeadersInit): Promise<BrandKit> {
  const res = await fetch('/api/brand-kit/me', { headers: authHeaders });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Không thể tải Brand Kit.');
  return data as BrandKit;
}

export async function saveBrandKit(kit: BrandKit, authHeaders: HeadersInit): Promise<BrandKit> {
  const res = await fetch('/api/brand-kit/me', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify(kit),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Không thể lưu Brand Kit.');
  return data as BrandKit;
}
