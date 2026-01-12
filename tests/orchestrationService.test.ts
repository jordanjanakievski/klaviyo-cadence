import { OrchestrationService } from "../src/services/orchestrationService";
import { Session, SegmentsApi, CampaignsApi } from "klaviyo-api";

jest.mock("klaviyo-api");

describe("OrchestrationService", () => {
    let service: OrchestrationService;
    let mockSession: Session;

    let mockSegmentsApi: jest.Mocked<SegmentsApi>;
    let mockCampaignsApi: jest.Mocked<CampaignsApi>;

    beforeEach(() => {
        jest.clearAllMocks();
        mockSession = {} as Session;
        service = new OrchestrationService(mockSession);

        mockSegmentsApi = (SegmentsApi as any).mock.instances[0];
        mockCampaignsApi = (CampaignsApi as any).mock.instances[0];

        process.env.KLAVIYO_TEMPLATE_ID = "template-123";
    });

    it("should orchestrate a campaign launch sequence correctly", async () => {
        const productId = "HC-002";
        const segmentId = "segment-123";
        const campaignId = "campaign-123";
        const messageId = "message-123";

        mockSegmentsApi.createSegment.mockResolvedValue({
            body: { data: { id: segmentId } },
        } as any);

        mockCampaignsApi.createCampaign.mockResolvedValue({
            body: { data: { id: campaignId } },
        } as any);

        mockCampaignsApi.getCampaignCampaignMessages.mockResolvedValue({
            body: {
                data: [
                    {
                        type: "campaign-message",
                        id: messageId,
                        attributes: {},
                        relationships: {},
                    },
                ],
            },
        } as any);

        mockCampaignsApi.updateCampaignMessage.mockResolvedValue({} as any);
        mockCampaignsApi.createCampaignMessageAssignTemplate.mockResolvedValue(
            {} as any,
        );
        mockCampaignsApi.createCampaignSendJob.mockResolvedValue({} as any);

        await service.launchGroupCampaign(productId);

        expect(mockSegmentsApi.createSegment).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    attributes: expect.objectContaining({
                        definition: expect.objectContaining({
                            conditionGroups: expect.arrayContaining([
                                expect.objectContaining({
                                    conditions: expect.arrayContaining([
                                        expect.objectContaining({
                                            property: "email",
                                            filter: expect.objectContaining({
                                                operator: "contains",
                                                value: "example.com",
                                            }),
                                        }),
                                    ]),
                                }),
                            ]),
                        }),
                    }),
                }),
            }),
        );

        expect(mockCampaignsApi.createCampaign).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    attributes: expect.objectContaining({
                        fromEmail: "donotreply@example.com",
                        audiences: expect.objectContaining({
                            included: [segmentId],
                        }),
                        sendStrategy: expect.objectContaining({
                            method: "immediate",
                        }),
                        campaignMessages: expect.objectContaining({
                            data: expect.arrayContaining([
                                expect.objectContaining({
                                    type: "campaign-message",
                                    attributes: expect.objectContaining({
                                        definition: expect.objectContaining({
                                            channel: "email",
                                        }),
                                    }),
                                }),
                            ]),
                        }),
                    }),
                }),
            }),
        );

        expect(mockCampaignsApi.updateCampaignMessage).toHaveBeenCalledWith(
            messageId,
            expect.objectContaining({
                data: expect.objectContaining({
                    attributes: expect.objectContaining({
                        definition: expect.objectContaining({
                            channel: "email",
                            content: expect.objectContaining({
                                subject: expect.stringContaining(productId),
                            }),
                        }),
                    }),
                }),
            }),
        );

        expect(
            mockCampaignsApi.createCampaignMessageAssignTemplate,
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    id: messageId,
                    relationships: {
                        template: {
                            data: { type: "template", id: "template-123" },
                        },
                    },
                }),
            }),
        );

        expect(mockCampaignsApi.createCampaignSendJob).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    type: "campaign-send-job",
                    id: campaignId,
                }),
            }),
        );
    });
});
