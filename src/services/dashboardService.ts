import { ProfilesApi, CatalogsApi, Session } from "klaviyo-api";

export interface DashboardProfile {
    email: string;
    predicted_date: string;
    first_name: string;
    product_id: string;
    product_name: string;
}

export class DashboardService {
    private profilesApi: ProfilesApi;
    private catalogsApi: CatalogsApi;

    constructor(session: Session) {
        this.profilesApi = new ProfilesApi(session);
        this.catalogsApi = new CatalogsApi(session);
    }

    async fetchUpcomingDemand(daysAhead: number): Promise<DashboardProfile[]> {
        const today = new Date();
        const futureDate = new Date();
        futureDate.setDate(today.getDate() + daysAhead);

        try {
            const response = await this.profilesApi.getProfiles({
                pageSize: 100,
                sort: "-updated",
            });

            const profilesData: DashboardProfile[] = [];
            const uniqueProductIds = new Set<string>();

            for (const profile of response.body.data) {
                const attributes = profile.attributes;
                if (!attributes) continue;

                const props = attributes.properties as any;
                if (!props) continue;

                for (const key of Object.keys(props)) {
                    if (key.startsWith("replenishment_date_")) {
                        const productId = key.replace(
                            "replenishment_date_",
                            "",
                        );
                        const predictedDateStr = props[key];

                        if (!predictedDateStr) continue;

                        const predictedDate = new Date(predictedDateStr);
                        if (
                            predictedDate >= today &&
                            predictedDate <= futureDate
                        ) {
                            profilesData.push({
                                email: attributes.email || "No Email",
                                first_name: attributes.firstName || "Customer",
                                predicted_date: predictedDateStr,
                                product_id: productId,
                                product_name: "",
                            });
                            uniqueProductIds.add(productId);
                        }
                    }
                }
            }

            const productNames: Map<string, string> = new Map();
            for (const pId of Array.from(uniqueProductIds)) {
                try {
                    const catalogItemId = `$custom:::$default:::${pId}`;
                    const productResponse =
                        await this.catalogsApi.getCatalogItem(catalogItemId);
                    productNames.set(
                        pId,
                        productResponse.body.data.attributes.title || pId,
                    );
                } catch (e: any) {
                    console.error(
                        `Error fetching title for product ${pId}:`,
                        e.message,
                    );
                    productNames.set(pId, pId);
                }
            }

            for (const profile of profilesData) {
                profile.product_name =
                    productNames.get(profile.product_id) || profile.product_id;
            }

            return profilesData;
        } catch (error: any) {
            console.error("Error fetching upcoming demand:", error);
            if (error.response?.data?.errors) {
                console.error("Klaviyo API Error:", error.response.data.errors);
            }
            return [];
        }
    }
}
