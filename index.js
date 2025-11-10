import express from 'express';
import bodyParser from 'body-parser';
import pg from 'pg';
import env from "dotenv";
import bcrypt from "bcryptjs";
import passport from "passport";
import { Strategy } from "passport-local";
import session from "express-session";
import nodemailer from 'nodemailer';
import multer from 'multer';
import pgSession from 'connect-pg-simple';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import methodOverride from 'method-override';
import compression from 'compression';
import { v2 as cloudinary } from 'cloudinary';


env.config();
const app = express();
const port = process.env.PORT || 3001;
const saltRounds = 10;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, 'public'), { maxAge: '30d' }));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));


const transporter = nodemailer.createTransport({
    host: "mail.manitu.de", // Manitu SMTP server
    port: 587, // Use 587 for STARTTLS (recommended) or 465 for SSL
    secure: false, // Set to true if using port 465
    auth: {
        user: process.env.EMAIL_USER, // Your full email address
        pass: process.env.EMAIL_PASS, // Your email password
    }
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
        maxAge: 30 * 24 * 60,// Example: 30 days
        // secure: process.env.NODE_ENV === 'production' && process.env.USE_HTTPS === 'true', // ✅ FIX: Secure only if HTTPS is enforced
        httpOnly: true, // Prevents client-side JS access
        sameSite: 'lax' // Prevents CSRF attacks
    }
}));

// Deine eigene Cloudinary Konfiguration
cloudinary.config({
    cloud_name: 'dndmew9my',
    api_key: '643484217454591',
    api_secret: 'aDbRqeTeI1s5W9qPyS3BnpjT-jU' // Click 'View API Keys' above to copy your API secret
});

app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(passport.initialize());
app.use(passport.session());
app.use(express.json());
app.use(methodOverride('_method'));
app.use(compression());


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
// Helper: Get banner settings from the database
async function getBannerSettings() {
    try {
        const textResult = await db.query("SELECT value FROM settings WHERE key = 'bannerText'");
        const bannerText = textResult.rows.length ? textResult.rows[0].value : 'Willkommen auf unserer Seite!';
        const enabledResult = await db.query("SELECT value FROM settings WHERE key = 'bannerEnabled'");
        const bannerEnabled = enabledResult.rows.length ? (enabledResult.rows[0].value === 'true') : true;
        return { bannerText, bannerEnabled };
    } catch (err) {
        console.error('Error fetching banner settings:', err);
        return { bannerText: '', bannerEnabled: true };
    }
}

// Step 1: Show table selection
app.get("/", async (req, res) => {
    const bannerSettings = await getBannerSettings();

    try {
        console.log("settings are: ", bannerSettings);
        res.render("index", {
            user: req.user || {}, bannerText: bannerSettings.bannerText,
            bannerEnabled: bannerSettings.bannerEnabled,
        });
    } catch (err) {
        console.error("Database error:", err);
        res.status(500).send("Internal Server Error");
    }
});

