import React, { useRef, useState } from 'react';
import VideoAnalysisResultPage from './VideoAnalysisResultPage';
import { fetchJson, readSelectedPlayer, readSelectedPlayerPosition, toAbsoluteUrl } from '../lib/api';

export default function VideoAnalysisPageLab() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [savedFilename, setSavedFilename] = useState<string>('');
  const [uploadedSource, setUploadedSource] = useState<string>('');
  const [geminiResult, setGeminiResult] = useState<any>(null);
  const [renderResult, setRenderResult] = useState<any>(null);
  const [clips, setClips] = useState<any[]>([]);
  const [statusMessage, setStatusMessage] = useState('대기 중');
  const [isBusy, setIsBusy] = useState(false);
  const [lastError, setLastError] = useState('');

  const handleStartAnalysis = async () => {
    if (!selectedFile) return alert("파일을 선택하세요.");
    try {
      setIsBusy(true); setLastError('');
      setStatusMessage('1/3 영상 업로드 중...');
      const formData = new FormData();
      formData.append('video', selectedFile);
      const uploaded = await fetchJson<{ savedFilename: string }>('/api/upload', {
        method: 'POST',
        body: formData,
      });

      setSavedFilename(uploaded.savedFilename);
      setUploadedSource(toAbsoluteUrl(`/uploads/${uploaded.savedFilename}`));

      setStatusMessage('2/3 등록 선수 중심 AI 분석 중 (1~3분)...');
      const response = await fetchJson<{
        success: boolean;
        clips?: any[];
        summary?: any;
        error?: string;
        message?: string;
      }>('/api/lab/extract-highlights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ savedFilename: uploaded.savedFilename, ...readSelectedPlayer() }),
      });

      if (!response.success) throw new Error(response.error);

      const nextClips = (response.clips || []).map((clip) => ({ ...clip, included: clip.included !== false }));
      setClips(nextClips);
      setGeminiResult({ summary: response.summary, clips: nextClips });
      setStatusMessage(response.message || '✅ AI 분석 및 클립 생성 완료!');
    } catch (err: any) {
      setLastError(err.message);
      setStatusMessage('❌ 오류 발생');
    } finally { setIsBusy(false); }
  };

  const handleRender = async () => {
    try {
      setIsBusy(true); setLastError('');
      setStatusMessage('3/3 최종 하이라이트 영상 합치는 중...');
      const data = await fetchJson<{ outputFileName?: string; outputPath?: string }>(
        '/api/lab/render-final-highlights',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ savedFilename, clips: clips.filter((c) => c.included !== false) }),
        },
      );
      setRenderResult(data);
      setStatusMessage('✅ 영상 생성 완료!');
    } catch (err: any) { 
      setLastError(err.message); 
      setStatusMessage('❌ 생성 실패');
    } finally { setIsBusy(false); }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <input ref={fileInputRef} type="file" hidden onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} />
      <div className="mx-auto max-w-[1400px]">
        <div className="mb-6 flex items-center gap-4 bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
           <div className={`h-3 w-3 rounded-full ${isBusy ? 'bg-blue-500 animate-ping' : 'bg-slate-300'}`} />
           <span className="font-bold text-slate-700">{statusMessage}</span>
           {lastError && <span className="text-red-600 text-sm ml-auto font-bold">에러: {lastError}</span>}
        </div>
        <VideoAnalysisResultPage
          selectedFile={selectedFile} uploadedSource={uploadedSource} savedFilename={savedFilename}
          clips={clips} geminiResult={geminiResult} renderResult={renderResult}
          healthResult={{success: true}} selectedPosition="골키퍼"
          selectedCriteria={['AI 코칭', '통합 분석']} recommendedSceneCount={5}
          onSelectFile={() => fileInputRef.current?.click()} onReupload={() => fileInputRef.current?.click()}
          onStartAnalysis={handleStartAnalysis} onGenerateFinal={handleRender} onRegenerateFinal={handleRender}
          onIncludeAll={() => setClips(clips.map(c => ({...c, included: true})))}
          onExcludeAll={() => setClips(clips.map(c => ({...c, included: false})))}
          onToggleClip={(id) => setClips(clips.map(c => c.id === id ? {...c, included: !c.included} : c))}
        />
      </div>
    </div>
  );
}
