document.addEventListener('DOMContentLoaded', () => {
    // Добавляем активный класс к текущей странице
    const currentPath = window.location.pathname;
    const navLinks = document.querySelectorAll('.nav-button');
    
    navLinks.forEach(link => {
        if (link.getAttribute('href') === currentPath) {
            link.classList.add('active');
        }
    });
    
    // Логирование переходов
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            console.log(`Navigating to ${link.getAttribute('href')}`);
        });
    });
});