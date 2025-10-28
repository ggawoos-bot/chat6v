/**
 * 포괄적 동의어 사전 구축 시스템
 * PDF에서 키워드를 추출하고 AI 기반 동의어를 생성하여 사전 구축
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, getDocs } from 'firebase/firestore';

const require = createRequire(import.meta.url);
const { GoogleGenerativeAI } = require('@google/generative-ai');
const pdfParse = require('pdf-parse');

// Firebase 초기화
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || "AIzaSyA0zyaTI--MHXoNPYlTf95S6iJu67XdRic",
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || "chat6-4b97d.firebaseapp.com",
  projectId: process.env.FIREBASE_PROJECT_ID || "chat6-4b97d",
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "chat6-4b97d.firebasestorage.app",
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "437591723431",
  appId: process.env.FIREBASE_APP_ID || "1:437591723431:web:9f228e7d46f33f9d49fa82"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class AdvancedKeywordExtractor {
  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY 환경변수가 설정되지 않았습니다.');
    }
    this.ai = new GoogleGenerativeAI(apiKey);
    this.extractedKeywords = new Map();
    this.synonymMappings = new Map();
  }

  /**
   * PDF에서 의미있는 키워드 추출
   */
  async extractMeaningfulKeywords(pdfText) {
    const keywords = new Set();
    
    // 1. 형태소 분석을 통한 명사 추출
    const nouns = this.extractNouns(pdfText);
    nouns.forEach(noun => keywords.add(noun));
    
    // 2. 전문용어 추출 (법령, 시설명 등)
    const technicalTerms = this.extractTechnicalTerms(pdfText);
    technicalTerms.forEach(term => keywords.add(term));
    
    // 3. 복합어 추출 (2-4글자 조합)
    const compounds = this.extractCompounds(pdfText);
    compounds.forEach(compound => keywords.add(compound));
    
    // 4. AI 기반 의미있는 키워드 추출
    const aiKeywords = await this.extractKeywordsWithAI(pdfText);
    aiKeywords.forEach(keyword => keywords.add(keyword));
    
    return Array.from(keywords);
  }

  /**
   * 형태소 분석을 통한 명사 추출
   */
  extractNouns(text) {
    const nouns = new Set();
    
    // 한글 명사 패턴 (2-10글자)
    const koreanNounPattern = /[가-힣]{2,10}/g;
    const matches = text.match(koreanNounPattern) || [];
    
    matches.forEach(match => {
      // 불용어 필터링
      if (!this.isStopWord(match) && this.isMeaningfulWord(match)) {
        nouns.add(match);
      }
    });
    
    return Array.from(nouns);
  }

  /**
   * 전문용어 추출
   */
  extractTechnicalTerms(text) {
    const terms = new Set();
    
    // 법령 관련 패턴
    const legalPatterns = [
      /[가-힣]+법(률)?/g,
      /[가-힣]+시행령/g,
      /[가-힣]+시행규칙/g,
      /[가-힣]+지침/g,
      /[가-힣]+가이드라인/g,
      /[가-힣]+매뉴얼/g
    ];
    
    // 시설 관련 패턴
    const facilityPatterns = [
      /[가-힣]+시설/g,
      /[가-힣]+센터/g,
      /[가-힣]+관/g,
      /[가-힣]+장/g,
      /[가-힣]+원/g,
      /[가-힣]+소/g
    ];
    
    [...legalPatterns, ...facilityPatterns].forEach(pattern => {
      const matches = text.match(pattern) || [];
      matches.forEach(match => terms.add(match));
    });
    
    return Array.from(terms);
  }

  /**
   * 복합어 추출
   */
  extractCompounds(text) {
    const compounds = new Set();
    
    // 2-4글자 조합 추출
    const compoundPattern = /[가-힣]{2,4}/g;
    const matches = text.match(compoundPattern) || [];
    
    matches.forEach(match => {
      if (this.isCompoundWord(match)) {
        compounds.add(match);
      }
    });
    
    return Array.from(compounds);
  }

  /**
   * AI 기반 키워드 추출
   */
  async extractKeywordsWithAI(text) {
    try {
      const prompt = `
다음 텍스트에서 의미있는 키워드들을 추출해주세요:

${text.substring(0, 2000)} // 텍스트 길이 제한

다음 기준으로 키워드를 추출해주세요:
1. 법령, 규정, 지침 관련 용어
2. 시설, 장소, 기관 관련 용어  
3. 행정, 절차, 관리 관련 용어
4. 건강, 금연, 보건 관련 용어
5. 교육, 보육 관련 용어
6. 기타 전문용어

JSON 형식으로 응답해주세요:
{
  "keywords": ["키워드1", "키워드2", "키워드3", ...]
}
`;

      const model = this.ai.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      const parsed = JSON.parse(text);
      return parsed.keywords || [];
    } catch (error) {
      console.error('AI 키워드 추출 실패:', error);
      return [];
    }
  }

  /**
   * AI 기반 동의어 생성
   */
  async generateSynonymsWithAI(keyword) {
    try {
      const prompt = `
"${keyword}"의 동의어와 유사어를 생성해주세요.

다음 기준으로 동의어를 생성해주세요:
1. 완전한 동의어 (같은 의미)
2. 유사한 의미의 단어
3. 관련된 전문용어
4. 줄임말이나 약어
5. 다른 표현 방식

JSON 형식으로 응답해주세요:
{
  "synonyms": ["동의어1", "동의어2", "동의어3", ...]
}
`;

      const model = this.ai.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      const parsed = JSON.parse(text);
      return parsed.synonyms || [];
    } catch (error) {
      console.error(`동의어 생성 실패 (${keyword}):`, error);
      return [];
    }
  }

  /**
   * 불용어 체크
   */
  isStopWord(word) {
    const stopWords = [
      '그것', '이것', '저것', '어떤', '무엇', '언제', '어디', '왜', '어떻게',
      '그리고', '또한', '또는', '그러나', '하지만', '따라서', '그러므로',
      '위의', '아래의', '앞의', '뒤의', '좌측', '우측', '중앙', '양쪽',
      '이상', '이하', '미만', '초과', '이내', '이외', '이상', '이하',
      '제1', '제2', '제3', '제4', '제5', '제6', '제7', '제8', '제9', '제10',
      '첫째', '둘째', '셋째', '넷째', '다섯째', '여섯째', '일곱째', '여덟째', '아홉째', '열째'
    ];
    return stopWords.includes(word);
  }

  /**
   * 의미있는 단어 체크
   */
  isMeaningfulWord(word) {
    // 2글자 이상, 숫자나 특수문자 제외
    return word.length >= 2 && /^[가-힣]+$/.test(word);
  }

  /**
   * 복합어 체크
   */
  isCompoundWord(word) {
    // 의미있는 복합어 패턴
    const compoundPatterns = [
      /^[가-힣]+시설$/,
      /^[가-힣]+관리$/,
      /^[가-힣]+지원$/,
      /^[가-힣]+서비스$/,
      /^[가-힣]+시스템$/,
      /^[가-힣]+프로그램$/,
      /^[가-힣]+정책$/,
      /^[가-힣]+방안$/,
      /^[가-힣]+절차$/,
      /^[가-힣]+기준$/,
      /^[가-힣]+규정$/,
      /^[가-힣]+지침$/,
      /^[가-힣]+가이드$/,
      /^[가-힣]+매뉴얼$/,
      /^[가-힣]+안내$/,
      /^[가-힣]+교육$/,
      /^[가-힣]+훈련$/,
      /^[가-힣]+연수$/,
      /^[가-힣]+학습$/,
      /^[가-힣]+지도$/,
      /^[가-힣]+계몽$/,
      /^[가-힣]+홍보$/,
      /^[가-힣]+광고$/,
      /^[가-힣]+선전$/,
      /^[가-힣]+캠페인$/,
      /^[가-힣]+안내$/,
      /^[가-힣]+공지$/,
      /^[가-힣]+상담$/,
      /^[가-힣]+문의$/,
      /^[가-힣]+자문$/,
      /^[가-힣]+안내$/,
      /^[가-힣]+컨설팅$/,
      /^[가-힣]+민원$/,
      /^[가-힣]+불만$/,
      /^[가-힣]+고충$/,
      /^[가-힣]+건의$/,
      /^[가-힣]+제안$/,
      /^[가-힣]+조사$/,
      /^[가-힣]+연구$/,
      /^[가-힣]+탐사$/,
      /^[가-힣]+검토$/,
      /^[가-힣]+분석$/,
      /^[가-힣]+점검$/,
      /^[가-힣]+확인$/,
      /^[가-힣]+검사$/,
      /^[가-힣]+감사$/,
      /^[가-힣]+진단$/,
      /^[가-힣]+안전점검$/,
      /^[가-힣]+정기점검$/,
      /^[가-힣]+안전$/,
      /^[가-힣]+보호$/,
      /^[가-힣]+예방$/,
      /^[가-힣]+위험방지$/,
      /^[가-힣]+안전관리$/,
      /^[가-힣]+안전수칙$/,
      /^[가-힣]+환경$/,
      /^[가-힣]+자연$/,
      /^[가-힣]+생태$/,
      /^[가-힣]+오염$/,
      /^[가-힣]+보호$/,
      /^[가-힣]+환경보호$/,
      /^[가-힣]+환경오염$/,
      /^[가-힣]+건강$/,
      /^[가-힣]+보건$/,
      /^[가-힣]+위생$/,
      /^[가-힣]+질병$/,
      /^[가-힣]+예방$/,
      /^[가-힣]+건강증진$/,
      /^[가-힣]+건강관리$/,
      /^[가-힣]+복지$/,
      /^[가-힣]+사회복지$/,
      /^[가-힣]+생활보장$/,
      /^[가-힣]+지원$/,
      /^[가-힣]+혜택$/,
      /^[가-힣]+복지서비스$/,
      /^[가-힣]+인권$/,
      /^[가-힣]+기본권$/,
      /^[가-힣]+자유$/,
      /^[가-힣]+평등$/,
      /^[가-힣]+존엄$/,
      /^[가-힣]+인권보호$/,
      /^[가-힣]+정보$/,
      /^[가-힣]+자료$/,
      /^[가-힣]+데이터$/,
      /^[가-힣]+지식$/,
      /^[가-힣]+안내$/,
      /^[가-힣]+정보제공$/,
      /^[가-힣]+기술$/,
      /^[가-힣]+과학$/,
      /^[가-힣]+개발$/,
      /^[가-힣]+혁신$/,
      /^[가-힣]+연구$/,
      /^[가-힣]+기술개발$/,
      /^[가-힣]+경제$/,
      /^[가-힣]+산업$/,
      /^[가-힣]+시장$/,
      /^[가-힣]+투자$/,
      /^[가-힣]+성장$/,
      /^[가-힣]+경제발전$/,
      /^[가-힣]+사회$/,
      /^[가-힣]+공동체$/,
      /^[가-힣]+문화$/,
      /^[가-힣]+시민$/,
      /^[가-힣]+지역사회$/,
      /^[가-힣]+사회문제$/,
      /^[가-힣]+국가$/,
      /^[가-힣]+정부$/,
      /^[가-힣]+정책$/,
      /^[가-힣]+법률$/,
      /^[가-힣]+행정$/,
      /^[가-힣]+국가기관$/,
      /^[가-힣]+지역$/,
      /^[가-힣]+지방$/,
      /^[가-힣]+시도$/,
      /^[가-힣]+시군구$/,
      /^[가-힣]+읍면동$/,
      /^[가-힣]+지역사회$/,
      /^[가-힣]+국제$/,
      /^[가-힣]+세계$/,
      /^[가-힣]+글로벌$/,
      /^[가-힣]+해외$/,
      /^[가-힣]+국제협력$/,
      /^[가-힣]+국제관계$/,
      /^[가-힣]+미래$/,
      /^[가-힣]+전망$/,
      /^[가-힣]+예측$/,
      /^[가-힣]+비전$/,
      /^[가-힣]+전략$/,
      /^[가-힣]+미래사회$/,
      /^[가-힣]+혁신$/,
      /^[가-힣]+창의$/,
      /^[가-힣]+개선$/,
      /^[가-힣]+변화$/,
      /^[가-힣]+발전$/,
      /^[가-힣]+기술혁신$/,
      /^[가-힣]+협력$/,
      /^[가-힣]+공동$/,
      /^[가-힣]+연대$/,
      /^[가-힣]+파트너십$/,
      /^[가-힣]+협업$/,
      /^[가-힣]+협력관계$/,
      /^[가-힣]+소통$/,
      /^[가-힣]+대화$/,
      /^[가-힣]+의사소통$/,
      /^[가-힣]+공감$/,
      /^[가-힣]+경청$/,
      /^[가-힣]+소통채널$/,
      /^[가-힣]+참여$/,
      /^[가-힣]+활동$/,
      /^[가-힣]+동참$/,
      /^[가-힣]+협조$/,
      /^[가-힣]+의견제시$/,
      /^[가-힣]+시민참여$/,
      /^[가-힣]+투명$/,
      /^[가-힣]+공개$/,
      /^[가-힣]+명확$/,
      /^[가-힣]+정직$/,
      /^[가-힣]+신뢰$/,
      /^[가-힣]+투명성$/,
      /^[가-힣]+공정$/,
      /^[가-힣]+정의$/,
      /^[가-힣]+형평$/,
      /^[가-힣]+균등$/,
      /^[가-힣]+공평$/,
      /^[가-힣]+공정성$/,
      /^[가-힣]+책임$/,
      /^[가-힣]+의무$/,
      /^[가-힣]+책무$/,
      /^[가-힣]+책임감$/,
      /^[가-힣]+책임소재$/,
      /^[가-힣]+윤리$/,
      /^[가-힣]+도덕$/,
      /^[가-힣]+가치$/,
      /^[가-힣]+원칙$/,
      /^[가-힣]+청렴$/,
      /^[가-힣]+윤리경영$/,
      /^[가-힣]+인증$/,
      /^[가-힣]+검증$/,
      /^[가-힣]+확인$/,
      /^[가-힣]+자격$/,
      /^[가-힣]+면허$/,
      /^[가-힣]+인증제도$/,
      /^[가-힣]+표준$/,
      /^[가-힣]+기준$/,
      /^[가-힣]+규격$/,
      /^[가-힣]+모범$/,
      /^[가-힣]+지침$/,
      /^[가-힣]+표준화$/,
      /^[가-힣]+데이터$/,
      /^[가-힣]+정보$/,
      /^[가-힣]+자료$/,
      /^[가-힣]+빅데이터$/,
      /^[가-힣]+통계$/,
      /^[가-힣]+데이터분석$/,
      /^[가-힣]+시스템$/,
      /^[가-힣]+체계$/,
      /^[가-힣]+구조$/,
      /^[가-힣]+플랫폼$/,
      /^[가-힣]+네트워크$/,
      /^[가-힣]+운영체제$/,
      /^[가-힣]+서비스$/,
      /^[가-힣]+제공$/,
      /^[가-힣]+지원$/,
      /^[가-힣]+혜택$/,
      /^[가-힣]+편의$/,
      /^[가-힣]+서비스개선$/,
      /^[가-힣]+사용자$/,
      /^[가-힣]+이용자$/,
      /^[가-힣]+고객$/,
      /^[가-힣]+시민$/,
      /^[가-힣]+소비자$/,
      /^[가-힣]+참여자$/,
      /^[가-힣]+개발$/,
      /^[가-힣]+연구$/,
      /^[가-힣]+생산$/,
      /^[가-힣]+구축$/,
      /^[가-힣]+진행$/,
      /^[가-힣]+개발사업$/,
      /^[가-힣]+운영$/,
      /^[가-힣]+관리$/,
      /^[가-힣]+실시$/,
      /^[가-힣]+집행$/,
      /^[가-힣]+수행$/,
      /^[가-힣]+운영방안$/,
      /^[가-힣]+구축$/,
      /^[가-힣]+설치$/,
      /^[가-힣]+건설$/,
      /^[가-힣]+마련$/,
      /^[가-힣]+조성$/,
      /^[가-힣]+시스템구축$/,
      /^[가-힣]+제공$/,
      /^[가-힣]+제시$/,
      /^[가-힣]+공급$/,
      /^[가-힣]+부여$/,
      /^[가-힣]+제공서비스$/,
      /^[가-힣]+활용$/,
      /^[가-힣]+이용$/,
      /^[가-힣]+응용$/,
      /^[가-힣]+적용$/,
      /^[가-힣]+활용방안$/,
      /^[가-힣]+개시$/,
      /^[가-힣]+시작$/,
      /^[가-힣]+착수$/,
      /^[가-힣]+개통$/,
      /^[가-힣]+개장$/,
      /^[가-힣]+개시일$/,
      /^[가-힣]+종료$/,
      /^[가-힣]+마감$/,
      /^[가-힣]+완료$/,
      /^[가-힣]+폐쇄$/,
      /^[가-힣]+종료일$/,
      /^[가-힣]+확대$/,
      /^[가-힣]+증가$/,
      /^[가-힣]+확장$/,
      /^[가-힣]+증대$/,
      /^[가-힣]+확대방안$/,
      /^[가-힣]+축소$/,
      /^[가-힣]+감소$/,
      /^[가-힣]+축소$/,
      /^[가-힣]+감축$/,
      /^[가-힣]+축소방안$/,
      /^[가-힣]+강화$/,
      /^[가-힣]+증진$/,
      /^[가-힣]+증대$/,
      /^[가-힣]+확대$/,
      /^[가-힣]+강화방안$/,
      /^[가-힣]+완화$/,
      /^[가-힣]+경감$/,
      /^[가-힣]+축소$/,
      /^[가-힣]+감소$/,
      /^[가-힣]+완화방안$/,
      /^[가-힣]+조정$/,
      /^[가-힣]+조절$/,
      /^[가-힣]+변경$/,
      /^[가-힣]+수정$/,
      /^[가-힣]+조정방안$/,
      /^[가-힣]+개편$/,
      /^[가-힣]+재편$/,
      /^[가-힣]+개정$/,
      /^[가-힣]+개선$/,
      /^[가-힣]+개편안$/,
      /^[가-힣]+재정$/,
      /^[가-힣]+재정비$/,
      /^[가-힣]+재구성$/,
      /^[가-힣]+재설정$/,
      /^[가-힣]+재정립$/,
      /^[가-힣]+수립$/,
      /^[가-힣]+설정$/,
      /^[가-힣]+계획$/,
      /^[가-힣]+마련$/,
      /^[가-힣]+수립방안$/,
      /^[가-힣]+시행$/,
      /^[가-힣]+실시$/,
      /^[가-힣]+적용$/,
      /^[가-힣]+집행$/,
      /^[가-힣]+운영$/,
      /^[가-힣]+발효$/,
      /^[가-힣]+시행일$/,
      /^[가-힣]+시행계획$/,
      /^[가-힣]+평가$/,
      /^[가-힣]+심사$/,
      /^[가-힣]+분석$/,
      /^[가-힣]+측정$/,
      /^[가-힣]+판단$/,
      /^[가-힣]+평가기준$/,
      /^[가-힣]+분석$/,
      /^[가-힣]+해석$/,
      /^[가-힣]+검토$/,
      /^[가-힣]+조사$/,
      /^[가-힣]+파악$/,
      /^[가-힣]+데이터분석$/,
      /^[가-힣]+예측$/,
      /^[가-힣]+전망$/,
      /^[가-힣]+추정$/,
      /^[가-힣]+예상$/,
      /^[가-힣]+예측모델$/,
      /^[가-힣]+대응$/,
      /^[가-힣]+대처$/,
      /^[가-힣]+처리$/,
      /^[가-힣]+조치$/,
      /^[가-힣]+반응$/,
      /^[가-힣]+위기대응$/,
      /^[가-힣]+준비$/,
      /^[가-힣]+대비$/,
      /^[가-힣]+계획$/,
      /^[가-힣]+마련$/,
      /^[가-힣]+준비사항$/,
      /^[가-힣]+실천$/,
      /^[가-힣]+행동$/,
      /^[가-힣]+이행$/,
      /^[가-힣]+수행$/,
      /^[가-힣]+실천방안$/,
      /^[가-힣]+협의$/,
      /^[가-힣]+논의$/,
      /^[가-힣]+상의$/,
      /^[가-힣]+조정$/,
      /^[가-힣]+협의사항$/,
      /^[가-힣]+공유$/,
      /^[가-힣]+나눔$/,
      /^[가-힣]+배포$/,
      /^[가-힣]+전달$/,
      /^[가-힣]+정보공유$/,
      /^[가-힣]+확인$/,
      /^[가-힣]+검증$/,
      /^[가-힣]+점검$/,
      /^[가-힣]+체크$/,
      /^[가-힣]+확인사항$/,
      /^[가-힣]+검토$/,
      /^[가-힣]+심사$/,
      /^[가-힣]+분석$/,
      /^[가-힣]+고려$/,
      /^[가-힣]+재검토$/,
      /^[가-힣]+제안$/,
      /^[가-힣]+건의$/,
      /^[가-힣]+제의$/,
      /^[가-힣]+발의$/,
      /^[가-힣]+제안사항$/,
      /^[가-힣]+의견$/,
      /^[가-힣]+견해$/,
      /^[가-힣]+생각$/,
      /^[가-힣]+주장$/,
      /^[가-힣]+의견수렴$/,
      /^[가-힣]+논의$/,
      /^[가-힣]+토론$/,
      /^[가-힣]+협의$/,
      /^[가-힣]+상의$/,
      /^[가-힣]+논의사항$/,
      /^[가-힣]+결정$/,
      /^[가-힣]+선택$/,
      /^[가-힣]+판단$/,
      /^[가-힣]+확정$/,
      /^[가-힣]+결정사항$/,
      /^[가-힣]+발표$/,
      /^[가-힣]+공개$/,
      /^[가-힣]+게시$/,
      /^[가-힣]+보고$/,
      /^[가-힣]+발표자료$/,
      /^[가-힣]+보고$/,
      /^[가-힣]+제출$/,
      /^[가-힣]+보고서$/,
      /^[가-힣]+결과보고$/,
      /^[가-힣]+중간보고$/,
      /^[가-힣]+최종보고$/,
      /^[가-힣]+승인$/,
      /^[가-힣]+허가$/,
      /^[가-힣]+인가$/,
      /^[가-힣]+동의$/,
      /^[가-힣]+결재$/,
      /^[가-힣]+승인절차$/,
      /^[가-힣]+반려$/,
      /^[가-힣]+거부$/,
      /^[가-힣]+기각$/,
      /^[가-힣]+부결$/,
      /^[가-힣]+반려사유$/,
      /^[가-힣]+접수$/,
      /^[가-힣]+수령$/,
      /^[가-힣]+신청$/,
      /^[가-힣]+등록$/,
      /^[가-힣]+접수처$/,
      /^[가-힣]+발급$/,
      /^[가-힣]+교부$/,
      /^[가-힣]+수여$/,
      /^[가-힣]+제공$/,
      /^[가-힣]+발급기관$/,
      /^[가-힣]+갱신$/,
      /^[가-힣]+연장$/,
      /^[가-힣]+재등록$/,
      /^[가-힣]+재발급$/,
      /^[가-힣]+갱신기간$/,
      /^[가-힣]+등록$/,
      /^[가-힣]+기록$/,
      /^[가-힣]+등재$/,
      /^[가-힣]+신청$/,
      /^[가-힣]+등록절차$/,
      /^[가-힣]+해지$/,
      /^[가-힣]+해제$/,
      /^[가-힣]+취소$/,
      /^[가-힣]+종료$/,
      /^[가-힣]+해지사유$/,
      /^[가-힣]+정지$/,
      /^[가-힣]+중단$/,
      /^[가-힣]+일시정지$/,
      /^[가-힣]+영업정지$/,
      /^[가-힣]+정지기간$/,
      /^[가-힣]+폐쇄$/,
      /^[가-힣]+폐지$/,
      /^[가-힣]+철거$/,
      /^[가-힣]+봉쇄$/,
      /^[가-힣]+폐쇄명령$/,
      /^[가-힣]+이전$/,
      /^[가-힣]+이동$/,
      /^[가-힣]+이관$/,
      /^[가-힣]+이설$/,
      /^[가-힣]+이전절차$/,
      /^[가-힣]+설치$/,
      /^[가-힣]+구축$/,
      /^[가-힣]+장착$/,
      /^[가-힣]+설비$/,
      /^[가-힣]+설치기준$/,
      /^[가-힣]+제거$/,
      /^[가-힣]+철거$/,
      /^[가-힣]+삭제$/,
      /^[가-힣]+폐기$/,
      /^[가-힣]+제거방법$/,
      /^[가-힣]+보수$/,
      /^[가-힣]+수리$/,
      /^[가-힣]+유지$/,
      /^[가-힣]+점검$/,
      /^[가-힣]+보수작업$/,
      /^[가-힣]+교체$/,
      /^[가-힣]+대체$/,
      /^[가-힣]+변경$/,
      /^[가-힣]+교환$/,
      /^[가-힣]+교체시기$/,
      /^[가-힣]+확보$/,
      /^[가-힣]+확충$/,
      /^[가-힣]+확보방안$/,
      /^[가-힣]+확보계획$/,
      /^[가-힣]+부족$/,
      /^[가-힣]+결핍$/,
      /^[가-힣]+미달$/,
      /^[가-힣]+불충분$/,
      /^[가-힣]+부족문제$/,
      /^[가-힣]+초과$/,
      /^[가-힣]+과다$/,
      /^[가-힣]+상회$/,
      /^[가-힣]+능가$/,
      /^[가-힣]+초과분$/,
      /^[가-힣]+증가$/,
      /^[가-힣]+증대$/,
      /^[가-힣]+확대$/,
      /^[가-힣]+향상$/,
      /^[가-힣]+증가율$/,
      /^[가-힣]+감소$/,
      /^[가-힣]+축소$/,
      /^[가-힣]+하락$/,
      /^[가-힣]+저하$/,
      /^[가-힣]+감소율$/,
      /^[가-힣]+유지$/,
      /^[가-힣]+보존$/,
      /^[가-힣]+지속$/,
      /^[가-힣]+존속$/,
      /^[가-힣]+유지관리$/
    ];
    
    return compoundPatterns.some(pattern => pattern.test(word));
  }
}

