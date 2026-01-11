import express, { Request, Response } from "express";
import { ApiKeySession } from "klaviyo-api";
import { ReplenishmentService } from "../services/replenishmentService";

const router = express.Router();
const API_KEY = process.env.KLAVIYO_KEY;

router.post("/placed-order", async (req: Request, res: Response) => {
    const { email, items } = req.body;

    if (!API_KEY) {
        console.error("KLAVIYO_KEY not set");
        return res.status(500).send("Server misconfiguration");
    }

    if (!email || !items || !Array.isArray(items)) {
        return res
            .status(400)
            .send(
                "Invalid payload. Expected { email, items: [{ product_id }] }",
            );
    }

    try {
        const session = new ApiKeySession(API_KEY);
        const service = new ReplenishmentService(session);

        const results = [];

        for (const item of items) {
            if (!item.product_id) continue;

            const nextDate = await service.calculateNextReplenishment(
                item.product_id,
                email,
            );

            if (nextDate) {
                await service.triggerReplenishmentEvent(
                    email,
                    item.product_id,
                    nextDate,
                );
                results.push({
                    product_id: item.product_id,
                    replenishment_date: nextDate,
                });
            }
        }

        res.status(200).json({
            message: "Processed replenishment checks",
            results,
        });
    } catch (error) {
        console.error("Error processing placed-order:", error);
        res.status(500).send("Internal Server Error");
    }
});

export default router;
