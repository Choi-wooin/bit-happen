const session = window.BitHappenAdminAuth.requireAuth();
if (!session) {
  throw new Error('not authenticated');
}

const sessionUser = document.getElementById('session-user');
const menuRoot = document.getElementById('menu-root');
const frame = document.getElementById('admin-frame');
const logoutButton = document.getElementById('logout-btn');

sessionUser.textContent = `${session.id} (${session.role})`;

if (session.role === 'super_admin') {
  const userButton = document.createElement('button');
  userButton.type = 'button';
  userButton.dataset.page = 'admin-users.html';
  userButton.textContent = '사용자 관리';
  menuRoot.appendChild(userButton);
}

function activateButton(target) {
  Array.from(menuRoot.querySelectorAll('button')).forEach((button) => {
    button.classList.toggle('active', button === target);
  });
}

Array.from(menuRoot.querySelectorAll('button')).forEach((button) => {
  button.addEventListener('click', () => {
    const page = button.dataset.page;
    if (!page) return;
    frame.src = page;
    activateButton(button);
  });
});

logoutButton.addEventListener('click', () => {
  window.BitHappenAdminAuth.logout();
  window.location.href = 'login.html';
});