import express, { Request, Response } from "express";
import { ApiKeySession } from "klaviyo-api";
import { DashboardService } from "../services/dashboardService";

const router = express.Router();

router.get("/", async (req: Request, res: Response) => {
    const API_KEY = process.env.KLAVIYO_KEY;
    if (!API_KEY) {
        return res.status(500).send("KLAVIYO_KEY not set");
    }

    const session = new ApiKeySession(API_KEY);
    const dashboardService = new DashboardService(session);

    // Fetch demand for next 2 months
    const profiles = await dashboardService.fetchUpcomingDemand(60);

    res.render("dashboard", {
        profiles,
        successMessage: req.query.success,
    });
});

export default router;
