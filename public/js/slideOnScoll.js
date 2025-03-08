// document.addEventListener("DOMContentLoaded", function () {
//     const minVisibleRatio = window.innerWidth < 600 ? 0.2 : 0.8;

//     const thresholds = Array.from({ length: 101 }, (_, i) => i / 100);
//     const observerOptions = { threshold: thresholds };

//     const observer = new IntersectionObserver((entries) => {
//       entries.forEach((entry) => {
//         const ratio = entry.intersectionRatio;

//         // Only make the element visible if it's at least 30% in view
//         if (ratio < minVisibleRatio) {
//           entry.target.style.opacity = 0;
//         //   // Optionally, you might want to keep it slightly offscreen:
//           if (entry.target.classList.contains("slide-left")) {
//             entry.target.style.transform = `translateX(-100px)`;
//           } else if (entry.target.classList.contains("slide-right")) {
//             entry.target.style.transform = `translateX(100px)`;
//           }
//         } else {
//           // When the element is sufficiently visible, calculate the transform offset based on the ratio.
//           if (entry.target.classList.contains("slide-left")) {
//             const offset = -100 * (1 - ratio);
//             entry.target.style.transform = `translateX(${offset}px)`;
//           } else if (entry.target.classList.contains("slide-right")) {
//             const offset = 100 * (1 - ratio);
//             entry.target.style.transform = `translateX(${offset}px)`;
//           }
//           entry.target.style.opacity = ratio;
//         }
//       });
//     }, observerOptions);

//     const slideElements = document.querySelectorAll(
//       ".slide-left, .slide-right"
//     );
//     slideElements.forEach((el) => observer.observe(el));
//   });

document.addEventListener("DOMContentLoaded", function () {
  // Set the minimum visible ratio (0.8 for larger screens, or 0.2 for small screens)
  const minVisibleRatio = window.innerWidth < 600 ? 0.2 : 0.8;
  // Create thresholds from 0 to 1 in 0.01 steps
  const thresholds = Array.from({ length: 101 }, (_, i) => i / 100);
  const observerOptions = { threshold: thresholds };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const ratio = entry.intersectionRatio;
      
      if (ratio < minVisibleRatio) {
        // When the element is less than the minimum visible ratio, keep it hidden at full offset.
        entry.target.style.opacity = 0;
        if (entry.target.classList.contains("slide-left")) {
          entry.target.style.transform = `translateX(-100px)`;
        } else if (entry.target.classList.contains("slide-right")) {
          entry.target.style.transform = `translateX(100px)`;
        }
      } else {
        // When the element is at least minVisibleRatio visible, calculate a progress factor.
        // progress = 0 when ratio == minVisibleRatio, and progress = 1 when ratio == 1.
        let progress = (ratio - minVisibleRatio) / (1 - minVisibleRatio);
        if (progress > 1) progress = 1; // ensure we don't exceed 1

        // Calculate the offset: 100px when progress = 0, 0px when progress = 1.
        const offset = 100 * (1 - progress);

        // Apply the transform based on element's class.
        if (entry.target.classList.contains("slide-left")) {
          entry.target.style.transform = `translateX(-${offset}px)`;
        } else if (entry.target.classList.contains("slide-right")) {
          entry.target.style.transform = `translateX(${offset}px)`;
        }

        // Set opacity. Here, we use the progress so that the element fades in as it moves.
        // At ratio = 0.8, progress is 0 and opacity is 0; at ratio = 1, progress is 1 and opacity is 1.
        entry.target.style.opacity = progress;
      }
    });
  }, observerOptions);

  const slideElements = document.querySelectorAll(".slide-left, .slide-right");
  slideElements.forEach((el) => observer.observe(el));
});
