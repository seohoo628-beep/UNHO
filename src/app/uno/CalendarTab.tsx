"use client";

// 앱은 캘린더를 직접 들고 있지 않는다. 일정은 구글/굿캘린더에서 관리하고,
// 이 탭은 내 (로그인된) 구글 캘린더를 바로 여는 통로 역할만 한다.
// → 비공개 업무 일정을 공개 URL에 노출하지 않으면서 안전하게 확인.
export default function CalendarTab() {
  return (
    <div className="uno-cal">
      <div className="card uno-cal-hub">
        <div className="uno-cal-hub-ico">📅</div>
        <h3>캘린더</h3>
        <p className="muted">
          일정은 <strong>구글 캘린더(굿캘린더)</strong>에서 관리하세요. 아래 버튼을 누르면 로그인된 내 구글 캘린더가
          그대로 열립니다.
        </p>

        <div className="uno-cal-hub-btns">
          <a className="btn primary" href="https://calendar.google.com/calendar/r/week" target="_blank" rel="noreferrer">
            📅 구글 캘린더 열기 (주간) ↗
          </a>
          <a className="btn" href="https://calendar.google.com/calendar/r" target="_blank" rel="noreferrer">
            구글 캘린더 홈 ↗
          </a>
        </div>

        <ul className="uno-cal-hub-tips">
          <li>휴대폰에서는 이 버튼이 구글 캘린더 앱으로 열릴 수 있어요.</li>
          <li>
            <strong>굿캘린더</strong>는 폰에서 앱을 바로 열어 확인하세요. 같은 구글 계정이면 여기 열리는 일정과
            동일합니다.
          </li>
          <li>일정 추가·수정·삭제는 구글 캘린더/굿캘린더에서 하시면 됩니다.</li>
        </ul>
      </div>
    </div>
  );
}
