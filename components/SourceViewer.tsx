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
  const firestoreService = FirestoreService.getInstance();
  const highlightTimeoutRef = useRef<NodeJS.Timeout>();

  // 선택된 문서의 청크 로드
  useEffect(() => {
    if (selectedDocumentId) {
      loadChunks(selectedDocumentId);
    } else {
      setChunks([]);
      setDocumentTitle('');
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

  // 하이라이트된 청크로 스크롤
  useEffect(() => {
    if (highlightedChunkId && chunks.length > 0) {
      const element = document.getElementById(`chunk-${highlightedChunkId}`);
      if (element) {
        // 기존 타이머 정리
        if (highlightTimeoutRef.current) {
          clearTimeout(highlightTimeoutRef.current);
        }
        
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // 하이라이트 효과 (2초 후 제거)
        highlightTimeoutRef.current = setTimeout(() => {
          element.classList.remove('highlight-animation');
        }, 2000);
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
      <div className="h-full flex items-center justify-center bg-white">
        <div className="text-center text-gray-500 p-8">
          <svg className="w-16 h-16 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-sm">좌측 소스를 선택하거나 답변의 참조 번호를 클릭하세요</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm text-gray-600">문서를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white">
      {/* 헤더 */}
      <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 z-10">
        <h2 className="text-lg font-semibold text-gray-800 truncate">{documentTitle}</h2>
        <p className="text-xs text-gray-500 mt-1">
          총 {chunks.length}개 청크
        </p>
      </div>

      {/* 청크 목록 */}
      <div className="p-4 space-y-4">
        {chunks.map((chunk, index) => {
          const isHighlighted = highlightedChunkId === chunk.id;
          
          return (
            <div
              key={chunk.id}
              id={`chunk-${chunk.id}`}
              className={`p-4 rounded-lg border transition-all duration-200 cursor-pointer ${
                isHighlighted
                  ? 'border-yellow-400 bg-yellow-50 highlight-animation shadow-md'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
              }`}
              onClick={() => handleChunkClick(chunk.id)}
            >
              {/* 메타데이터 */}
              <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
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
                  <span className="ml-auto text-gray-400">#{chunk.metadata.position}</span>
                )}
              </div>

              {/* 청크 내용 */}
              <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                {chunk.content}
              </div>

              {/* 키워드 */}
              {chunk.keywords && chunk.keywords.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {chunk.keywords.slice(0, 5).map((keyword, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded"
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
  );
};

