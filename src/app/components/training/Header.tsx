import { Link } from 'react-router';

export function Header() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-[#0a0e1a]/95 backdrop-blur-md border-b border-white/10">
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-[#b4d248] to-[#8fa838] rounded-lg flex items-center justify-center">
                <span className="text-[#0a0e1a] font-bold text-sm">10X</span>
              </div>
              <span className="text-white font-semibold text-lg">AI SPORTS</span>
            </div>
          </Link>

          {/* Navigation */}
          <nav className="flex items-center gap-8">
            <Link to="/" className="text-[#9ca3af] hover:text-white transition-colors">홈</Link>
            <Link to="/register" className="text-[#9ca3af] hover:text-white transition-colors">선수 등록</Link>
            <Link to="/analysis" className="text-[#9ca3af] hover:text-white transition-colors">영상 분석</Link>
            <Link to="/journal" className="text-white font-medium">훈련일지</Link>
            <Link to="/sample-report" className="text-[#9ca3af] hover:text-white transition-colors">샘플 리포트</Link>
          </nav>
        </div>
      </div>
    </header>
  );
}
