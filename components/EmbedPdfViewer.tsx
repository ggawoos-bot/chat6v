import React, { useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';

// react-pdf CSS styles
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// PDF.js 워커 설정
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

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
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(currentPage);
  const [scale, setScale] = useState(1.5);
  const [error, setError] = useState<string | null>(null);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    console.log(`✅ PDF 로드 완료: ${numPages}페이지`);
    setNumPages(numPages);
    onDocumentLoad?.(numPages);
  }

  function onDocumentLoadError(error: Error) {
    console.error('PDF 로드 실패:', error);
    const errorMessage = `PDF 로드 실패: ${error.message}`;
    setError(errorMessage);
    onError?.(errorMessage);
  }

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= (numPages || 1)) {
      setPageNumber(newPage);
      onPageChange?.(newPage);
    }
  };

  const handleScaleChange = (delta: number) => {
    setScale((prevScale) => Math.min(Math.max(0.5, prevScale + delta), 3));
  };

  // currentPage prop이 변경되면 pageNumber 동기화
  React.useEffect(() => {
    if (currentPage !== pageNumber) {
      setPageNumber(currentPage);
    }
  }, [currentPage]);

  return (
    <div className="h-full flex flex-col bg-white">
      {/* 헤더 컨트롤 */}
      <div className="flex items-center justify-between p-4 border-b bg-gray-50 flex-shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={() => handlePageChange(pageNumber - 1)}
            disabled={pageNumber <= 1}
            className="px-3 py-1 bg-blue-500 text-white rounded disabled:opacity-50 hover:bg-blue-600 transition-colors"
            title="이전 페이지"
          >
            ← 이전
          </button>
          <span className="text-sm font-medium">
            페이지 {pageNumber} / {numPages || '?'}
          </span>
          <button
            onClick={() => handlePageChange(pageNumber + 1)}
            disabled={pageNumber >= (numPages || 1)}
            className="px-3 py-1 bg-blue-500 text-white rounded disabled:opacity-50 hover:bg-blue-600 transition-colors"
            title="다음 페이지"
          >
            다음 →
          </button>
        </div>
        
        {/* 페이지 입력 및 줌 */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleScaleChange(-0.1)}
              className="px-2 py-1 bg-gray-200 rounded hover:bg-gray-300"
              title="축소"
            >
              −
            </button>
            <span className="text-sm text-gray-600">{Math.round(scale * 100)}%</span>
            <button
              onClick={() => handleScaleChange(0.1)}
              className="px-2 py-1 bg-gray-200 rounded hover:bg-gray-300"
              title="확대"
            >
              +
            </button>
            <button
              onClick={() => setScale(1.5)}
              className="px-2 py-1 bg-gray-200 rounded hover:bg-gray-300 text-xs"
              title="기본 크기"
            >
              리셋
            </button>
          </div>
          
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="1"
              max={numPages || 1}
              value={pageNumber}
              onChange={(e) => handlePageChange(parseInt(e.target.value) || 1)}
              className="w-16 px-2 py-1 border rounded text-sm text-center"
            />
            <span className="text-sm text-gray-600">페이지</span>
          </div>
        </div>
      </div>

      {/* PDF 뷰어 */}
      <div className="flex-1 overflow-auto p-4 bg-gray-100">
        {error ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-red-500 mb-4 text-lg">❌ PDF 로드 실패</div>
              <div className="text-gray-600 mb-4 text-sm">{error}</div>
              <button
                onClick={() => {
                  setError(null);
                  setNumPages(null);
                }}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
              >
                다시 시도
              </button>
            </div>
          </div>
        ) : (
          <div className="flex justify-center">
            <Document
              file={pdfUrl}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={onDocumentLoadError}
              loading={
                <div className="flex items-center justify-center h-full">
                  <div className="text-gray-500">PDF 로딩 중...</div>
                </div>
              }
            >
              <Page
                pageNumber={pageNumber}
                scale={scale}
                renderTextLayer={true}
                renderAnnotationLayer={true}
              />
            </Document>
          </div>
        )}
      </div>
    </div>
  );
};

export default EmbedPdfViewer;