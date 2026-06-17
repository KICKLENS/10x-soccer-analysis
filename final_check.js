import { VertexAI } from '@google-cloud/vertexai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const keyPath = path.join(__dirname, 'google-key.json');
process.env.GOOGLE_APPLICATION_CREDENTIALS = keyPath;

const keyData = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
const projectId = keyData.project_id;

// 1. 프로젝트 초기화 (2.0은 us-central1에서 가장 먼저 배포됩니다)
const vertexAI = new VertexAI({ project: projectId, location: 'us-central1' });

async function test20() {
  console.log(`📡 [2.0 테스트] 프로젝트 [${projectId}] 에서 Gemini 2.0 호출 시도...`);
  
  /**
   * 💡 모델 이름 확인: 
   * Vertex AI용 정식 명칭인 'gemini-2.0-flash-exp' 
   * 또는 실험적 버전인 'gemini-2.0-flash-exp'를 사용합니다.
   */
  const model = vertexAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

  try {
    const result = await model.generateContent("2.0 작동하니? 작동하면 'Yes'라고 해줘.");
    const response = await result.response;
    console.log("\n✅ [축하합니다!!!] 2.0 모델로 연결 성공!");
    console.log("응답:", response.candidates[0].content.parts[0].text);
    console.log("\n🚀 이제 server.js의 모델명을 'gemini-2.0-flash-exp'로 바꾸면 됩니다!");
  } catch (err) {
    console.error("\n❌ 2.0 역시 실패. 에러 내용:");
    console.error(err.message);
    
    console.log("\n💡 마지막 시도: 모델명을 'gemini-2.0-flash-exp'로 바꿔서 다시 해보세요.");
  }
}

test20();