export interface ExportJobPayload {
  videoUrl: string | null;
  uploadedFilePath?: string | null;
  captions: unknown[];
  brolls: unknown[];
  zooms: unknown[];
  style: string;
  captionSettings: Record<string, unknown>;
  isSnapMode: boolean;
  isMagicCutEnabled?: boolean;
  silenceSegments?: Array<{ start: number; end: number }>;
  words?: Array<{ start: number; end: number; word?: string }>;
  transitionType?: string;
  customTextOverlays?: Array<Record<string, unknown>>;
  videoAdjustments?: Record<string, unknown>;
  cleanAudioEnabled?: boolean;
  brandKit?: Record<string, unknown> | null;
}

export interface SilencePreviewPayload {
  captions: Array<{ start: number; end: number; text?: string }>;
  words?: Array<{ start: number; end: number; word?: string }>;
  duration?: number;
}

async function readJsonResponse<T>(response: Response, fallbackError: string): Promise<T> {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || fallbackError);
    }
    return data as T;
  }

  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`${fallbackError} [${response.status}] ${bodyText.slice(0, 150)}`);
  }
  throw new Error(`Phản hồi không hợp lệ. [${response.status}] ${bodyText.slice(0, 150)}`);
}

export async function createTranscriptionJob(
  file: File,
  language: string,
  fileName: string,
  authHeaders: HeadersInit,
  onUploadProgress?: (percent: number) => void,
) {
  const formData = new FormData();
  formData.append("video", file);
  formData.append("language", language);
  formData.append("fileName", fileName);
  const headerEntries = Object.entries(authHeaders as Record<string, string>);

  return new Promise<{ jobId: string }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/jobs/create", true);
    xhr.timeout = 180000;

    headerEntries.forEach(([key, value]) => {
      if (value) {
        xhr.setRequestHeader(key, value);
      }
    });

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onUploadProgress) {
        const percent = Math.round((event.loaded / event.total) * 100);
        onUploadProgress(Math.max(0, Math.min(100, percent)));
      }
    };

    xhr.onerror = () => reject(new Error("Mất kết nối khi tải video lên máy chủ."));
    xhr.onabort = () => reject(new Error("Tải video đã bị hủy."));
    xhr.ontimeout = () => reject(new Error("Upload bị timeout. Vui lòng thử lại hoặc giảm dung lượng video."));
    xhr.onload = () => {
      const responseText = xhr.responseText || "";
      let parsed: any = {};
      try {
        parsed = responseText ? JSON.parse(responseText) : {};
      } catch {
        parsed = {};
      }

      if (xhr.status === 413) {
        reject(new Error("Video quá lớn hoặc vượt giới hạn gói hiện tại."));
        return;
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(parsed.error || `Lỗi khởi tạo xử lý (${xhr.status})`));
        return;
      }
      resolve(parsed as { jobId: string });
    };

    xhr.send(formData);
  });
}

export async function getJobStatus(jobId: string, authHeaders: HeadersInit) {
  const response = await fetch(`/api/jobs/${jobId}`, { headers: authHeaders });
  return readJsonResponse<any>(response, "Mất kết nối tiến trình xử lý.");
}

export async function createExportJob(payload: ExportJobPayload, authHeaders: HeadersInit) {
  const response = await fetch("/api/jobs/export", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify(payload),
  });

  return readJsonResponse<{ jobId: string }>(response, "Lỗi khởi tạo xuất video.");
}

export async function uploadRawVideoForExport(
  file: File,
  authHeaders: HeadersInit,
  onUploadProgress?: (percent: number) => void,
) {
  const formData = new FormData();
  formData.append("video", file);
  const headerEntries = Object.entries(authHeaders as Record<string, string>);

  return new Promise<{ uploadedFilePath: string }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/uploads/raw", true);
    xhr.timeout = 180000;

    headerEntries.forEach(([key, value]) => {
      if (value) xhr.setRequestHeader(key, value);
    });

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onUploadProgress) {
        const percent = Math.round((event.loaded / event.total) * 100);
        onUploadProgress(Math.max(0, Math.min(100, percent)));
      }
    };

    xhr.onerror = () => reject(new Error("Mất kết nối khi tải file export lên server."));
    xhr.onabort = () => reject(new Error("Upload export đã bị hủy."));
    xhr.ontimeout = () => reject(new Error("Upload export bị timeout. Vui lòng thử lại."));
    xhr.onload = () => {
      const responseText = xhr.responseText || "";
      let parsed: any = {};
      try {
        parsed = responseText ? JSON.parse(responseText) : {};
      } catch {
        parsed = {};
      }

      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(parsed.error || `Upload export thất bại (${xhr.status})`));
        return;
      }

      resolve(parsed as { uploadedFilePath: string });
    };

    xhr.send(formData);
  });
}

export async function analyzeBrolls(captions: unknown[], authHeaders: HeadersInit) {
  const response = await fetch("/api/analyze-brolls", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify({ captions }),
  });

  return readJsonResponse<{
    brolls?: unknown[];
    meta?: {
      source?: string;
      targetCount?: number;
      appliedCount?: number;
      minSpacingSec?: number;
      maxCoverageSeconds?: number;
    };
  }>(response, "Lỗi khi kết nối AI phân tích B-roll.");
}

export async function analyzeSilencePreview(payload: SilencePreviewPayload, authHeaders: HeadersInit) {
  const response = await fetch("/api/magic-cut/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify(payload),
  });

  return readJsonResponse<{ silenceSegments: Array<{ start: number; end: number }> }>(
    response,
    "Lỗi phân tích khoảng lặng.",
  );
}
