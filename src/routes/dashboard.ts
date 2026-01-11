import express, { Request, Response } from "express";
import { ApiKeySession } from "klaviyo-api";
import { DashboardService } from "../services/dashboardService";
import { OrchestrationService } from "../services/orchestrationService";

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

router.post("/launch", async (req: Request, res: Response) => {
    const API_KEY = process.env.KLAVIYO_KEY;
    if (!API_KEY) {
        return res.status(500).send("KLAVIYO_KEY not set");
    }

    const { product_id } = req.body;
    if (!product_id || product_id === "all") {
        return res
            .status(400)
            .send("Please select a specific product to launch a campaign.");
    }

    const session = new ApiKeySession(API_KEY);
    const orchestrationService = new OrchestrationService(session);

    try {
        await orchestrationService.launchGroupCampaign(product_id);
        res.redirect("/dashboard?success=Campaign Launched Successfully!");
    } catch (error) {
        res.status(500).send("Failed to launch campaign. Check logs.");
    }
});

export default router;
