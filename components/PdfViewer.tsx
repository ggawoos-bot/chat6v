import React, { useState, useEffect, useRef, useCallback } from 'react';

interface PdfViewerProps {
  pdfUrl: string;
  currentPage?: number;
  onPageChange?: (page: number) => void;
  onDocumentLoad?: (totalPages: number) => void;
  onError?: (error: string) => void;
}

export const PdfViewer: React.FC<PdfViewerProps> = ({
  pdfUrl,
  currentPage = 1,
  onPageChange,
  onDocumentLoad,
  onError
}) => {
  const [totalPages, setTotalPages] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1.5);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfRef = useRef<any>(null);
  const pdfjsLibRef = useRef<any>(null);

  // PDF.js 로드
  const loadPdfJs = useCallback(async () => {
    if (pdfjsLibRef.current) return pdfjsLibRef.current;
    
    try {
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
      pdfjsLibRef.current = pdfjsLib;
      return pdfjsLib;
    } catch (error) {
      console.error('PDF.js 로드 실패:', error);
      throw error;
    }
  }, []);

  // PDF 문서 로드
  const loadPdf = useCallback(async () => {
    if (!pdfUrl) return;
    
    try {
      setIsLoading(true);
      setError(null);
      
      const pdfjsLib = await loadPdfJs();
      
      console.log(`📄 PDF 로드 시작: ${pdfUrl}`);
      const pdf = await pdfjsLib.getDocument({
        url: pdfUrl,
        cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/',
        cMapPacked: true,
      }).promise;
      
      pdfRef.current = pdf;
      setTotalPages(pdf.numPages);
      onDocumentLoad?.(pdf.numPages);
      
      console.log(`✅ PDF 로드 완료: ${pdf.numPages}페이지`);
      
      // 현재 페이지 렌더링
      if (currentPage > 0) {
        await renderPage(currentPage);
      }
    } catch (error) {
      console.error('PDF 로드 실패:', error);
      const errorMessage = `PDF 로드 실패: ${error.message}`;
      setError(errorMessage);
      onError?.(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [pdfUrl, currentPage, loadPdfJs, onDocumentLoad, onError]);

  // 페이지 렌더링
  const renderPage = useCallback(async (pageNum: number) => {
    if (!pdfRef.current || !canvasRef.current || pageNum < 1 || pageNum > totalPages) {
      return;
    }
    
    try {
      const page = await pdfRef.current.getPage(pageNum);
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      
      if (!context) return;
      
      const viewport = page.getViewport({ scale });
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      
      await page.render({
        canvasContext: context,
        viewport: viewport
      }).promise;
      
      console.log(`📄 페이지 ${pageNum} 렌더링 완료`);
    } catch (error) {
      console.error(`페이지 ${pageNum} 렌더링 실패:`, error);
    }
  }, [scale, totalPages]);

  // PDF 로드
  useEffect(() => {
    loadPdf();
  }, [loadPdf]);

  // 페이지 변경
  useEffect(() => {
    if (pdfRef.current && currentPage > 0 && currentPage <= totalPages) {
      renderPage(currentPage);
    }
  }, [currentPage, renderPage]);

  // 페이지 변경 핸들러
  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      onPageChange?.(newPage);
    }
  };

  // 줌 핸들러
  const handleZoomIn = () => {
    setScale(prev => Math.min(prev + 0.25, 3));
  };

  const handleZoomOut = () => {
    setScale(prev => Math.max(prev - 0.25, 0.5));
  };

  const handleZoomReset = () => {
    setScale(1.5);
  };

  // 에러 상태
  if (error) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-100">
        <div className="text-center p-8">
          <div className="text-red-500 text-lg mb-4">❌ PDF 로드 실패</div>
          <div className="text-gray-600 mb-4">{error}</div>
          <button
            onClick={loadPdf}
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
      {/* PDF 뷰어 헤더 */}
      <div className="flex items-center justify-between p-4 border-b bg-gray-50 flex-shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage <= 1 || isLoading}
            className="px-3 py-1 bg-blue-500 text-white rounded disabled:opacity-50 hover:bg-blue-600 transition-colors"
            title="이전 페이지"
          >
            ← 이전
          </button>
          <span className="text-sm font-medium">
            {currentPage} / {totalPages}
          </span>
          <button
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage >= totalPages || isLoading}
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
            disabled={isLoading}
          />
          <span className="text-sm text-gray-600">페이지</span>
        </div>

        {/* 줌 컨트롤 */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleZoomOut}
            disabled={isLoading}
            className="px-2 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
            title="축소"
          >
            −
          </button>
          <span className="text-sm text-gray-600 min-w-[60px] text-center">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={handleZoomIn}
            disabled={isLoading}
            className="px-2 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
            title="확대"
          >
            +
          </button>
          <button
            onClick={handleZoomReset}
            disabled={isLoading}
            className="px-2 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors text-xs"
            title="원본 크기"
          >
            리셋
          </button>
        </div>
      </div>

      {/* PDF 캔버스 */}
      <div className="flex-1 overflow-auto bg-gray-100">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <div className="text-gray-500">PDF 로딩 중...</div>
            </div>
          </div>
        ) : (
          <div className="flex justify-center p-4">
            <canvas 
              ref={canvasRef} 
              className="shadow-lg bg-white"
              style={{ maxWidth: '100%', height: 'auto' }}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default PdfViewer;
