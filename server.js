require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("./db");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET;

// API Health Check
app.get("/", (req, res) => {
    res.send("🚀 API is running...");
});

// Register User
app.post("/register", async (req, res) => {
    try {
        console.log("📥 Incoming Register Request:", req.body);

        const { username, password, name, role } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);

        console.log("🔑 Hashed Password:", hashedPassword);

        const newUser = await pool.query(
            "INSERT INTO users (username, password, name, role) VALUES ($1, $2, $3, $4) RETURNING *",
            [username, hashedPassword, name, role]
        );

        console.log("✅ User Inserted:", newUser.rows[0]);
        res.status(201).json({ message: "User registered successfully", user: newUser.rows[0] });
    } catch (err) {
        console.error("❌ Database Error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// Login User
app.post("/login", async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await pool.query("SELECT * FROM users WHERE username = $1", [username]);

        if (user.rows.length === 0) return res.status(401).json({ error: "Invalid credentials" });

        const isValid = await bcrypt.compare(password, user.rows[0].password);
        if (!isValid) return res.status(401).json({ error: "Invalid credentials" });

        const token = jwt.sign({ userId: user.rows[0].id }, JWT_SECRET, { expiresIn: "7d" });

        res.json({ token, role: user.rows[0].role, userId: user.rows[0].id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Middleware for Authentication
const authenticate = (req, res, next) => {
    const token = req.headers["authorization"];
    if (!token) return res.status(401).json({ error: "Access denied" });

    jwt.verify(token.split(" ")[1], JWT_SECRET, (err, decoded) => {
        if (err) return res.status(401).json({ error: "Invalid token" });
        req.userId = decoded.userId;
        next();
    });
};

// Get Medications
app.get("/medications", authenticate, async (req, res) => {
    try {
        const medications = await pool.query("SELECT * FROM medications WHERE user_id = $1", [req.userId]);
        res.json(medications.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Add Medication
app.post("/medications", authenticate, async (req, res) => {
    try {
        const { name, dosage, time, duration, isTaken } = req.body;
        const newMedication = await pool.query(
            "INSERT INTO medications (user_id, name, dosage, time, duration, is_taken) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
            [req.userId, name, dosage, time, duration, isTaken]
        );
        res.json(newMedication.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete Medication
app.delete("/medications/:id", authenticate, async (req, res) => {
    try {
        await pool.query("DELETE FROM medications WHERE id = $1 AND user_id = $2", [req.params.id, req.userId]);
        res.json({ message: "Medication deleted" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Appointments
app.get("/appointments", authenticate, async (req, res) => {
    try {
        const appointments = await pool.query("SELECT * FROM appointments WHERE user_id = $1", [req.userId]);
        res.json(appointments.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Add Appointment
app.post("/appointments", authenticate, async (req, res) => {
    try {
        const { title, date, description } = req.body;

        console.log("📥 Incoming Appointment Request:", req.body); // Debugging Log

        // Validate correct `YYYY-MM-DD` format for the date
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return res.status(400).json({ error: "Invalid date format. Expected YYYY-MM-DD" });
        }

        // Insert into PostgreSQL
        const newAppointment = await pool.query(
            "INSERT INTO appointments (user_id, title, date, description) VALUES ($1, $2, $3, $4) RETURNING *",
            [req.userId, title, date, description]
        );

        console.log("✅ Appointment Added:", newAppointment.rows[0]);
        res.json(newAppointment.rows[0]);
    } catch (err) {
        console.error("❌ Database Error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// DAILY TASKS CRUD OPERATIONS

// Get Daily Tasks
app.get("/daily_tasks", authenticate, async (req, res) => {
    try {
        const tasks = await pool.query("SELECT * FROM daily_tasks WHERE user_id = $1", [req.userId]);
        res.json(tasks.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Add Daily Task
app.post("/daily_tasks", authenticate, async (req, res) => {
    try {
        const { name, location, time, frequency } = req.body;

        console.log("📥 Incoming Daily Task:", req.body); // Debugging Log

        const dateRegex = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;  // Strict validation
        if (!dateRegex.test(time)) {
    console.log("❌ Invalid Time Format Received:", time);  // Debugging
    return res.status(400).json({ error: "Invalid time format. Expected YYYY-MM-DD HH:mm:ss" });
}


        // Insert into PostgreSQL
        const newTask = await pool.query(
            "INSERT INTO daily_tasks (user_id, name, location, time, frequency) VALUES ($1, $2, $3, $4, $5) RETURNING *",
            [req.userId, name, location, time, frequency]
        );

        console.log("✅ Task Added:", newTask.rows[0]);
        res.json(newTask.rows[0]);
    } catch (err) {
        console.error("❌ Database Error:", err.message);
        res.status(500).json({ error: err.message });
    }
});


// Update Daily Task
app.put("/daily_tasks/:id", authenticate, async (req, res) => {
    try {
        const { name, location, time, frequency } = req.body;
        const updatedTask = await pool.query(
            "UPDATE daily_tasks SET name = $1, location = $2, time = $3, frequency = $4 WHERE id = $5 AND user_id = $6 RETURNING *",
            [name, location, time, frequency, req.params.id, req.userId]
        );

        if (updatedTask.rows.length === 0) {
            return res.status(404).json({ error: "Task not found or unauthorized" });
        }

        res.json(updatedTask.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete Daily Task
app.delete("/daily_tasks/:id", authenticate, async (req, res) => {
    try {
        const deletedTask = await pool.query("DELETE FROM daily_tasks WHERE id = $1 AND user_id = $2 RETURNING *", [req.params.id, req.userId]);

        if (deletedTask.rows.length === 0) {
            return res.status(404).json({ error: "Task not found or unauthorized" });
        }

        res.json({ message: "Task deleted successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});

app.post("/assign_caregiver", authenticate, async (req, res) => {
    try {
        const { caregiverUsername } = req.body;
        const caregiver = await pool.query("SELECT id FROM users WHERE username = $1 AND role = 'caregiver'", [caregiverUsername]);

        if (caregiver.rows.length === 0) {
            return res.status(404).json({ error: "Caregiver not found" });
        }

        await pool.query("UPDATE users SET counterpart_id = $1 WHERE id = $2", [caregiver.rows[0].id, req.userId]);

        res.json({ message: "Caregiver assigned successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get("/get_caregiver", authenticate, async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT u2.name AS caregiver_name FROM users u1 JOIN users u2 ON u1.counterpart_id = u2.id WHERE u1.id = $1",
            [req.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "No caregiver assigned" });
        }

        res.json({ caregiverName: result.rows[0].caregiver_name });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
app.get("/caregiver/pending-patients", authenticate, async (req, res) => {
    try {
        const { caregiverId } = req.query;
        if (!caregiverId) {
            return res.status(400).json({ error: "Caregiver ID is required" });
        }

        const pendingPatients = await pool.query(
            "SELECT * FROM users WHERE assigned_caregiver IS NULL AND role = 'patient'"
        );

        res.json(pendingPatients.rows);
    } catch (err) {
        console.error("❌ Error fetching pending patients:", err.message);
        res.status(500).json({ error: err.message });
    }
});
app.post("/caregiver/accept-patient/:patientId", authenticate, async (req, res) => {
    try {
        const caregiverId = req.userId; // Extract caregiver ID from JWT
        const { patientId } = req.params;

        // Assign patient to caregiver
        const result = await pool.query(
            "UPDATE users SET assigned_caregiver = $1 WHERE id = $2 RETURNING *",
            [caregiverId, patientId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: "Patient not found or already assigned" });
        }

        res.json({ message: "Patient assigned successfully" });
    } catch (err) {
        console.error("❌ Error accepting patient:", err.message);
        res.status(500).json({ error: err.message });
    }
});
app.post("/patients/assign-caregiver", authenticate, async (req, res) => {
    try {
        const { userId, caregiverUsername } = req.query; // Use req.query instead of req.body

        console.log(`📥 Incoming Request to Assign Caregiver`);
        console.log(`🔎 userId: ${userId}, caregiverUsername: ${caregiverUsername}`);

        // Find caregiver by username
        const caregiver = await pool.query(
            "SELECT id FROM users WHERE username = $1 AND role = 'caregiver'", 
            [caregiverUsername]
        );

        if (caregiver.rows.length === 0) {
            console.log("❌ Caregiver not found");
            return res.status(404).json({ error: "Caregiver not found" });
        }

        const caregiverId = caregiver.rows[0].id;

        // Update patient record with caregiver ID
        const updatePatient = await pool.query(
            "UPDATE users SET caregiver_id = $1 WHERE id = $2 RETURNING *", 
            [caregiverId, userId]
        );

        if (updatePatient.rowCount === 0) {
            console.log("❌ Patient not found");
            return res.status(404).json({ error: "Patient not found" });
        }

        console.log(`✅ Caregiver assigned successfully!`);
        res.json({ message: "Caregiver assigned successfully" });
    } catch (err) {
        console.error("❌ Server Error:", err.message);
        res.status(500).json({ error: err.message });
    }
});



