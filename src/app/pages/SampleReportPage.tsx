import { Link } from 'react-router';
import { ArrowLeft, Play, TrendingUp, Target, Award, ChevronRight } from 'lucide-react';
import { ImageWithFallback } from '../components/figma/ImageWithFallback';

export default function SampleReportPage() {
  const reportImage = "https://images.unsplash.com/photo-1693045181676-57199422ee66?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxzcG9ydHMlMjBhbmFseXRpY3MlMjByZXBvcnQlMjBkb2N1bWVudHxlbnwxfHx8fDE3NzU2MjU4NjZ8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral";
  const videoImage = "https://images.unsplash.com/photo-1613758403772-268da019247a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx2aWRlbyUyMHBsYXllciUyMHNjcmVlbiUyMHNvY2NlcnxlbnwxfHx8fDE3NzU1MzEzMzN8MA&ixlib=rb-4.1.0&q=80&w=1080";

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-[#f8f9fa]">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#050810] border-b border-white/10 shadow-lg">
        <div className="max-w-[1440px] mx-auto px-12 py-5 flex items-center justify-between">
          <Link to="/" className="text-3xl font-bold tracking-tight">
            <span className="text-[#b4d248]">10X</span>
            <span className="text-white ml-2">AI SPORTS</span>
          </Link>
          <nav className="flex gap-8 text-xl">
            <Link to="/" className="text-[#9ca3af] hover:text-white transition-colors">홈</Link>
            <Link to="/register" className="text-[#9ca3af] hover:text-white transition-colors">선수 등록</Link>
            <Link to="/analysis" className="text-[#9ca3af] hover:text-white transition-colors">영상 분석</Link>
            <Link to="/journal" className="text-[#9ca3af] hover:text-white transition-colors">훈련일지</Link>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <div className="pt-32 pb-20">
        <div className="max-w-[1440px] mx-auto px-12">
          {/* Back Button */}
          <Link to="/" className="inline-flex items-center gap-2 text-[#9ca3af] hover:text-white transition-colors mb-8">
            <ArrowLeft className="w-5 h-5" />
            <span>돌아가기</span>
          </Link>

          {/* Page Header */}
          <div className="mb-12">
            <h1 className="text-5xl font-bold text-white mb-4">샘플 AI 분석 리포트</h1>
            <p className="text-xl text-[#9ca3af]">
              실제 경기 분석 리포트를 미리 확인해보세요
            </p>
          </div>

          {/* Report Header */}
          <div className="bg-gradient-to-br from-[#2a2f3f] via-[#1e2230] to-[#141824] rounded-2xl p-10 border border-white/10 mb-8">
            <div className="grid grid-cols-2 gap-12">
              <div>
                <h2 className="text-3xl font-bold text-white mb-6">경기 정보</h2>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[#9ca3af]">선수 이름</span>
                    <span className="text-white font-semibold">김유소</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#9ca3af]">경기 날짜</span>
                    <span className="text-white font-semibold">2026. 3. 28</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#9ca3af]">상대팀</span>
                    <span className="text-white font-semibold">FC 청소년</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#9ca3af]">경기 결과</span>
                    <span className="text-[#b4d248] font-semibold">3-2 (승)</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#9ca3af]">포지션</span>
                    <span className="text-white font-semibold">공격수 (FW)</span>
                  </div>
                </div>
              </div>
              <div className="aspect-video rounded-xl overflow-hidden border border-white/10">
                <ImageWithFallback
                  src={videoImage}
                  alt="Match Video"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          </div>

          {/* Key Stats */}
          <div className="grid grid-cols-4 gap-6 mb-8">
            <div className="bg-gradient-to-br from-[#141824] to-[#0f1218] rounded-2xl p-6 border border-white/10 text-center">
              <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-[#b4d248]/10 flex items-center justify-center">
                <Target className="w-6 h-6 text-[#b4d248]" />
              </div>
              <div className="text-3xl font-bold text-white mb-1">8회</div>
              <div className="text-sm text-[#9ca3af]">슈팅 시도</div>
            </div>
            <div className="bg-gradient-to-br from-[#141824] to-[#0f1218] rounded-2xl p-6 border border-white/10 text-center">
              <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-[#b4d248]/10 flex items-center justify-center">
                <Award className="w-6 h-6 text-[#b4d248]" />
              </div>
              <div className="text-3xl font-bold text-white mb-1">2골</div>
              <div className="text-sm text-[#9ca3af]">득점</div>
            </div>
            <div className="bg-gradient-to-br from-[#141824] to-[#0f1218] rounded-2xl p-6 border border-white/10 text-center">
              <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-[#b4d248]/10 flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-[#b4d248]" />
              </div>
              <div className="text-3xl font-bold text-white mb-1">12회</div>
              <div className="text-sm text-[#9ca3af]">성공적 패스</div>
            </div>
            <div className="bg-gradient-to-br from-[#141824] to-[#0f1218] rounded-2xl p-6 border border-white/10 text-center">
              <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-[#b4d248]/10 flex items-center justify-center">
                <Play className="w-6 h-6 text-[#b4d248]" />
              </div>
              <div className="text-3xl font-bold text-white mb-1">6개</div>
              <div className="text-sm text-[#9ca3af]">하이라이트 장면</div>
            </div>
          </div>

          {/* Main Report Content */}
          <div className="grid grid-cols-3 gap-8">
            {/* Left Column - Highlights */}
            <div className="col-span-2 space-y-6">
              {/* Highlights Section */}
              <div className="bg-gradient-to-br from-[#141824] to-[#0f1218] rounded-2xl p-8 border border-white/10">
                <h3 className="text-2xl font-bold text-white mb-6">주요 하이라이트 장면</h3>
                
                <div className="space-y-4">
                  {/* Highlight 1 */}
                  <div className="bg-[#0a0e1a] rounded-xl p-5 border border-white/5 hover:border-[#b4d248]/20 transition-all cursor-pointer">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[#b4d248]/10 flex items-center justify-center">
                          <Play className="w-5 h-5 text-[#b4d248]" />
                        </div>
                        <div>
                          <h4 className="font-semibold text-white">전반 18분 - 첫 번째 골</h4>
                          <p className="text-sm text-[#9ca3af]">슈팅 성공</p>
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-[#9ca3af]" />
                    </div>
                    <p className="text-sm text-[#c7cdd8]">
                      미드필더의 패스를 받아 페널티박스 안쪽에서 강력한 슈팅으로 골망을 흔들었습니다. 
                      빠른 판단과 정확한 슈팅이 돋보인 장면입니다.
                    </p>
                  </div>

                  {/* Highlight 2 */}
                  <div className="bg-[#0a0e1a] rounded-xl p-5 border border-white/5 hover:border-[#b4d248]/20 transition-all cursor-pointer">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[#b4d248]/10 flex items-center justify-center">
                          <Play className="w-5 h-5 text-[#b4d248]" />
                        </div>
                        <div>
                          <h4 className="font-semibold text-white">전반 32분 - 어시스트</h4>
                          <p className="text-sm text-[#9ca3af]">패스 성공</p>
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-[#9ca3af]" />
                    </div>
                    <p className="text-sm text-[#c7cdd8]">
                      오른쪽 측면에서 크로스를 올려 동료의 헤딩골을 도왔습니다. 
                      정확한 위치로 올린 크로스가 인상적이었습니다.
                    </p>
                  </div>

                  {/* Highlight 3 */}
                  <div className="bg-[#0a0e1a] rounded-xl p-5 border border-white/5 hover:border-[#b4d248]/20 transition-all cursor-pointer">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[#b4d248]/10 flex items-center justify-center">
                          <Play className="w-5 h-5 text-[#b4d248]" />
                        </div>
                        <div>
                          <h4 className="font-semibold text-white">후반 20분 - 결승골</h4>
                          <p className="text-sm text-[#9ca3af]">슈팅 성공</p>
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-[#9ca3af]" />
                    </div>
                    <p className="text-sm text-[#c7cdd8]">
                      상대 수비수를 제치고 1 vs 1 상황에서 침착하게 골키퍼를 제치며 결승골을 기록했습니다. 
                      뛰어난 드리블과 침착함이 돋보였습니다.
                    </p>
                  </div>

                  {/* More highlights... */}
                  <div className="bg-[#0a0e1a] rounded-xl p-5 border border-white/5 hover:border-[#b4d248]/20 transition-all cursor-pointer">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[#b4d248]/10 flex items-center justify-center">
                          <Play className="w-5 h-5 text-[#b4d248]" />
                        </div>
                        <div>
                          <h4 className="font-semibold text-white">후반 35분 - 슈팅 시도</h4>
                          <p className="text-sm text-[#9ca3af]">슈팅 실패</p>
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-[#9ca3af]" />
                    </div>
                    <p className="text-sm text-[#c7cdd8]">
                      좋은 위치에서 슈팅을 시도했으나 골키퍼의 선방으로 막혔습니다. 
                      슈팅 코스 선택에 대한 개선이 필요합니다.
                    </p>
                  </div>
                </div>
              </div>

              {/* AI Analysis */}
              <div className="bg-gradient-to-br from-[#141824] to-[#0f1218] rounded-2xl p-8 border border-white/10">
                <h3 className="text-2xl font-bold text-white mb-6">AI 분석 피드백</h3>
                
                <div className="space-y-6">
                  {/* Strengths */}
                  <div>
                    <h4 className="text-lg font-semibold text-[#b4d248] mb-3">잘한 점</h4>
                    <ul className="space-y-2">
                      <li className="flex items-start gap-2 text-[#c7cdd8]">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#b4d248] mt-2" />
                        <span>슈팅 정확도가 높았으며, 골 결정력이 뛰어났습니다</span>
                      </li>
                      <li className="flex items-start gap-2 text-[#c7cdd8]">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#b4d248] mt-2" />
                        <span>오프더볼 움직임이 좋아 공간 창출에 성공했습니다</span>
                      </li>
                      <li className="flex items-start gap-2 text-[#c7cdd8]">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#b4d248] mt-2" />
                        <span>1 vs 1 상황에서 침착함을 유지했습니다</span>
                      </li>
                    </ul>
                  </div>

                  {/* Improvements */}
                  <div>
                    <h4 className="text-lg font-semibold text-[#9ca3af] mb-3">개선할 점</h4>
                    <ul className="space-y-2">
                      <li className="flex items-start gap-2 text-[#c7cdd8]">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#9ca3af] mt-2" />
                        <span>슈팅 코스 선택 시 골키퍼의 위치를 더 잘 파악할 필요가 있습니다</span>
                      </li>
                      <li className="flex items-start gap-2 text-[#c7cdd8]">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#9ca3af] mt-2" />
                        <span>압박 상황에서 패스 판단이 다소 늦었습니다</span>
                      </li>
                      <li className="flex items-start gap-2 text-[#c7cdd8]">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#9ca3af] mt-2" />
                        <span>수비 가담 빈도를 높일 필요가 있습니다</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column - Additional Info */}
            <div className="space-y-6">
              {/* Report Image */}
              <div className="aspect-square rounded-2xl overflow-hidden border border-white/10">
                <ImageWithFallback
                  src={reportImage}
                  alt="Analysis Report"
                  className="w-full h-full object-cover"
                />
              </div>

              {/* Performance Rating */}
              <div className="bg-gradient-to-br from-[#2a2f3f] via-[#1e2230] to-[#141824] rounded-2xl p-6 border border-white/10">
                <h3 className="text-lg font-bold text-white mb-6">경기 평가</h3>
                
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-[#c7cdd8]">슈팅</span>
                      <span className="text-sm font-bold text-white">8.5</span>
                    </div>
                    <div className="h-2 bg-[#0a0e1a] rounded-full overflow-hidden">
                      <div className="h-full bg-[#b4d248] rounded-full" style={{ width: '85%' }} />
                    </div>
                  </div>
                  
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-[#c7cdd8]">패스</span>
                      <span className="text-sm font-bold text-white">7.5</span>
                    </div>
                    <div className="h-2 bg-[#0a0e1a] rounded-full overflow-hidden">
                      <div className="h-full bg-[#b4d248] rounded-full" style={{ width: '75%' }} />
                    </div>
                  </div>
                  
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-[#c7cdd8]">드리블</span>
                      <span className="text-sm font-bold text-white">8.0</span>
                    </div>
                    <div className="h-2 bg-[#0a0e1a] rounded-full overflow-hidden">
                      <div className="h-full bg-[#b4d248] rounded-full" style={{ width: '80%' }} />
                    </div>
                  </div>
                  
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-[#c7cdd8]">포지셔닝</span>
                      <span className="text-sm font-bold text-white">7.0</span>
                    </div>
                    <div className="h-2 bg-[#0a0e1a] rounded-full overflow-hidden">
                      <div className="h-full bg-[#b4d248] rounded-full" style={{ width: '70%' }} />
                    </div>
                  </div>

                  <div className="pt-4 mt-4 border-t border-white/10">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-white">종합 평점</span>
                      <span className="text-2xl font-bold text-[#b4d248]">7.8</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Next Steps */}
              <div className="bg-[#b4d248]/5 border border-[#b4d248]/20 rounded-2xl p-6">
                <h4 className="text-lg font-semibold text-[#b4d248] mb-4">다음 훈련 제안</h4>
                <ul className="space-y-3">
                  <li className="flex items-start gap-2 text-sm text-[#c7cdd8]">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#b4d248] mt-1.5" />
                    <span>골키퍼 위치에 따른 슈팅 코스 선택 훈련</span>
                  </li>
                  <li className="flex items-start gap-2 text-sm text-[#c7cdd8]">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#b4d248] mt-1.5" />
                    <span>압박 상황에서의 빠른 패스 판단 연습</span>
                  </li>
                  <li className="flex items-start gap-2 text-sm text-[#c7cdd8]">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#b4d248] mt-1.5" />
                    <span>공격-수비 전환 타이밍 개선</span>
                  </li>
                </ul>
              </div>

              {/* CTA */}
              <Link to="/analysis" className="block w-full px-6 py-4 bg-[#b4d248] text-[#0a0e1a] rounded-lg hover:bg-[#a3c137] transition-all duration-200 font-bold text-center">
                내 경기 분석 시작하기
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
