// UNO 자기 관리 플랫폼 — 데이터 타입.
// 모든 데이터는 브라우저 localStorage 에만 저장된다(개인용, 기기 로컬).

export type Rating = 1 | 2 | 3 | 4 | 5;

export type Sleep = {
  bedtime?: string; // HH:MM (잠든 시각)
  wake?: string; // HH:MM (기상 시각)
  hours?: number; // 수면 시간(직접 입력 또는 자동 계산)
  quality?: number; // 1~5
  note?: string;
};

export type Exercise = {
  done: boolean; // 오늘 운동 여부
  type?: string; // 러닝 / 헬스 / 홈트 등
  minutes?: number;
  count?: number; // 세트/횟수(예: 팔굽혀펴기 50개)
  intensity?: number; // 1~5
  note?: string;
};

export type Reading = {
  minutes?: number;
  pages?: number;
  book?: string;
  note?: string;
};

// 공부: 영어 / 경영 / AI (분 단위)
export type Study = {
  english?: number;
  business?: number;
  ai?: number;
  note?: string;
};

// 업무 시트 트래킹
export type Work = {
  planned?: number; // 계획한 업무 수
  done?: number; // 완료한 업무 수
  focusHours?: number; // 집중(딥워크) 시간
  note?: string;
};

export type Wellbeing = {
  mood?: number; // 기분 1~5
  energy?: number; // 에너지 1~5
  water?: number; // 물 섭취(잔)
  weight?: number; // 체중(kg)
  shower?: number; // 샤워 횟수
  stretch?: number; // 스트레칭 횟수
};

export type DailyLog = {
  date: string; // YYYY-MM-DD (키)
  sleep?: Sleep;
  exercise?: Exercise; // 레거시 단일(호환용) — 신규는 exercises 사용
  exercises?: Exercise[]; // 하루 여러 운동
  reading?: Reading; // 레거시 단일(호환용) — 신규는 readings 사용
  readings?: Reading[]; // 하루 여러 독서
  study?: Study;
  work?: Work;
  wellbeing?: Wellbeing;
  supplements?: string[]; // 오늘 복용한 영양제 종류(비어있으면 미복용)
  note?: string; // 하루 한 줄 메모
};

export type GoalMetric =
  | "exerciseDays" // 주/월 운동한 날 수
  | "studyMinutes" // 총 공부 분
  | "readingMinutes" // 총 독서 분
  | "workDone" // 완료 업무 수
  | "sleepAvgHours"; // 평균 수면 시간(목표 이상)

export type Goal = {
  id: string;
  title: string;
  emoji?: string;
  metric: GoalMetric;
  target: number;
  period: "week" | "month";
};

export type Book = {
  id: string;
  title: string;
  author?: string;
  status: "want" | "reading" | "done";
  pages?: number;
  currentPage?: number;
  rating?: number;
  note?: string;
  finishedAt?: string; // YYYY-MM-DD
};

// ── 운동일지 (번핏 스타일: 세션 → 종목 → 세트) ──────────
export type WorkoutSet = {
  weight?: number; // kg
  reps?: number; // 회
  done?: boolean; // 완료 체크
};

export type WorkoutExercise = {
  id: string;
  name: string; // 종목명(예: 벤치프레스)
  part?: string; // 부위(가슴/등/하체 …)
  sets: WorkoutSet[];
  note?: string;
};

export type WorkoutSession = {
  id: string;
  date: string; // YYYY-MM-DD
  title?: string; // 예: 상체, 하체, 가슴+삼두
  durationMin?: number; // 운동 시간(분)
  exercises: WorkoutExercise[];
  note?: string;
};

export type ScheduleItem = {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  start?: string; // HH:MM
  end?: string; // HH:MM
  location?: string;
  category?: string;
  note?: string;
  syncedToGcal?: boolean;
};

export type Settings = {
  ownerName?: string;
  calendarEmbedUrl?: string; // 구글 캘린더 임베드 URL 또는 캘린더 ID
  targets?: {
    sleepHours?: number; // 목표 수면 시간
    exerciseDaysPerWeek?: number;
    studyMinutesPerDay?: number;
    readingMinutesPerDay?: number;
    waterCups?: number;
  };
};

export type UnoState = {
  logs: Record<string, DailyLog>;
  goals: Goal[];
  books: Book[];
  schedule: ScheduleItem[];
  workouts: WorkoutSession[];
  settings: Settings;
};

export const DEFAULT_STATE: UnoState = {
  logs: {},
  goals: [
    { id: "g-ex", title: "주 4회 운동", emoji: "🏋️", metric: "exerciseDays", target: 4, period: "week" },
    { id: "g-study", title: "주 500분 공부", emoji: "📚", metric: "studyMinutes", target: 500, period: "week" },
    { id: "g-read", title: "주 210분 독서", emoji: "📖", metric: "readingMinutes", target: 210, period: "week" },
    { id: "g-sleep", title: "평균 7시간 수면", emoji: "😴", metric: "sleepAvgHours", target: 7, period: "week" },
  ],
  books: [],
  schedule: [],
  workouts: [],
  settings: {
    targets: {
      sleepHours: 7,
      exerciseDaysPerWeek: 4,
      studyMinutesPerDay: 60,
      readingMinutesPerDay: 30,
      waterCups: 8,
    },
  },
};