// PATCH endpoint to update banner text
app.patch('/update-banner-text', async (req, res) => {
    const { bannerText } = req.body;
    try {
        await db.query("UPDATE settings SET value = $1 WHERE key = 'bannerText'", [bannerText]);
        res.json({ message: "Banner Text updated" });
    } catch (err) {
        console.error("Error updating banner text:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

// PATCH endpoint to toggle banner visibility
app.patch('/toggle-banner', async (req, res) => {
    try {
        const result = await db.query("SELECT value FROM settings WHERE key = 'bannerEnabled'");
        let currentState = result.rows.length ? (result.rows[0].value === 'true') : true;
        const newState = !currentState;
        await db.query("UPDATE settings SET value = $1 WHERE key = 'bannerEnabled'", [newState.toString()]);
        res.json({ bannerEnabled: newState });
    } catch (err) {
        console.error("Error toggling banner:", err);
        res.status(500).json({ error: "Internal server error" });
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

app.get("/cookies", async (req, res) => {
    res.render("cookies.ejs", { user: req.user || {} });
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


// GET /blog -> Alle Blogposts anzeigen (nur Hauptbilder und Titel)
app.get('/blog', async (req, res) => {
    try {
        const result = await db.query("SELECT id, heading, main_image, date FROM blog ORDER BY date DESC");
        res.render("blog", { posts: result.rows, user: req.user || {} });
    } catch (err) {
        console.error("Error fetching blog posts:", err);
        res.status(500).send("Error fetching blog posts.");
    }
});

// GET /blog/:id -> Einzelnen Blogpost anzeigen
app.get('/blog/:id', async (req, res) => {
    const id = req.params.id;
    try {
        const result = await db.query("SELECT * FROM blog WHERE id = $1", [id]);
        if (result.rows.length === 0) return res.status(404).send("Blog not found.");
        const post = result.rows[0];
        res.render("blogPost", { post, user: req.user || {} });
    } catch (err) {
        console.error("Error fetching blog post:", err);
        res.status(500).send("Error fetching blog post.");
    }
});

// GET /newBlog -> Neues Blogformular anzeigen
app.get("/newBlog", async (req, res) => {
    if (req.user && req.user.isAdmin) {
        res.render("newBlog.ejs", { user: req.user || {} });
    } else {
        res.redirect("/");
    }
});

// POST /newBlog -> Neuen Blogpost anlegen (mit Upload zu Cloudinary)
app.post("/newBlog", upload.fields([
    { name: 'mainImage', maxCount: 1 },
    { name: 'extraImages', maxCount: 5 }
]), async (req, res) => {
    const { heading, text } = req.body;

    if (!req.files || !req.files.mainImage) {
        return res.status(400).send('Main image is required.');
    }

    let mainImageUrl = '';
    let mainImagePublicId = '';
    let extraImages = [];

    try {
        // Hauptbild hochladen
        const mainUploadResult = await new Promise((resolve, reject) => {
            cloudinary.uploader.upload_stream({
                folder: "CafeApp/Blog",
                format: "webp",
                resource_type: "image"
            }, (error, result) => {
                if (error) return reject(error);
                resolve(result);
            }).end(req.files.mainImage[0].buffer);
        });

        mainImageUrl = mainUploadResult.secure_url;
        mainImagePublicId = mainUploadResult.public_id;

        // Extra-Bilder hochladen
        if (req.files.extraImages) {
            for (let file of req.files.extraImages) {
                const extraUploadResult = await new Promise((resolve, reject) => {
                    cloudinary.uploader.upload_stream({
                        folder: "CafeApp/Blog",
                        format: "webp",
                        resource_type: "image"
                    }, (error, result) => {
                        if (error) return reject(error);
                        resolve(result);
                    }).end(file.buffer);
                });
                extraImages.push({
                    url: extraUploadResult.secure_url,
                    public_id: extraUploadResult.public_id
                });
            }
        }

        const currentDate = new Date().toISOString().split('T')[0];

        await db.query(
            "INSERT INTO blog (heading, text, main_image, main_image_public_id, extra_images, date) VALUES ($1, $2, $3, $4, $5, $6)",
            [heading, text, mainImageUrl, mainImagePublicId, JSON.stringify(extraImages), currentDate]
        );

        res.redirect("/blog");
    } catch (err) {
        console.error("Error uploading blog:", err);
        res.status(500).send("Error uploading blog.");
    }
});

// GET /blog/:id/edit -> Blogpost bearbeiten Formular anzeigen
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

// POST /blog/:id/edit -> Blogpost speichern (alte Bilder löschen, neue hochladen)
app.post("/blog/:id/edit", upload.fields([
    { name: 'mainImage', maxCount: 1 },
    { name: 'extraImages', maxCount: 5 }
]), async (req, res) => {
    const id = req.params.id;
    const { heading, text } = req.body;

    try {
        const result = await db.query("SELECT * FROM blog WHERE id = $1", [id]);
        if (result.rows.length === 0) return res.status(404).send("Blog not found.");
        let post = result.rows[0];

        let mainImageUrl = post.main_image;
        let mainImagePublicId = post.main_image_public_id;
        let extraImages = post.extra_images ? (post.extra_images) : [];

        // Hauptbild ersetzen
        if (req.files.mainImage && req.files.mainImage.length > 0) {
            if (mainImagePublicId) {
                await cloudinary.uploader.destroy(mainImagePublicId);
            }

            const mainUploadResult = await new Promise((resolve, reject) => {
                cloudinary.uploader.upload_stream({
                    folder: "CafeApp/Blog",
                    format: "webp",
                    resource_type: "image"
                }, (error, result) => {
                    if (error) return reject(error);
                    resolve(result);
                }).end(req.files.mainImage[0].buffer);
            });

            mainImageUrl = mainUploadResult.secure_url;
            mainImagePublicId = mainUploadResult.public_id;
        }

        // Extra Bilder ersetzen
        if (req.files.extraImages && req.files.extraImages.length > 0) {
            for (let img of extraImages) {
                if (img.public_id) {
                    await cloudinary.uploader.destroy(img.public_id);
                }
            }
            extraImages = [];

            for (let file of req.files.extraImages) {
                const extraUploadResult = await new Promise((resolve, reject) => {
                    cloudinary.uploader.upload_stream({
                        folder: "CafeApp/Blog",
                        format: "webp",
                        resource_type: "image"
                    }, (error, result) => {
                        if (error) return reject(error);
                        resolve(result);
                    }).end(file.buffer);
                });
                extraImages.push({
                    url: extraUploadResult.secure_url,
                    public_id: extraUploadResult.public_id
                });
            }
        }

        await db.query(
            "UPDATE blog SET heading = $1, text = $2, main_image = $3, main_image_public_id = $4, extra_images = $5 WHERE id = $6",
            [heading, text, mainImageUrl, mainImagePublicId, JSON.stringify(extraImages), id]
        );

        res.redirect("/blog/" + id);
    } catch (err) {
        console.error("Error updating blog:", err);
        res.status(500).send("Error updating blog post.");
    }
});

app.post("/blog/:id/delete", async (req, res) => {
    const id = req.params.id;
    try {
        const result = await db.query("SELECT * FROM blog WHERE id = $1", [id]);
        if (result.rows.length === 0) return res.status(404).send("Blog not found.");
        const post = result.rows[0];

        // Delete main image
        if (post.main_image_public_id) {
            await cloudinary.uploader.destroy(post.main_image_public_id);
        }

        // Delete extra images
        if (post.extra_images) {
            const extras = post.extra_images;
            for (let img of extras) {
                if (img.public_id) {
                    await cloudinary.uploader.destroy(img.public_id);
                }
            }
        }

        await db.query("DELETE FROM blog WHERE id = $1", [id]);
        res.redirect("/blog");
    } catch (err) {
        console.error("Error deleting blog:", err);
        res.status(500).send("Error deleting blog post.");
    }
});

//Tischreservierung
app.get('/tischreservierung', async (req, res) => {
    try {
        const { rows } = await db.query('SELECT * FROM eventbutton ORDER BY id');
        res.render('tischreservierung', {
            user: req.user || {},      // oder aus Session
            eventButton: rows
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('DB-Fehler');
    }
});

app.post("/tischreservierung", async (req, res) => {
    const { date, text, mail, name, tel, time } = req.body;
    console.log("POST /tischreservierung", { date, time, mail });

    try {
        const result = await db.query(
            "INSERT INTO tischreservierung (date, text, mail, name, tel, time) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
            [date, text, mail, name, tel, time]
        );
        console.log("Inserted tischreservierung id:", result.rows[0].id);

        // Session speichern + redirect, unabhängig von Mail
        req.session.date = date;
        req.session.time = time;
        req.session.name = name;

        transporter.verify((error, success) => {
            if (error) {
                console.error("❌ Nodemailer verify failed:", error);
            } else {
                console.log("✅ Nodemailer ready to send mail");
            }
        });

        req.session.save(() => {
            res.redirect("/tischangefragt");
        });



        // Mail asynchron im Hintergrund (kein await, eigener Catch)
        transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: mail,
            bcc: process.env.EMAIL_USER,
            subject: `Buchungsanfrage Erfolgreich`,
            text: `Hallo ${name}, ...`
        }).then(info => {
            console.log("Mail ok:", info.messageId);
        }).catch(err => {
            console.error("Mailfehler (aber Reservierung gespeichert):", err);
        });

    } catch (err) {
        console.error("Error inserting tischreservierung:", err);
        res.status(500).send("Fehler bei der Reservierung.");
    }
});


app.get("/tischangefragt", (req, res) => {
    res.render("tischangefragt.ejs", {
        user: req.user || req.session,
        name: req.session.name,
    });
})

// Event Area
app.get('/eventbuchung', async (req, res) => {
    try {
        const { rows } = await db.query('SELECT * FROM eventbutton ORDER BY id');
        res.render('eventbuchung', {
            user: req.user || {},      // oder aus Session
            eventButton: rows
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('DB-Fehler');
    }
});

app.post("/eventbuchung", async (req, res) => {
    const { event, text, mail, name, tel } = req.body;

    req.session.event = event;
    req.session.name = name; // ✅ Store selected date in session
    req.session.save(); // ✅ Save session update


    try {
        const result = await db.query("INSERT INTO eventbuchung (event, text, mail, name, tel) VALUES ($1, $2, $3, $4, $5) RETURNING *",
            [event, text, mail, name, tel]
        )

        const mailOptions = {
            from: process.env.EMAIL_USER, // Sender address
            to: mail,                      // Recipient's email
            bcc: process.env.EMAIL_USER,     // Copy to sender
            subject: `Buchungsanfrage Erfolgreich`, // Subject line
            text: `Hallo ${name},
  
  Deine Anfrage wurde erfolgreich übermittelt: 🥳🎉
  Dein gewähltes Event: ${event}
  Dein Text: ${text}
  Deine Rufnummer: ${tel}

  Vielen Dank für deine Anfrage.

  Wir melden uns in kürze bei dir,
  Bernd und Manuel Ziekow
  
  
  Zur alten Backstube
  Hauptstraße 155, 13158 Berlin
  Tel: 030-47488482`
            ,
        };

        // Send the email
        await transporter.sendMail(mailOptions);
        res.redirect("/angefragt",)
    } catch (error) {
        console.error("Error inserting event into DB:", err);
        res.status(500).send("Error inserting blog.");
    }
})

app.patch('/eventbuchung/:id/toggle', async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Nicht autorisiert' });
    const id = parseInt(req.params.id, 10);
    const enabled = req.body.enabled;
    console.log('Server Toggle:', id, enabled);  // DEBUG
    try {
        const { rows } = await db.query(
            'UPDATE eventbutton SET enabled = $1 WHERE id = $2 RETURNING *',
            [enabled, id]
        );
        if (!rows[0]) return res.status(404).json({ error: 'Nicht gefunden' });
        res.json(rows[0]);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server-Fehler' });
    }
});

// PATCH update name
app.patch('/eventbuchung/:id/update', async (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Nicht autorisiert' });
    const id = parseInt(req.params.id, 10);
    const name = req.body.name;
    console.log('Server Update:', id, name);     // DEBUG
    try {
        const { rows } = await db.query(
            'UPDATE eventbutton SET name = $1 WHERE id = $2 RETURNING *',
            [name, id]
        );
        if (!rows[0]) return res.status(404).json({ error: 'Nicht gefunden' });
        res.json(rows[0]);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server-Fehler' });
    }
});

app.get("/angefragt", (req, res) => {
    res.render("angefragt.ejs", {
        user: req.user || req.session,
        event: req.session.event,
        name: req.session.name,
    });
})

//Menu Area
// GET /menu: Fetch menu items, group by category, and render the page
app.get('/menu', async (req, res) => {
    try {
        // Neue Sortierung: nach main_category, dann nach position (nicht mehr nach "sort" oder id)
        const result = await db.query("SELECT * FROM menu ORDER BY sort, main_category, position ASC");
        // Group by main_category
        const categories = {};
        result.rows.forEach(drink => {
            if (!categories[drink.main_category]) {
                categories[drink.main_category] = [];
            }
            categories[drink.main_category].push(drink);
        });

        const categoriesArray = Object.keys(categories).map(cat => ({
            mainCategory: cat, // Name of the category
            drinks: categories[cat], // Array of drinks in this category
            sort: categories[cat][0].sort, // Assuming all drinks in a category have the same sort value
        }));

        res.render('menu', { categories: categoriesArray, user: req.user || {} });
    } catch (err) {
        console.error("Error fetching menu:", err);
        res.status(500).send("Error fetching menu");
    }
});

app.patch('/menu/reorder', async (req, res) => {
    // Admin‑Check (angenommen du nutzt req.user.isAdmin)
    if (!req.user || !req.user.isAdmin) {
        return res.status(403).json({ error: 'Nur Admins dürfen das.' });
    }

    const { category, newOrder } = req.body;
    if (!category || !Array.isArray(newOrder)) {
        return res.status(400).json({ error: 'Ungültiges Format. Erwartet category + Array newOrder' });
    }

    try {
        for (let i = 0; i < newOrder.length; i++) {
            const drinkId = newOrder[i];
            await db.query(
                'UPDATE menu SET position = $1 WHERE id = $2 AND main_category = $3',
                [i, drinkId, category]
            );
        }
        console.log('✅ Positionen aktualisiert');
        res.json({ message: 'Reihenfolge gespeichert' });
    } catch (err) {
        console.error('❌ Fehler beim Speichern der Position:', err);
        // Gib err.message ans Frontend zurück, damit du siehst, was wirklich klemmt
        res.status(500).json({ error: err.message });
    }
});

// PATCH /menu/:id - update price
app.patch('/menu/:id', async (req, res) => {
    const drinkId = req.params.id;
    const { price } = req.body;
    try {
        const result = await db.query(
            "UPDATE menu SET price = $1 WHERE id = $2 RETURNING *",
            [price, drinkId]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: "Drink not found" });
        res.json({ message: "Price updated", drink: result.rows[0] });
    } catch (err) {
        console.error("Error updating price:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

// PATCH /menu/category/:category - Update category name and sort order
app.patch('/menu/category/:category', async (req, res) => {
    const { category } = req.params;
    const { newCategoryName, newSort } = req.body;

    try {
        const result = await db.query(
            "UPDATE menu SET main_category = $1, sort = $2 WHERE main_category = $3 RETURNING *",
            [newCategoryName, newSort, category]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: "Kategorie nicht gefunden" });
        }

        res.json({ message: "Kategorie aktualisiert", category: result.rows });
    } catch (err) {
        console.error("Fehler beim Aktualisieren der Kategorie:", err);
        res.status(500).json({ error: "Interner Serverfehler" });
    }
});


// PATCH /menu/:id/toggle - enable/disable a drink
app.patch('/menu/:id/toggle', async (req, res) => {
    const drinkId = req.params.id;
    const { enabled } = req.body;
    try {
        const result = await db.query(
            "UPDATE menu SET enabled = $1 WHERE id = $2 RETURNING *",
            [enabled, drinkId]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: "Drink not found" });
        res.json({ message: "Drink toggled", drink: result.rows[0] });
    } catch (err) {
        console.error("Error toggling drink:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

// DELETE /menu/:id - delete a drink
app.delete('/menu/:id', async (req, res) => {
    const drinkId = req.params.id;
    try {
        await db.query("DELETE FROM menu WHERE id = $1", [drinkId]);
        res.json({ message: "Drink deleted" });
    } catch (err) {
        console.error("Error deleting drink:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

// POST /menu - add a new drink
app.post('/menu', async (req, res) => {
    const { name, price, hinweis, main_category } = req.body;
    try {
        // 1) Hole den aktuellen sort-Wert für diese Kategorie
        const catRes = await db.query(
            'SELECT DISTINCT sort FROM menu WHERE main_category = $1 LIMIT 1',
            [main_category]
        );
        const sortValue = catRes.rows[0]?.sort ?? 0;
        const result = await db.query(
            "INSERT INTO menu (name, price, hinweis, image, description, main_category, enabled, sort, position) VALUES ($1, $2, $3, $4, $5, $6, true, $7, 0) RETURNING *",
            [name, price, hinweis, ' ', '', main_category, sortValue]
        );
        res.json({ message: "Drink added", drink: result.rows[0] });
    } catch (err) {
        console.error("Error adding drink:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

// POST /menu/category – fügt eine neue Kategorie mit einem Getränk hinzu
app.post('/menu/category', async (req, res) => {
    const { category, name, price, hinweis } = req.body;
    try {
        const result = await db.query(
            `INSERT INTO menu (name, price, image, description, main_category, enabled, hinweis)
         VALUES ($1, $2, $3, $4, $5, true, $6) RETURNING *`,
            [name, price, '', '', category, hinweis]
        );
        res.json({ message: "Neue Kategorie und Getränk hinzugefügt", drink: result.rows[0] });
    } catch (err) {
        console.error("Fehler beim Hinzufügen der neuen Kategorie:", err);
        res.status(500).json({ error: "Interner Serverfehler" });
    }
});

//!!Log-In/ Register Area!!
app.get("/login", async (req, res) => {
    res.render("login.ejs", { user: req.user || {} });
});

//impressum, agb, datenschutz
app.get("/impressum", async (req, res) => {
    res.render("impressum.ejs", { user: req.user || {} })
});

app.get("/agb", async (req, res) => {
    res.render("agb.ejs", { user: req.user || {} })
})

app.get("/datenschutz", async (req, res) => {
    res.render("datenschutz.ejs", { user: req.user || {} })
})


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

app.listen(port, "0.0.0.0", function () {
    console.log(`Server running on port http://localhost:${port}`);
});
