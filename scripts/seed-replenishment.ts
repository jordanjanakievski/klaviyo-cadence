import {
    ApiKeySession,
    CatalogsApi,
    EventsApi,
    ProfilesApi,
} from "klaviyo-api";
import * as dotenv from "dotenv";

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

async function seed() {
    console.log("Starting seeding process...");

    // 1. Create Catalog Item (Vitamin Serum)
    const productId = "VS-001";
    console.log(`Creating catalog item: ${productId}...`);
    try {
        await catalogsApi.createCatalogItem({
            data: {
                type: "catalog-item",
                attributes: {
                    externalId: productId,
                    title: "Vitamin Serum",
                    description: "A revitalizing serum for daily use.",
                    price: 29.99,
                    url: "https://example.com/products/vitamin-serum",
                    imageFullUrl:
                        "https://example.com/images/vitamin-serum.jpg",
                    customMetadata: {
                        expectedLifetimeDays: 60,
                        category: "Skincare",
                    } as any, // Cast to any to handle dynamic metadata structure
                },
            },
        });
        console.log("Catalog item created.");
    } catch (e: any) {
        console.log(
            "Catalog item creation skipped or failed (might already exist):",
            e.message || e,
        );
    }

    // 2. Create/Get Profile
    const email = "test-user@example.com";
    console.log(`Seeding profile: ${email}...`);
    let profileId: string | undefined;

    try {
        const profiles = await profilesApi.getProfiles({
            filter: `equals(email,"${email}")`,
        });

        if (profiles.body.data.length > 0) {
            profileId = profiles.body.data[0].id || undefined;
            console.log(`Profile found: ${profileId}`);
        } else {
            const newProfile = await profilesApi.createProfile({
                data: {
                    type: "profile",
                    attributes: {
                        email: email,
                        firstName: "Test",
                        lastName: "User",
                    },
                },
            });
            profileId = newProfile.body.data.id || undefined;
            console.log(`Profile created: ${profileId}`);
        }
    } catch (e) {
        console.error("Error managing profile:", e);
        return;
    }

    if (!profileId) return;

    // 3. Seed 'Placed Order' events
    // We want to simulate a burn rate of 30 days.
    // Events at: Today - 90d, Today - 60d, Today - 30d.
    const today = new Date();
    const intervals = [90, 60, 30];

    console.log("Seeding 'Placed Order' events...");

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
                                    product_id: productId,
                                    product_name: "Vitamin Serum",
                                },
                            ],
                            value: 29.99,
                        },
                        metric: {
                            data: {
                                type: "metric",
                                attributes: {
                                    name: "Placed Order",
                                },
                            },
                        },
                        profile: {
                            data: {
                                type: "profile",
                                id: profileId,
                                attributes: {},
                            },
                        },
                        time: date,
                        uniqueId: `order-${date.getTime()}`,
                    },
                },
            });
            console.log(`Created event for date: ${date.toISOString()}`);
        } catch (e) {
            console.error("Error creating event:", e);
        }
    }

    console.log("Seeding complete.");
}

seed();
