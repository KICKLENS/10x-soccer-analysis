import { API_BASE_URL, fetchJson } from './api';

type PresignResponse = {
  success: boolean;
  uploadUrl: string;
  publicUrl: string;
  key: string;
  error?: string;
};

const UPLOAD_TIMEOUT_MS = 15 * 60 * 1000;

function putWithProgress(
  url: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);
    xhr.timeout = UPLOAD_TIMEOUT_MS;
    xhr.setRequestHeader('Content-Type', file.type || 'video/mp4');

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve();
      } else {
        reject(new Error(`영상 저장 실패 (${xhr.status}). 잠시 후 다시 시도해 주세요.`));
      }
    };
    xhr.onerror = () => reject(new Error('네트워크 오류로 영상 업로드에 실패했습니다.'));
    xhr.ontimeout = () => reject(new Error('업로드 시간이 초과되었습니다. 더 짧은 영상으로 시도해 주세요.'));
    xhr.send(file);
  });
}

export async function uploadTrainingVideo(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<string> {
  const presign = await fetchJson<PresignResponse>('/api/training-journal/presign-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: file.name,
      contentType: file.type || 'video/mp4',
      fileSize: file.size,
    }),
  });

  if (!presign.uploadUrl || !presign.publicUrl) {
    throw new Error(presign.error || '업로드 주소를 받지 못했습니다.');
  }

  await putWithProgress(presign.uploadUrl, file, onProgress);
  return presign.publicUrl;
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
