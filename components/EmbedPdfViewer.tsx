import React, { useState, useEffect, useMemo } from 'react';
import { EmbedPDF } from '@embedpdf/core/react';
import { createPluginRegistration } from '@embedpdf/core';
import { usePdfiumEngine } from '@embedpdf/engines/react';
import { ViewportPluginPackage, Viewport } from '@embedpdf/plugin-viewport/react';
import { ScrollPluginPackage, Scroller } from '@embedpdf/plugin-scroll/react';
import { RenderPluginPackage, RenderLayer } from '@embedpdf/plugin-render/react';
import { LoaderPluginPackage } from '@embedpdf/plugin-loader/react';

interface EmbedPdfViewerProps {
  pdfUrl: string;
  currentPage?: number;
  onPageChange?: (page: number) => void;
  onDocumentLoad?: (totalPages: number) => void;
  onError?: (error: string) => void;
}

export const EmbedPdfViewer: React.FC<EmbedPdfViewerProps> = ({
  pdfUrl,
  currentPage = 1,
  onPageChange,
  onDocumentLoad,
  onError
}) => {
  const { engine, isLoading, error: engineError } = usePdfiumEngine();
  const [totalPages, setTotalPages] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingPdf, setIsLoadingPdf] = useState<boolean>(true);

  // PDF URL을 절대 경로로 변환
  const absolutePdfUrl = useMemo(() => {
    if (!pdfUrl) return '';
    
    // 이미 절대 URL인 경우 그대로 사용
    if (pdfUrl.startsWith('http://') || pdfUrl.startsWith('https://')) {
      return pdfUrl;
    }
    
    // 상대 경로인 경우 현재 도메인 기준으로 절대 경로 생성
    if (pdfUrl.startsWith('./')) {
      return `${window.location.origin}${pdfUrl.substring(1)}`;
    }
    
    // 다른 상대 경로인 경우
    if (pdfUrl.startsWith('/')) {
      return `${window.location.origin}${pdfUrl}`;
    }
    
    // 기본적으로 현재 도메인 기준으로 처리
    return `${window.location.origin}/${pdfUrl}`;
  }, [pdfUrl]);

  // EmbedPDF 플러그인 등록 (pdfUrl이 변경될 때만 재생성)
  const plugins = useMemo(() => [
    createPluginRegistration(LoaderPluginPackage, {
      loadingOptions: {
        type: 'url',
        pdfFile: {
          id: 'pdf-document',
          url: absolutePdfUrl,
        },
      },
    }),
    createPluginRegistration(ViewportPluginPackage),
    createPluginRegistration(ScrollPluginPackage),
    createPluginRegistration(RenderPluginPackage),
  ], [absolutePdfUrl]);

  // PDF URL 변경 시 디버깅 정보 출력
  useEffect(() => {
    console.log('🔍 EmbedPDF URL 변경:', {
      originalUrl: pdfUrl,
      absoluteUrl: absolutePdfUrl,
      currentOrigin: window.location.origin
    });
  }, [pdfUrl, absolutePdfUrl]);

  // PDF URL 변경 시 로딩 상태 초기화
  useEffect(() => {
    setIsLoadingPdf(true);
    setError(null);
    setTotalPages(0);
    
    // 10초 후에도 로딩이 완료되지 않으면 에러로 처리
    const timeout = setTimeout(() => {
      if (isLoadingPdf) {
        const errorMessage = 'PDF 로딩 시간 초과 (10초)';
        console.error('❌ PDF 로딩 타임아웃');
        setError(errorMessage);
        setIsLoadingPdf(false);
        onError?.(errorMessage);
      }
    }, 10000);
    
    return () => clearTimeout(timeout);
  }, [pdfUrl, isLoadingPdf, onError]);

  // 엔진 에러 처리
  useEffect(() => {
    if (engineError) {
      const errorMessage = `PDF 엔진 오류: ${engineError.message}`;
      console.error('❌ PDF 엔진 오류:', engineError);
      setError(errorMessage);
      onError?.(errorMessage);
    }
  }, [engineError, onError]);

  // 페이지 변경 처리
  const handlePageChange = (pageIndex: number) => {
    const pageNumber = pageIndex + 1; // EmbedPDF는 0-based index 사용
    onPageChange?.(pageNumber);
  };

  if (isLoading || !engine) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500">PDF 엔진 로딩 중...</div>
      </div>
    );
  }

  if (isLoadingPdf) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500">PDF 문서 로딩 중...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="text-red-500 mb-4 text-lg">❌ PDF 로드 실패</div>
          <div className="text-gray-600 mb-4 text-sm">{error}</div>
          <button
            onClick={() => setError(null)}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* 헤더 컨트롤 */}
      <div className="flex items-center justify-between p-4 border-b bg-gray-50 flex-shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={() => handlePageChange(Math.max(0, currentPage - 2))}
            disabled={currentPage <= 1}
            className="px-3 py-1 bg-blue-500 text-white rounded disabled:opacity-50 hover:bg-blue-600 transition-colors"
            title="이전 페이지"
          >
            ← 이전
          </button>
          <span className="text-sm font-medium">
            페이지 {currentPage} / {totalPages || '?'}
          </span>
          <button
            onClick={() => handlePageChange(currentPage)}
            disabled={currentPage >= (totalPages || 1)}
            className="px-3 py-1 bg-blue-500 text-white rounded disabled:opacity-50 hover:bg-blue-600 transition-colors"
            title="다음 페이지"
          >
            다음 →
          </button>
        </div>
        
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="1"
            max={totalPages || 1}
            value={currentPage}
            onChange={(e) => handlePageChange(parseInt(e.target.value) - 1)}
            className="w-16 px-2 py-1 border rounded text-sm text-center"
          />
          <span className="text-sm text-gray-600">페이지</span>
        </div>
      </div>

      {/* EmbedPDF 뷰어 */}
      <div className="flex-1 overflow-hidden">
        <EmbedPDF engine={engine} plugins={plugins}>
          <Viewport style={{ backgroundColor: '#f1f3f5', height: '100%' }}>
            <Scroller
              renderPage={({ width, height, pageIndex, scale }) => {
                // 첫 번째 페이지가 렌더링되면 로딩 완료로 간주
                if (pageIndex === 0 && isLoadingPdf) {
                  console.log('✅ PDF 첫 페이지 렌더링 완료');
                  setIsLoadingPdf(false);
                  // 임시로 페이지 수를 설정 (실제로는 문서에서 가져와야 함)
                  if (totalPages === 0) {
                    setTotalPages(149); // 임시 값, 실제로는 문서에서 가져와야 함
                    onDocumentLoad?.(149);
                  }
                }
                
                return (
                  <div style={{ width, height, position: 'relative' }}>
                    <RenderLayer pageIndex={pageIndex} scale={scale} />
                  </div>
                );
              }}
            />
          </Viewport>
        </EmbedPDF>
      </div>
    </div>
  );
};

export default EmbedPdfViewer;