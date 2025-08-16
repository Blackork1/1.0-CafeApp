document.addEventListener("DOMContentLoaded", function () {
  const menuIcon = document.getElementById("menu-icon");
  const navLinks = document.getElementById("nav-links");
  const navBar = document.getElementById("navigation");

  menuIcon.addEventListener("click", function () {
    navLinks.classList.toggle("active");
    navBar.classList.toggle("active");
  });

  document.addEventListener("click", function (event) {
    if (navBar.classList.contains("active") && !navBar.contains(event.target)) {
      navLinks.classList.remove("active");
      navBar.classList.remove("active");
    }
  });
});