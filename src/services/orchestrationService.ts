import { SegmentsApi, CampaignsApi, Session } from "klaviyo-api";

export class OrchestrationService {
    private segmentsApi: SegmentsApi;
    private campaignsApi: CampaignsApi;

    constructor(session: Session) {
        this.segmentsApi = new SegmentsApi(session);
        this.campaignsApi = new CampaignsApi(session);
    }

    async launchGroupCampaign(productId: string): Promise<string> {
        const today = new Date().toISOString().split("T")[0];
        const timestamp = new Date().getTime();
        const segmentName = `Restock_${productId}_${today}_${timestamp}`;

        try {
            const segmentDefinition = {
                conditionGroups: [
                    {
                        operator: "and",
                        conditions: [
                            {
                                type: "profile-property",
                                property: "email",
                                filter: {
                                    type: "string",
                                    operator: "contains",
                                    value: "example.com",
                                },
                            },
                        ],
                    },
                ],
            };

            const segmentPayload = {
                data: {
                    type: "segment",
                    attributes: {
                        name: segmentName,
                        definition: segmentDefinition,
                    },
                },
            };

            const segmentResponse = await this.segmentsApi.createSegment(
                segmentPayload as any,
            );
            const segmentId = segmentResponse.body.data.id;

            const campaignPayload = {
                data: {
                    type: "campaign",
                    attributes: {
                        name: `Restock Campaign ${productId} - ${today} - ${timestamp}`,
                        fromEmail: "donotreply@example.com",
                        fromLabel: "Example Store",
                        subject: `Time to restock your ${productId}!`,
                        audiences: {
                            included: [segmentId],
                        },
                        sendStrategy: {
                            method: "immediate",
                        },
                        sendOptions: {
                            useSmartSending: true,
                        },
                        campaignMessages: {
                            data: [
                                {
                                    type: "campaign-message",
                                    attributes: {
                                        definition: {
                                            channel: "email",
                                            content: {
                                                subject: `Time to restock your ${productId}!`,
                                                from_email:
                                                    "donotreply@example.com",
                                                from_label: "Example Store",
                                            },
                                        },
                                    },
                                },
                            ],
                        },
                    },
                },
            };

            const campaignResponse = await this.campaignsApi.createCampaign(
                campaignPayload as any,
            );
            const campaignId = campaignResponse.body.data.id;

            const messagesResponse =
                await this.campaignsApi.getCampaignCampaignMessages(campaignId);
            const messageId = messagesResponse.body.data[0]?.id;

            if (!messageId) {
                throw new Error("Campaign created but no message found.");
            }

            await this.campaignsApi.updateCampaignMessage(messageId, {
                data: {
                    type: "campaign-message",
                    id: messageId,
                    attributes: {
                        definition: {
                            channel: "email",
                            content: {
                                subject: `Time to restock your ${productId}!`,
                                from_email: "replenishment@example.com",
                                from_label: "Klaviyo Replenishment",
                            },
                        },
                    },
                },
            } as any);

            const templateId = process.env.KLAVIYO_TEMPLATE_ID;
            if (!templateId) {
                throw new Error("KLAVIYO_TEMPLATE_ID not set in environment");
            }

            const assignTemplatePayload = {
                data: {
                    type: "campaign-message",
                    id: messageId,
                    relationships: {
                        template: {
                            data: {
                                type: "template",
                                id: templateId,
                            },
                        },
                    },
                },
            };

            await this.campaignsApi.createCampaignMessageAssignTemplate(
                assignTemplatePayload as any,
            );

            const sendJobPayload = {
                data: {
                    type: "campaign-send-job",
                    id: campaignId,
                },
            };

            await this.campaignsApi.createCampaignSendJob(
                sendJobPayload as any,
            );

            console.log("Campaign created");
            return campaignId;
        } catch (error: any) {
            console.error("Orchestration Failed:", error.message);
            if (error.response?.data?.errors) {
                console.error(
                    "Klaviyo API Details:",
                    JSON.stringify(error.response.data.errors, null, 2),
                );
            }
            throw new Error("Failed to launch campaign");
        }
    }
}
