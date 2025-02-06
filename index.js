import express from 'express';
import bodyParser from 'body-parser';
import session from 'express-session';
import pg from 'pg';
import env from "dotenv";

env.config();

const app = express();
const port = process.env.PORT || 3000;

const db = new pg.Client({
    user: process.env.PG_USER,
    host: process.env.PG_HOST,
    database: process.env.PG_DATABASE,
    password: process.env.PG_PASSWORD,
    port: process.env.PG_PORT,
});

db.connect();

app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

// Get available weekend dates (next 4 weeks)
function getAvailableDays() {
    const today = new Date();
    const days = [];
    
    for (let i = 0; i < 4 * 7; i++) {
        const date = new Date();
        date.setDate(today.getDate() + i);
        const dayOfWeek = date.getDay();

        if (dayOfWeek === 6 || dayOfWeek === 0) { // Saturday (6) or Sunday (0)
            days.push(date.toISOString().split("T")[0]); // YYYY-MM-DD format
        }
    }
    return days;
}

// Step 1: Load all tables
app.get("/", async (req, res) => {
    try {
        const result = await db.query("SELECT id, tablename, places, roomname FROM tables ORDER BY id ASC");
        const tables = result.rows;
        res.render("index", { tables, selectedTable: null, availableDates: [], availableTimes: [] });
    } catch (err) {
        console.error("Database error:", err);
        res.status(500).send("Internal Server Error");
    }
});

// Step 2: Fetch available dates when a table is selected
app.post("/select-table", async (req, res) => {
    const tableId = req.body.tableId;

    try {
        const tableResult = await db.query("SELECT * FROM tables WHERE id = $1", [tableId]);
        if (tableResult.rows.length === 0) return res.redirect("/");

        const selectedTable = tableResult.rows[0];

        // Get all weekend days for the next 4 weeks
        const allAvailableDates = getAvailableDays();

        // Fetch already booked dates for the selected table
        const bookingResult = await db.query("SELECT DISTINCT date FROM booking WHERE table_id = $1", [tableId]);
        const bookedDates = bookingResult.rows.map(row => row.date.toISOString().split("T")[0]);

        // Filter out booked dates
        const availableDates = allAvailableDates.filter(date => !bookedDates.includes(date));

        res.render("index", { tables: [], selectedTable, availableDates, availableTimes: [] });
    } catch (err) {
        console.error("Database error:", err);
        res.status(500).send("Internal Server Error");
    }
});

// Step 3: Fetch available times when a date is selected
app.post("/select-date", async (req, res) => {
    const { tableId, selectedDate } = req.body;

    try {
        const tableResult = await db.query("SELECT * FROM tables WHERE id = $1", [tableId]);
        if (tableResult.rows.length === 0) return res.redirect("/");

        const selectedTable = tableResult.rows[0];

        // Define time slots
        const allTimes = ["13-15", "15-17"];

        // Fetch already booked times for the selected table and date
        const bookingResult = await db.query("SELECT DISTINCT time FROM booking WHERE table_id = $1 AND date = $2", [tableId, selectedDate]);
        const bookedTimes = bookingResult.rows.map(row => row.time);

        // Filter out booked times
        const availableTimes = allTimes.filter(time => !bookedTimes.includes(time));

        // Reload with available times
        res.render("index", { tables: [], selectedTable, availableDates: [selectedDate], availableTimes });
    } catch (err) {
        console.error("Database error:", err);
        res.status(500).send("Internal Server Error");
    }
});

// Step 4: Handle final reservation submission
app.post("/reserve", async (req, res) => {
    const { selectedTable, selectedDate, selectedTime, numPeople, name, email } = req.body;

    try {
        // Check if the table is still available
        const checkQuery = `SELECT * FROM booking WHERE table_id = $1 AND date = $2 AND time = $3`;
        const checkResult = await db.query(checkQuery, [selectedTable, selectedDate, selectedTime]);

        if (checkResult.rows.length > 0) {
            return res.send(`Sorry, Table ${selectedTable} is already booked for ${selectedDate} at ${selectedTime}. Please choose another.`);
        }

        // Insert into database
        const insertQuery = `
            INSERT INTO booking (table_id, date, time, places_selected, name, email)
            VALUES ($1, $2, $3, $4, $5, $6)
        `;
        await db.query(insertQuery, [selectedTable, selectedDate, selectedTime, numPeople, name, email]);

        res.send(`Reservation confirmed for ${name} at Table ${selectedTable} on ${selectedDate} at ${selectedTime} for ${numPeople} people.`);
    } catch (err) {
        console.error("Database error:", err);
        res.status(500).send("An error occurred while processing your reservation.");
    }
});

app.listen(port, () => {
    console.log(`Server running on port http://localhost:${port}`);
});
