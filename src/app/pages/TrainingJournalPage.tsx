import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { Header } from '../components/training/Header';
import { FieldBoard } from '../components/training/FieldBoard';
import { TextRecordForm } from '../components/training/TextRecordForm';
import { DraggableIcon } from '../components/training/DraggableIcon';
import { Circle, User, Target, Save, FileCheck, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight, ArrowUpLeft, ArrowDownRight, ArrowDownLeft } from 'lucide-react';

export default function TrainingJournalPage() {
  return (
    <DndProvider backend={HTML5Backend}>
      <div className="min-h-screen bg-[#0B1220] relative overflow-x-hidden">
        {/* Background Elements */}
        <div className="fixed inset-0 pointer-events-none">
          {/* Background Image */}
          <div 
            className="absolute inset-0 opacity-[0.70]"
            style={{
              backgroundImage: `url('https://images.unsplash.com/photo-1545255678-30015d3842b0?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxzb2NjZXIlMjBmb290YmFsbCUyMGZpZWxkJTIwc3RhZGl1bXxlbnwxfHx8fDE3NzU1NjgxMjV8MA&ixlib=rb-4.1.0&q=80&w=1080')`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat'
            }}
          ></div>
          
          {/* Dark Overlay */}
          <div className="absolute inset-0 bg-[#0B1220]/85"></div>
          
          {/* Subtle Field Texture */}
          <div className="absolute inset-0 opacity-5" style={{
            backgroundImage: `
              linear-gradient(to right, rgba(76, 125, 184, 0.3) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(76, 125, 184, 0.3) 1px, transparent 1px)
            `,
            backgroundSize: '80px 80px'
          }}></div>
          
          {/* Stadium Lighting Glow */}
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#4C7DB8]/5 rounded-full blur-3xl"></div>
          <div className="absolute top-40 right-1/4 w-96 h-96 bg-[#2E5A8A]/5 rounded-full blur-3xl"></div>
        </div>

        <Header />

        {/* Main Content */}
        <main className="relative pt-24 pb-16">
          <div className="max-w-7xl mx-auto px-6">
            {/* Page Intro */}
            <div className="mb-12 text-center">
              <h1 className="text-4xl font-bold text-white mb-4">훈련일지</h1>
              <p className="text-white/70 text-lg mb-2">
                오늘의 훈련 내용을 필드 위에 정리하고, 기억할 포인트를 함께 남겨보세요
              </p>
              <p className="text-white/50 text-sm">
                움직임, 위치, 장면을 간단히 표시하고 텍스트로 복습 내용을 기록할 수 있습니다
              </p>
              
              {/* Date */}
              <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 bg-[#14253D]/80 rounded-lg border border-[#4C7DB8]/20">
                <div className="w-2 h-2 bg-[#4C7DB8] rounded-full"></div>
                <span className="text-white/80 text-sm">2026.04.07 훈련 기록</span>
              </div>
            </div>

            {/* Main Content Grid */}
            <div className="grid lg:grid-cols-2 gap-8 mb-12">
              {/* Left Column - Field Drawing Board */}
              <div className="space-y-6">
                <div className="bg-[#14253D]/80 backdrop-blur-sm rounded-2xl p-6 border border-[#2E5A8A]/20">
                  <div className="mb-6">
                    <h2 className="text-xl font-semibold text-white mb-2">
                      오늘의 훈련 장면
                    </h2>
                    <p className="text-white/60 text-sm">
                      공과 선수를 배치해 오늘의 훈련 상황을 간단히 정리해보세요
                    </p>
                  </div>

                  {/* Icon Toolbar */}
                  <div className="mb-4">
                    <p className="text-white/50 text-xs mb-3">배치 도구</p>
                    
                    {/* Main Tools */}
                    <div className="grid grid-cols-4 gap-3 mb-3">
                      <DraggableIcon
                        type="ball"
                        icon={<Circle className="w-5 h-5 fill-white" />}
                        label="축구공"
                      />
                      <DraggableIcon
                        type="player-blue"
                        icon={
                          <div className="relative">
                            <User className="w-5 h-5" strokeWidth={2.5} />
                            <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-lime-400 rounded-full"></div>
                          </div>
                        }
                        label="우리팀"
                      />
                      <DraggableIcon
                        type="player-red"
                        icon={
                          <div className="relative">
                            <User className="w-5 h-5" strokeWidth={2.5} />
                            <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-[#E85D75] rounded-full"></div>
                          </div>
                        }
                        label="상대팀"
                      />
                      <DraggableIcon
                        type="cone"
                        icon={<Target className="w-5 h-5" />}
                        label="콘"
                      />
                    </div>

                    {/* Arrow Direction Tools */}
                    <div className="border-t border-[#2E5A8A]/30 pt-3">
                      <p className="text-white/40 text-xs mb-2">방향 화살표</p>
                      <div className="grid grid-cols-8 gap-2">
                        <DraggableIcon
                          type="arrow-up"
                          icon={<ArrowUp className="w-4 h-4" />}
                          label="위"
                        />
                        <DraggableIcon
                          type="arrow-up-right"
                          icon={<ArrowUpRight className="w-4 h-4" />}
                          label="↗"
                        />
                        <DraggableIcon
                          type="arrow-right"
                          icon={<ArrowRight className="w-4 h-4" />}
                          label="오른쪽"
                        />
                        <DraggableIcon
                          type="arrow-down-right"
                          icon={<ArrowDownRight className="w-4 h-4" />}
                          label="↘"
                        />
                        <DraggableIcon
                          type="arrow-down"
                          icon={<ArrowDown className="w-4 h-4" />}
                          label="아래"
                        />
                        <DraggableIcon
                          type="arrow-down-left"
                          icon={<ArrowDownLeft className="w-4 h-4" />}
                          label="↙"
                        />
                        <DraggableIcon
                          type="arrow-left"
                          icon={<ArrowLeft className="w-4 h-4" />}
                          label="왼쪽"
                        />
                        <DraggableIcon
                          type="arrow-up-left"
                          icon={<ArrowUpLeft className="w-4 h-4" />}
                          label="↖"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Field Board */}
                  <FieldBoard />
                </div>

                {/* Helper Card */}
                <div className="bg-[#1F3B63]/30 border border-[#4C7DB8]/20 rounded-xl p-4">
                  <p className="text-[#B8D4F0]/90 text-xs leading-relaxed">
                    💡 <span className="font-medium">팁:</span> 장면과 메모를 함께 남기면 다음 복습에 더 도움이 됩니다
                  </p>
                </div>
              </div>

              {/* Right Column - Text Record Form */}
              <div className="space-y-6">
                <div className="bg-[#14253D]/80 backdrop-blur-sm rounded-2xl p-6 border border-[#2E5A8A]/20">
                  <div className="mb-6">
                    <h2 className="text-xl font-semibold text-white mb-2">
                      오늘의 훈련 기록
                    </h2>
                    <p className="text-white/60 text-sm">
                      훈련 내용을 체계적으로 기록하고 복습 포인트를 정리하세요
                    </p>
                  </div>

                  <TextRecordForm />
                </div>
              </div>
            </div>

            {/* Action Area */}
            <div className="bg-[#14253D]/80 backdrop-blur-sm rounded-2xl p-6 border border-[#2E5A8A]/20">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-center sm:text-left">
                  <p className="text-white/80 text-sm font-medium mb-1">
                    훈련일지를 저장하시겠습니까?
                  </p>
                  <p className="text-white/50 text-xs">
                    저장된 일지는 나중에 다시 확인하고 분석할 수 있습니다
                  </p>
                </div>
                
                <div className="flex items-center gap-3">
                  <button className="px-5 py-2.5 bg-[#1F3B63]/50 hover:bg-[#1F3B63] border border-[#2E5A8A]/30 hover:border-[#4C7DB8]/50 rounded-lg text-white/70 hover:text-white text-sm font-medium transition-all flex items-center gap-2">
                    <FileCheck className="w-4 h-4" />
                    임시 저장
                  </button>
                  
                  <button className="px-6 py-2.5 bg-gradient-to-r from-[#2E5A8A] to-[#4C7DB8] hover:from-[#4C7DB8] hover:to-[#5A8FCE] rounded-lg text-white text-sm font-semibold transition-all shadow-lg shadow-[#4C7DB8]/20 hover:shadow-[#4C7DB8]/30 flex items-center gap-2">
                    <Save className="w-4 h-4" />
                    훈련일지 저장하기
                  </button>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </DndProvider>
  );
}
