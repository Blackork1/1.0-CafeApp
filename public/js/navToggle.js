document.addEventListener("DOMContentLoaded", function () {
    const menuIcon = document.getElementById("menu-icon");
    const navLinks = document.getElementById("nav-links");
    const navBar = document.getElementById("navigation");

    menuIcon.addEventListener("click", function () {
      navLinks.classList.toggle("active");
      navBar.classList.toggle("active");
    });
  });