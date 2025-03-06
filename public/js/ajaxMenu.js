$(document).ready(function() {
    // Update price via Ajax
    $('.update-price').on('click', function(e) {
      e.preventDefault();
      const drinkId = $(this).data('drink-id');
      const input = $(`.price-input[data-drink-id="${drinkId}"]`);
      const newPrice = input.val();
  
      $.ajax({
        url: `/menu/${drinkId}`,
        method: 'PATCH',
        contentType: 'application/json',
        data: JSON.stringify({ price: newPrice }),
        success: function(response) {
          $(`.update-price[data-drink-id="${drinkId}"]`).text('✔️').delay(1000).queue(function(next){
            $(this).text('✅');
            next();
          });
        },
        error: function(xhr, status, error) {
          alert('Error updating price.');
          console.error(error);
        }
      });
    });
  
    // Delete drink via Ajax
    $('.delete-drink').on('click', function(e) {
      e.preventDefault();
      if (!confirm("Are you sure you want to delete this drink?")) return;
      const drinkId = $(this).data('drink-id');
  
      $.ajax({
        url: `/menu/${drinkId}`,
        method: 'DELETE',
        success: function(response) {
          $(`[data-drink-id="${drinkId}"]`).closest('.drink-item').fadeOut();
        },
        error: function(xhr, status, error) {
          alert('Error deleting drink.');
          console.error(error);
        }
      });
    });
  
    // Toggle (enable/disable) drink via Ajax
    $('.toggle-drink').on('click', function(e) {
      e.preventDefault();
      const drinkId = $(this).data('drink-id');
      const currentEnabled = $(this).data('enabled');
      const newEnabled = !currentEnabled;
  
      $.ajax({
        url: `/menu/${drinkId}/toggle`,
        method: 'PATCH',
        contentType: 'application/json',
        data: JSON.stringify({ enabled: newEnabled }),
        success: function(response) {
          const btn = $(`.toggle-drink[data-drink-id="${drinkId}"]`);
          btn.data('enabled', newEnabled);
          btn.text(newEnabled ? 'Ausblenden' : 'Einblenden');
        },
        error: function(xhr, status, error) {
          alert('Error toggling drink.');
          console.error(error);
        }
      });
    });
  
    // Add new drink via Ajax
    $('.add-drink-form').on('submit', function(e) {
      e.preventDefault();
      const form = $(this);
      const category = form.data('category');
      const name = form.find('input[name="name"]').val();
      const price = form.find('input[name="price"]').val();
      const image = form.find('input[name="image"]').val();
  
      $.ajax({
        url: `/menu`,
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ name, price, image, main_category: category }),
        success: function(response) {
          const newDrink = response.drink;
          const newDrinkHTML = `
            <li class="drink-item" data-drink-id="${newDrink.id}">
              <span class="drink-name">${newDrink.name}</span>
              <span class="drink-price">
                <input type="number" class="price-input" value="${newDrink.price}" data-drink-id="${newDrink.id}">
                <button class="update-price" data-drink-id="${newDrink.id}">✅</button>
                <button class="delete-drink" data-drink-id="${newDrink.id}">Löschen</button>
                <button class="toggle-drink" data-drink-id="${newDrink.id}" data-enabled="true">Ausblenden</button>
              </span>
            </li>
          `;
          form.closest('.menu-card').find('.drink-list').append(newDrinkHTML);
          form[0].reset();
        },
        error: function(xhr, status, error) {
          alert('Error adding drink.');
          console.error(error);
        }
      });
    });
  });
  