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
import pgSession from 'connect-pg-simple';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

env.config();
const app = express();
const port = process.env.PORT || 3000;
const saltRounds = 10;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const transporter = nodemailer.createTransport({
    host: "mail.manitu.de", // Manitu SMTP server
    port: 587, // Use 587 for STARTTLS (recommended) or 465 for SSL
    secure: false, // Set to true if using port 465
    auth: {
        user: process.env.EMAIL_USER, // Your full email address
        pass: process.env.EMAIL_PASS, // Your email password
    },
    tls: {
        rejectUnauthorized: false, // Allows self-signed certificates (if needed)
    },
});

const db = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // Needed for Railway's managed PostgreSQL instances
    }
});

db.connect()
    .then(() => console.log("Connected to Railway PostgreSQL"))
    .catch(err => console.error("Connection error:", err));


app.set('trust proxy', 1);
const PgSessionStore = pgSession(session);
app.use(session({
    store: new PgSessionStore({
        conString: process.env.DATABASE_URL,
        tableName: 'session',  // default is "session"
        createTableIfMissing: true, // Automatically create the session table if missing
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 30 * 24 * 60 * 60 * 1000,// Example: 30 days
        secure: process.env.NODE_ENV === 'production' && process.env.USE_HTTPS === 'true', // ✅ FIX: Secure only if HTTPS is enforced
        httpOnly: true, // Prevents client-side JS access
        sameSite: 'lax' // Prevents CSRF attacks
    }
}));

app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(passport.initialize());
app.use(passport.session());

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
        res.render("index", { user: req.user || {} });
    } catch (err) {
        console.error("Database error:", err);
        res.status(500).send("Internal Server Error");
    }
});

app.get("/about", async (req, res) => {
    res.render("about", { user: req.user || {} });
});

app.get("/contact", async (req, res) => {
    res.render("contact", { user: req.user || {} });
});

app.get("/impressum", async (req, res) => {
    res.render("impressum", { user: req.user || {} });
});

app.get("/geschichte", async (req, res) => {
    res.render("geschichte", { user: req.user || {} });
});

