const express = require("express");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const cors = require("cors");
const dotenv = require("dotenv");
const cookieParser = require("cookie-parser");

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

// Mongo URI
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.jcgtqm0.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    console.log("✅ MongoDB connected");

    const database = client.db("lifeSure");
    const userCollection = database.collection("user");
    const policiesCollection = database.collection("policies");

    // Save user if not exists
    app.post("/users", async (req, res) => {
      const user = req.body;

      const existing = await userCollection.findOne({ email: user.email });
      if (existing) {
        return res.status(200).json({ message: "User already exists" });
      }
      const result = await userCollection.insertOne(user);

      res.status(201).json({
        message: "User saved",
        insertedId: result.insertedId,
        user,
      });
    });
    // GET all users (for Manage Users page)
    app.get("/users", async (req, res) => {
      try {
        const users = await userCollection.find().toArray();
        res.send(users);
      } catch (err) {
        console.error("Failed to fetch users:", err);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    // Get user by email
    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ email });
      if (!user) return res.status(404).send("User not found");
      res.send(user);
    });
    // update user lastLogin
    app.patch("/users/last-login/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const { lastLogin } = req.body;

        const result = await userCollection.updateOne(
          { email },
          { $set: { lastLogin } }
        );

        res.send(result);
      } catch (error) {
        console.error("Error updating last login:", error);
        res.status(500).send({ message: "Failed to update last login" });
      }
    });

    // update user role

    app.patch("/users/:id/role", async (req, res) => {
  try {
    const userId = req.params.id;
    const { role } = req.body;

    if (!["admin", "agent", "customer"].includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    const result = await userCollection.updateOne(
      { _id: new ObjectId(userId) },
      { $set: { role } }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ message: "User not found or role unchanged" });
    }

    res.json({ message: "User role updated successfully" });
  } catch (error) {
    console.error("Error updating user role:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Delete User

app.delete("/users/:id", async (req, res) => {
  try {
    const userId = req.params.id;

    const result = await userCollection.deleteOne({ _id: new ObjectId(userId) });

    if (result.deletedCount === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ message: "Server error" });
  }
});



    // Add a new policy
    app.post("/policies", async (req, res) => {
      const newPolicy = req.body;
      const result = await policiesCollection.insertOne(newPolicy);
      res.send(result);
    });

    // Get all policies
    app.get("/policies", async (req, res) => {
      try {
        const policies = await policiesCollection.find().toArray();
        res.send(policies);
      } catch (error) {
        console.error("Failed to fetch policies:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    // Update a policy by id
    app.patch("/policies/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const updatedData = req.body;

        const result = await policiesCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updatedData }
        );

        res.send(result);
      } catch (error) {
        console.error("Error updating policy:", error);
        res.status(500).send({ message: "Update failed" });
      }
    });

    // Delete a policy by id
    app.delete("/policies/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const result = await policiesCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.send(result);
      } catch (error) {
        console.error("Error deleting policy:", error);
        res.status(500).send({ message: "Delete failed" });
      }
    });

    // Start server AFTER DB connection is ready
    app.listen(port, () => {
      console.log(`🚀 Server running on http://localhost:${port}`);
    });
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
  }
}

run();
