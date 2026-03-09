import "dotenv/config";
import express from "express";
import authRoutes from "./routes/auth";
import launchRoutes from "./routes/launches";
import whitelistRoutes from "./routes/launches.whitelist";
import referralRoutes from "./routes/launches.referrals";
import purchaseRoutes from "./routes/purchases";
import vestingRoutes from "./routes/vesting";

const app = express();
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/api/auth", authRoutes);
app.use("/api/launches", launchRoutes);
app.use("/api/launches/:id/whitelist", whitelistRoutes);
app.use("/api/launches/:id/referrals", referralRoutes);
app.use("/api/launches/:id", purchaseRoutes); // purchase is under /api/launches/:id/purchase
app.use("/api/launches/:id/vesting", vestingRoutes);

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
