import {
    ApiKeySession,
    CatalogsApi,
    EventsApi,
    ProfilesApi,
    Session,
} from "klaviyo-api";
import * as dotenv from "dotenv";
import { ReplenishmentService } from "../src/services/replenishmentService";

dotenv.config();

const API_KEY = process.env.KLAVIYO_KEY;
if (!API_KEY) {
    console.error("Please set KLAVIYO_KEY in .env");
    process.exit(1);
}

const session = new ApiKeySession(API_KEY);
const catalogsApi = new CatalogsApi(session);
const eventsApi = new EventsApi(session);
const profilesApi = new ProfilesApi(session);
const replenishmentService = new ReplenishmentService(session);

// --- DATA DEFINITIONS ---

const PRODUCTS = [
    {
        id: "VS-001",
        title: "Vitamin Serum",
        lifetime: 30,
        price: 29.99,
    },
    {
        id: "HC-002",
        title: "Hydrating Cleanser",
        lifetime: 45,
        price: 15.99,
    },
    {
        id: "DM-003",
        title: "Daily Moisturizer",
        lifetime: 60,
        price: 24.99,
    },
];

const USERS = [
    {
        email: "user1.multi@example.com",
        first: "Alice",
        last: "Multi",
        orders: [
            { productId: "VS-001", interval: 25 }, // Buys Serum fast (25 days)
            { productId: "HC-002", interval: 50 }, // Buys Cleanser slow (50 days)
        ],
    },
    {
        email: "user2.multi@example.com",
        first: "Bob",
        last: "Multi",
        orders: [
            { productId: "HC-002", interval: 40 }, // Buys Cleanser normal (40 days)
            { productId: "DM-003", interval: 60 }, // Buys Moisturizer normal (60 days)
        ],
    },
    {
        email: "user3.single@example.com",
        first: "Charlie",
        last: "Single",
        orders: [
            { productId: "VS-001", interval: 35 }, // Buys Serum slow (35 days)
        ],
    },
    {
        email: "user4.single@example.com",
        first: "Diana",
        last: "Single",
        orders: [
            { productId: "DM-003", interval: 55 }, // Buys Moisturizer fast (55 days)
        ],
    },
    {
        email: "user5.single@example.com",
        first: "Evan",
        last: "Single",
        orders: [
            { productId: "HC-002", interval: 20 }, // Buys Cleanser VERY fast (20 days)
        ],
    },
];

// --- LOGIC ---

async function seedMaster() {
    console.log("Starting MASTER SEED process...");

    // 1. Create Products
    console.log("\nCreating Catalog Items...");
    for (const prod of PRODUCTS) {
        try {
            await catalogsApi.createCatalogItem({
                data: {
                    type: "catalog-item",
                    attributes: {
                        externalId: prod.id,
                        title: prod.title,
                        description: `A premium ${prod.title}`,
                        price: prod.price,
                        url: `https://example.com/products/${prod.id}`,
                        imageFullUrl: `https://example.com/images/${prod.id}.jpg`,
                        customMetadata: {
                            expectedLifetimeDays: prod.lifetime,
                            category: "Skincare",
                        } as any,
                    },
                },
            });
            console.log(`   Created ${prod.title} (${prod.id})`);
        } catch (e: any) {
            console.log(`   Skipped ${prod.title} (might exist)`);
        }
    }

    // 2. Create Users & Events
    console.log("\nCreating Profiles & Seeding Orders...");
    const today = new Date();

    for (const user of USERS) {
        console.log(`   Processing ${user.email}...`);
        let profileId: string | undefined;

        // Get or Create Profile
        try {
            const profiles = await profilesApi.getProfiles({
                filter: `equals(email,"${user.email}")`,
            });
            if (profiles.body.data.length > 0) {
                profileId = profiles.body.data[0].id || undefined;
            } else {
                const newProfile = await profilesApi.createProfile({
                    data: {
                        type: "profile",
                        attributes: {
                            email: user.email,
                            firstName: user.first,
                            lastName: user.last,
                        },
                    },
                });
                profileId = newProfile.body.data.id || undefined;
            }
        } catch (e) {
            console.error(`      Error fetching/creating profile:`, e);
            continue;
        }

        if (!profileId) continue;

        // Create Events for each product line
        for (const orderConfig of user.orders) {
            const product = PRODUCTS.find(
                (p) => p.id === orderConfig.productId,
            );
            if (!product) continue;

            // Generate 3 past orders to establish the cadence
            const intervals = [
                orderConfig.interval * 3,
                orderConfig.interval * 2,
                orderConfig.interval * 1,
            ];

            for (const daysAgo of intervals) {
                const date = new Date(today);
                date.setDate(date.getDate() - daysAgo);

                try {
                    await eventsApi.createEvent({
                        data: {
                            type: "event",
                            attributes: {
                                properties: {
                                    items: [
                                        {
                                            product_id: product.id,
                                            product_name: product.title,
                                        },
                                    ],
                                    value: product.price,
                                },
                                metric: {
                                    data: {
                                        type: "metric",
                                        attributes: { name: "Placed Order" },
                                    },
                                },
                                profile: {
                                    data: {
                                        type: "profile",
                                        id: profileId,
                                    },
                                },
                                time: date,
                                uniqueId: `master-${user.email}-${product.id}-${daysAgo}`,
                            } as any, // Cast to any to bypass strict typing that causes compiler error
                        },
                    });
                } catch (e) {
                    // Ignore dupes
                }
            }
            console.log(
                `      Seeded history for ${product.title} (Interval: ${orderConfig.interval}d)`,
            );

            // 3. TRIGGER REPLENISHMENT LOGIC IMMEDIATELY
            // This ensures the dashboard is populated without manual steps
            try {
                const nextDate =
                    await replenishmentService.calculateNextReplenishment(
                        product.id,
                        user.email,
                    );
                if (nextDate) {
                    await replenishmentService.triggerReplenishmentEvent(
                        user.email,
                        product.id,
                        nextDate,
                    );
                    console.log(
                        `      Calculated Replenishment: ${nextDate.toISOString().split("T")[0]}`,
                    );
                }
            } catch (e) {
                console.error(`      Failed to calculate replenishment:`, e);
            }
        }
    }

    console.log("\nMASTER SEED COMPLETE!");
    console.log("Go to http://localhost:8000/dashboard to see the results.");
}

seedMaster();
