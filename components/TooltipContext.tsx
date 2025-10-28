import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

interface TooltipContent {
  title: string;
  content: string;
}

interface TooltipContextType {
  tooltipRef: string | null;
  tooltipContent: TooltipContent | null;
  showTooltip: (uniqueKey: string, content: TooltipContent) => void;
  hideTooltip: (uniqueKey: string, delay?: number) => void;
  cancelHide: () => void;
  isTooltipVisible: (uniqueKey: string) => boolean;
}

const TooltipContext = createContext<TooltipContextType | null>(null);

export const TooltipProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tooltipRef, setTooltipRef] = useState<string | null>(null);
  const [tooltipContent, setTooltipContent] = useState<TooltipContent | null>(null);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showTooltip = useCallback((uniqueKey: string, content: TooltipContent) => {
    // 기존 타이머 클리어
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    
    // 기존 툴팁과 다르면 즉시 교체
    if (tooltipRef !== uniqueKey) {
      setTooltipRef(uniqueKey);
      setTooltipContent(content);
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

  return (
    <TooltipContext.Provider value={{
      tooltipRef,
      tooltipContent,
      showTooltip,
      hideTooltip,
      cancelHide,
      isTooltipVisible
    }}>
      {children}
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

