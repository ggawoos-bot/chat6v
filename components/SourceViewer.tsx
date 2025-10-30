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
  const [maxPdfPage, setMaxPdfPage] = useState<number>(0);
  const [documentTotalPages, setDocumentTotalPages] = useState<number>(0); // ✅ 추가: 문서의 실제 총 페이지 수
  const [document, setDocument] = useState<PDFDocument | null>(null); // ✅ 추가: 문서 정보
  const [searchText, setSearchText] = useState<string>('');
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const firestoreService = FirestoreService.getInstance();
  const highlightTimeoutRef = useRef<NodeJS.Timeout>();
  const suppressObserverRef = useRef<boolean>(false); // 버튼 클릭 등 프로그램적 이동 시 관찰 억제
  const scrollContainerRef = useRef<HTMLDivElement>(null); // ✅ 텍스트 뷰 스크롤 컨테이너 ref
  const chunkRefs = useRef<{ [key: string]: HTMLDivElement | null }>({}); // ✅ 청크 요소 ref 저장
  const wheelCooldownRef = useRef<boolean>(false); // 휠로 페이지 이동 쿨다운
  
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
    // ✅ PDF 페이지 번호 기준으로 청크 가져오기
    // pdfCurrentPage는 1부터 시작, 실제 PDF 페이지 번호로 변환
    const targetPageNumber = pdfCurrentPage;
    
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

  // 텍스트에서 검색어를 하이라이트 처리하는 함수
  const highlightSearchTerm = (text: string, searchTerm: string) => {
    if (!searchTerm || !text) return text;

    // 원본 검색어 사용 (대소문자 구분 안 함)
    const escapedSearchTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedSearchTerm})`, 'gi');
    const parts = text.split(regex);

    return parts.map((part, index) => {
      // 각 부분이 검색어와 일치하는지 확인 (대소문자 무시)
      const isMatch = part.toLowerCase() === searchTerm.toLowerCase();
      return isMatch ? (
        <span key={index} className="search-highlight bg-yellow-200 text-yellow-900 font-medium px-0.5 rounded">
          {part}
        </span>
      ) : (
        part
      );
    });
  };

  // 간단 검색: 텍스트 포함 청크를 찾아 해당 페이지로 이동 후 스크롤
  const handleSearchSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = (searchText || '').trim().toLowerCase();
    if (!query || chunks.length === 0) return;
    try {
      setIsSearching(true);
      // 가장 먼저 매칭되는 청크 찾기
      const match = chunks.find((c) => (c.content || '').toLowerCase().includes(query));
      if (match) {
        // chunksByPage를 사용하여 실제 페이지 번호 찾기
        let targetPage = 1;
        for (const [pageNum, pageChunks] of Object.entries(chunksByPage)) {
          if (pageChunks.some(c => c.id === match.id)) {
            targetPage = parseInt(pageNum);
            break;
          }
        }
        
        if (onPdfPageChange) onPdfPageChange(targetPage);
        // 페이지 상태 반영 이후 해당 청크로 스크롤
        setTimeout(() => {
          const el = window.document.getElementById(`chunk-${match.id}`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // 하이라이트 효과 추가
            el.classList.add('highlight-animation');
            setTimeout(() => {
              el.classList.remove('highlight-animation');
            }, 2000);
          }
        }, 300); // 페이지 변경 반영 시간 증가
      }
    } finally {
      setIsSearching(false);
    }
  };
  
  // 페이지 변경 함수 (pdfCurrentPage 사용)
  // 대상 페이지의 첫 번째 청크로 스크롤
  const scrollToPageFirstChunk = (page: number) => {
    const pageChunks = chunksByPage[page] || [];
    const firstChunk = pageChunks[0];
    if (firstChunk) {
      const el = window.document.getElementById(`chunk-${firstChunk.id}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  };

  // 현재/목표 방향 기준으로 청크가 존재하는 가장 가까운 페이지 찾기
  const findNearestPageWithChunks = (startPage: number, direction: 'prev' | 'next'): number => {
    if (chunksByPage[startPage] && chunksByPage[startPage].length > 0) return startPage;
    if (direction === 'next') {
      for (let p = startPage + 1; p <= totalPages; p++) {
        if (chunksByPage[p] && chunksByPage[p].length > 0) return p;
      }
    } else {
      for (let p = startPage - 1; p >= 1; p--) {
        if (chunksByPage[p] && chunksByPage[p].length > 0) return p;
      }
    }
    return startPage; // fallback
  };

  const handlePreviousPage = () => {
    if (!onPdfPageChange) return;
    const requested = Math.max(1, pdfCurrentPage - 1);
    const target = findNearestPageWithChunks(requested, 'prev');
    if (target === pdfCurrentPage) return;
    console.log('⏪ prev click: from', pdfCurrentPage, '->', target);
    suppressObserverRef.current = true;
    onPdfPageChange(target);
    // 프로그램적 이동 즉시 해당 페이지 첫 청크로 스크롤
    setTimeout(() => scrollToPageFirstChunk(target), 0);
    // 스크롤 반영 시간이 지나면 관찰 재개
    setTimeout(() => {
      suppressObserverRef.current = false;
    }, 400);
  };
  
  const handleNextPage = () => {
    if (!onPdfPageChange) return;
    const requested = Math.min(totalPages, pdfCurrentPage + 1);
    const target = findNearestPageWithChunks(requested, 'next');
    if (target === pdfCurrentPage) return;
    console.log('⏩ next click: from', pdfCurrentPage, '->', target);
    suppressObserverRef.current = true;
    onPdfPageChange(target);
    // 프로그램적 이동 즉시 해당 페이지 첫 청크로 스크롤
    setTimeout(() => scrollToPageFirstChunk(target), 0);
    // 스크롤 반영 시간이 지나면 관찰 재개
    setTimeout(() => {
      suppressObserverRef.current = false;
    }, 400);
  };

  // 문서 영역 휠 스크롤 핸들러: 상/하단에서 추가 휠 시 페이지 이동
  const handleWheelInScrollArea: React.WheelEventHandler<HTMLDivElement> = (e) => {
    if (pdfViewerMode !== 'text') return; // 텍스트 모드에서만 처리
    const container = scrollContainerRef.current;
    if (!container || !onPdfPageChange) return;

    const atTop = container.scrollTop <= 0;
    const atBottom = Math.ceil(container.scrollTop + container.clientHeight) >= container.scrollHeight;

    // 과도한 연속 페이지 이동 방지
    if (wheelCooldownRef.current) return;

    if (e.deltaY < 0 && atTop && pdfCurrentPage > 1) {
      wheelCooldownRef.current = true;
      handlePreviousPage();
      setTimeout(() => { wheelCooldownRef.current = false; }, 300);
    } else if (e.deltaY > 0 && atBottom && pdfCurrentPage < totalPages) {
      wheelCooldownRef.current = true;
      handleNextPage();
      setTimeout(() => { wheelCooldownRef.current = false; }, 300);
    }
  };

  // 선택된 문서의 청크 로드
  useEffect(() => {
    if (selectedDocumentId) {
      // 새 문서 선택 시 첫 페이지로 리셋 (pdfCurrentPage는 App.tsx에서 관리)
      if (onPdfPageChange) {
        onPdfPageChange(1);
      }
      loadChunks(selectedDocumentId);
    } else {
      setChunks([]);
      setDocumentTitle('');
    }
    // onPdfPageChange는 부모에서 매 렌더마다 새로운 함수 참조가 전달될 수 있으므로
    // 의존성에서 제외하여 불필요한 반복 로드를 방지한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      // 하이라이트된 청크 찾기
      const highlightedChunk = chunks.find(chunk => chunk.id === highlightedChunkId);
      
      if (highlightedChunk) {
        // 청크의 페이지 번호로 pdfCurrentPage 업데이트
        for (const [pageNum, pageChunks] of Object.entries(chunksByPage)) {
          if (pageChunks.some(c => c.id === highlightedChunkId)) {
            const actualPage = parseInt(pageNum);
            if (actualPage !== pdfCurrentPage && onPdfPageChange) {
              onPdfPageChange(actualPage);
            }
            break;
          }
        }
        
        // 페이지 이동 후 하이라이트
        setTimeout(() => {
          const element = window.document.getElementById(`chunk-${highlightedChunkId}`);
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
  }, [highlightedChunkId, chunks, chunksByPage, pdfCurrentPage, onPdfPageChange]);

  const handleChunkClick = (chunkId: string) => {
    if (onChunkSelect) {
      onChunkSelect(chunkId);
    }
  };

  // ✅ IntersectionObserver를 사용하여 텍스트 뷰 스크롤 시 페이지 감지 및 동기화
  useEffect(() => {
    // PDF 뷰어 모드이거나, 페이지 변경 콜백이 없거나, 청크가 없거나, 스크롤 컨테이너가 없으면 관찰하지 않음
    if (pdfViewerMode === 'pdf' || !onPdfPageChange || chunks.length === 0 || !scrollContainerRef.current) {
      return;
    }

    let timeoutId: NodeJS.Timeout | null = null;

    const observer = new IntersectionObserver(
      (entries) => {
        if (suppressObserverRef.current) {
          // 프로그램적 이동 중에는 관찰 반영 안 함
          return;
        }
        let mostVisibleChunk: PDFChunk | null = null;
        let maxVisibilityRatio = 0;

        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio > maxVisibilityRatio) {
            const chunkId = entry.target.id.replace('chunk-', '');
            const chunk = chunks.find((c) => c.id === chunkId);
            if (chunk) {
              mostVisibleChunk = chunk;
              maxVisibilityRatio = entry.intersectionRatio;
            }
          }
        });

        // 가장 많이 보이는 청크의 페이지 번호로 pdfCurrentPage 업데이트
        if (mostVisibleChunk) {
          for (const [pageNum, pageChunks] of Object.entries(chunksByPage)) {
            if (pageChunks.some(c => c.id === mostVisibleChunk!.id)) {
              const actualPage = parseInt(pageNum);
              // 현재 페이지와 다를 때만 업데이트
              if (actualPage !== pdfCurrentPage) {
                // 디바운싱을 적용하여 스크롤 중 과도한 상태 업데이트 방지
                if (timeoutId) clearTimeout(timeoutId);
                timeoutId = setTimeout(() => {
                  onPdfPageChange(actualPage);
                  console.log(`🔄 Text view scrolled to page: ${actualPage}`);
                }, 100); // 100ms 디바운스
              }
              break;
            }
          }
        }
      },
      {
        root: scrollContainerRef.current, // 스크롤 컨테이너를 root로 지정
        rootMargin: '0px',
        threshold: 0.5, // 청크의 50% 이상이 보일 때 감지
      }
    );

    // 모든 청크 요소에 대해 관찰 시작 (렌더링 완료 후)
    const observeChunks = () => {
      Object.values(chunkRefs.current).forEach((el) => {
        if (el) observer.observe(el);
      });
    };
    
    // 렌더링 완료를 기다린 후 관찰 시작
    requestAnimationFrame(() => {
      setTimeout(observeChunks, 0);
    });

    // 컴포넌트 언마운트 시 또는 의존성 변경 시 observer 정리
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      observer.disconnect();
    };
  }, [chunks, chunksByPage, onPdfPageChange, pdfViewerMode, pdfCurrentPage]);

  // ✅ PDF 뷰어 페이지 변경 시 텍스트 뷰 해당 페이지로 스크롤
  useEffect(() => {
    if (pdfViewerMode === 'text' && pdfCurrentPage > 0 && chunks.length > 0) {
      // 해당 페이지의 첫 번째 청크로 프로그램적 스크롤 → 관찰 일시 중단
      const pageChunks = chunksByPage[pdfCurrentPage] || [];
      if (pageChunks.length > 0) {
        const firstChunk = pageChunks[0];
        suppressObserverRef.current = true;
        setTimeout(() => {
          const element = window.document.getElementById(`chunk-${firstChunk.id}`);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
            console.log(`📄 Scrolled to page ${pdfCurrentPage}, chunk: ${firstChunk.id}`);
          }
          // 스크롤 반영 시간 이후 관찰 재개
          setTimeout(() => { suppressObserverRef.current = false; }, 300);
        }, 50);
      }
    }
  }, [pdfCurrentPage, pdfViewerMode, chunksByPage, chunks.length]);

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
      <div className="bg-brand-surface border-b border-brand-secondary px-4 py-3 flex-shrink-0 sticky top-0 z-30">
        <div className="flex items-center justify-between mb-2 gap-2">
          <h2 className="text-lg font-semibold text-brand-text-primary truncate max-w-[60%]">{documentTitle}</h2>
          <div className="flex items-center gap-2 flex-nowrap">
            {/* 컨텍스트 모드 표시 */}
            {highlightedChunkId && getPaginatedChunks().length > 0 && (
              <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs whitespace-nowrap">
                컨텍스트 모드 • {getPaginatedChunks().length}개 항목 표시 중
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          {/* 검색 입력 */}
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 flex-1 min-w-0">
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSearchSubmit();
                }
              }}
              placeholder="현재 문서에서 검색..."
              className="flex-1 min-w-0 px-3 py-1.5 rounded border border-brand-secondary bg-brand-bg text-sm text-brand-text-primary focus:outline-none focus:border-brand-primary"
            />
            <button
              type="submit"
              disabled={isSearching || !searchText.trim()}
              className="px-3 py-1.5 bg-brand-primary text-white text-xs rounded disabled:opacity-50"
              title="검색"
            >
              {isSearching ? '검색중' : '검색'}
            </button>
          </form>

          {/* 페이지 이동 */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={handlePreviousPage}
              disabled={pdfCurrentPage <= 1}
              className="p-1 rounded hover:bg-brand-secondary disabled:opacity-50"
              title="이전 페이지"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <input
              type="number"
              min={1}
              max={Math.max(1, totalPages)}
              value={Math.max(1, pdfCurrentPage)}
              onChange={(e) => {
                const v = parseInt(e.target.value || '1', 10);
                if (onPdfPageChange) onPdfPageChange(Math.min(Math.max(1, v), Math.max(1, totalPages)));
              }}
              className="w-16 px-2 py-1 rounded border border-brand-secondary bg-brand-bg text-center text-xs text-brand-text-primary"
            />
            <span className="text-xs text-brand-text-secondary px-1">/ {Math.max(1, totalPages)}</span>
            <button
              onClick={handleNextPage}
              disabled={pdfCurrentPage >= totalPages}
              className="p-1 rounded hover:bg-brand-secondary disabled:opacity-50"
              title="다음 페이지"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>

            {highlightedChunkId && onChunkSelect && (
              <button
                onClick={() => onChunkSelect && onChunkSelect('')}
                className="ml-2 px-3 py-1 bg-brand-primary text-white text-xs rounded hover:bg-blue-600"
              >
                전체 문서
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 컨텐츠 영역 - 고정 높이 700px, 스크롤 포함 (텍스트 전용) */}
      <div className="min-h-0 overflow-hidden">
        {/* 텍스트 뷰 (청크 목록) */}
        <div className="relative h-[700px]">
          <div
            ref={scrollContainerRef}
            onWheel={handleWheelInScrollArea}
            className="h-full overflow-y-auto p-4"
          >
              <div className="space-y-4">
              {getPaginatedChunks().map((chunk, index) => {
              const isHighlighted = highlightedChunkId === chunk.id;
              
              return (
                <div
                  key={chunk.id}
                  id={`chunk-${chunk.id}`}
                  ref={(el) => (chunkRefs.current[chunk.id] = el)} // ✅ ref 할당
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
                    {searchText.trim() ? highlightSearchTerm(chunk.content, searchText.trim()) : chunk.content}
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
        </div>
      </div>
    </div>
  );
};