class ComprehensiveSynonymDictionaryBuilder {
  constructor() {
    this.extractor = new AdvancedKeywordExtractor();
    this.allKeywords = new Set();
    this.synonymMappings = new Map();
  }

  /**
   * 모든 PDF에서 키워드 추출 (Firestore에서 청크 가져오기)
   */
  async extractKeywordsFromAllPDFs() {
    console.log('📚 Firestore에서 PDF 청크 가져오기 시작...');
    
    try {
      // Firestore에서 모든 청크 가져오기
      const chunksQuery = query(collection(db, 'pdf_chunks'));
      const chunksSnapshot = await getDocs(chunksQuery);
      
      const allText = [];
      let processedDocuments = new Set();
      
      console.log(`📦 총 ${chunksSnapshot.size}개 청크 발견`);
      
      chunksSnapshot.forEach((doc) => {
        const chunkData = doc.data();
        
        // 문서별로 첫 번째 청크만 기록
        if (!processedDocuments.has(chunkData.filename)) {
          processedDocuments.add(chunkData.filename);
          console.log(`📄 문서 발견: ${chunkData.filename}`);
        }
        
        // 청크 텍스트 수집
        if (chunkData.content) {
          allText.push(chunkData.content);
        }
      });
      
      // 모든 텍스트 결합
      const fullText = allText.join('\n');
      console.log(`📝 전체 텍스트 길이: ${fullText.length}자`);
      
      // 키워드 추출
      const keywords = await this.extractor.extractMeaningfulKeywords(fullText);
      keywords.forEach(keyword => this.allKeywords.add(keyword));
      
      console.log(`✅ 총 ${this.allKeywords.size}개 고유 키워드 추출 완료`);
      
    } catch (error) {
      console.error('❌ Firestore에서 데이터 가져오기 실패:', error);
      
      // 폴백: 로컬 PDF 파일에서 추출 시도
      console.log('🔄 로컬 PDF 파일에서 추출 시도...');
      await this.extractFromLocalPDFs();
    }
  }

