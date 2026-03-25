(function () {
  window.BitHappenDetailDefaultOverrides = {
    'ai-udt-tennis': {
      pains: [
        '동호인 스윙 교정이 코치 주관과 현장 제약에 크게 의존',
        '촬영 영상은 있어도 기술적 분석 지표가 부족해 개선 포인트 도출이 어려움',
        '코칭 피드백이 전문 용어 중심으로 제공되어 일반 사용자가 이해하기 어려움',
      ],
      how: [
        '스마트폰 영상 업로드 후 비동기 파이프라인으로 자동 분석',
        'MediaPipe 포즈 추정과 EfficientDet 라켓 감지를 결합한 이중 AI 분석',
        'LLM 기반 자연어 코칭으로 교정 포인트/연습 방법을 이해하기 쉽게 전달',
      ],
      scenarios: [
        '개인 동호인 스윙 교정 및 셀프 트레이닝',
        '테니스 아카데미 레슨 전/후 성과 비교 리포트',
        '온라인 코칭 서비스의 비대면 분석 모듈',
      ],
      integration: [
        'Backend: Python FastAPI + WebSocket',
        'Frontend: HTML5, CSS3, Canvas API, Vanilla JS SPA',
        'Database: MariaDB',
        'Admin: ASP.NET Core MVC + Entity Framework',
        'LLM: LM Studio / Claude API 연동',
      ],
      features: [
        '영상 업로드 & 트림: 드래그 앤 드롭, 듀얼 핸들 타임라인(최대 3분)',
        '실시간 스켈레톤 오버레이: 33개 관절 추적 및 각도 시각화',
        '6대 키 모먼트 자동 감지: 최대 외회전/손목 최고 속도/임팩트 등',
        '레이더 차트 & 등급 평가: S~D 등급 및 종합 스윙 퀄리티 시각화',
        'AI 자연어 코칭: 분석 데이터 기반 교정 포인트/훈련 방법 제공',
        '관리자 CMS: 회원/분석/코칭 데이터 관리, 키 모먼트 편집',
        '8단계 스윙 페이즈 자동 분류: Ready~Recovery',
        '9개 핵심 메트릭 스코어링: 0~100점',
      ],
      techSpecs: [
        {
          title: 'AI/ML',
          items: ['MediaPipe PoseLandmarker', 'EfficientDet-Lite0 (라켓 감지)'],
        },
        {
          title: 'Backend',
          items: ['Python FastAPI', 'WebSocket', '비동기 영상 분석 파이프라인'],
        },
        {
          title: 'Frontend',
          items: ['HTML5', 'CSS3', 'Canvas API', 'Vanilla JS SPA', '다크 테마'],
        },
        {
          title: 'Data & Admin',
          items: ['MariaDB', 'ASP.NET Core MVC', 'Entity Framework'],
        },
      ],
      kpis: [
        { value: '33', title: '관절 포인트 분석', desc: '스윙 전 구간의 관절 움직임 정밀 추적' },
        { value: '9', title: '핵심 메트릭', desc: '스윙 품질을 정량화하는 핵심 지표 스코어링' },
        { value: '8', title: '스윙 페이즈', desc: 'Ready부터 Recovery까지 자동 분류' },
      ],
    },
  };
})();