//!!Reservation Area!!
function getAvailableDays() {
    const now = new Date();
    let offsetDays = 0;

    // If it's Saturday (day 6) and the time is 08:00 or later, skip this weekend
    if (now.getDay() === 6 && now.getHours() >= 8) {
        offsetDays = 7; // Skip the current weekend, start from next Saturday
    }

    const days = [];
    for (let i = offsetDays; i < offsetDays + 14; i++) {
        const date = new Date();
        date.setDate(now.getDate() + i);
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
        const result = await db.query("SELECT id, tablename, places, roomname, description FROM tables ORDER BY id ASC");/**/
        const tables = result.rows;
        res.render("reservation", { tables, selectedTable: null, availableSlots: {}, user: req.user || {} });
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

        const allTimes = ["13:00-14:30", "14:30-16:00", "16:00-17:00"];
        const availableSlots = {};
        allDates.forEach(date => {
            // --- CHANGE: Only add the date if at least one time is free ---
            const bookedTimes = bookedData[date] || [];
            const freeTimes = allTimes.filter(time => !bookedTimes.includes(time));
            if (freeTimes.length > 0) {
                availableSlots[date] = freeTimes;
            }
        });

        res.render("reservation", {
            tables: [],
            selectedTable,
            availableSlots,
            user: req.user || {},
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
        req.session.selectedTable = selectedTable;
        req.session.selectedDate = selectedDate; // ✅ Store selected date in session
        req.session.selectedTime = selectedTime;

        if (req.user) {
            req.user.name = name;
        }
        else {
            req.session.name = name;
        }
        req.session.save(); // ✅ Save session update

        const mailOptions = {
            from: process.env.EMAIL_USER, // Sender address
            to: email,                      // Recipient's email
            bcc: process.env.EMAIL_USER,     // Copy to sender
            subject: `Reservierung Zur alten Backstube am ${selectedDate}`, // Subject line
            text: `Hallo ${name},
  
  Deine Reservierung wurde bestätigt: 🥳🎉
  Tisch: ${selectedTable}
  Tag: ${selectedDate}
  Zeit: ${selectedTime}
  Anzahl an Gästen: ${numPeople}
  
  Vielen Dank.

  Wir freuen uns auf dich,
  Bernd und Manuel Ziekow
  

  
  Zur alten Backstube
  Hauptstraße 155, 13158 Berlin
  Tel: 030-47488482`
            ,
        };

        // Send the email
        await transporter.sendMail(mailOptions);
        res.redirect("/booked",)
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

        if (req.user.isAdmin) {
            res.render("allReservations", { bookings, user: req.user || {} });
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
    res.render("booked.ejs", {
        user: req.user || req.session,
        selectedTable: req.session.selectedTable,
        selectedDate: req.session.selectedDate,
        selectedTime: req.session.selectedTime
    });
});

// Helper: Process image with sharp (resize to 5:7, convert to webp)
async function processImage(imageBuffer, filename) {
    const outputPath = path.join(__dirname, 'public/uploads', filename);
    await sharp(imageBuffer)
        .resize({
            width: 500, // adjust as needed
            height: 700, // 5:7 ratio
            fit: 'cover',
            position: 'center'
        })
        .toFormat('webp')
        .toFile(outputPath);
    return filename;
}

//!!Blog Area!!
// Display all blog posts (only main image and heading)
app.get('/blog', async (req, res) => {
    try {
        const result = await db.query("SELECT id, heading, main_image, date FROM blog ORDER BY date DESC");
        res.render("blog", { posts: result.rows, user: req.user || {} });
    } catch (err) {
        console.error("Error fetching blog posts:", err);
        res.status(500).send("Error fetching blog posts.");
    }
});

// Display single blog post (heading, main image, text, extra images)
app.get('/blog/:id', async (req, res) => {
    const id = req.params.id;
    try {
        const result = await db.query("SELECT * FROM blog WHERE id = $1", [id]);
        if (result.rows.length === 0) return res.status(404).send("Blog not found.");
        const post = result.rows[0];
        console.log(post.extra_images);

        // Parse extra_images JSON
        // post.extra_images = post.extra_images ? JSON.parse(post.extra_images) : [];
        res.render("blogPost", { post, user: req.user || {} });
    } catch (err) {
        console.error("Error fetching blog post:", err);
        res.status(500).send("Error fetching blog post.");
    }
});


// New Blog Post – Display form (newBlog.ejs)
app.get("/newBlog", async (req, res) => {
    if (req.user && req.user.isAdmin) {
        res.render("newBlog.ejs", { user: req.user || {} });
    } else {
        res.redirect("/");
    }
});

// Create New Blog Post – Process form upload (mainImage and extraImages)
app.post("/newBlog", upload.fields([
    { name: 'mainImage', maxCount: 1 },
    { name: 'extraImages', maxCount: 5 }
]), async (req, res) => {
    const { heading, text } = req.body;

    // Ensure upload directory exists
    const uploadDir = path.join(__dirname, 'public/uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

    // Validate that a main image was uploaded.
    if (!req.files || !req.files.mainImage) {
        return res.status(400).send('Main image is required.');
    }

    // Process main image:
    const mainImageBuffer = req.files.mainImage[0].buffer;
    const mainImageName = `main_${Date.now()}.webp`;
    try {
        await processImage(mainImageBuffer, mainImageName);
    } catch (err) {
        console.error("Error processing main image:", err);
        return res.status(500).send("Error processing main image.");
    }

    // Process extra images if provided:
    let extraImagePaths = [];
    if (req.files.extraImages) {
        for (let i = 0; i < req.files.extraImages.length; i++) {
            const extraBuffer = req.files.extraImages[i].buffer;
            const extraImageName = `extra_${Date.now()}_${i}.webp`;
            try {
                await processImage(extraBuffer, extraImageName);
                extraImagePaths.push(extraImageName);
            } catch (err) {
                console.error("Error processing extra image:", err);
            }
        }
    }

    // Use current date (ISO format) for database
    const currentDate = new Date().toISOString().split('T')[0];

    try {
        const result = await db.query(
            "INSERT INTO blog (heading, text, main_image, extra_images, date) VALUES ($1, $2, $3, $4, $5) RETURNING *",
            [heading, text, mainImageName, JSON.stringify(extraImagePaths), currentDate]
        );
        res.redirect("/blog");
    } catch (err) {
        console.error("Error inserting blog into DB:", err);
        res.status(500).send("Error inserting blog.");
    }
});

app.get("/blog/:id", async (req, res) => {
    const id = req.params.id;
    try {
        const result = await db.query("SELECT * FROM blog WHERE id = $1", [id]);
        const post = result.rows[0];
        res.render("blogPost", { post, user: req.user || {} });
    } catch (err) {
        console.log(err);
    }
});

// Edit Blog – Display form (editBlog.ejs)
app.get("/blog/:id/edit", async (req, res) => {
    const id = req.params.id;
    try {
        const result = await db.query("SELECT * FROM blog WHERE id = $1", [id]);
        if (result.rows.length === 0) return res.status(404).send("Blog not found.");
        const post = result.rows[0];
        res.render("editBlog.ejs", { post, user: req.user || {} });
    } catch (err) {
        console.error("Error fetching blog for edit:", err);
        res.status(500).send("Error fetching blog for edit.");
    }
});

// Edit Blog – Process form upload for updates
app.post("/blog/:id/edit", upload.fields([
    { name: 'mainImage', maxCount: 1 },
    { name: 'extraImages', maxCount: 5 }
]), async (req, res) => {
    const id = req.params.id;
    const { heading, text } = req.body;
    const uploadDir = path.join(__dirname, 'public/uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

    try {
        // Fetch current blog data:
        const result = await db.query("SELECT main_image, extra_images FROM blog WHERE id = $1", [id]);
        if (result.rows.length === 0) return res.status(404).send("Blog not found.");
        let { main_image, extra_images } = result.rows[0];
        let currentExtras = extra_images;

        // Process new main image if uploaded:
        if (req.files.mainImage && req.files.mainImage.length > 0) {
            // Delete old main image file:
            if (main_image) {
                const oldMainPath = path.join(uploadDir, main_image);
                if (fs.existsSync(oldMainPath)) fs.unlinkSync(oldMainPath);
            }
            const mainImageBuffer = req.files.mainImage[0].buffer;
            main_image = `main_${Date.now()}.webp`;
            await processImage(mainImageBuffer, main_image);
        }

        // Process new extra images if uploaded:
        if (req.files.extraImages && req.files.extraImages.length > 0) {
            // Optionally delete old extra images:
            currentExtras.forEach(imgName => {
                const oldExtraPath = path.join(uploadDir, imgName);
                if (fs.existsSync(oldExtraPath)) fs.unlinkSync(oldExtraPath);
            });
            currentExtras = [];
            for (let i = 0; i < req.files.extraImages.length; i++) {
                const extraBuffer = req.files.extraImages[i].buffer;
                const extraImageName = `extra_${Date.now()}_${i}.webp`;
                await processImage(extraBuffer, extraImageName);
                currentExtras.push(extraImageName);
            }
        }

        await db.query(
            "UPDATE blog SET heading = $1, text = $2, main_image = $3, extra_images = $4 WHERE id = $5",
            [heading, text, main_image, JSON.stringify(currentExtras), id]
        );
        res.redirect("/blog/" + id);
    } catch (err) {
        console.error("Error updating blog:", err);
        res.status(500).send("Error updating blog post.");
    }
});

// Delete Blog – Process deletion and remove files
app.post("/blog/:id/delete", async (req, res) => {
    const id = req.params.id;
    try {
        const result = await db.query("SELECT main_image, extra_images FROM blog WHERE id = $1", [id]);
        if (result.rows.length === 0) return res.status(404).send("Blog not found.");
        const { main_image, extra_images } = result.rows[0];
        const uploadDir = path.join(__dirname, 'public/uploads');

        // Delete main image:
        if (main_image) {
            const mainPath = path.join(uploadDir, main_image);
            if (fs.existsSync(mainPath)) fs.unlinkSync(mainPath);
        }

        // Delete extra images:
        if (extra_images) {
            const extras = JSON.parse(extra_images);
            extras.forEach(imgName => {
                const imgPath = path.join(uploadDir, imgName);
                if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
            });
        }

        await db.query("DELETE FROM blog WHERE id = $1", [id]);
        res.redirect("/blog");
    } catch (err) {
        console.error("Error deleting blog:", err);
        res.status(500).send("Error deleting blog post.");
    }
});

//!!Log-In/ Register Area!!
app.get("/login", async (req, res) => {
    res.render("login.ejs", { user: req.user || {} });
});

app.get("/logout", (req, res, next) => {
    req.logout((err) => {
        if (err) return next(err);
        req.session.destroy(() => {
            res.redirect("/");
        });
    });
});

app.get("/register", async (req, res) => {
    res.render("register.ejs", { user: req.user || {} });
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

passport.use("local",
    new Strategy(async (username, password, cb) => {
        try {
            const result = await db.query("SELECT * FROM users WHERE email = $1", [username]);
            if (result.rows.length === 0) return cb(null, false);

            const user = result.rows[0];

            bcrypt.compare(password, user.password, (err, valid) => {
                if (err) return cb(err);
                if (!valid) return cb(null, false);

                return cb(null, user);
            });
        } catch (err) {
            return cb(err);
        }
    })
);

passport.serializeUser((user, done) => {
    done(null, {
        id: user.id,
        email: user.email,
        name: user.name,
        isAdmin: user.email === "admin@admin", // ✅ Store isAdmin flag
        isLoggedIn: true, // ✅ Store isLoggedIn flag  
    });
});

passport.deserializeUser(async (user, done) => {
    try {
        const result = await db.query("SELECT * FROM users WHERE id = $1", [user.id]);
        if (result.rows.length === 0) return done(null, false);

        const dbUser = result.rows[0];
        done(null, {
            id: dbUser.id,
            email: dbUser.email,
            name: dbUser.name,
            isAdmin: user.isAdmin, // ✅ Keep isAdmin from session
            isLoggedIn: user.isLoggedIn, // ✅ Keep isLoggedIn from session
        });
    } catch (err) {
        done(err);
    }
});

app.listen(port, () => {
    console.log(`Server running on port http://localhost:${port}`);
});
