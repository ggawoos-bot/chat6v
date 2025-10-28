import React, { useState, useEffect } from 'react';
import ChatWindow from './components/ChatWindow';
import SourceInfo from './components/SourceInfo';
import CompressionStats from './components/CompressionStats';
import ConfirmDialog from './components/ConfirmDialog';
import { FirestoreCacheManager } from './components/FirestoreCacheManager';
import { AdvancedSearchTest } from './components/AdvancedSearchTest';
import { SourceViewer } from './components/SourceViewer';
import { geminiService } from './services/geminiService';
import { FirestoreService } from './services/firestoreService';
import { SourceInfo as SourceInfoType } from './types';

function App() {
  const [sources, setSources] = useState<SourceInfoType[]>([]);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showCompressionStats, setShowCompressionStats] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showAdvancedSearchTest, setShowAdvancedSearchTest] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const [chatKey, setChatKey] = useState(0); // ChatWindow 리렌더링을 위한 키
  
  // ✅ SourceViewer 상태 관리
  const [selectedDocumentId, setSelectedDocumentId] = useState<string>();
  const [highlightedChunkId, setHighlightedChunkId] = useState<string>();
  
  // ✅ 사이드바 리사이징 관련 상태
  const [sidebarWidth, setSidebarWidth] = useState<number>(320); // 기본값: 320px (w-80)
  const [isResizing, setIsResizing] = useState(false);
  const [originalSidebarWidth, setOriginalSidebarWidth] = useState<number>(320); // 원래 사이드바 너비 저장
  
  // ✅ 리사이즈 핸들러들
  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    const handleResize = (e: MouseEvent) => {
      if (!isResizing) return;
      
      // 최소 너비: 200px, 최대 너비: 800px
      const newWidth = Math.min(Math.max(200, e.clientX), 800);
      setSidebarWidth(newWidth);
    };

    const handleResizeEnd = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleResize);
      document.addEventListener('mouseup', handleResizeEnd);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleResize);
      document.removeEventListener('mouseup', handleResizeEnd);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);

  // ✅ 소스뷰어 표시/숨김 시 사이드바 너비 자동 조정
  useEffect(() => {
    if (selectedDocumentId) {
      // 소스뷰어가 표시될 때: 현재 너비를 원래 너비로 저장하고 2배로 확장
      const currentWidth = sidebarWidth;
      setOriginalSidebarWidth(currentWidth);
      const expandedWidth = Math.min(currentWidth * 2, 1200); // 최대 1200px
      setSidebarWidth(expandedWidth);
    } else if (selectedDocumentId === undefined) {
      // 소스뷰어가 닫힐 때: 원래 너비로 복원
      setSidebarWidth(originalSidebarWidth);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDocumentId]);
  
  // ✅ 소스 클릭 핸들러
  const handleSourceClick = async (sourceId: string) => {
    console.log('🖱️ 소스 클릭됨, sourceId:', sourceId);
    
    // sourceId가 숫자만 있는 경우 (인덱스일 가능성)
    if (/^\d+$/.test(sourceId)) {
      console.warn('⚠️ sourceId가 숫자입니다. 이는 배열 인덱스일 수 있습니다.');
      console.log('📋 sources 배열:', sources);
      
      // 인덱스로 변환
      const index = parseInt(sourceId);
      if (sources && sources[index]) {
        const actualSourceId = sources[index].id;
        console.log('✅ 인덱스를 실제 sourceId로 변환:', actualSourceId);
        await handleSourceClick(actualSourceId);
        return;
      } else {
        console.error('❌ 유효하지 않은 인덱스:', index, 'sources 길이:', sources.length);
        return;
      }
    }
    
    try {
      // FirestoreService 인스턴스 가져오기
      const firestoreService = FirestoreService.getInstance();
      
      // Firestore에서 모든 문서 가져오기
      const allDocuments = await firestoreService.getAllDocuments();
      console.log('📚 전체 문서 목록:', allDocuments.map(d => ({ id: d.id, title: d.title, filename: d.filename })));
      
      // sourceId에서 파일명 추출 (예: "filename-page-section" 또는 "filename-section")
      const parts = sourceId.split('-');
      console.log('🔍 sourceId 파싱:', parts);
      
      // 가능한 모든 조합 시도
      let matchingDoc = null;
      
      // 방법 1: sourceId가 Firestore document ID와 일치하는 경우
      matchingDoc = allDocuments.find(doc => doc.id === sourceId);
      
      if (!matchingDoc) {
        // 방법 2: filename에 .pdf 추가
        matchingDoc = allDocuments.find(doc => 
          doc.filename === parts[0] + '.pdf' || 
          doc.filename === parts[0] ||
          doc.filename.startsWith(parts[0])
        );
      }
      
      if (!matchingDoc && parts.length > 1) {
        // 방법 3: 파일명에 하이픈이 포함된 경우
        const firstTwo = parts[0] + '-' + parts[1];
        matchingDoc = allDocuments.find(doc => 
          doc.filename.includes(firstTwo) || 
          doc.filename.startsWith(parts[0])
        );
      }
      
      if (matchingDoc) {
        setSelectedDocumentId(matchingDoc.id);
        console.log('✅ 소스 선택 완료:', matchingDoc.title, 'ID:', matchingDoc.id);
      } else {
        console.warn('❌ 문서를 찾을 수 없습니다. sourceId:', sourceId, '전체 문서:', allDocuments.map(d => d.filename));
      }
    } catch (error) {
      console.error('❌ 소스 클릭 오류:', error);
    }
  };

  // 앱 시작 시 PDF 소스 로드 (압축 기능 포함 + 진행률 표시)
  useEffect(() => {
    const initializeSources = async () => {
      try {
        console.log('Starting PDF initialization...');
        
        // PDF 내용을 압축하여 초기화 (비동기 처리)
        const initPromise = geminiService.initializeWithPdfSources();
        
        // 채팅 세션 생성 (PDF 초기화와 병렬 처리)
        const chatPromise = geminiService.createNotebookChatSession();
        
        // 두 작업을 병렬로 실행
        await Promise.all([initPromise, chatPromise]);
        
        // 소스 목록 업데이트
        setSources(geminiService.getSources());
        
        console.log('Initialization completed successfully');
        setIsInitializing(false);
      } catch (error) {
        console.error('Failed to initialize chat session:', error);
        // 초기화 실패 시에도 앱을 계속 실행
        console.warn('초기화에 실패했지만 앱을 계속 실행합니다.');
        setIsInitializing(false);
      }
    };

    // 초기화를 비동기로 실행하여 UI 블로킹 방지
    initializeSources();
  }, []);

  // ✅ 참조 클릭 이벤트 리스너
  useEffect(() => {
    const handleReferenceClick = (event: CustomEvent) => {
      console.log('📥 App.tsx에서 referenceClick 이벤트 수신:', event.detail);
      const { documentId, chunkId } = event.detail;
      console.log('📝 설정할 값:', { documentId, chunkId });
      
      // ✅ chatKey 변경 방지 (채팅창 초기화 방지)
      if (documentId && chunkId) {
        setSelectedDocumentId(documentId);
        setHighlightedChunkId(chunkId);
        console.log('✅ SourceViewer 상태 업데이트 완료');
      } else {
        console.warn('⚠️ documentId 또는 chunkId가 없음');
      }
    };

    window.addEventListener('referenceClick', handleReferenceClick as EventListener);
    return () => window.removeEventListener('referenceClick', handleReferenceClick as EventListener);
  }, []);

  const handleSendMessage = async (message: string): Promise<string> => {
    return await geminiService.generateResponse(message);
  };

  const handleStreamingMessage = async (message: string): Promise<AsyncGenerator<string, void, unknown>> => {
    return await geminiService.generateStreamingResponse(message);
  };


  const handleResetChat = () => {
    setShowResetConfirm(true);
  };

  const confirmReset = async () => {
    try {
      setShowResetConfirm(false);
      
      // 1. 현재 채팅 세션 초기화
      await geminiService.resetChatSession();
      
      // 2. 메시지 목록 초기화 (ChatWindow에서 관리하는 메시지들)
      setMessages([]);
      
      // 3. ChatWindow 강제 리렌더링을 위한 키 변경
      setChatKey(prev => prev + 1);
      
      // 4. 소스 목록을 다시 로드하여 최신 상태 유지
      await geminiService.initializeWithPdfSources();
      setSources(geminiService.getSources());
      
      console.log('새 대화가 시작되었습니다.');
    } catch (error) {
      console.error('Failed to reset chat session:', error);
    }
  };

  // ESC 키로 소스 뷰어 닫기
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedDocumentId) {
        setSelectedDocumentId(undefined);
        setHighlightedChunkId(undefined);
        console.log('ESC 키로 소스 뷰어 닫기');
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [selectedDocumentId]);

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-brand-bg text-brand-text-primary flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-4">
          <div className="relative mb-6">
            <div className="w-16 h-16 border-4 border-brand-secondary rounded-full mx-auto"></div>
            <div className="w-16 h-16 border-4 border-brand-primary border-t-transparent rounded-full animate-spin absolute top-0 left-1/2 transform -translate-x-1/2"></div>
          </div>
          <h2 className="text-2xl font-bold text-brand-text-primary mb-3">AI 사업문의 지원 Chatbot6v</h2>
          <p className="text-brand-text-secondary mb-4">문서를 준비하고 있습니다...</p>
          <div className="space-y-2 text-sm text-brand-text-secondary">
            <div className="flex items-center justify-center space-x-2">
              <div className="w-2 h-2 bg-brand-primary rounded-full animate-pulse"></div>
              <span>사전 처리된 데이터 로딩 중...</span>
            </div>
            <div className="flex items-center justify-center space-x-2">
              <div className="w-2 h-2 bg-brand-primary rounded-full animate-pulse" style={{animationDelay: '0.2s'}}></div>
              <span>PDF 문서 파싱 중 (폴백 모드)</span>
            </div>
            <div className="flex items-center justify-center space-x-2">
              <div className="w-2 h-2 bg-brand-primary rounded-full animate-pulse" style={{animationDelay: '0.4s'}}></div>
              <span>AI 모델 준비 중...</span>
            </div>
          </div>
          <div className="mt-6 text-xs text-brand-text-secondary">
            잠시만 기다려주세요. 첫 로딩은 시간이 걸릴 수 있습니다.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-bg text-brand-text-primary">
      <div className="max-w-7xl mx-auto h-screen flex flex-col">
        <header className="bg-brand-surface border-b border-brand-secondary p-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              {/* 모바일 메뉴 버튼 */}
              <button
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="md:hidden p-2 rounded-lg bg-brand-secondary hover:bg-opacity-80 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              
              <div>
                <h1 className="text-xl md:text-2xl font-bold text-brand-primary">
                  AI 사업문의 지원 Chatbot 6V
                </h1>
                <p className="text-brand-text-secondary text-xs md:text-sm mt-1">
                  금연사업 관련 문의사항을 AI가 도와드립니다
                </p>
              </div>
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={() => setShowAdvancedSearchTest(true)}
                className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
              >
                🧪 고급 검색 테스트
              </button>
              <button
                onClick={() => setShowCompressionStats(true)}
                className="px-3 py-2 bg-brand-secondary text-brand-text-primary rounded-lg hover:bg-opacity-80 transition-colors text-xs md:text-sm"
              >
                사용량 통계
              </button>
              <button
                onClick={handleResetChat}
                className="px-3 py-2 bg-brand-secondary text-brand-text-primary rounded-lg hover:bg-opacity-80 transition-colors text-xs md:text-sm"
              >
                새 대화 시작
              </button>
            </div>
          </div>
        </header>

        <div className="flex-1 flex overflow-hidden relative">
          {/* 모바일 오버레이 */}
          {isSidebarOpen && (
            <div 
              className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
              onClick={() => setIsSidebarOpen(false)}
            />
          )}

          {/* 사이드바 - 소스 관리 */}
          <div 
            className={`
              fixed md:relative z-50 md:z-auto
              h-full bg-brand-surface border-r border-brand-secondary overflow-hidden
              transform transition-transform duration-300 ease-in-out
              ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
              md:translate-x-0 md:block
              flex flex-col
            `}
            style={{ width: `${sidebarWidth}px` }}
          >
            {/* 사이드바 내용 */}
            <div className="flex-1 overflow-y-auto p-4 sidebar-scroll">
              <div className="mb-4">
                <div className="flex justify-between items-center mb-2">
                  <h2 className="text-lg font-semibold text-brand-text-primary">
                    {selectedDocumentId ? '소스 보기' : '자료 출처'}
                  </h2>
                  <div className="flex gap-2">
                    {selectedDocumentId && (
                      <button
                        onClick={() => {
                          setSelectedDocumentId(undefined);
                          setHighlightedChunkId(undefined);
                        }}
                        className="p-1 rounded-lg hover:bg-brand-secondary"
                        title="돌아가기"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                      </button>
                    )}
                    <button
                      onClick={() => setIsSidebarOpen(false)}
                      className="md:hidden p-1 rounded-lg hover:bg-brand-secondary"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
              
              {/* 조건부 렌더링: 소스 뷰어 또는 소스 목록 */}
              {selectedDocumentId ? (
                <SourceViewer
                  selectedDocumentId={selectedDocumentId}
                  highlightedChunkId={highlightedChunkId}
                  onChunkSelect={(chunkId) => setHighlightedChunkId(chunkId)}
                />
              ) : (
                <div className="space-y-2">
                  <h3 className="text-md font-medium text-brand-text-primary">현재 자료</h3>
                  <SourceInfo sources={sources} onSourceClick={handleSourceClick} />
                </div>
              )}
            </div>
            
            {/* 리사이즈 핸들 */}
            <div
              className="absolute top-0 right-0 w-1 h-full cursor-col-resize bg-transparent hover:bg-blue-500 transition-colors z-10 md:block hidden"
              onMouseDown={handleResizeStart}
              style={{
                transition: isResizing ? 'none' : 'background-color 0.2s'
              }}
            >
              {/* 핸들 시각적 표시 */}
              <div className="absolute top-1/2 right-0 transform -translate-y-1/2 w-1 h-16 bg-gray-400 rounded-r opacity-0 hover:opacity-100 transition-opacity" />
            </div>
          </div>

          {/* ✅ 채팅 화면 (전체 너비) */}
          <div className="flex-1 flex">
            <div className="flex-1 flex flex-col min-w-0">
              <ChatWindow
                key={chatKey} // 키를 사용하여 강제 리렌더링 제어
                onSendMessage={handleSendMessage}
                onStreamingMessage={handleStreamingMessage}
                onResetMessages={() => setMessages([])}
                resetTrigger={chatKey} // 리셋 트리거 전달
                placeholder="금연사업 관련 문의사항을 입력하세요..."
              />
            </div>
          </div>
        </div>
      </div>

      {/* 압축 통계 모달 */}
      <CompressionStats
        compressionResult={geminiService.getCompressionStats()}
        isVisible={showCompressionStats}
        onClose={() => setShowCompressionStats(false)}
      />

      {/* 새 대화 시작 확인 다이얼로그 */}
      <ConfirmDialog
        isOpen={showResetConfirm}
        title="새 대화 시작"
        message="현재 대화 내용이 모두 삭제됩니다. 계속하시겠습니까?"
        confirmText="새 대화 시작"
        cancelText="취소"
        onConfirm={confirmReset}
        onCancel={() => setShowResetConfirm(false)}
        isDestructive={true}
      />

      {/* Firestore 캐시 관리자 */}
      <FirestoreCacheManager />

      {/* 고급 검색 테스트 모달 */}
      {showAdvancedSearchTest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-6xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">🚀 고급 검색 품질 테스트</h2>
              <button
                onClick={() => setShowAdvancedSearchTest(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>
            <AdvancedSearchTest />
          </div>
        </div>
      )}
    </div>
  );
}

export default App;