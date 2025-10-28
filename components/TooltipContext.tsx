import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

interface TooltipContent {
  title: string;
  content: string;
}

interface TooltipPosition {
  x: number;
  y: number;
}

interface TooltipContextType {
  tooltipRef: string | null;
  tooltipContent: TooltipContent | null;
  tooltipPosition: TooltipPosition | null;
  showTooltip: (uniqueKey: string, content: TooltipContent, position?: TooltipPosition) => void;
  hideTooltip: (uniqueKey: string, delay?: number) => void;
  cancelHide: () => void;
  isTooltipVisible: (uniqueKey: string) => boolean;
}

const TooltipContext = createContext<TooltipContextType | null>(null);

export const TooltipProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tooltipRef, setTooltipRef] = useState<string | null>(null);
  const [tooltipContent, setTooltipContent] = useState<TooltipContent | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<TooltipPosition | null>(null);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showTooltip = useCallback((uniqueKey: string, content: TooltipContent, position?: TooltipPosition) => {
    // 기존 타이머 클리어
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    
    // 기존 툴팁과 다르면 즉시 교체
    if (tooltipRef !== uniqueKey) {
      setTooltipRef(uniqueKey);
      setTooltipContent(content);
      setTooltipPosition(position || null);
    }
  }, [tooltipRef]);

  const hideTooltip = useCallback((uniqueKey: string, delay: number = 0) => {
    // 기존 타이머 클리어
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
    }

    // 딜레이 후 닫기 (딜레이가 0이면 즉시 닫기)
    if (delay === 0) {
      if (tooltipRef === uniqueKey) {
        setTooltipRef(null);
        setTooltipContent(null);
      }
    } else {
      hideTimeoutRef.current = setTimeout(() => {
        if (tooltipRef === uniqueKey) {
          setTooltipRef(null);
          setTooltipContent(null);
        }
        hideTimeoutRef.current = null;
      }, delay);
    }
  }, [tooltipRef]);

  const cancelHide = useCallback(() => {
    // 기존 타이머 취소
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  }, []);

  const isTooltipVisible = useCallback((uniqueKey: string) => {
    return tooltipRef === uniqueKey && tooltipContent !== null;
  }, [tooltipRef, tooltipContent]);

  const handleTooltipMouseEnter = useCallback(() => {
    cancelHide();
  }, [cancelHide]);

  const handleTooltipMouseLeave = useCallback(() => {
    if (tooltipRef) {
      hideTooltip(tooltipRef, 300);
    }
  }, [tooltipRef, hideTooltip]);

  // ✅ 툴팁 위치 계산 함수 - 화면 경계 고려
  const calculateTooltipPosition = useCallback((position: TooltipPosition | null): React.CSSProperties => {
    if (!position) {
      return {
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)'
      };
    }

    const tooltipWidth = 500;
    const tooltipHeight = 400; // 대략적인 높이
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    let left = position.x;
    let top = position.y;
    let transformX = '-50%';
    let transformY = '0';

    // ✅ 가로 위치 조정 - 화면 왼쪽 경계 체크
    if (left - tooltipWidth / 2 < 10) {
      left = tooltipWidth / 2 + 10;
    }
    // ✅ 가로 위치 조정 - 화면 오른쪽 경계 체크
    if (left + tooltipWidth / 2 > windowWidth - 10) {
      left = windowWidth - tooltipWidth / 2 - 10;
    }

    // ✅ 세로 위치 조정 - 화면 아래 경계 체크 (툴팁이 아래로 표시될 때)
    if (top + tooltipHeight > windowHeight - 10) {
      // 화면 아래에 공간이 부족하면 위쪽에 표시
      top = position.y - 20; // 버튼 위쪽에 표시
      transformY = '-100%';
    }

    // ✅ 세로 위치 조정 - 화면 위 경계 체크
    if (top < 10) {
      top = 10;
    }

    return {
      left: `${left}px`,
      top: `${top}px`,
      transform: `translate(${transformX}, ${transformY})`
    };
  }, []);

  return (
    <TooltipContext.Provider value={{
      tooltipRef,
      tooltipContent,
      tooltipPosition,
      showTooltip,
      hideTooltip,
      cancelHide,
      isTooltipVisible
    }}>
      {children}
      {/* ✅ 전역 툴팁 - 한 번만 렌더링 */}
      {tooltipRef && tooltipContent && (
        <div 
          className="fixed z-[9999] pointer-events-none"
          style={calculateTooltipPosition(tooltipPosition)}
        >
          <div 
            className="w-[500px] max-h-[600px] overflow-y-auto bg-white border border-gray-300 rounded-lg shadow-xl p-4 pointer-events-auto"
            onMouseEnter={handleTooltipMouseEnter}
            onMouseLeave={handleTooltipMouseLeave}
          >
            <div className="text-sm font-semibold text-gray-800 mb-3 border-b pb-2 sticky top-0 bg-white">
              {tooltipContent.title}
            </div>
            <div 
              className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap"
              dangerouslySetInnerHTML={{ __html: tooltipContent.content }}
            />
          </div>
        </div>
      )}
    </TooltipContext.Provider>
  );
};

export const useTooltip = () => {
  const context = useContext(TooltipContext);
  if (!context) {
    throw new Error('useTooltip must be used within TooltipProvider');
  }
  return context;
};

