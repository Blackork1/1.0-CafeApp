import express from 'express';
import bodyParser from 'body-parser';
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

// Step 1: Show tables for selection
app.get("/", async (req, res) => {
    try {
        const tablesResult = await db.query("SELECT id, tablename, places, roomname FROM tables ORDER BY id ASC");
        res.render("index", { 
            tables: tablesResult.rows, 
            selectedTable: null, 
            availableDates: [], 
            availableTimes: [], 
            selectedDate: null 
        });
    } catch (err) {
        console.error("Database error:", err);
        res.status(500).send("Internal Server Error");
    }
});

// Step 2: Show only dates where at least one time slot is available
app.post("/select-table", async (req, res) => {
    const tableId = req.body.tableId;

    try {
        const tableResult = await db.query("SELECT * FROM tables WHERE id = $1", [tableId]);
        if (tableResult.rows.length === 0) return res.redirect("/");

        // Get all weekend dates
        const allDates = getAvailableDays();

        // Get all booked dates and times
        const bookedResult = await db.query(`
            SELECT date, time FROM booking WHERE table_id = $1
        `, [tableId]);

        const bookedData = bookedResult.rows.reduce((acc, row) => {
            if (!acc[row.date]) acc[row.date] = [];
            acc[row.date].push(row.time);
            return acc;
        }, {});

        // Keep only dates where at least one time slot is free
        const allTimes = ["13-15", "15-17"];
        const availableDates = allDates.filter(date => {
            const bookedTimes = bookedData[date] || [];
            return allTimes.some(time => !bookedTimes.includes(time));
        });

        res.render("index", { 
            tables: [], 
            selectedTable: tableResult.rows[0], 
            availableDates, 
            availableTimes: [], 
            selectedDate: null 
        });

    } catch (err) {
        console.error("Database error:", err);
        res.status(500).send("Error fetching available dates");
    }
});

// Step 3: Show only available times for the selected date
app.post("/select-date", async (req, res) => {
    const { tableId, selectedDate } = req.body;

    try {
        const tableResult = await db.query("SELECT * FROM tables WHERE id = $1", [tableId]);
        if (tableResult.rows.length === 0) return res.redirect("/");

        // Get all possible time slots
        const allTimes = ["13-15", "15-17"];

        // Get booked times for the selected date
        const bookedTimesResult = await db.query(`
            SELECT time FROM booking WHERE table_id = $1 AND date = $2
        `, [tableId, selectedDate]);

        const bookedTimes = bookedTimesResult.rows.map(row => row.time);

        // Filter available times
        const availableTimes = allTimes.filter(time => !bookedTimes.includes(time));

        res.render("index", { 
            tables: [], 
            selectedTable: tableResult.rows[0], 
            availableDates: [selectedDate], 
            availableTimes, 
            selectedDate 
        });

    } catch (err) {
        console.error("Database error:", err);
        res.status(500).send("Error fetching available times");
    }
});

// Step 4: Finalize reservation
app.post("/reserve", async (req, res) => {
    const { selectedTable, selectedDate, selectedTime, numPeople, name, email } = req.body;

    try {
        // Insert into database
        await db.query(`
            INSERT INTO booking (table_id, date, time, places_selected, name, email)
            VALUES ($1, $2, $3, $4, $5, $6)
        `, [selectedTable, selectedDate, selectedTime, numPeople, name, email]);

        res.send(`Reservation confirmed for ${name} at Table ${selectedTable} on ${selectedDate} at ${selectedTime} for ${numPeople} people.`);
    } catch (err) {
        console.error("Database error:", err);
        res.status(500).send("An error occurred while processing your reservation.");
    }
});

app.listen(port, () => {
    console.log(`Server running on port http://localhost:${port}`);
});

// Function to get available weekend days
function getAvailableDays() {
    const today = new Date();
    const days = [];
    
    for (let i = 0; i < 4 * 7; i++) {
        const date = new Date();
        date.setDate(today.getDate() + i);
        const dayOfWeek = date.getDay();

        if (dayOfWeek === 6 || dayOfWeek === 0) { // Saturday (6) or Sunday (0)
            days.push(date.toISOString().split("T")[0]); // Format YYYY-MM-DD
        }
    }
    return days;
}
