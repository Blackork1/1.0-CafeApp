$(function(){
    // Toggle Ein/Ausblenden
    $(document).on('click', '.toggle-button', function(e){
      e.preventDefault();
      const ctrl    = $(this).closest('.admin-controls');
      const id      = ctrl.data('id');            // hier holen wir uns die ID
      const cur     = $(this).data('enabled');
      const nxt     = !cur;
  
      console.log('Toggle ID:', id, '→', nxt);    // DEBUG: überprüfe in der Konsole
  
      $.ajax({
        url: `/eventbuchung/${id}/toggle`,
        method: 'PATCH',
        contentType: 'application/json',
        data: JSON.stringify({ enabled: nxt }),
      })
      .done(() => {
        // Button-Label updaten
        $(this).data('enabled', nxt)
               .text(nxt ? 'Ausblenden' : 'Einblenden');
        // nur die Radio-Option aus-/einblenden
        $(`#event-${id}`).closest('.radio-item').toggle(nxt);
      })
      .fail(xhr => {
        console.error(xhr);
        alert('Fehler beim Umschalten');
      });
    });
  
    // Name ändern
    $(document).on('click', '.update-name', function(e){
      e.preventDefault();
      const ctrl    = $(this).closest('.admin-controls');
      const id      = ctrl.data('id');
      const newName = ctrl.find('.name-input').val().trim();
  
      console.log('Update ID:', id, 'Name:', newName);  // DEBUG
  
      if (!newName) {
        return alert('Bitte gib einen neuen Namen ein.');
      }
  
      $.ajax({
        url: `/eventbuchung/${id}/update`,
        method: 'PATCH',
        contentType: 'application/json',
        data: JSON.stringify({ name: newName }),
      })
      .done(() => {
        // Feedback am Button
        $(this).text('✔️').delay(800).queue(next => {
          $(this).text('Name ändern');
          next();
        });
        // Label und Radio-Input value updaten
        $(`label[for="event-${id}"]`).text(newName);
        $(`#event-${id}`).val(newName);
      })
      .fail(xhr => {
        console.error(xhr);
        alert('Fehler beim Ändern des Namens');
      });
    });
  });
  