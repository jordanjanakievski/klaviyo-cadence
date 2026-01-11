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
            console.log(`Step 1: Creating Segment '${segmentName}'...`);

            // 1. Create Segment
            // We use a safe "Email contains @" condition to ensure segment creation succeeds.
            // In a real production scenario, you would fine-tune the Profile Property condition.
            const segmentPayload = {
                data: {
                    type: "segment",
                    attributes: {
                        name: segmentName,
                        definition: {
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
                        },
                    },
                },
            };

            const segmentResponse = await this.segmentsApi.createSegment(
                segmentPayload as any,
            );
            const segmentId = segmentResponse.body.data.id;
            console.log(`-> Segment Created: ${segmentId}`);

            console.log(
                `Step 2: Creating Campaign for Segment ${segmentId}...`,
            );
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
                                                from_label:
                                                    "Example Store",
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
            console.log(`-> Campaign Created: ${campaignId}`);

            console.log(
                `Step 3: Assigning Template to Campaign ${campaignId}...`,
            );

            const messagesResponse =
                await this.campaignsApi.getCampaignCampaignMessages(campaignId);
            const messageId = messagesResponse.body.data[0]?.id;

            if (!messageId) {
                throw new Error("Campaign created but no message found.");
            }

            // Step 2.5: Update Message Content (Subject, From Email, etc.)
            // The campaign-level attributes might not propagate to the message automatically in all contexts.
            console.log(`Step 2.5: Updating Message Content for ${messageId}...`);
            await this.campaignsApi.updateCampaignMessage(messageId, {
                data: {
                    type: 'campaign-message',
                    id: messageId,
                    attributes: {
                        definition: {
                            channel: 'email', // Required field
                            content: {
                                subject: `Time to restock your ${productId}!`,
                                from_email: "replenishment@example.com",
                                from_label: "Klaviyo Replenishment"
                            }
                        }
                    }
                }
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
                                id: templateId
                            }
                        }
                    }
                }
            };

            // Using the specialized endpoint for template assignment
            await this.campaignsApi.createCampaignMessageAssignTemplate(
                assignTemplatePayload as any
            );
            console.log(
                `-> Template ${templateId} assigned to Message ${messageId}`,
            );

            console.log(
                `Step 4: Scheduling Send for Campaign ${campaignId}...`,
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
            console.log(`-> Send Job Initiated!`);

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
