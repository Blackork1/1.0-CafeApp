import express from 'express';
import bodyParser from 'body-parser';
import pg from 'pg';
import env from "dotenv";
import bcrypt from "bcrypt";
import passport from "passport";
import { Strategy } from "passport-local";
import session from "express-session";
import nodemailer from 'nodemailer';
import multer from 'multer';
import e from 'express';


env.config();
const app = express();
const port = process.env.PORT || 3000;
const saltRounds = 10;

const userData = {
    isAdmin: false,
    isLoggedIn: false,
    userName: "",
    userEmail: "",
    selectedTable: null,
    selectedDate: null,
    selectedTime: null,
    selectedName: null,
}

// Configure the transporter (make sure to set EMAIL_USER and EMAIL_PASS in your .env file)
const transporter = nodemailer.createTransport({
    service: 'Gmail', // or use another email service
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
}));

const db = new pg.Client({
    connectionString: process.env.DATABASE_PUBLIC_URL,
    ssl: {
        rejectUnauthorized: false // Needed for Railway's managed PostgreSQL instances
    }
});

db.connect()
    .then(() => console.log("Connected to Railway PostgreSQL"))
    .catch(err => console.error("Connection error:", err));

app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

app.use(passport.initialize());
app.use(passport.session());



/* For Local use
const db = new pg.Client({
    user: process.env.PGUSER,
    host: process.env.PGHOST,
    database: process.env.PGDATABASE,
    password: process.env.PGPASSWORD,
    port: process.env.PGPORT,
});

db.connect();*/

// Multer-Konfiguration: Dateien werden im Arbeitsspeicher gehalten
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    // Optional: Maximale Dateigröße z. B. 5 MB festlegen
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: function (req, file, cb) {
        // Allow only jpeg and png files
        if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/png') {
            cb(null, true);
        } else {
            cb(new Error('Only .jpeg and .png files are allowed!'), false);
        }
    },
});
// Function to get weekend dates (next 4 weeks) in YYYY-MM-DD format

// Step 1: Show table selection
app.get("/", async (req, res) => {
    try {
        const result = await db.query("SELECT id, tablename, places, roomname FROM tables ORDER BY id ASC");
        const tables = result.rows;
        res.render("index", { tables, selectedTable: null, availableSlots: {}, user: userData });
    } catch (err) {
        console.error("Database error:", err);
        res.status(500).send("Internal Server Error");
    }
});

//!!Reservation Area!!
function getAvailableDays() {
    const today = new Date();
    const days = [];
    for (let i = 0; i < 4 * 7; i++) {
        const date = new Date();
        date.setDate(today.getDate() + i);
        const dayOfWeek = date.getDay();
        if (dayOfWeek === 6 || dayOfWeek === 0) { // Saturday or Sunday
            days.push(date.toISOString().split("T")[0]);
        }
    }
    return days;
}
// Step 1: Show table selection
app.get("/reservation", async (req, res) => {
    try {
        const result = await db.query("SELECT id, tablename, places, roomname FROM tables ORDER BY id ASC");
        const tables = result.rows;
        res.render("reservation", { tables, selectedTable: null, availableSlots: {}, user: userData });
    } catch (err) {
        console.error("Database error:", err);
        res.status(500).send("Internal Server Error");
    }
});

// Step 2: After table selection, compute available slots (dates with free times)
app.post("/select-table", async (req, res) => {
    const tableId = req.body.tableId;
    try {
        const tableResult = await db.query("SELECT * FROM tables WHERE id = $1", [tableId]);
        if (tableResult.rows.length === 0) return res.redirect("/");
        const selectedTable = tableResult.rows[0];

        const allDates = getAvailableDays();

        // --- CHANGE: Use to_char to get date strings from the DB ---
        const bookedResult = await db.query(
            `SELECT to_char(date, 'YYYY-MM-DD') as date, time FROM booking WHERE table_id = $1`,
            [tableId]
        );

        // Build an object where keys are dates (YYYY-MM-DD) and values are arrays of booked times.
        const bookedData = bookedResult.rows.reduce((acc, row) => {
            let dateStr = row.date; // Already a string due to to_char()
            if (!acc[dateStr]) acc[dateStr] = [];
            acc[dateStr].push(row.time);
            return acc;
        }, {});

        const allTimes = ["13-15", "15-17"];
        const availableSlots = {};
        allDates.forEach(date => {
            // --- CHANGE: Only add the date if at least one time is free ---
            const bookedTimes = bookedData[date] || [];
            const freeTimes = allTimes.filter(time => !bookedTimes.includes(time));
            if (freeTimes.length > 0) {
                availableSlots[date] = freeTimes;
            }
        });

        if (req.user) {
            userData.userName = req.user.name;
            userData.userEmail = req.user.email;
        }
        res.render("reservation", {
            tables: [],
            selectedTable,
            availableSlots,
            user: userData,
        });
    } catch (err) {
        console.error("Database error:", err);
        res.status(500).send("Error fetching available slots");
    }
});

