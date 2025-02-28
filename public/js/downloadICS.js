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

    // Parse the time (assuming format "startTime-endTime" where each is in HH:MM format)
    const [startTime, endTime] = time.split("-");
    if (!startTime || !endTime) {
      console.error("Time format is not valid. Expected format 'HH:MM-HH:MM'.");
      return;
    }

    // Create start and end Date objects
    // Create start and end Date objects by appending ':00' for seconds
    const startDateTime = new Date(`${date}T${startTime}:00`);
    const endDateTime = new Date(`${date}T${endTime}:00`);

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
