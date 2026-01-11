import {
    CatalogsApi,
    MetricsApi,
    EventsApi,
    ProfilesApi,
    Session,
} from "klaviyo-api";

export class ReplenishmentService {
    private catalogsApi: CatalogsApi;
    private metricsApi: MetricsApi;
    private eventsApi: EventsApi;
    private profilesApi: ProfilesApi;

    constructor(session: Session) {
        this.catalogsApi = new CatalogsApi(session);
        this.metricsApi = new MetricsApi(session);
        this.eventsApi = new EventsApi(session);
        this.profilesApi = new ProfilesApi(session);
    }

    private async getProfileId(email: string): Promise<string | null> {
        try {
            const profiles = await this.profilesApi.getProfiles({
                filter: `equals(email,"${email}")`,
            });
            return profiles.body.data[0]?.id || null;
        } catch (error) {
            console.error("Error fetching profile:", error);
            return null;
        }
    }

    async getBurnRate(email: string, defaultDays: number): Promise<number> {
        const profileId = await this.getProfileId(email);
        if (!profileId) return defaultDays;

        try {
            const metrics = await this.metricsApi.getMetrics({
                filter: `equals(attributes.name,"Placed Order")`,
            });
            const metricId = metrics.body.data[0]?.id;
            if (!metricId) return defaultDays;

            // Fetch recent 'Placed Order' events for this profile
            // Used to calculate average interval
            const events = await this.eventsApi.getEvents({
                filter: `equals(metric_id,"${metricId}"),equals(profile_id,"${profileId}")`,
                sort: "-datetime",
            });

            const eventData = events.body.data.slice(0, 3);
            if (eventData.length < 2) return defaultDays;

            let totalInterval = 0;
            for (let i = 0; i < eventData.length - 1; i++) {
                const dt1 = eventData[i].attributes.datetime;
                const dt2 = eventData[i + 1].attributes.datetime;

                if (!dt1 || !dt2) continue;

                const d1 = new Date(dt1).getTime();
                const d2 = new Date(dt2).getTime();
                totalInterval += d1 - d2;
            }

            const avgIntervalMs = totalInterval / (eventData.length - 1);
            const avgDays = avgIntervalMs / (1000 * 60 * 60 * 24);

            return avgDays > 0 ? avgDays : defaultDays;
        } catch (error) {
            console.error("Error calculating burn rate:", error);
            return defaultDays;
        }
    }

    async calculateNextReplenishment(
        productId: string,
        email: string,
    ): Promise<Date | null> {
        try {
            const items = await this.catalogsApi.getCatalogItems({
                filter: `equals(external_id,"${productId}")`,
            });
            const item = items.body.data[0];

            if (!item) {
                console.warn(`Product ${productId} not found in catalog.`);
                return null;
            }

            const attributes = item.attributes as any;
            const metadata =
                attributes.custom_metadata || attributes.customMetadata;
            const lifetimeDays =
                metadata?.expected_lifetime_days ||
                metadata?.expectedLifetimeDays;

            if (!lifetimeDays) return null;

            const baseRate = Number(lifetimeDays);
            const burnRate = await this.getBurnRate(email, baseRate);

            const multiplier = burnRate / baseRate;
            const nextEmailWindow = Number(lifetimeDays) * multiplier;

            const nextDate = new Date();
            nextDate.setDate(nextDate.getDate() + Math.round(nextEmailWindow));

            return nextDate;
        } catch (error) {
            console.error("Error calculating replenishment:", error);
            return null;
        }
    }

    async triggerReplenishmentEvent(
        email: string,
        productId: string,
        date: Date,
    ): Promise<void> {
        const profileId = await this.getProfileId(email);
        if (!profileId) {
            console.error(
                `Cannot trigger event: Profile not found for ${email}`,
            );
            return;
        }

        try {
            await this.eventsApi.createEvent({
                data: {
                    type: "event",
                    attributes: {
                        properties: {
                            replenishment_date: date
                                .toISOString()
                                .split("T")[0],
                            product_id: productId,
                        },
                        metric: {
                            data: {
                                type: "metric",
                                attributes: {
                                    name: "Replenishment Due Soon",
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
                    },
                },
            });
            console.log(
                `Triggered 'Replenishment Due Soon' for ${email} on ${date.toISOString()}`,
            );
        } catch (error) {
            console.error("Error triggering event:", error);
        }
    }
}
