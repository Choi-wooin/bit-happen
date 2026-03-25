const session = window.BitHappenAdminAuth.requireAuth();
if (!session) {
  throw new Error('not authenticated');
}

const message = document.getElementById('users-message');
const usersList = document.getElementById('users-list');
const createForm = document.getElementById('create-user-form');
const changeForm = document.getElementById('change-password-form');

if (session.role !== 'super_admin') {
  document.body.innerHTML = '<main style="padding:20px;font-family:Noto Sans KR,sans-serif;">접근 권한이 없습니다.</main>';
  throw new Error('forbidden');
}

function setMessage(text, isError = true) {
  message.style.color = isError ? '#b61d3a' : '#1f7a35';
  message.textContent = text;
}

function formatTime(value) {
  const n = Number(value || 0);
  if (!n) return '-';
  return new Date(n).toLocaleString('ko-KR');
}

async function renderUsers() {
  const result = await window.BitHappenAdminAuth.listUsers(session);
  if (!result.ok) {
    usersList.innerHTML = '<p>사용자 목록을 불러오지 못했습니다.</p>';
    return;
  }

  usersList.innerHTML = result.users
    .map(
      (user) => `
      <article class="user-item">
        <strong>${user.id}</strong>
        <p>역할: ${user.role}</p>
        <p>생성: ${formatTime(user.createdAt)}</p>
        <p>수정: ${formatTime(user.updatedAt)}</p>
      </article>
    `
    )
    .join('');
}

createForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setMessage('');

  const id = document.getElementById('new-user-id').value;
  const password = document.getElementById('new-user-password').value;
  const role = document.getElementById('new-user-role').value;

  try {
    const result = await window.BitHappenAdminAuth.createUser(session, id, password, role);
    if (!result.ok) {
      setMessage(result.message || '계정 생성에 실패했습니다.');
      return;
    }

    createForm.reset();
    await renderUsers();
    setMessage('계정을 생성했습니다.', false);
  } catch (_error) {
    setMessage('계정 생성 중 오류가 발생했습니다.');
  }
});

changeForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setMessage('');

  const id = document.getElementById('target-user-id').value;
  const password = document.getElementById('target-user-password').value;

  try {
    const result = await window.BitHappenAdminAuth.changePassword(session, id, password);
    if (!result.ok) {
      setMessage(result.message || '비밀번호 변경에 실패했습니다.');
      return;
    }

    changeForm.reset();
    await renderUsers();
    setMessage('비밀번호를 변경했습니다.', false);
  } catch (_error) {
    setMessage('비밀번호 변경 중 오류가 발생했습니다.');
  }
});

renderUsers();