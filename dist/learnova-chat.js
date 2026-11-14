const app = document.querySelector('.learnova-app');
document.querySelector('#sidebar-toggle').addEventListener('click', () => {
  app.classList.toggle('sidebar-open');
  document.querySelector('#sidebar-toggle').setAttribute('aria-expanded', String(app.classList.contains('sidebar-open')));
});
