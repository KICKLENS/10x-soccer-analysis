import { useDrag } from 'react-dnd';

interface DraggableIconProps {
  type: string;
  icon: React.ReactNode;
  label: string;
}

export function DraggableIcon({ type, icon, label }: DraggableIconProps) {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: 'FIELD_ITEM',
    item: { type },
    collect: (monitor) => ({
      isDragging: !!monitor.isDragging(),
    }),
  }));

  return (
    <div
      ref={drag}
      className={`
        bg-[#1F3B63]/40 hover:bg-[#1F3B63]/70 
        border border-[#2E5A8A]/30 hover:border-[#4C7DB8]/50
        rounded-lg p-2 
        flex flex-col items-center justify-center gap-1
        cursor-grab active:cursor-grabbing
        transition-all
        ${isDragging ? 'opacity-50' : 'opacity-100'}
      `}
    >
      <div className="text-white/90">
        {icon}
      </div>
      <span className="text-white/60 text-[10px] font-medium">{label}</span>
    </div>
  );
}
