$(document).ready(function () {
  // Banner Text aktualisieren
  $('#banner-form').on('submit', function (e) {
    e.preventDefault();
    const newBannerText = $(this).find('input[name="bannerText"]').val();

    $.ajax({
      url: '/update-banner-text',
      method: 'PATCH',
      contentType: 'application/json',
      data: JSON.stringify({ bannerText: newBannerText }),
      success: function () {
        $('.banner-text').text(newBannerText);
        alert('Banner-Text aktualisiert!');
      },
      error: function (xhr, status, error) {
        alert('Fehler beim Aktualisieren des Banners.');
        console.error(error);
      }
    });
  });

  // Banner ein-/ausblenden
  $('#toggle-banner').on('click', function () {
    $.ajax({
      url: '/toggle-banner',
      method: 'PATCH',
      contentType: 'application/json',
      success: function (response) {
        const banner = $('.banner-container');
        const button = $('#toggle-banner');
        if (response.bannerEnabled) {
          banner.show();
          button.text('Banner ausblenden');
        } else {
          banner.hide();
          button.text('Banner einblenden');
        }
      },
      error: function (xhr, status, error) {
        alert('Fehler beim Umschalten des Banners.');
        console.error(error);
      }
    });
  });



});