// Step 3: Finalize reservation submission
app.post("/reserve", async (req, res) => {
    // The radio button value is in the format "YYYY-MM-DD|time"
    const { selectedTable, slot, numPeople, name, email } = req.body;
    const [selectedDate, selectedTime] = slot.split("|");

    try {
        const checkQuery = `SELECT * FROM booking WHERE table_id = $1 AND date = $2 AND time = $3`;
        const checkResult = await db.query(checkQuery, [selectedTable, selectedDate, selectedTime]);
        if (checkResult.rows.length > 0) {
            return res.send(`Sorry, Table ${selectedTable} is already booked for ${selectedDate} at ${selectedTime}. Please choose another.`);
        }
        const insertQuery = `
            INSERT INTO booking (table_id, date, time, places_selected, name, email)
            VALUES ($1, $2, $3, $4, $5, $6)
        `;
        await db.query(insertQuery, [selectedTable, selectedDate, selectedTime, numPeople, name, email]);
        // Compose the email content

        userData.selectedTable = selectedTable;
        userData.selectedDate = selectedDate;
        userData.selectedTime = selectedTime;
        userData.selectedName = name;

        const mailOptions = {
            from: process.env.EMAIL_USER, // Sender address
            to: email,                      // Recipient's email
            bcc: process.env.EMAIL_USER,     // Copy to sender
            subject: 'Reservierung Zur alten Backstube', // Subject line
            text: `Hallo ${name},
  
  Deine Reservierung wurde bestätigt:
  Tisch: ${selectedTable}
  Tag: ${selectedDate}
  Zeit: ${selectedTime}
  Anzahl an Gästen: ${numPeople}
  
  Vielen Dank für die Reservierung!

  Ich freue mich auf dich,
  dein Manu!     
  


  Zur alten Backstube
  Hauptstraße 155, 13158 Berlin
  Tel: 030-47488482`,
        };

        // Send the email
        await transporter.sendMail(mailOptions);
        res.redirect("/booked")
        // res.send(`Reservation confirmed for ${name} at Table ${selectedTable} on ${selectedDate} at ${selectedTime} for ${numPeople} people.`);
    } catch (err) {
        console.error("Database error:", err);
        res.status(500).send("An error occurred while processing your reservation.");
    }
});

app.get("/allReservations", async (req, res) => {
    try {
        const result = await db.query("SELECT * FROM booking ORDER BY date ASC");
        const bookings = result.rows;
        console.log(bookings);

        if (userData.isAdmin) {
            res.render("allReservations", { bookings, user: userData });
        } else {
            res.redirect("/");
        }
    } catch (err) {
        console.error("Database error:", err);
        res.status(500).send("Internal Server Error");
    }
});

app.post("/deleteReservation/:id", async (req, res) => {
    const id = req.params.id;
    try {
        const result = await db.query("DELETE FROM booking WHERE id = $1", [id]);
        res.redirect("/allReservations");
    } catch (err) {
        console.log(err);
    }
});

app.get("/booked", async (req, res) => {
    res.render("booked.ejs", { user: userData });
});

//!!Blog Area!!
// Route to serve image data for a given blog post
app.get('/image/:id', async (req, res) => {
    const { id } = req.params;
    try {
        // Query to get image data for the specific post
        const result = await db.query(
            'SELECT image_data, image_name FROM blog WHERE id = $1',
            [id]
        );
        if (result.rows.length === 0) {
            return res.status(404).send('Image not found.');
        }
        const image = result.rows[0];

        // Set the Content-Type header (assuming JPEG; adjust if needed)
        res.set('Content-Type', 'image/jpeg');
        res.send(image.image_data);
    } catch (err) {
        console.error('Error fetching image:', err);
        res.status(500).send('Internal Server Error');
    }
});

// Route to display all blog posts using blog.ejs
app.get('/blog', async (req, res) => {
    try {
        // Query to get all posts ordered by creation date (newest first)
        const result = await db.query(
            'SELECT id, heading, date FROM blog ORDER BY date DESC'
        );
        const posts = result.rows;
        //convert date to dd.mm.yyyy);
        var date = "";

        if (posts.length != 0) {
            var fullDate = posts[0].date;
            var dd = String(fullDate.getDate() - 1).padStart(1, '0');
            var mm = String(fullDate.getMonth() + 1).padStart(2, '0'); //January is 0!
            var yyyy = fullDate.getFullYear();
            date = dd + '.' + mm + '.' + yyyy;
        }




        res.render('blog', { posts, user: userData, date });
    } catch (err) {
        console.error('Error fetching blog posts:', err);
        res.status(500).send('Error fetching blog posts');
    }
});

app.get("/newBlog", async (req, res) => {
    if (userData.isAdmin) {
        res.render("newBlog.ejs", { user: userData });
    }
    else {
        res.redirect("/");
    }
});

