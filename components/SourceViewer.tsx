import React, { useState, useEffect, useRef, useMemo } from 'react';
import { FirestoreService, PDFChunk, PDFDocument } from '../services/firestoreService';
import EmbedPdfViewer from './EmbedPdfViewer';

interface SourceViewerProps {
  selectedDocumentId?: string;
  highlightedChunkId?: string;
  onChunkSelect?: (chunkId: string) => void;
  pdfViewerMode?: 'text' | 'pdf';
  pdfCurrentPage?: number;
  pdfFilename?: string;
  onPdfPageChange?: (page: number) => void;
  onViewModeChange?: (mode: 'text' | 'pdf') => void;
}

export const SourceViewer: React.FC<SourceViewerProps> = ({
  selectedDocumentId,
  highlightedChunkId,
  onChunkSelect,
  pdfViewerMode = 'text',
  pdfCurrentPage = 1,
  pdfFilename = '',
  onPdfPageChange,
  onViewModeChange
}) => {
  const [chunks, setChunks] = useState<PDFChunk[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [documentTitle, setDocumentTitle] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [maxPdfPage, setMaxPdfPage] = useState<number>(0);
  const [documentTotalPages, setDocumentTotalPages] = useState<number>(0); // ✅ 추가: 문서의 실제 총 페이지 수
  const [document, setDocument] = useState<PDFDocument | null>(null); // ✅ 추가: 문서 정보
  const firestoreService = FirestoreService.getInstance();
  const highlightTimeoutRef = useRef<NodeJS.Timeout>();
  
  // ✅ PDF 페이지 번호로 그룹화
  const chunksByPage = React.useMemo(() => {
    const grouped: Record<number, PDFChunk[]> = {};
    
    // ✅ 모든 청크의 page가 0이거나 없는지 확인
    const allPagesZero = chunks.length > 0 && chunks.every(c => !c.metadata?.page || c.metadata.page === 0);
    
    chunks.forEach((chunk, index) => {
      let pageNum;
      
      // ✅ page 정보가 없으면 실제 PDF 페이지 번호를 추정
      if (allPagesZero) {
        // 문서의 실제 총 페이지 수가 있으면 청크를 균등 분배
        if (documentTotalPages > 0) {
          pageNum = Math.floor((index / chunks.length) * documentTotalPages) + 1;
          pageNum = Math.min(pageNum, documentTotalPages); // 최대 페이지 수 제한
        } else {
          // 문서 총 페이지 수가 없으면 기본 3개 청크 = 1페이지
          const chunksPerPage = 3;
          pageNum = Math.floor(index / chunksPerPage) + 1;
        }
      } else {
        pageNum = chunk.metadata?.page || 0;
      }
      
      if (!grouped[pageNum]) {
        grouped[pageNum] = [];
      }
      grouped[pageNum].push(chunk);
    });
    
    return grouped;
  }, [chunks, documentTotalPages]);

  // ✅ maxPdfPage 상태 업데이트 (useEffect로 분리하여 Side Effect 제거)
  React.useEffect(() => {
    const pages = Object.keys(chunksByPage).map(Number);
    const maxPage = pages.length > 0 ? Math.max(...pages) : 0;
    if (maxPage > 0) {
      setMaxPdfPage(maxPage);
    } else if (documentTotalPages > 0) {
      // documentTotalPages가 있으면 그것을 사용
      setMaxPdfPage(documentTotalPages);
    }
  }, [chunksByPage, documentTotalPages]);

  // ✅ PDF 페이지 번호 배열
  const pdfPageNumbers = React.useMemo(() => {
    return Object.keys(chunksByPage)
      .map(Number)
      .sort((a, b) => a - b);
  }, [chunksByPage]);

  // ✅ 전체 페이지 수는 문서의 실제 총 페이지 수를 우선 사용
  const totalPages = documentTotalPages > 0 ? documentTotalPages : (maxPdfPage || pdfPageNumbers.length);
  
  // ✅ PDF URL 생성 (파일명 URL 인코딩)
  const pdfUrl = useMemo(() => {
    const filename = pdfFilename || document?.filename || '';
    if (!filename) return '';
    const encodedFilename = encodeURIComponent(filename);
    return `/chat6v/pdf/${encodedFilename}`;
  }, [pdfFilename, document?.filename]);
  
  // 현재 페이지의 청크 추출
  const getPaginatedChunks = () => {
    // 하이라이트된 청크가 있으면 주변 컨텍스트 포함 (임팩트 존 전략)
    if (highlightedChunkId && chunks.length > 0) {
      const highlightedIndex = chunks.findIndex(chunk => chunk.id === highlightedChunkId);
      
      if (highlightedIndex !== -1) {
        // 핵심 청크 ±2개 (총 5개 청크)
        const contextSize = 2;
        const start = Math.max(0, highlightedIndex - contextSize);
        const end = Math.min(chunks.length, highlightedIndex + contextSize + 1);
        
        return chunks.slice(start, end);
      }
    }
    
    // ✅ PDF 페이지 번호 기준으로 청크 가져오기
    // currentPage는 1부터 시작, 실제 PDF 페이지 번호로 변환
    const targetPageNumber = currentPage;
    
    // chunksByPage에서 해당 페이지의 청크를 가져옴
    // 페이지에 청크가 없으면 빈 배열 반환
    return chunksByPage[targetPageNumber] || [];
  };
  
  // 주변 페이지 정보 가져오기 (미리보기용)
  const getContextualPages = () => {
    if (!highlightedChunkId || chunks.length === 0) return null;
    
    const highlightedIndex = chunks.findIndex(chunk => chunk.id === highlightedChunkId);
    if (highlightedIndex === -1) return null;
    
    const highlightedChunk = chunks[highlightedIndex];
    const pageNumber = highlightedChunk.metadata.page;
    
    if (!pageNumber) return null;
    
    // 이전 페이지와 다음 페이지 찾기
    const previousPageChunks = chunks
      .filter(chunk => chunk.metadata.page === pageNumber - 1)
      .slice(0, 1); // 각 페이지에서 첫 번째 청크만
    
    const nextPageChunks = chunks
      .filter(chunk => chunk.metadata.page === pageNumber + 1)
      .slice(0, 1);
    
    return {
      previous: previousPageChunks,
      next: nextPageChunks
    };
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
        setDocument(document); // ✅ 문서 정보 저장
        setDocumentTitle(document.title);
        setDocumentTotalPages(document.totalPages || 0); // ✅ 문서의 실제 총 페이지 수 설정
        console.log(`📄 문서 정보: ${document.title}, 총 페이지: ${document.totalPages}`);
      }
      
      // 청크 로드
      const chunks = await firestoreService.getChunksByDocument(documentId);
      setChunks(chunks);
      
      // 디버그: 청크 페이지 정보 분석
      const pageStats: Record<number, number> = {};
      let maxPage = 0;
      chunks.forEach(chunk => {
        const pageNum = chunk.metadata?.page || 0;
        pageStats[pageNum] = (pageStats[pageNum] || 0) + 1;
        if (pageNum > maxPage) maxPage = pageNum;
      });
      
      const pageNumbers = Object.keys(pageStats).map(Number).sort((a, b) => a - b);
      const allPagesZero = chunks.every(c => !c.metadata?.page || c.metadata.page === 0);
      
      console.log(`✅ 소스 뷰어: ${chunks.length}개 청크 로드 완료`);
      console.log(`📄 PDF 최대 페이지: ${maxPage}`);
      console.log(`📋 청크가 있는 페이지: ${pageNumbers.length}개 (${pageNumbers.slice(0, 10).join(', ')}${pageNumbers.length > 10 ? '...' : ''})`);
      console.log(`🔍 모든 청크의 page가 0: ${allPagesZero}`);
      
      if (allPagesZero) {
        if (documentTotalPages > 0) {
          console.log(`📝 실제 PDF 페이지 기반 분배: ${documentTotalPages}페이지에 청크 ${chunks.length}개 균등 분배`);
        } else {
          const estimatedPages = Math.ceil(chunks.length / 3);
          console.log(`📝 기본 페이지 추정: ${estimatedPages}페이지 (청크 ${chunks.length}개 ÷ 3)`);
        }
      }
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
        // 하이라이트가 설정되면 페이지를 1로 리셋 (같은 페이지의 모든 청크 표시)
        setCurrentPage(1);
        
        // 페이지 이동 후 하이라이트
        setTimeout(() => {
          const element = (document as any).getElementById(`chunk-${highlightedChunkId}`);
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
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold text-brand-text-primary truncate">{documentTitle}</h2>
          <div className="flex items-center gap-2">
            {/* 컨텍스트 모드 표시 */}
            {highlightedChunkId && getPaginatedChunks().length > 0 && (
              <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs whitespace-nowrap">
                컨텍스트 모드 • {getPaginatedChunks().length}개 항목 표시 중
              </span>
            )}
            
            {/* 뷰 모드 전환 버튼 */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => onViewModeChange?.('text')}
                className={`px-2 py-1 rounded text-xs transition-colors ${
                  pdfViewerMode === 'text' 
                    ? 'bg-blue-500 text-white' 
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
                title="텍스트 보기"
              >
                텍스트
              </button>
              <button
                onClick={() => {
                  console.log('📄 PDF 버튼 클릭됨, 현재 모드:', pdfViewerMode);
                  console.log('📄 PDF URL:', pdfUrl);
                  console.log('📄 PDF 파일명:', pdfFilename || document?.filename);
                  onViewModeChange?.('pdf');
                }}
                className={`px-2 py-1 rounded text-xs transition-colors ${
                  pdfViewerMode === 'pdf' 
                    ? 'bg-blue-500 text-white' 
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
                title="PDF 보기"
              >
                PDF
              </button>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-xs text-brand-text-secondary">
            {maxPdfPage > 0 && currentPage > 0 ? (
              <>PDF {currentPage}페이지 (청크 {getPaginatedChunks().length}개)</>
            ) : (
              <>총 {chunks.length}개 청크</>
            )}
          </p>
          <div className="flex items-center gap-2">
            {highlightedChunkId && onChunkSelect && (
              <button
                onClick={() => {
                  // 전체 문서 모드로 전환 (하이라이트 해제)
                  if (onChunkSelect) {
                    onChunkSelect('');
                  }
                }}
                className="px-3 py-1 bg-brand-primary text-white text-xs rounded hover:bg-blue-600 transition-colors"
              >
                전체 문서 보기
              </button>
            )}
            {chunks.length > 0 && !highlightedChunkId && (
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
      </div>

      {/* 컨텐츠 영역 - PDF 뷰어 또는 텍스트 뷰 */}
      <div className="flex-1 overflow-hidden">
        {pdfViewerMode === 'pdf' ? (
          // EmbedPDF 뷰어
          <EmbedPdfViewer
            pdfUrl={pdfUrl}
            currentPage={pdfCurrentPage}
            onPageChange={(page) => {
              onPdfPageChange?.(page);
            }}
            onDocumentLoad={(totalPages) => {
              console.log(`📄 EmbedPDF 로드 완료: ${totalPages}페이지`);
            }}
            onError={(error) => {
              console.error('EmbedPDF 뷰어 오류:', error);
            }}
          />
        ) : (
          // 텍스트 뷰 (기존 청크 목록)
          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-4">
              {getPaginatedChunks().map((chunk, index) => {
              const isHighlighted = highlightedChunkId === chunk.id;
              
              return (
                <div
                  key={chunk.id}
                  id={`chunk-${chunk.id}`}
                  className={`p-4 rounded-lg border-2 transition-all duration-200 cursor-pointer ${
                    isHighlighted
                      ? 'border-yellow-600 bg-yellow-200 text-gray-900 font-medium highlight-animation shadow-xl'
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
            
            {/* 주변 페이지 미리보기 */}
            {getContextualPages() && getContextualPages() && (
              <div className="border-t border-brand-secondary mt-6 pt-4">
                <p className="text-xs text-brand-text-secondary mb-2 px-2">
                  주변 페이지 힌트
                </p>
                <div className="space-y-2 overflow-y-auto max-h-40">
                  {getContextualPages()?.previous && getContextualPages()!.previous.length > 0 && (
                    <div className="bg-brand-secondary rounded p-2">
                      <div className="text-xs text-brand-text-secondary font-semibold mb-1">
                        ← 이전 페이지 ({getContextualPages()!.previous[0].metadata.page}페이지)
                      </div>
                      <div className="text-xs text-brand-text-primary line-clamp-2">
                        {getContextualPages()!.previous[0].content.substring(0, 150)}...
                      </div>
                    </div>
                  )}
                  {getContextualPages()?.next && getContextualPages()!.next.length > 0 && (
                    <div className="bg-brand-secondary rounded p-2">
                      <div className="text-xs text-brand-text-secondary font-semibold mb-1">
                        다음 페이지 → ({getContextualPages()!.next[0].metadata.page}페이지)
                      </div>
                      <div className="text-xs text-brand-text-primary line-clamp-2">
                        {getContextualPages()!.next[0].content.substring(0, 150)}...
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

