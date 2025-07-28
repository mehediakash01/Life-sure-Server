const express = require("express");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const cors = require("cors");
const dotenv = require("dotenv");
const cookieParser = require("cookie-parser");
const jwt = require('jsonwebtoken');
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
const stripe = require('stripe')(process.env.PAYMENT_KEY);

// Mongo URI
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.jcgtqm0.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// JWT Middleware
// Fixed JWT Middleware
const verifyJwt = (req, res, next) => {

  
  // Check for token in Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log("No valid authorization header found");
    return res.status(401).send({ message: 'Unauthorized Access - No token provided' });
  }
  
  const token = authHeader.split(" ")[1];
  console.log('Token extracted:', token ? 'Token present' : 'No token');
  
  if (!token) {
    return res.status(401).send({ message: 'Unauthorized Access - Invalid token format' });
  }

  // Verify JWT secret exists
  if (!process.env.JWT_SECRET_KEY) {
    console.error("JWT_SECRET_KEY is not defined in environment variables");
    return res.status(500).send({ message: 'Server configuration error' });
  }

  jwt.verify(token, process.env.JWT_SECRET_KEY, (err, decoded) => {
    if (err) {
      console.log("JWT verify error:", err.message);
      if (err.name === 'TokenExpiredError') {
        return res.status(401).send({ message: 'Token expired' });
      } else if (err.name === 'JsonWebTokenError') {
        return res.status(401).send({ message: 'Invalid token' });
      } else {
        return res.status(403).send({ message: 'Forbidden access' });
      }
    }
    

    req.decoded = decoded;
    req.tokenEmail = decoded.email; // Add this for easier access
    next();
  });
};

