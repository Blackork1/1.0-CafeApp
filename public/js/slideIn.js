
window.addEventListener("load", function () {
    let imgEinfliegen = document.querySelectorAll(".flex_einfliegen > img");
    imViewport();
    function imViewport() {
        for (let i = 0; i < imgEinfliegen.length; i++) {
            if (imgEinfliegen[i].getBoundingClientRect().top >= 0) {
                if (imgEinfliegen[i].getBoundingClientRect().top <= window.innerHeight) {
                    imgEinfliegen[i].style.opacity = "1";
                    imgEinfliegen[i].style.transform = "translateX(0)";
                }
            }

        }
    }
    window.addEventListener("scroll", imViewport);
})
  