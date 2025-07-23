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

    // post agent
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
    // GET all pending agent applications
    app.get("/agent-applications/pending", async (req, res) => {
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

    // update agent role if approved
    app.patch("/agent-applications/approve/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const { status } = req.body;

        // 2. Update application status
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

    // Update user role by email (for agent approval case)
    app.patch("/users/promote/:email", async (req, res) => {
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

    // reject agent and send feedback
    app.patch("/agent-applications/reject/:id", async (req, res) => {
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

    // Delete User

    app.delete("/users/:id", async (req, res) => {
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

    // Add a new policy
    app.post("/policies", async (req, res) => {
      const newPolicy = req.body;
      const result = await policiesCollection.insertOne(newPolicy);
      res.send(result);
    });

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

    // GET a single policy by ID
    app.get("/policies/:id", async (req, res) => {
      const id = req.params.id;
      const policy = await policiesCollection.findOne({
        _id: new ObjectId(id),
      });
      if (!policy) return res.status(404).send("Policy not found");
      res.send(policy);
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

    // post application data
    app.post("/applications", async (req, res) => {
      try {
        const application = req.body;

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

    // getting  application data

    app.get("/applications", async (req, res) => {
      try {
        const applications = await applicationsCollection
          .find()
          .sort({ submittedAt: -1 })
          .toArray();
        res.send(applications);
      } catch (error) {
        console.error("Error fetching applications:", error);
        res.status(500).send({ message: "Server error" });
      }
    });

    // get application data by email
    app.get("/applications/agent/:email", async (req, res) => {
      const email = req.params.email;
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

    // GET /applications/user/:email
    app.get("/applications/user", async (req, res) => {
      const email = req.query.email;
      try {
        const userApps = await applicationsCollection
          .find({ email })
          .sort({ submittedAt: -1 }) // latest first
          .toArray();
        res.send(userApps);
      } catch (err) {
        res.status(500).send({ message: "Failed to fetch applications" });
      }
    });


        // getting  application data by id

    app.get("/applications/:id", async (req, res) => {
   const id = req.params.id;
 
      const filter = { _id: new ObjectId(id)};
      try {
        const applications = await applicationsCollection
          .findOne(filter)
          
       
        res.send(applications);
      } catch (error) {
        console.error("Error fetching applications:", error);
        res.status(500).send({ message: "Server error" });
      }
    });

    // update status and increase count if approved
    app.patch("/applications/status/:id", async (req, res) => {
      const id = req.params.id;
      const { status, policy_name } = req.body;

      try {
        const updateResult = await applicationsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status } }
        );

        // Optional: Increase policy purchase count if status becomes 'approved'
        if (status === "approved") {
          await policiesCollection.updateOne(
            { title: policy_name },
            { $inc: { purchaseCount: 1 } } // Assume this field exists
          );
        }

        res.send(updateResult);
      } catch (err) {
        console.error("Failed to update status:", err);
        res.status(500).send({ message: "Internal server error" });
      }
    });

// get application by email if policy status is active
    app.get('/active-application', async (req, res) => {
  const email = req.query.email;
  if (!email) return res.status(400).send({ message: "Missing email query" });

  try {
    const activeApp = await applicationsCollection.find({
      email,
      policyStatus: 'active'
    })   .toArray();

    if (!activeApp) {
      return res.status(404).send({ message: "No active policy found" });
    }

    res.send(activeApp);
  } catch (error) {
    console.error("Error fetching active application:", error);
    res.status(500).send({ message: "Server error" });
  }
});


    // Assign Agent and mark as approved
    app.patch("/applications/:id/assign-agent", async (req, res) => {
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

    // update payment status 
app.patch('/applications/pay/:id', async (req, res) => {
 const id = req.params.id

  const paidAt = new Date();

  try {
    
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


    //   update status if rejected

    app.patch("/applications/:id/reject", async (req, res) => {
      const { id } = req.params;
      const { feedback } = req.body;

      try {
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

    // posting blogs(agent)

    app.post("/blogs", async (req, res) => {
      try {
        const blogData = req.body;

        const result = await blogsCollection.insertOne(blogData);

        res.status(201).send({ insertedId: result.insertedId });
      } catch (error) {
        console.error("Error saving blog:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    app.get("/blogs", async (req, res) => {
      try {
        const email = req.query.email;
        const query = email ? { authorEmail: email } : {};
        const blogs = await blogsCollection
          .find(query)
          .sort({ publishDate: -1 })
          .toArray();
        res.send(blogs);
      } catch (error) {
        res.status(500).send({ error: "Failed to fetch blogs" });
      }
    });

    // update blog by id

    app.put("/blogs/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const updatedBlog = req.body;
        const result = await blogsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updatedBlog }
        );
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to update blog" });
      }
    });

    // delete blog
    app.delete("/blogs/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const result = await blogsCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to delete blog" });
      }
    });

 

    // post review into database

    app.post("/reviews", async (req, res) => {
  
      const reviewData = req.body;

      try {
       

        const result = await reviewsCollection.insertOne( reviewData
        
        );

        res.send({ success: true, insertedId: result.insertedId });
      } catch (err) {
        res.status(500).send({ message: "Review submission failed" });
      }
    });

    app.post('/create-payment-intent',async (req,res)=>{
      const {amountInCents} = req.body;
      const paymentIntent = await stripe.paymentIntents.create({
        amount:amountInCents,
        currency: 'usd',
        // payment_Method_types: ['card']
        
      })
      res.json({clientSecret:paymentIntent.client_secret})
    })

    // save payment history in database

app.post('/payment-history', async (req, res) => {
  const payment = req.body; // should include userEmail, amount, policyTitle, frequency, paidAt, applicationId

  try {
    const result = await paymentCollection.insertOne(payment);
    res.send(result);
  } catch (error) {
    console.error("Error saving payment history:", error);
    res.status(500).send({ message: "Server error" });
  }
});

// GET /payment-history
app.get("/payment-history",  async (req, res) => {
  try {
    const payments = await paymentCollection.find().sort({ paidAt: -1 }).toArray();
    res.status(200).json(payments);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch payment history", error });
  }
});

// Create a new claim request
app.post('/claims', async (req, res) => {
  const claim = req.body;


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

// getting faqs from db
app.get('/faqs', async (req, res) => {
  try {
    const faqs = await faqCollections.find().sort({ helpfulCount: -1 }).toArray();
    res.send(faqs);
  } catch (error) {
    console.error("Error fetching FAQs:", error);
    res.status(500).send({ message: "Server error" });
  }
});

// update faqs helpfulCount
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





    // Start server AFTER DB connection is ready
    app.listen(port, () => {
      console.log(`🚀 Server running on http://localhost:${port}`);
    });
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
  }
}

run();
