const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const cookieParser = require("cookie-parser");
const { MongoClient, ServerApiVersion } = require("mongodb");

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

// Keep reference to collections here
const database = client.db("lifeSure");
const userCollection = database.collection("user");
const policiesCollection = database.collection("policies")
async function run() {
  try {
    await client.connect();

    console.log("✅ MongoDB connected");

    // ✅ Only start server after DB connection
    app.listen(port, () => {
      console.log(`🚀 Server running on http://localhost:${port}`);
    });
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
  }
}
run();

// ✅ Save user if not exists
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
// get user
app.get("/users/:email", async (req, res) => {
  const email = req.params.email;
  const user = await userCollection.findOne({ email });
  if (!user) return res.status(404).send("User not found");
  res.send(user);
});


// POST /policies
app.post("/policies", async (req, res) => {
  const newPolicy = req.body;
  const result = await policiesCollection.insertOne(newPolicy);
  res.send(result);
});
