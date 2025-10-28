import React, { useEffect, useRef, useState } from 'react';

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
  const containerRef = useRef<HTMLDivElement>(null);
  const embedInstanceRef = useRef<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalPages, setTotalPages] = useState(0);

  useEffect(() => {
    loadEmbedPDF();
    return () => {
      if (embedInstanceRef.current) {
        embedInstanceRef.current.destroy?.();
      }
    };
  }, [pdfUrl]);

  useEffect(() => {
    if (embedInstanceRef.current && currentPage > 0) {
      embedInstanceRef.current.goToPage?.(currentPage);
    }
  }, [currentPage]);

  const loadEmbedPDF = async () => {
    if (!containerRef.current || !pdfUrl) return;

    try {
      setIsLoading(true);
      setError(null);

      console.log(`📄 EmbedPDF 로드 시작: ${pdfUrl}`);
      
      // @embedpdf/engines 동적 로드
      const { createEmbedPDF } = await import('@embedpdf/engines');
      
      // 컨테이너 초기화
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
      
      embedInstanceRef.current = createEmbedPDF(containerRef.current, {
        url: pdfUrl,
        width: '100%',
        height: '100%',
        page: currentPage,
        toolbar: true,
        navigation: true,
        zoom: true,
        download: true,
        print: true
      });

      await embedInstanceRef.current.load();
      
      // 총 페이지 수 가져오기
      const pages = embedInstanceRef.current.getTotalPages?.() || 1;
      setTotalPages(pages);
      onDocumentLoad?.(pages);
      
      console.log(`✅ EmbedPDF 로드 완료: ${pages}페이지`);
    } catch (err: any) {
      console.error('EmbedPDF 로드 실패:', err);
      const errorMessage = `EmbedPDF 로드 실패: ${err.message}`;
      setError(errorMessage);
      onError?.(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      onPageChange?.(newPage);
    }
  };

  const handleRetry = () => {
    setError(null);
    loadEmbedPDF();
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {/* 헤더 컨트롤 */}
      <div className="flex items-center justify-between p-4 border-b bg-gray-50 flex-shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage <= 1}
            className="px-3 py-1 bg-blue-500 text-white rounded disabled:opacity-50 hover:bg-blue-600 transition-colors"
            title="이전 페이지"
          >
            ← 이전
          </button>
          <span className="text-sm font-medium">
            페이지 {currentPage} / {totalPages}
          </span>
          <button
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage >= totalPages}
            className="px-3 py-1 bg-blue-500 text-white rounded disabled:opacity-50 hover:bg-blue-600 transition-colors"
            title="다음 페이지"
          >
            다음 →
          </button>
        </div>
        
        {/* 페이지 입력 */}
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="1"
            max={totalPages}
            value={currentPage}
            onChange={(e) => handlePageChange(parseInt(e.target.value) || 1)}
            className="w-16 px-2 py-1 border rounded text-sm text-center"
          />
          <span className="text-sm text-gray-600">페이지</span>
        </div>
      </div>

      {/* PDF 컨테이너 */}
      <div className="flex-1 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
              <div className="text-gray-500">PDF 로딩 중...</div>
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-red-500 mb-4 text-lg">❌ PDF 로드 실패</div>
              <div className="text-gray-600 mb-4 text-sm">{error}</div>
              <button
                onClick={handleRetry}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
              >
                다시 시도
              </button>
            </div>
          </div>
        ) : (
          <div 
            ref={containerRef} 
            className="w-full h-full"
            style={{ minHeight: '500px' }}
          />
        )}
      </div>
    </div>
  );
};

export default EmbedPdfViewer;
