import { API_BASE_URL, fetchJson } from './api';

type UploadResponse = {
  success: boolean;
  publicUrl: string;
  key: string;
  error?: string;
};

const UPLOAD_TIMEOUT_MS = 15 * 60 * 1000;

// 브라우저 → 우리 서버(api.10x.ai.kr) → R2 로 업로드.
// 한국 ISP가 R2 S3 엔드포인트(<account>.r2.cloudflarestorage.com) 직접 연결을 SNI 차단하므로
// R2로 직접 PUT하지 않고 서버를 경유한다.
export async function uploadTrainingVideo(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('video', file, file.name);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE_URL}/api/training-journal/upload`, true);
    xhr.timeout = UPLOAD_TIMEOUT_MS;

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
      }
    };

    xhr.onload = () => {
      let data: UploadResponse | null = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        data = null;
      }
      if (xhr.status >= 200 && xhr.status < 300 && data?.success && data.publicUrl) {
        onProgress?.(100);
        resolve(data.publicUrl);
      } else {
        reject(new Error(data?.error || `영상 업로드 실패 (${xhr.status}). 잠시 후 다시 시도해 주세요.`));
      }
    };
    xhr.onerror = () => reject(new Error('네트워크 오류로 영상 업로드에 실패했습니다.'));
    xhr.ontimeout = () => reject(new Error('업로드 시간이 초과되었습니다. 더 짧은 영상으로 시도해 주세요.'));
    xhr.send(form);
  });
}

export async function isTrainingUploadEnabled(): Promise<boolean> {
  try {
    const health = await fetchJson<{ r2Enabled?: boolean }>('/api/health');
    return Boolean(health.r2Enabled);
  } catch {
    return false;
  }
}

export { API_BASE_URL };