app.get("/blog/:id", async (req, res) => {
    const id = req.params.id;
    try {
        const result = await db.query("SELECT * FROM blog WHERE id = $1", [id]);
        const post = result.rows[0];
        res.render("blogPost", { post, user: userData });
    } catch (err) {
        console.log(err);
    }
});

app.get("/blog/:id/edit", async (req, res) => {
    const id = req.params.id;
    try {
        const result = await db.query("SELECT * FROM blog WHERE id = $1", [id]);
        const post = result.rows[0];
        res.render("editBlog", { post, user: userData });
    } catch (err) {
        console.log(err);
    }
});

app.post("/newBlog", upload.single('bild'), async (req, res) => {
    const heading = req.body.heading;
    const text = req.body.text;
    if (!req.file) {
        return res.status(400).send('Kein Bild hochgeladen.');
    }
    const imageName = req.file.originalname;
    const imageData = req.file.buffer;

    var date = new Date();
    var dd = String(date.getDate()).padStart(2, '0');
    var mm = String(date.getMonth() + 1).padStart(2, '0'); //January is 0!
    var yyyy = date.getFullYear();
    date = mm + '/' + dd + '/' + yyyy;

    try {
        const result = await db.query(
            "INSERT INTO blog (heading, text, image_name, image_data, date) VALUES ($1, $2, $3, $4, $5) RETURNING *",
            [heading, text, imageName, imageData, date]
        );
        res.redirect("/");
    } catch (err) {
        console.log(err);
    }
});

app.post("/editBlog/:id", upload.single('bild'), async (req, res) => {
    const id = req.params.id;
    const heading = req.body.heading;
    const text = req.body.text;
    if (!req.file) {
        return res.status(400).send('Kein Bild hochgeladen.');
    }
    const imageName = req.file.originalname;
    const imageData = req.file.buffer;

    try {
        const result = await db.query(
            "UPDATE blog SET heading = $1, text = $2, image_name = $3, image_data = $4 WHERE id = $5",
            [heading, text, imageName, imageData, id]
        );
        res.redirect("/blog/" + id);
    } catch (err) {
        console.log(err);
    }
});

app.post("/blog/:id/delete", async (req, res) => {
    const id = req.params.id;
    try {
        const result = await db.query("DELETE FROM blog WHERE id = $1", [id]);
        res.redirect("/blog");
    } catch (err) {
        console.log(err);
    }
});

//!!Log-In/ Register Area!!
app.get("/login", async (req, res) => {
    res.render("login.ejs", { user: userData });
});

app.get("/logout", (req, res) => {
    req.logout(function (err) {
        userData.isAdmin = false;
        userData.isLoggedIn = false;
        if (err) {
            return next(err);
        }
        res.redirect("/");
    });
});

app.get("/register", async (req, res) => {
    res.render("register.ejs", { user: userData });
});

app.post("/login",
    passport.authenticate("local", {
        successRedirect: "/",
        failureRedirect: "/login",
    })
);

app.post("/register", async (req, res) => {
    const email = req.body.username;
    const password = req.body.password;
    const name = req.body.name;
    try {
        const checkResult = await db.query("SELECT * FROM users WHERE email = $1", [
            email,
        ]);

        if (checkResult.rows.length > 0) {
            req.redirect("/login");
        } else {
            bcrypt.hash(password, saltRounds, async (err, hash) => {
                if (err) {
                    console.error("Error hashing password:", err);
                } else {
                    const result = await db.query(
                        "INSERT INTO users (email, password, name) VALUES ($1, $2, $3) RETURNING *",
                        [email, hash, name]
                    );
                    const user = result.rows[0];
                    req.login(user, (err) => {
                        console.log("success");
                        res.redirect("/");
                    });
                }
            });
        }
    } catch (err) {
        console.log(err);
    }
});

passport.use(
    "local",
    new Strategy(async function verify(username, password, cb) {
        try {
            const result = await db.query("SELECT * FROM users WHERE email = $1 ", [
                username,
            ]);
            console.log("username is: ", result.rows[0]);

            if (result.rows[0].email === "admin@admin") {
                userData.isAdmin = true;
            }
            if (result.rows.length > 0) {
                const user = result.rows[0];
                const storedHashedPassword = user.password;
                bcrypt.compare(password, storedHashedPassword, (err, valid) => {
                    if (err) {
                        console.error("Error comparing passwords:", err);
                        return cb(err);
                    } else {
                        if (valid) {
                            userData.isLoggedIn = true;
                            userData.userName = user.name;
                            userData.userEmail = user.email;
                            console.log("user is: ", user);
                            return cb(null, user);
                        } else {
                            return cb(null, false);
                        }
                    }
                });
            } else {
                return cb("User not found");
            }
        } catch (err) {
            console.log(err);
        }
    })
);

passport.serializeUser((user, cb) => {
    cb(null, user);
});

passport.deserializeUser((user, cb) => {
    cb(null, user);
});


app.listen(port, () => {
    console.log(`Server running on port http://localhost:${port}`);
});
