import { useState } from 'react';
import { Calendar, Clock, FileText, Lightbulb, Target as TargetIcon } from 'lucide-react';

export function TextRecordForm() {
  const [formData, setFormData] = useState({
    trainingDate: '2026-04-07',
    duration: '',
    trainingType: '',
    goal: '',
    content: '',
    review: '',
    nextGoal: '',
  });

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  return (
    <div className="space-y-5">
      {/* Basic Info */}
      <div className="space-y-3">
        <label className="text-white/80 text-sm font-medium flex items-center gap-2">
          <Calendar className="w-4 h-4 text-[#4C7DB8]" />
          훈련 날짜
        </label>
        <input
          type="date"
          value={formData.trainingDate}
          onChange={(e) => handleChange('trainingDate', e.target.value)}
          className="w-full px-4 py-2.5 bg-[#0F1E30]/80 border border-[#2E5A8A]/30 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-[#4C7DB8]/50 focus:ring-1 focus:ring-[#4C7DB8]/30 transition-all"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-3">
          <label className="text-white/80 text-sm font-medium flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#4C7DB8]" />
            훈련 시간
          </label>
          <input
            type="text"
            placeholder="예: 90분"
            value={formData.duration}
            onChange={(e) => handleChange('duration', e.target.value)}
            className="w-full px-4 py-2.5 bg-[#0F1E30]/80 border border-[#2E5A8A]/30 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-[#4C7DB8]/50 focus:ring-1 focus:ring-[#4C7DB8]/30 transition-all"
          />
        </div>

        <div className="space-y-3">
          <label className="text-white/80 text-sm font-medium flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#4C7DB8]" />
            훈련 종류
          </label>
          <input
            type="text"
            placeholder="예: 패스 연습"
            value={formData.trainingType}
            onChange={(e) => handleChange('trainingType', e.target.value)}
            className="w-full px-4 py-2.5 bg-[#0F1E30]/80 border border-[#2E5A8A]/30 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-[#4C7DB8]/50 focus:ring-1 focus:ring-[#4C7DB8]/30 transition-all"
          />
        </div>
      </div>

      {/* Training Goal */}
      <div className="space-y-3">
        <label className="text-white/80 text-sm font-medium flex items-center gap-2">
          <TargetIcon className="w-4 h-4 text-[#4C7DB8]" />
          오늘의 훈련 목표
        </label>
        <textarea
          placeholder="오늘 집중할 목표를 작성해보세요"
          value={formData.goal}
          onChange={(e) => handleChange('goal', e.target.value)}
          rows={2}
          className="w-full px-4 py-2.5 bg-[#0F1E30]/80 border border-[#2E5A8A]/30 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-[#4C7DB8]/50 focus:ring-1 focus:ring-[#4C7DB8]/30 transition-all resize-none"
        />
      </div>

      {/* Training Content */}
      <div className="space-y-3">
        <label className="text-white/80 text-sm font-medium flex items-center gap-2">
          <FileText className="w-4 h-4 text-[#4C7DB8]" />
          훈련 내용
        </label>
        <textarea
          placeholder="오늘 한 훈련 내용을 상세히 기록하세요"
          value={formData.content}
          onChange={(e) => handleChange('content', e.target.value)}
          rows={4}
          className="w-full px-4 py-2.5 bg-[#0F1E30]/80 border border-[#2E5A8A]/30 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-[#4C7DB8]/50 focus:ring-1 focus:ring-[#4C7DB8]/30 transition-all resize-none"
        />
      </div>

      {/* Review */}
      <div className="space-y-3">
        <label className="text-white/80 text-sm font-medium flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-[#4C7DB8]" />
          복습 포인트
        </label>
        <textarea
          placeholder="잘한 점, 아쉬운 점, 배운 점 등을 정리하세요"
          value={formData.review}
          onChange={(e) => handleChange('review', e.target.value)}
          rows={3}
          className="w-full px-4 py-2.5 bg-[#0F1E30]/80 border border-[#2E5A8A]/30 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-[#4C7DB8]/50 focus:ring-1 focus:ring-[#4C7DB8]/30 transition-all resize-none"
        />
      </div>

      {/* Next Goal */}
      <div className="space-y-3">
        <label className="text-white/80 text-sm font-medium flex items-center gap-2">
          <TargetIcon className="w-4 h-4 text-[#4C7DB8]" />
          다음 훈련 목표
        </label>
        <textarea
          placeholder="다음 훈련 때 집중할 목표를 미리 작성해보세요"
          value={formData.nextGoal}
          onChange={(e) => handleChange('nextGoal', e.target.value)}
          rows={2}
          className="w-full px-4 py-2.5 bg-[#0F1E30]/80 border border-[#2E5A8A]/30 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-[#4C7DB8]/50 focus:ring-1 focus:ring-[#4C7DB8]/30 transition-all resize-none"
        />
      </div>
    </div>
  );
}
