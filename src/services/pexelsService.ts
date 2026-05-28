export interface PexelsVideo {
  id: number;
  width: number;
  height: number;
  url: string;
  image: string;
  duration: number;
  video_files: {
    id: number;
    quality: 'hd' | 'sd';
    file_type: string;
    width: number;
    height: number;
    link: string;
  }[];
}

export const searchPexelsVideos = async (query: string, perPage = 15, token?: string): Promise<PexelsVideo[]> => {
  const response = await fetch(`/api/pexels/search?query=${encodeURIComponent(query)}&per_page=${perPage}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Lỗi khi tìm kiếm video trên Pexels.");
  }

  return Array.isArray(data.videos) ? data.videos : [];
};
