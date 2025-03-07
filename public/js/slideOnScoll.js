document.addEventListener("DOMContentLoaded", function () {
    const minVisibleRatio = window.innerWidth < 600 ? 0.5 : 0.8;

    const thresholds = Array.from({ length: 101 }, (_, i) => i / 100);
    const observerOptions = { threshold: thresholds };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const ratio = entry.intersectionRatio;

        // Only make the element visible if it's at least 30% in view
        if (ratio < minVisibleRatio) {
          entry.target.style.opacity = 0;
        //   // Optionally, you might want to keep it slightly offscreen:
          if (entry.target.classList.contains("slide-left")) {
            entry.target.style.transform = `translateX(-100px)`;
          } else if (entry.target.classList.contains("slide-right")) {
            entry.target.style.transform = `translateX(100px)`;
          }
        } else {
          // When the element is sufficiently visible, calculate the transform offset based on the ratio.
          if (entry.target.classList.contains("slide-left")) {
            const offset = -100 * (1 - ratio);
            entry.target.style.transform = `translateX(${offset}px)`;
          } else if (entry.target.classList.contains("slide-right")) {
            const offset = 100 * (1 - ratio);
            entry.target.style.transform = `translateX(${offset}px)`;
          }
          entry.target.style.opacity = ratio;
        }
      });
    }, observerOptions);

    const slideElements = document.querySelectorAll(
      ".slide-left, .slide-right"
    );
    slideElements.forEach((el) => observer.observe(el));
  });