  /**
   * 로컬 PDF 파일에서 키워드 추출 (폴백)
   */
  async extractFromLocalPDFs() {
    try {
      // 먼저 pdf 폴더 시도, 없으면 public/pdf 시도
      let pdfDir = path.join(__dirname, '../pdf');
      if (!fs.existsSync(pdfDir) || fs.readdirSync(pdfDir).filter(file => file.endsWith('.pdf')).length === 0) {
        pdfDir = path.join(__dirname, '../public/pdf');
      }
      
      const pdfFiles = fs.readdirSync(pdfDir).filter(file => file.endsWith('.pdf'));
      
      console.log(`📚 로컬 ${pdfFiles.length}개 PDF 파일에서 키워드 추출 시작...`);
      
      for (const pdfFile of pdfFiles) {
        try {
          console.log(`🔍 처리 중: ${pdfFile}`);
          const pdfPath = path.join(pdfDir, pdfFile);
          const pdfText = await this.extractTextFromPDF(pdfPath);
          
          const keywords = await this.extractor.extractMeaningfulKeywords(pdfText);
          keywords.forEach(keyword => this.allKeywords.add(keyword));
          
          console.log(`✅ ${pdfFile}: ${keywords.length}개 키워드 추출`);
        } catch (error) {
          console.error(`❌ ${pdfFile} 처리 실패:`, error);
        }
      }
      
      console.log(`🎯 총 ${this.allKeywords.size}개 고유 키워드 추출 완료`);
    } catch (error) {
      console.error('❌ 로컬 PDF 처리 실패:', error);
    }
  }

