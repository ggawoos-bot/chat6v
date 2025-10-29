import React, { useState, useEffect } from 'react';
import { EmbedPDF } from '@embedpdf/core/react';
import { usePdfiumEngine } from '@embedpdf/engines/react';

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

  // PDF 로드 완료 처리
  useEffect(() => {
    if (engine && totalPages > 0) {
      console.log(`✅ EmbedPDF 로드 완료: ${totalPages}페이지`);
      onDocumentLoad?.(totalPages);
    }
  }, [engine, totalPages, onDocumentLoad]);

  // 에러 처리
  useEffect(() => {
    if (engineError) {
      const errorMessage = `PDF 엔진 오류: ${engineError.message}`;
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
        <EmbedPDF 
          engine={engine} 
          pdfUrl={pdfUrl}
          style={{ height: '100%', width: '100%' }}
        >
          <div style={{ backgroundColor: '#f1f3f5', height: '100%' }}>
            {/* EmbedPDF 기본 뷰어 - 자체적으로 페이지 렌더링 처리 */}
          </div>
        </EmbedPDF>
      </div>
    </div>
  );
};

export default EmbedPdfViewer;