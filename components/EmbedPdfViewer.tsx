import React, { useState, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';

// PDF.js Worker 설정
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
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(currentPage);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // PDF URL을 절대 경로로 변환
  const absolutePdfUrl = React.useMemo(() => {
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

  // currentPage가 변경되면 pageNumber 업데이트
  useEffect(() => {
    if (currentPage > 0 && currentPage <= numPages) {
      setPageNumber(currentPage);
    } else if (currentPage > 0 && numPages === 0) {
      // numPages가 아직 로드되지 않은 경우 currentPage를 일단 설정
      setPageNumber(currentPage);
    }
  }, [currentPage, numPages]);

  // PDF 로드 성공 처리
  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    console.log(`✅ PDF 로드 성공: ${numPages}페이지`);
    setNumPages(numPages);
    setLoading(false);
    setError(null);
    onDocumentLoad?.(numPages);
    
    // currentPage가 유효한 범위인지 확인
    if (currentPage > 0 && currentPage <= numPages) {
      setPageNumber(currentPage);
      onPageChange?.(currentPage);
    } else {
      setPageNumber(1);
      onPageChange?.(1);
    }
  };

  // PDF 로드 에러 처리
  const onDocumentLoadError = (error: Error) => {
    console.error('❌ PDF 로드 오류:', error);
    const errorMessage = `PDF 로드 실패: ${error.message}`;
    setError(errorMessage);
    setLoading(false);
    onError?.(errorMessage);
  };

  // 페이지 변경 처리
  const changePage = (offset: number) => {
    const newPage = pageNumber + offset;
    if (newPage >= 1 && newPage <= numPages) {
      setPageNumber(newPage);
      onPageChange?.(newPage);
    }
  };

  const goToPage = (page: number) => {
    if (page >= 1 && page <= numPages) {
      setPageNumber(page);
      onPageChange?.(page);
    }
  };

  if (loading && !error) {
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
            onClick={() => {
              setError(null);
              setLoading(true);
            }}
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
            onClick={() => changePage(-1)}
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
            onClick={() => changePage(1)}
            disabled={pageNumber >= numPages}
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
            max={numPages || 1}
            value={pageNumber}
            onChange={(e) => goToPage(parseInt(e.target.value) || 1)}
            className="w-16 px-2 py-1 border rounded text-sm text-center"
          />
          <span className="text-sm text-gray-600">페이지</span>
        </div>
      </div>

      {/* PDF 뷰어 */}
      <div className="flex-1 overflow-auto bg-gray-100 p-4 flex items-start justify-center">
        <Document
          file={absolutePdfUrl}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={onDocumentLoadError}
          loading={
            <div className="flex items-center justify-center h-full">
              <div className="text-gray-500">PDF 로딩 중...</div>
            </div>
          }
          error={
            <div className="flex items-center justify-center h-full">
              <div className="text-red-500">PDF 로드 실패</div>
            </div>
          }
        >
          <Page
            pageNumber={pageNumber}
            renderTextLayer={true}
            renderAnnotationLayer={true}
            className="shadow-lg"
            width={window.innerWidth > 768 ? 800 : window.innerWidth - 64}
          />
        </Document>
      </div>
    </div>
  );
};

export default EmbedPdfViewer;
