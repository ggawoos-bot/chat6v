/**
 * Firestore 데이터 초기화 스크립트
 * 기존 pdf_documents와 pdf_chunks 컬렉션의 모든 데이터를 삭제
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, deleteDoc, doc, writeBatch } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyA0zyaTI--MHXoNPYlTf95S6iJu67XdRic",
  authDomain: "chat6-4b97d.firebaseapp.com",
  projectId: "chat6-4b97d",
  storageBucket: "chat6-4b97d.firebasestorage.app",
  messagingSenderId: "437591723431",
  appId: "1:437591723431:web:9f228e7d46f33f9d49fa82"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function clearFirestore() {
  try {
    console.log('🗑️ Firestore 데이터 일괄 초기화 시작...');
    
    // pdf_documents 컬렉션 일괄 삭제
    console.log('📄 pdf_documents 컬렉션 일괄 삭제 중...');
    const documentsSnapshot = await getDocs(collection(db, 'pdf_documents'));
    
    if (documentsSnapshot.docs.length > 0) {
      const batch1 = writeBatch(db);
      
      documentsSnapshot.docs.forEach(docSnapshot => {
        batch1.delete(doc(db, 'pdf_documents', docSnapshot.id));
      });
      
      await batch1.commit();
      console.log(`✅ pdf_documents 삭제 완료: ${documentsSnapshot.docs.length}개`);
    } else {
      console.log('📄 pdf_documents 컬렉션이 비어있습니다.');
    }
    
    // pdf_chunks 컬렉션 일괄 삭제 (500개씩 배치)
    console.log('📦 pdf_chunks 컬렉션 일괄 삭제 중...');
    const chunksSnapshot = await getDocs(collection(db, 'pdf_chunks'));
    const chunks = chunksSnapshot.docs;
    
    if (chunks.length > 0) {
      // 500개씩 배치로 나누어 처리 (Firestore 제한)
      const batchSize = 500;
      let totalDeleted = 0;
      
      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = writeBatch(db);
        const batchChunks = chunks.slice(i, i + batchSize);
        
        batchChunks.forEach(chunkSnapshot => {
          batch.delete(doc(db, 'pdf_chunks', chunkSnapshot.id));
        });
        
        await batch.commit();
        totalDeleted += batchChunks.length;
        console.log(`  📊 청크 삭제 진행: ${totalDeleted}/${chunks.length}개 (${((totalDeleted / chunks.length) * 100).toFixed(1)}%)`);
      }
      
      console.log(`✅ pdf_chunks 삭제 완료: ${totalDeleted}개`);
    } else {
      console.log('📦 pdf_chunks 컬렉션이 비어있습니다.');
    }
    
    console.log('\n🎉 Firestore 데이터 일괄 초기화 완료!');
    console.log(`📊 삭제된 데이터:`);
    console.log(`  - 문서: ${documentsSnapshot.docs.length}개`);
    console.log(`  - 청크: ${chunks.length}개`);
    
  } catch (error) {
    console.error('❌ 초기화 실패:', error);
    process.exit(1);
  }
}

// 스크립트 실행
clearFirestore();
