document.addEventListener("DOMContentLoaded", function () {
    const sliderMask = document.querySelector(".slider-mask");
    const slides = document.querySelectorAll(".slide");
    const prevArrow = document.getElementById("prev");
    const nextArrow = document.getElementById("next");

    let currentIndex = 0;
    const slideWidth = 370; // Fixed slide width
    const slideMarginRight = 60; // Same as in CSS

    function updateSlider() {
      // Calculate the offset: slide width + margin for each slide
      const offset = currentIndex * (slideWidth + slideMarginRight);
      sliderMask.style.transform = `translateX(-${offset}px)`;

      // Set the 'focused' class: only the current slide is clear
      slides.forEach((slide, index) => {
        if (index === currentIndex) {
          slide.classList.add("focused");
        } else {
          slide.classList.remove("focused");
        }
      });

      // Update arrow button disabled states
      if (currentIndex === 0) {
        prevArrow.classList.add("disabled");
      } else {
        prevArrow.classList.remove("disabled");
      }
      if (currentIndex === slides.length - 1) {
        nextArrow.classList.add("disabled");
      } else {
        nextArrow.classList.remove("disabled");
      }
    }

    // Initialize the slider
    updateSlider();

    // Arrow click events:
    prevArrow.addEventListener("click", () => {
      if (currentIndex > 0) {
        currentIndex--;
        updateSlider();
      }
    });

    nextArrow.addEventListener("click", () => {
      if (currentIndex < slides.length - 1) {
        currentIndex++;
        updateSlider();
      }
    });
  });