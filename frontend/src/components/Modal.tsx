import type { ReactNode } from 'react';

export default function Modal({ title, onClose, children, width = 640 }: { title: string; onClose: () => void; children: ReactNode; width?: number }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <div
        className="roi-pop flex max-h-[86vh] w-full flex-col overflow-hidden rounded-lg border border-border2 bg-[#0e0e11]"
        style={{ maxWidth: width }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[#242429] px-6 py-4">
          <span className="text-[15px] font-bold">{title}</span>
          <button onClick={onClose} className="text-[19px] leading-none text-gray-500 hover:text-gray-200">
            ×
          </button>
        </div>
        <div className="overflow-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}
