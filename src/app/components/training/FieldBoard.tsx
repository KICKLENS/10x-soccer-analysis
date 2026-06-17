import { useState } from 'react';
import { useDrop } from 'react-dnd';
import { Circle, User, Target, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight, ArrowUpLeft, ArrowDownRight, ArrowDownLeft, Trash2 } from 'lucide-react';

interface FieldItem {
  id: string;
  type: string;
  x: number;
  y: number;
}

export function FieldBoard() {
  const [items, setItems] = useState<FieldItem[]>([]);

  const [{ isOver }, drop] = useDrop(() => ({
    accept: 'FIELD_ITEM',
    drop: (item: { type: string }, monitor) => {
      const offset = monitor.getClientOffset();
      const boardElement = document.getElementById('field-board');
      if (offset && boardElement) {
        const rect = boardElement.getBoundingClientRect();
        const x = ((offset.x - rect.left) / rect.width) * 100;
        const y = ((offset.y - rect.top) / rect.height) * 100;
        
        const newItem: FieldItem = {
          id: `${item.type}-${Date.now()}`,
          type: item.type,
          x: Math.max(0, Math.min(100, x)),
          y: Math.max(0, Math.min(100, y)),
        };
        
        setItems((prev) => [...prev, newItem]);
      }
    },
    collect: (monitor) => ({
      isOver: !!monitor.isOver(),
    }),
  }));

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const clearAll = () => {
    setItems([]);
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'ball':
        return <Circle className="w-6 h-6 fill-white text-white" />;
      case 'player-blue':
        return (
          <div className="relative">
            <User className="w-6 h-6 text-white" strokeWidth={2.5} />
            <div className="absolute -bottom-1 -right-1 w-2.5 h-2.5 bg-lime-400 rounded-full border border-white"></div>
          </div>
        );
      case 'player-red':
        return (
          <div className="relative">
            <User className="w-6 h-6 text-white" strokeWidth={2.5} />
            <div className="absolute -bottom-1 -right-1 w-2.5 h-2.5 bg-[#E85D75] rounded-full border border-white"></div>
          </div>
        );
      case 'cone':
        return <Target className="w-6 h-6 text-white" />;
      case 'arrow-up':
        return <ArrowUp className="w-5 h-5 text-white" />;
      case 'arrow-down':
        return <ArrowDown className="w-5 h-5 text-white" />;
      case 'arrow-left':
        return <ArrowLeft className="w-5 h-5 text-white" />;
      case 'arrow-right':
        return <ArrowRight className="w-5 h-5 text-white" />;
      case 'arrow-up-right':
        return <ArrowUpRight className="w-5 h-5 text-white" />;
      case 'arrow-up-left':
        return <ArrowUpLeft className="w-5 h-5 text-white" />;
      case 'arrow-down-right':
        return <ArrowDownRight className="w-5 h-5 text-white" />;
      case 'arrow-down-left':
        return <ArrowDownLeft className="w-5 h-5 text-white" />;
      default:
        return null;
    }
  };

  return (
    <div>
      {/* Control Bar */}
      {items.length > 0 && (
        <div className="mb-3 flex items-center justify-between">
          <p className="text-white/50 text-xs">배치된 항목: {items.length}개</p>
          <button
            onClick={clearAll}
            className="px-3 py-1.5 bg-[#1F3B63]/40 hover:bg-[#E85D75]/20 border border-[#2E5A8A]/30 hover:border-[#E85D75]/40 rounded text-white/70 hover:text-[#E85D75] text-xs font-medium transition-all flex items-center gap-1.5"
          >
            <Trash2 className="w-3 h-3" />
            전체 삭제
          </button>
        </div>
      )}

      {/* Field Board */}
      <div
        ref={drop}
        id="field-board"
        className={`
          relative w-full aspect-[16/11] 
          rounded-xl overflow-hidden
          border-2 transition-all
          ${isOver ? 'border-[#4C7DB8] bg-[#4C7DB8]/5' : 'border-[#2E5A8A]/30 bg-[#0F1E30]/60'}
        `}
        style={{
          backgroundImage: `
            linear-gradient(to bottom, rgba(76, 125, 184, 0.03) 1px, transparent 1px),
            linear-gradient(to right, rgba(76, 125, 184, 0.03) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
        }}
      >
        {/* Field Lines */}
        <div className="absolute inset-0 pointer-events-none">
          {/* Center Line */}
          <div className="absolute top-0 bottom-0 left-1/2 w-[2px] bg-white/10"></div>
          
          {/* Center Circle */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 rounded-full border-2 border-white/10"></div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-white/20"></div>
          
          {/* Penalty Areas */}
          <div className="absolute top-1/2 left-4 -translate-y-1/2 w-16 h-32 border-2 border-l-0 border-white/10 rounded-r-lg"></div>
          <div className="absolute top-1/2 right-4 -translate-y-1/2 w-16 h-32 border-2 border-r-0 border-white/10 rounded-l-lg"></div>
        </div>

        {/* Dropped Items */}
        {items.map((item) => (
          <div
            key={item.id}
            className="absolute group cursor-pointer"
            style={{
              left: `${item.x}%`,
              top: `${item.y}%`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <div className="relative">
              {getIcon(item.type)}
              
              {/* Delete Button */}
              <button
                onClick={() => removeItem(item.id)}
                className="absolute -top-2 -right-2 w-5 h-5 bg-[#E85D75] rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
              >
                <Trash2 className="w-3 h-3 text-white" />
              </button>
            </div>
          </div>
        ))}

        {/* Empty State */}
        {items.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className="mb-2 text-white/20">
                <Target className="w-12 h-12 mx-auto" />
              </div>
              <p className="text-white/40 text-sm font-medium">도구를 여기로 드래그하세요</p>
              <p className="text-white/20 text-xs mt-1">축구공, 선수, 화살표 등을 배치할 수 있습니다</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
