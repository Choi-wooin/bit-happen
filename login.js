const form = document.getElementById('login-form');
const idInput = document.getElementById('login-id');
const passwordInput = document.getElementById('login-password');
const message = document.getElementById('login-message');

if (window.BitHappenAdminAuth?.getSession()) {
  window.location.href = 'admin.html';
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  message.textContent = '';

  try {
    const result = await window.BitHappenAdminAuth.login(idInput.value, passwordInput.value);
    if (!result.ok) {
      message.textContent = result.message || '로그인에 실패했습니다.';
      return;
    }

    window.location.href = 'admin.html';
  } catch (_error) {
    message.textContent = '로그인 처리 중 오류가 발생했습니다.';
  }
});