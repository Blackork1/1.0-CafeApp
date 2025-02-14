document.addEventListener("DOMContentLoaded", function () {
    const downloadButton = document.getElementById("download-ics");
    if (!downloadButton) return;
  
    downloadButton.addEventListener("click", function () {
      // Retrieve data attributes from the button
      const name = downloadButton.dataset.name;
      const date = downloadButton.dataset.date; // Expected format: YYYY-MM-DD
      const time = downloadButton.dataset.time; // Expected format: e.g., "13-15"
  
      if (!name || !date || !time) {
        console.error("Missing reservation data on the button!");
        return;
      }
  
      // Parse the time (assuming format "startHour-endHour")
      const [startHour, endHour] = time.split("-");
      if (!startHour || !endHour) {
        console.error("Time format is not valid. Expected format 'startHour-endHour'.");
        return;
      }
  
      // Create start and end Date objects
      // Ensure hours are two-digit strings if needed (e.g., "13" rather than "3")
      const startDateTime = new Date(`${date}T${startHour.padStart(2, "0")}:00:00`);
      const endDateTime = new Date(`${date}T${endHour.padStart(2, "0")}:00`);
  
      // Helper to format dates in ICS format (YYYYMMDDTHHMMSSZ)
      function formatDate(dateObj) {
        return dateObj
          .toISOString()
          .replace(/[-:]/g, "")
          .split(".")[0] + "Z";
      }
  
      // Create the ICS content
      const icsContent = `
BEGIN:VCALENDAR
VERSION:2.0
CALSCALE:GREGORIAN
BEGIN:VEVENT
SUMMARY:Reservierung für ${name}
DTSTART:${formatDate(startDateTime)}
DTEND:${formatDate(endDateTime)}
DESCRIPTION:Deine Reservierung wurde bestätigt.
LOCATION:Kaffee Zur Alten Backstube
END:VEVENT
END:VCALENDAR`.trim();
  
      // Create a Blob from the ICS content and trigger a download
      const blob = new Blob([icsContent], { type: "text/calendar" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "reservation.ics";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  });
  