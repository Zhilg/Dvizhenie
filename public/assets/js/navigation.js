// Инициализация навигации при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    // Добавляем активный класс к текущей странице в меню навигации
    const currentPath = window.location.pathname; // Получаем текущий путь страницы
    const navLinks = document.querySelectorAll('.nav-button'); // Находим все кнопки навигации

    navLinks.forEach(link => {
        if (link.getAttribute('href') === currentPath) {
            link.classList.add('active'); // Выделяем активную страницу
        }
    });

    // Логирование переходов между страницами для отладки
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            console.log(`Navigating to ${link.getAttribute('href')}`); // Записываем в консоль переход
        });
    });
});