async function run() {
  try {
    await client.connect();
    console.log("✅ MongoDB connected");

    const database = client.db("lifeSure");
    const userCollection = database.collection("user");
    const agentApplicationsCollection = database.collection("agents");
    const policiesCollection = database.collection("policies");
    const applicationsCollection = database.collection("applications");
    const blogsCollection = database.collection("blogs");
    const reviewsCollection = database.collection("reviews");
    const paymentCollection = database.collection("payments");
    const claimsCollection = database.collection("claims");
    const faqCollections = database.collection("faqs");
    const newsletterCollection = database.collection("newsletters");

    // --- Role-based Middleware Definitions ---
    // These middleware functions must be defined within the 'run' function
    // to have access to the 'userCollection' database instance.

    const isAdmin = async (req, res, next) => {
      const email =req.decoded?.email; // Email extracted by verifyJwt
      if (!email) {
        return res.status(403).send({ message: 'Forbidden: Email not found in token.' });
      }
      const user = await userCollection.findOne({ email });
      if (!user || user.role !== 'admin') {
        return res.status(403).send({ message: 'Forbidden: Requires Admin role.' });
      }
      next();
    };

    const isAgent = async (req, res, next) => {
      const email = req.decoded?.email;
      if (!email) {
        return res.status(403).send({ message: 'Forbidden: Email not found in token.' });
      }
      const user = await userCollection.findOne({ email });
      if (!user || user.role !== 'agent') {
        return res.status(403).send({ message: 'Forbidden: Requires Agent role.' });
      }
      next();
    };

    const isCustomer = async (req, res, next) => {
      const email = req.decoded?.email;
      if (!email) {
        return res.status(403).send({ message: 'Forbidden: Email not found in token.' });
      }
      const user = await userCollection.findOne({ email });
      if (!user || user.role !== 'customer') {
        return res.status(403).send({ message: 'Forbidden: Requires Customer role.' });
      }
      next();
    };
    // --- End Role-based Middleware Definitions ---


 app.post('/jwt', (req, res) => {
      const user = { email: req.body.email }
      const Token = jwt.sign(user, process.env.JWT_SECRET_KEY, {
        expiresIn: '10d'
      })
      res.send({ Token, message: 'jwt created successfully' });
    })
    // Save user if not exists (public or handled by client-side auth flow)
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

    // Post agent application (typically accessible to anyone applying, but might need basic auth later)
    app.post("/agent-applications", async (req, res) => {
      try {
        const application = req.body;
        application.status = "pending";
        application.appliedAt = new Date();
        const result = await agentApplicationsCollection.insertOne(application);
        res.send({
          success: true,
          insertedId: result.insertedId,
          message: "Agent application submitted successfully",
        });
      } catch (error) {
        console.error("Failed to submit agent application:", error);
        res
          .status(500)
          .send({ success: false, message: "Internal server error" });
      }
    });

    // GET all pending agent applications - ADMIN ONLY
    app.get("/agent-applications/pending", verifyJwt, isAdmin, async (req, res) => {
      try {
        const pending = await agentApplicationsCollection
          .find({ status: "pending" })
          .toArray();
        res.send(pending);
      } catch (err) {
        console.error("Error fetching pending agent applications:", err);
        res
          .status(500)
          .send({ message: "Failed to fetch pending applications" });
      }
    });

    // Update user role - ADMIN ONLY
    app.patch("/users/:id/role", verifyJwt, isAdmin, async (req, res) => {
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
          return res
            .status(404)
            .json({ message: "User not found or role unchanged" });
        }
        res.json({ message: "User role updated successfully" });
      } catch (error) {
        console.error("Error updating user role:", error);
        res.status(500).json({ message: "Server error" });
      }
    });

    // Update agent application status and potentially user role - ADMIN ONLY
    app.patch("/agent-applications/approve/:email", verifyJwt, isAdmin, async (req, res) => {
      try {
        const email = req.params.email;
        const { status } = req.body;
        // Update application status
        const result = await agentApplicationsCollection.updateOne(
          { email },
          { $set: { status } }
        );
        res.send(result);
      } catch (err) {
        console.error("Error approving agent:", err);
        res.status(500).send({ message: "Failed to approve agent" });
      }
    });

    // Promote user to role by email (used after agent approval) - ADMIN ONLY
    app.patch("/users/promote/:email", verifyJwt, isAdmin, async (req, res) => {
      try {
        const email = req.params.email;
        const { role } = req.body;
        if (!["admin", "agent", "customer"].includes(role)) {
          return res.status(400).json({ message: "Invalid role" });
        }
        const result = await userCollection.updateOne(
          { email },
          { $set: { role } }
        );
        if (result.modifiedCount === 0) {
          return res
            .status(404)
            .json({ message: "User not found or role unchanged" });
        }
        res.json({ message: "User role updated successfully" });
      } catch (error) {
        console.error("Error updating user role by email:", error);
        res.status(500).json({ message: "Server error" });
      }
    });

    // Reject agent application and send feedback - ADMIN ONLY
    app.patch("/agent-applications/reject/:id", verifyJwt, isAdmin, async (req, res) => {
      try {
        const { id } = req.params;
        const { feedback } = req.body;
        const result = await agentApplicationsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: "rejected", feedback } }
        );
        res.send(result);
      } catch (err) {
        console.error("Error rejecting agent:", err);
        res.status(500).send({ message: "Failed to reject agent" });
      }
    });

    // GET all users (for Manage Users page) - ADMIN ONLY
    app.get("/users", verifyJwt, isAdmin, async (req, res) => {
      try {
        const users = await userCollection.find().toArray();
        res.send(users);
      } catch (err) {
        console.error("Failed to fetch users:", err);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    // Getting featured agents (public or light auth) - consider if this needs JWT
    app.get('/featured-agents', async (req, res) => {
      const agents = await userCollection
        .find({ role: 'agent' })
        .limit(3)
        .toArray();
      res.send(agents);
    });

    // Get user by email (restricted to 'self' or 'admin')
   app.get("/users/:email", verifyJwt, async (req, res) => {
  const email = req.params.email;
  const tokenEmail = req.decoded?.email;

  try {
    const userRequesting = await userCollection.findOne({ email: tokenEmail });

    if (!userRequesting) {
      return res.status(401).send({ message: "Unauthorized: User not found" });
    }

    // Now safe to check role
    if (userRequesting.role === 'admin' || tokenEmail === email) {
      const user = await userCollection.findOne({ email });
      if (!user) return res.status(404).send("User not found");
      res.send(user);
    } else {
      return res.status(403).send({ message: "Forbidden: Cannot access other user's data" });
    }
  } catch (error) {
    console.error("Error fetching user by email:", error);
    res.status(500).send({ message: "Server error" });
  }
});

    // Update user lastLogin - USER ONLY (authenticated user can update their own last login)
    app.patch("/users/last-login/:email", verifyJwt, async (req, res) => {
      try {
        const email = req.params.email;
        if (req.tokenEmail !== email) { // Ensure user can only update their own lastLogin
          return res.status(403).send({ message: "Forbidden: Cannot update another user's last login." });
        }
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

    // Update User profile - USER ONLY (authenticated user can update their own profile)
    app.put('/users/:id', verifyJwt, async (req, res) => {
      const id = req.params.id;
      const { name, photoURL, email } = req.body; // Assuming email is passed in body for verification

      if (req.tokenEmail !== email) { // Verify token email matches email in body
        return res.status(403).send({ message: "Forbidden: Cannot update another user's profile." });
      }

      const result = await userCollection.updateOne(
        { _id: new ObjectId(id), email: req.tokenEmail }, // Ensure it's the correct user
        { $set: { name, photoURL } }
      );
      res.send(result);
    });

    // Delete User - ADMIN ONLY
    app.delete("/users/:id", verifyJwt, isAdmin, async (req, res) => {
      try {
        const userId = req.params.id;
        const result = await userCollection.deleteOne({
          _id: new ObjectId(userId),
        });
        if (result.deletedCount === 0) {
          return res.status(404).json({ message: "User not found" });
        }
        res.json({ message: "User deleted successfully" });
      } catch (error) {
        console.error("Error deleting user:", error);
        res.status(500).json({ message: "Server error" });
      }
    });

    // Add a new policy - ADMIN ONLY
    app.post("/policies", verifyJwt, isAdmin, async (req, res) => {
      const newPolicy = req.body;
      const result = await policiesCollection.insertOne(newPolicy);
      res.send(result);
    });

    // Get policies (public or light auth depending on use case)
    app.get("/policies", async (req, res) => {
      try {
        const { search = "", category = "" } = req.query;
        const query = {};
        if (search) {
          query.$or = [
            { title: { $regex: search, $options: "i" } },
            { category: { $regex: search, $options: "i" } },
            { description: { $regex: search, $options: "i" } },
          ];
        }
        if (category) {
          query.category = category;
        }
        const policies = await policiesCollection.find(query).toArray();
        res.send(policies);
      } catch (error) {
        console.error("Failed to fetch policies:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    // GET a single policy by ID (public or light auth)
    app.get("/policies/:id", async (req, res) => {
      const id = req.params.id;
      const policy = await policiesCollection.findOne({
        _id: new ObjectId(id),
      });
      if (!policy) return res.status(404).send("Policy not found");
      res.send(policy);
    });

    // GET top 6 popular policies (public or light auth)
    app.get("/popular-policies", async (req, res) => {
      try {
        const policies = await policiesCollection
          .find()
          .sort({ purchaseCount: -1 })
          .limit(6)
          .toArray();
        res.send(policies);
      } catch (error) {
        console.error("Failed to fetch popular policies:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    // Update a policy by id - ADMIN ONLY
    app.patch("/policies/:id", verifyJwt, isAdmin, async (req, res) => {
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

    // Delete a policy by id - ADMIN ONLY
    app.delete("/policies/:id", verifyJwt, isAdmin, async (req, res) => {
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

    // Post application data - CUSTOMER ONLY
    app.post("/applications", verifyJwt, isCustomer, async (req, res) => {
      try {
        const application = req.body;
        if (req.tokenEmail !== application.email) { // Ensure customer submits for themselves
          return res.status(403).send({ message: "Forbidden: Cannot submit application for another user." });
        }
        // Add default status
        application.status = "pending";
        application.submittedAt = new Date();
        const result = await applicationsCollection.insertOne(application);
        res.send({
          success: true,
          message: "Application submitted successfully",
          insertedId: result.insertedId,
        });
      } catch (error) {
        console.error("Failed to submit application:", error);
        res.status(500).send({
          success: false,
          message: "Internal server error",
        });
      }
    });

    // Getting all application data - ADMIN/AGENT ONLY (admin sees all, agent sees their assigned)
    app.get("/applications", verifyJwt, async (req, res) => {
      try {
        const email = req.tokenEmail;
        const user = await userCollection.findOne({ email });
        let query = {};
        if (user.role === 'agent') {
          query = { assignedAgent: email };
        } else if (user.role !== 'admin') {
          return res.status(403).send({ message: 'Forbidden: Requires Admin or Agent role.' });
        }
        const applications = await applicationsCollection
          .find(query)
          .sort({ submittedAt: -1 })
          .toArray();
        res.send(applications);
      } catch (error) {
        console.error("Error fetching applications:", error);
        res.status(500).send({ message: "Server error" });
      }
    });

    // Get application data by agent email - AGENT ONLY
    app.get("/applications/agent/:email", verifyJwt, isAgent, async (req, res) => {
      const email = req.params.email;
      if (req.tokenEmail !== email) { // Ensure agent can only view their own assigned applications
        return res.status(403).send({ message: "Forbidden: Cannot view other agent's applications." });
      }
      try {
        const assignedApplications = await applicationsCollection
          .find({ assignedAgent: email })
          .toArray();
        res.send(assignedApplications);
      } catch (err) {
        console.error("Failed to get assigned applications:", err);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    // GET /applications/user/:email - CUSTOMER ONLY (view their own applications)
    app.get("/applications/user", verifyJwt, isCustomer, async (req, res) => {
      const email = req.query.email;
      if (req.tokenEmail !== email) { // Ensure customer can only view their own applications
        return res.status(403).send({ message: "Forbidden: Cannot view other user's applications." });
      }
      try {
        const userApps = await applicationsCollection
          .find({ email })
          .sort({ submittedAt: -1 })
          .toArray();
        res.send(userApps);
      } catch (err) {
        res.status(500).send({ message: "Failed to fetch applications" });
      }
    });

    // Get single application data by id - ADMIN/AGENT/CUSTOMER (if it's their own)
    app.get("/applications/:id", verifyJwt, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      try {
        const application = await applicationsCollection.findOne(filter);
        if (!application) {
          return res.status(404).send({ message: 'Application not found.' });
        }
        // Check if the authenticated user has permission to view this application
        const user = await userCollection.findOne({ email: req.tokenEmail });
        if (user.role === 'admin' || application.assignedAgent === req.tokenEmail || application.email === req.tokenEmail) {
          res.send(application);
        } else {
          return res.status(403).send({ message: 'Forbidden: You do not have permission to view this application.' });
        }
      } catch (error) {
        console.error("Error fetching application:", error);
        res.status(500).send({ message: "Server error" });
      }
    });

    // Update application status and increase count if approved - ADMIN/AGENT ONLY
    app.patch("/applications/status/:id", verifyJwt, async (req, res) => { // Consider isAdmin or isAgent if specific actions are allowed
      const id = req.params.id;
      const { status, policyId } = req.body;
      try {
        const user = await userCollection.findOne({ email: req.tokenEmail });
        if (user.role !== 'admin' && user.role !== 'agent') {
            return res.status(403).send({ message: 'Forbidden: Requires Admin or Agent role.' });
        }

        const updateResult = await applicationsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status } }
        );

        // Optional: Increase policy purchase count if status becomes 'approved'
        if (status === "approved") {
          await policiesCollection.updateOne(
            { id: policyId }, // Assuming 'id' is a unique field in policies
            { $inc: { purchaseCount: 1 } } // Assume this field exists
          );
        }
        res.send(updateResult);
      } catch (err) {
        console.error("Failed to update status:", err);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    // Get application by email if policy status is active - CUSTOMER ONLY
    app.get('/active-application', verifyJwt, isCustomer, async (req, res) => {
      const email = req.query.email;
      if (!email || req.tokenEmail !== email) return res.status(400).send({ message: "Missing email query or unauthorized access" });
      try {
        const activeApp = await applicationsCollection.find({
          email,
          policyStatus: 'active'
        }).toArray();
        if (!activeApp) {
          return res.status(404).send({ message: "No active policy found" });
        }
        res.send(activeApp);
      } catch (error) {
        console.error("Error fetching active application:", error);
        res.status(500).send({ message: "Server error" });
      }
    });

    // Assign Agent and mark as approved - ADMIN ONLY
    app.patch("/applications/:id/assign-agent", verifyJwt, isAdmin, async (req, res) => {
      const { id } = req.params;
      const { agentEmail } = req.body;
      try {
        const result = await applicationsCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              assignedAgent: agentEmail,
            },
          }
        );
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: "Error assigning agent" });
      }
    });

    // Update payment status - CUSTOMER ONLY (for their own application)
    app.patch('/applications/pay/:id', verifyJwt, isCustomer, async (req, res) => {
      const id = req.params.id;
      const paidAt = new Date();
      try {
        const application = await applicationsCollection.findOne({ _id: new ObjectId(id) });
        if (!application || application.email !== req.tokenEmail) {
          return res.status(403).send({ message: "Forbidden: Cannot pay for another user's application." });
        }

        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            paymentStatus: "paid",
            policyStatus: "active",
            dueDate: paidAt,
          },
        };
        const result = await applicationsCollection.updateOne(filter, updateDoc);
        res.send(result);
      } catch (error) {
        console.error("Error updating payment status:", error);
        res.status(500).send({ message: "Server error" });
      }
    });

    // Update status if rejected - ADMIN/AGENT ONLY
    app.patch("/applications/:id/reject", verifyJwt, async (req, res) => { // Could be isAdmin or isAgent
      const id = req.params.id;
      const { feedback } = req.body;
      try {
        const user = await userCollection.findOne({ email: req.tokenEmail });
        if (user.role !== 'admin' && user.role !== 'agent') {
            return res.status(403).send({ message: 'Forbidden: Requires Admin or Agent role to reject applications.' });
        }

        const result = await applicationsCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              status: "rejected",
              rejectionFeedback: feedback,
            },
          }
        );
        res.send(result);
      } catch (err) {
        console.error("Error rejecting application:", err);
        res.status(500).send({ message: "Error rejecting application" });
      }
    });

    // Posting blogs - AGENT ONLY
    app.post("/blogs", verifyJwt, isAgent, async (req, res) => {
      try {
        const blogData = req.body;
        if (req.tokenEmail !== blogData.authorEmail) { // Ensure agent posts their own blogs
          return res.status(403).send({ message: "Forbidden: You can only post blogs as yourself." });
        }
        const result = await blogsCollection.insertOne(blogData);
        res.status(201).send({ insertedId: result.insertedId });
      } catch (error) {
        console.error("Error saving blog:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // Get blogs (public or based on author for agent's own blogs)
    app.get("/blogs", async (req, res) => { // No specific role required unless querying for agent's own blogs
      try {
        const email = req.query.email;
        const query = email ? { authorEmail: email } : {}; // Allow filtering by author email
        const blogs = await blogsCollection
          .find(query)
          .sort({ publishDate: -1 })
          .toArray();
        res.send(blogs);
      } catch (error) {
        res.status(500).send({ error: "Failed to fetch blogs" });
      }
    });

    // Update visit count (public)
    app.patch('/blogs/:id/visit', async (req, res) => {
      const blogId = req.params.id;
      try {
        const result = await blogsCollection.updateOne(
          { _id: new ObjectId(blogId) },
          { $inc: { totalVisit: 1 } }
        );
        if (result.modifiedCount === 1) {
          res.send({ message: 'Visit count incremented' });
        } else {
          res.status(404).send({ error: 'Blog not found' });
        }
      } catch (error) {
        res.status(500).send({ error: 'Server error' });
      }
    });

    // Get latest blogs (public)
    app.get("/blogs/latest", async (req, res) => {
      try {
        const latestBlogs = await blogsCollection
          .find()
          .sort({ publishDate: -1 }) // Newest first
          .limit(4)
          .toArray();
        res.send(latestBlogs);
      } catch (error) {
        console.error("Failed to fetch latest blogs", error);
        res.status(500).send({ error: "Internal server error" });
      }
    });

    // GET blog by ID (public)
    app.get("/blogs/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const blog = await blogsCollection.findOne({ _id: new ObjectId(id) });
        if (!blog) {
          return res.status(404).send({ error: "Blog not found" });
        }
        res.send(blog);
      } catch (error) {
        console.error("Error fetching blog:", error);
        res.status(500).send({ error: "Server error" });
      }
    });

    // Update blog by id - AGENT ONLY (for their own blogs) or ADMIN
    app.put("/blogs/:id", verifyJwt, async (req, res) => {
      try {
        const id = req.params.id;
        const updatedBlog = req.body;

        const user = await userCollection.findOne({ email: req.tokenEmail });
        if (user.role === 'agent' && updatedBlog.authorEmail !== req.tokenEmail) {
            return res.status(403).send({ message: "Forbidden: You can only update your own blogs." });
        } else if (user.role !== 'admin' && user.role !== 'agent') {
            return res.status(403).send({ message: 'Forbidden: Requires Admin or Agent role to update blogs.' });
        }

        const result = await blogsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updatedBlog }
        );
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to update blog" });
      }
    });

    // Delete blog - AGENT ONLY (for their own blogs) or ADMIN
    app.delete("/blogs/:id", verifyJwt, async (req, res) => {
      try {
        const id = req.params.id;
        const blog = await blogsCollection.findOne({ _id: new ObjectId(id) });
        if (!blog) {
            return res.status(404).send({ message: 'Blog not found.' });
        }

        const user = await userCollection.findOne({ email: req.tokenEmail });
        if (user.role === 'agent' && blog.authorEmail !== req.tokenEmail) {
            return res.status(403).send({ message: "Forbidden: You can only delete your own blogs." });
        } else if (user.role !== 'admin' && user.role !== 'agent') {
            return res.status(403).send({ message: 'Forbidden: Requires Admin or Agent role to delete blogs.' });
        }

        const result = await blogsCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to delete blog" });
      }
    });

    // Post review into database - CUSTOMER ONLY
    app.post("/reviews", verifyJwt, isCustomer, async (req, res) => {
      const reviewData = req.body;
      if (req.tokenEmail !== reviewData.reviewerEmail) { // Ensure customer posts their own reviews
        return res.status(403).send({ message: "Forbidden: Cannot post review as another user." });
      }
      try {
        const result = await reviewsCollection.insertOne(reviewData);
        res.send({ success: true, insertedId: result.insertedId });
      } catch (err) {
        res.status(500).send({ message: "Review submission failed" });
      }
    });

    // GET reviews (public)
    app.get("/reviews", async (req, res) => {
      try {
        const reviews = await reviewsCollection
          .find()
          .sort({ createdAt: -1 }) // latest first
          .toArray();
        res.send(reviews);
      } catch (error) {
        console.error("Failed to fetch reviews:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    app.post('/create-payment-intent', verifyJwt, isCustomer, async (req,res)=>{
      const {amountInCents} = req.body;
      const paymentIntent = await stripe.paymentIntents.create({
        amount:amountInCents,
        currency: 'usd',
      })
      res.json({clientSecret:paymentIntent.client_secret})
    })

    // Save payment history in database - CUSTOMER ONLY
    app.post('/payment-history', verifyJwt, isCustomer, async (req, res) => {
      const payment = req.body; // should include userEmail, amount, policyTitle, frequency, paidAt, applicationId
      if (req.tokenEmail !== payment.userEmail) { // Ensure customer records their own payment
        return res.status(403).send({ message: "Forbidden: Cannot record payment for another user." });
      }
      try {
        const result = await paymentCollection.insertOne(payment);
        res.send(result);
      } catch (error) {
        console.error("Error saving payment history:", error);
        res.status(500).send({ message: "Server error" });
      }
    });

    // GET /payment-history (Admin only for all, Customer for their own)
    app.get("/payment-history", verifyJwt, async (req, res) => {
      try {
        const email = req.query.email; // Allow optional filtering for specific user
        const user = await userCollection.findOne({ email: req.tokenEmail });
        let query = {};

        if (email && user.role === 'customer' && req.tokenEmail !== email) {
            return res.status(403).send({ message: 'Forbidden: Cannot view other user\'s payment history.' });
        } else if (user.role === 'customer' && !email) { // If customer and no email query, only show their own
            query = { userEmail: req.tokenEmail };
        } else if (email && user.role === 'admin') { // Admin can view specific user's history
            query = { userEmail: email };
        } else if (user.role === 'admin' && !email) { // Admin can view all history
            // No specific query, fetches all
        } else {
            return res.status(403).send({ message: 'Forbidden: Requires Admin or Customer role to view payment history.' });
        }

        const payments = await paymentCollection.find(query).sort({ paidAt: -1 }).toArray();
        res.status(200).json(payments);
      } catch (error) {
        res.status(500).json({ message: "Failed to fetch payment history", error });
      }
    });


    // Create a new claim request - CUSTOMER ONLY
    app.post('/claims', verifyJwt, isCustomer, async (req, res) => {
      const claim = req.body;
      if (req.tokenEmail !== claim.userEmail) { // Ensure customer submits their own claim
        return res.status(403).send({ message: "Forbidden: Cannot submit claim for another user." });
      }
      try {
        const result = await claimsCollection.insertOne(claim);
        res.send({
          message: "Claim submitted successfully",
          insertedId: result.insertedId,
        });
      } catch (error) {
        console.error("Error submitting claim:", error);
        res.status(500).send({ message: "Failed to submit claim" });
      }
    });

    // Getting faqs from db (public)
    app.get('/faqs', async (req, res) => {
      try {
        const faqs = await faqCollections.find().sort({ helpfulCount: -1 }).toArray();
        res.send(faqs);
      } catch (error) {
        console.error("Error fetching FAQs:", error);
        res.status(500).send({ message: "Server error" });
      }
    });

    // Update faqs helpfulCount (public - any user can vote)
    app.patch('/faqs/:id/helpful', async (req, res) => {
      const id = req.params.id;
      try {
        const result = await faqCollections.updateOne(
          { _id: new ObjectId(id) },
          { $inc: { helpfulCount: 1 } }
        );
        if (result.modifiedCount === 0) {
          return res.status(404).send({ message: "FAQ not found or already updated." });
        }
        res.send({ message: "Vote added!" });
      } catch (error) {
        console.error("Error updating helpful vote:", error);
        res.status(500).send({ message: "Server error" });
      }
    });

    // POST /newsletter - Public route (no auth required)
    app.post("/newsletter", async (req, res) => {
      const { name, email } = req.body;
      try {
        // Optional: prevent duplicate subscriptions
        const existing = await newsletterCollection.findOne({ email });
        if (existing) {
          return res.status(409).json({ message: "Already subscribed with this email." });
        }
        const result = await newsletterCollection.insertOne({
          name,
          email,
          subscribedAt: new Date(),
        });
        res.status(201).json({ message: "Subscription successful", insertedId: result.insertedId });
      } catch (error) {
        console.error("Newsletter subscription failed:", error);
        res.status(500).json({ message: "Internal server error" });
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
