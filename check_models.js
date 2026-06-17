import 'dotenv/config';

async function checkMyModels() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("❌ 에러: .env 파일에서 GEMINI_API_KEY를 찾을 수 없습니다.");
    return;
  }

  console.log("🔍 구글 서버에 접속하여 사용 가능한 모델 리스트를 확인 중입니다...");
  
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.error) {
      console.error("❌ API 에러 발생:", data.error.message);
      return;
    }

    console.log("\n✅ [성공] 사용자님의 API 키로 사용 가능한 모델 목록:");
    console.log("--------------------------------------------------");
    data.models.forEach(model => {
      // 우리가 필요한 1.5 시리즈만 골라서 보기 편하게 출력
      if (model.name.includes("1.5")) {
        console.log(`▶️  ${model.name}`);
      }
    });
    console.log("--------------------------------------------------");
    console.log("💡 위 리스트에 있는 이름을 server.js의 model 항목에 그대로 복사해서 넣어야 합니다.");

  } catch (error) {
    console.error("❌ 네트워크 오류:", error.message);
  }
}

checkMyModels();