  /**
   * 동의어/유사어 생성
   */
  async generateSynonyms() {
    const keywords = Array.from(this.allKeywords);
    console.log(`🔄 ${keywords.length}개 키워드의 동의어 생성 시작...`);
    
    // 배치 처리 (API 제한 고려)
    const batchSize = 10;
    for (let i = 0; i < keywords.length; i += batchSize) {
      const batch = keywords.slice(i, i + batchSize);
      
      console.log(`📦 배치 ${Math.floor(i/batchSize) + 1}/${Math.ceil(keywords.length/batchSize)} 처리 중...`);
      
      const batchPromises = batch.map(async (keyword) => {
        try {
          const synonyms = await this.extractor.generateSynonymsWithAI(keyword);
          this.synonymMappings.set(keyword, synonyms);
          return { keyword, synonyms };
        } catch (error) {
          console.error(`❌ ${keyword} 동의어 생성 실패:`, error);
          return { keyword, synonyms: [] };
        }
      });
      
      await Promise.all(batchPromises);
      
      // API 제한 고려한 대기
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log(`✅ ${this.synonymMappings.size}개 키워드의 동의어 생성 완료`);
  }

  /**
   * 동의어 사전 저장
   */
  async saveSynonymDictionary() {
    const dictionary = {
      metadata: {
        totalKeywords: this.allKeywords.size,
        totalSynonyms: Array.from(this.synonymMappings.values()).reduce((sum, synonyms) => sum + synonyms.length, 0),
        createdAt: new Date().toISOString(),
        version: '1.0'
      },
      keywords: Array.from(this.allKeywords),
      synonymMappings: Object.fromEntries(this.synonymMappings)
    };
    
    // data 디렉토리가 없으면 생성
    const dataDir = path.join(__dirname, '../data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    const outputPath = path.join(dataDir, 'comprehensive-synonym-dictionary.json');
    fs.writeFileSync(outputPath, JSON.stringify(dictionary, null, 2), 'utf8');
    
    console.log(`💾 동의어 사전 저장 완료: ${outputPath}`);
    console.log(`📊 통계:`);
    console.log(`   - 총 키워드: ${dictionary.metadata.totalKeywords}개`);
    console.log(`   - 총 동의어: ${dictionary.metadata.totalSynonyms}개`);
    console.log(`   - 평균 동의어/키워드: ${(dictionary.metadata.totalSynonyms / dictionary.metadata.totalKeywords).toFixed(2)}개`);
  }

  /**
   * PDF에서 텍스트 추출
   */
  async extractTextFromPDF(pdfPath) {
    const dataBuffer = fs.readFileSync(pdfPath);
    const data = await pdfParse(dataBuffer);
    return data.text;
  }

  /**
   * 메인 실행 함수
   */
  async build() {
    try {
      console.log('🚀 포괄적 동의어 사전 구축 시작...');
      
      // 1. 모든 PDF에서 키워드 추출
      await this.extractKeywordsFromAllPDFs();
      
      // 2. 동의어/유사어 생성
      await this.generateSynonyms();
      
      // 3. 동의어 사전 저장
      await this.saveSynonymDictionary();
      
      console.log('🎉 포괄적 동의어 사전 구축 완료!');
    } catch (error) {
      console.error('❌ 동의어 사전 구축 실패:', error);
      throw error;
    }
  }
}

// 실행
const builder = new ComprehensiveSynonymDictionaryBuilder();
builder.build().catch(console.error);

export default ComprehensiveSynonymDictionaryBuilder;