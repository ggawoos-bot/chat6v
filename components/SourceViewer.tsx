import React, { useState, useEffect, useRef } from 'react';
import { FirestoreService, PDFChunk } from '../services/firestoreService';

interface SourceViewerProps {
  selectedDocumentId?: string;
  highlightedChunkId?: string;
  onChunkSelect?: (chunkId: string) => void;
}

export const SourceViewer: React.FC<SourceViewerProps> = ({
  selectedDocumentId,
  highlightedChunkId,
  onChunkSelect
}) => {
  const [chunks, setChunks] = useState<PDFChunk[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [documentTitle, setDocumentTitle] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const chunksPerPage = 3; // 한 페이지에 보여줄 청크 수
  const firestoreService = FirestoreService.getInstance();
  const highlightTimeoutRef = useRef<NodeJS.Timeout>();
  
  // 전체 페이지 수 계산
  const totalPages = Math.ceil(chunks.length / chunksPerPage);
  
  // 현재 페이지의 청크 추출
  const getPaginatedChunks = () => {
    const startIndex = (currentPage - 1) * chunksPerPage;
    const endIndex = startIndex + chunksPerPage;
    return chunks.slice(startIndex, endIndex);
  };
  
  // 페이지 변경 함수
  const handlePreviousPage = () => {
    setCurrentPage(prev => Math.max(1, prev - 1));
  };
  
  const handleNextPage = () => {
    setCurrentPage(prev => Math.min(totalPages, prev + 1));
  };

  // 선택된 문서의 청크 로드
  useEffect(() => {
    if (selectedDocumentId) {
      setCurrentPage(1); // 새 문서 선택 시 첫 페이지로 리셋
      loadChunks(selectedDocumentId);
    } else {
      setChunks([]);
      setDocumentTitle('');
      setCurrentPage(1);
    }
  }, [selectedDocumentId]);

  const loadChunks = async (documentId: string) => {
    setIsLoading(true);
    try {
      // 문서 정보 가져오기
      const document = await firestoreService.getDocumentById(documentId);
      if (document) {
        setDocumentTitle(document.title);
      }
      
      // 청크 로드
      const chunks = await firestoreService.getChunksByDocument(documentId);
      setChunks(chunks);
      
      console.log(`✅ 소스 뷰어: ${chunks.length}개 청크 로드 완료`);
    } catch (error) {
      console.error('청크 로드 실패:', error);
      setChunks([]);
      setDocumentTitle('');
    } finally {
      setIsLoading(false);
    }
  };

  // 하이라이트된 청크로 스크롤 및 페이지 이동
  useEffect(() => {
    if (highlightedChunkId && chunks.length > 0) {
      // 하이라이트된 청크의 인덱스 찾기
      const chunkIndex = chunks.findIndex(chunk => chunk.id === highlightedChunkId);
      
      if (chunkIndex !== -1) {
        // 해당 청크가 있는 페이지로 이동
        const targetPage = Math.floor(chunkIndex / chunksPerPage) + 1;
        if (targetPage !== currentPage) {
          setCurrentPage(targetPage);
        }
        
        // 페이지 이동 후 하이라이트
        setTimeout(() => {
          const element = document.getElementById(`chunk-${highlightedChunkId}`);
          if (element) {
            // 기존 타이머 정리
            if (highlightTimeoutRef.current) {
              clearTimeout(highlightTimeoutRef.current);
            }
            
            // ✅ highlight-animation 클래스 추가
            element.classList.add('highlight-animation');
            
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            // 하이라이트 효과 (2초 후 제거)
            highlightTimeoutRef.current = setTimeout(() => {
              element.classList.remove('highlight-animation');
            }, 2000);
          }
        }, 100);
      }
    }
  }, [highlightedChunkId, chunks.length]);

  const handleChunkClick = (chunkId: string) => {
    if (onChunkSelect) {
      onChunkSelect(chunkId);
    }
  };

  if (!selectedDocumentId) {
    return (
      <div className="h-full flex items-center justify-center bg-brand-surface">
        <div className="text-center text-brand-text-secondary p-8">
          <svg className="w-16 h-16 mx-auto mb-4 text-brand-text-secondary opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-sm">좌측 소스를 선택하거나 답변의 참조 번호를 클릭하세요</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-brand-surface">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-brand-secondary border-t-brand-primary rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm text-brand-text-secondary">문서를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-brand-surface">
      {/* 헤더 - 고정 */}
      <div className="bg-brand-surface border-b border-brand-secondary px-4 py-3 flex-shrink-0">
        <h2 className="text-lg font-semibold text-brand-text-primary truncate">{documentTitle}</h2>
        <div className="flex items-center justify-between mt-1">
          <p className="text-xs text-brand-text-secondary">
            총 {chunks.length}개 청크
          </p>
          {chunks.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={handlePreviousPage}
                disabled={currentPage === 1}
                className="p-1 rounded hover:bg-brand-secondary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="이전 페이지"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <span className="text-xs text-brand-text-secondary">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={handleNextPage}
                disabled={currentPage === totalPages}
                className="p-1 rounded hover:bg-brand-secondary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="다음 페이지"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 청크 목록 - 스크롤 가능 */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          {getPaginatedChunks().map((chunk, index) => {
          const isHighlighted = highlightedChunkId === chunk.id;
          
          return (
            <div
              key={chunk.id}
              id={`chunk-${chunk.id}`}
              className={`p-4 rounded-lg border transition-all duration-200 cursor-pointer ${
                isHighlighted
                  ? 'border-yellow-400 bg-yellow-50 highlight-animation shadow-md'
                  : 'border-brand-secondary bg-brand-surface hover:border-brand-primary hover:shadow-sm'
              }`}
              onClick={() => handleChunkClick(chunk.id)}
            >
              {/* 메타데이터 */}
              <div className="flex items-center gap-2 text-xs text-brand-text-secondary mb-2">
                {chunk.metadata.page && (
                  <span className="inline-flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    페이지 {chunk.metadata.page}
                  </span>
                )}
                {chunk.metadata.section && (
                  <span className="inline-flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    {chunk.metadata.section}
                  </span>
                )}
                {chunk.metadata.position && (
                  <span className="ml-auto text-brand-text-secondary opacity-70">#{chunk.metadata.position}</span>
                )}
              </div>

              {/* 청크 내용 */}
              <div className="text-sm text-brand-text-primary leading-relaxed whitespace-pre-wrap">
                {chunk.content}
              </div>

              {/* 키워드 */}
              {chunk.keywords && chunk.keywords.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {chunk.keywords.slice(0, 5).map((keyword, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 bg-brand-secondary text-brand-text-secondary text-xs rounded"
                    >
                      {keyword}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        </div>
      </div>
    </div>
  );
};

