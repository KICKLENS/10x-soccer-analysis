import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

async function forceTest() {
  const apiKey = process.env.GEMINI_API_KEY;
  const genAI = new GoogleGenerativeAI(apiKey);

  console.log("🚀 [테스트] gemini-1.5-flash 모델 강제 호출 시도 중...");

  try {
    // 모델 리스트 무시하고 바로 호출
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
    const result = await model.generateContent("안녕? 너 작동하니?");
    const response = await result.response;
    
    console.log("\n✅ [성공!!] 모델이 정상 작동합니다!");
    console.log("대답:", response.text());
    console.log("\n💡 이제 server.js를 실행해서 영상 분석을 시작하시면 됩니다.");

  } catch (error) {
    console.error("\n❌ [실패] 강제 호출 에러 발생:");
    console.error("에러 메시지:", error.message);
    
    if (error.message.includes("404")) {
      console.log("\n🔍 진단: 여전히 모델을 찾지 못합니다. 모델 이름을 'gemini-1.5-flash-latest'로 바꿔서 한 번 더 시도해 보세요.");
    } else if (error.message.includes("403") || error.message.includes("permission")) {
      console.log("\n🔍 진단: 권한(Permission) 문제인 것이 확실합니다. API 키 설정을 다시 확인해야 합니다.");
    }
  }
}

forceTest();