import { ReplenishmentService } from "../src/services/replenishmentService";
import {
    Session,
    CatalogsApi,
    MetricsApi,
    EventsApi,
    ProfilesApi,
} from "klaviyo-api";

jest.mock("klaviyo-api");

describe("ReplenishmentService", () => {
    let service: ReplenishmentService;
    let mockSession: Session;

    let mockCatalogsApi: jest.Mocked<CatalogsApi>;
    let mockMetricsApi: jest.Mocked<MetricsApi>;
    let mockEventsApi: jest.Mocked<EventsApi>;
    let mockProfilesApi: jest.Mocked<ProfilesApi>;

    beforeEach(() => {
        jest.clearAllMocks();

        mockSession = {} as Session;

        service = new ReplenishmentService(mockSession);

        mockCatalogsApi = (CatalogsApi as any).mock.instances[0];
        mockMetricsApi = (MetricsApi as any).mock.instances[0];
        mockEventsApi = (EventsApi as any).mock.instances[0];
        mockProfilesApi = (ProfilesApi as any).mock.instances[0];
    });

    describe("getBurnRate", () => {
        it("should return default 30 days if profile not found", async () => {
            mockProfilesApi.getProfiles.mockResolvedValue({
                body: { data: [] },
            } as any);

            const rate = await service.getBurnRate("test@example.com", 30);
            expect(rate).toBe(30);
        });

        it("should return 30 days if no metric found", async () => {
            mockProfilesApi.getProfiles.mockResolvedValue({
                body: { data: [{ id: "profile-123" }] },
            } as any);
            mockMetricsApi.getMetrics.mockResolvedValue({
                body: { data: [] },
            } as any);

            const rate = await service.getBurnRate("test@example.com", 30);
            expect(rate).toBe(30);
        });

        it("should calculate correct burn rate based on event intervals", async () => {
            mockProfilesApi.getProfiles.mockResolvedValue({
                body: { data: [{ id: "profile-123" }] },
            } as any);
            mockMetricsApi.getMetrics.mockResolvedValue({
                body: {
                    data: [
                        {
                            id: "metric-123",
                            attributes: { name: "Placed Order" },
                        },
                    ],
                },
            } as any);

            const now = new Date().getTime();
            const dayMs = 24 * 60 * 60 * 1000;

            mockEventsApi.getEvents.mockResolvedValue({
                body: {
                    data: [
                        {
                            attributes: {
                                datetime: new Date(now).toISOString(),
                            },
                        },
                        {
                            attributes: {
                                datetime: new Date(
                                    now - 15 * dayMs,
                                ).toISOString(),
                            },
                        },
                        {
                            attributes: {
                                datetime: new Date(
                                    now - 30 * dayMs,
                                ).toISOString(),
                            },
                        },
                    ],
                },
            } as any);

            const rate = await service.getBurnRate("test@example.com", 30);
            expect(rate).toBeCloseTo(15, 1);
        });
    });

    describe("calculateNextReplenishment", () => {
        it("should return null if product not found (404)", async () => {
            mockCatalogsApi.getCatalogItem.mockRejectedValue({ status: 404 });

            const date = await service.calculateNextReplenishment(
                "prod-1",
                "test@example.com",
            );
            expect(date).toBeNull();
        });

        it("should calculate correct date based on lifetime and burn rate", async () => {
            mockProfilesApi.getProfiles.mockResolvedValue({
                body: { data: [{ id: "profile-123" }] },
            } as any);

            mockMetricsApi.getMetrics.mockResolvedValue({
                body: {
                    data: [
                        {
                            id: "metric-123",
                            attributes: { name: "Placed Order" },
                        },
                    ],
                },
            } as any);

            const now = new Date().getTime();
            const dayMs = 24 * 60 * 60 * 1000;
            mockEventsApi.getEvents.mockResolvedValue({
                body: {
                    data: [
                        {
                            attributes: {
                                datetime: new Date(now).toISOString(),
                            },
                        },
                        {
                            attributes: {
                                datetime: new Date(
                                    now - 15 * dayMs,
                                ).toISOString(),
                            },
                        },
                        {
                            attributes: {
                                datetime: new Date(
                                    now - 30 * dayMs,
                                ).toISOString(),
                            },
                        },
                    ],
                },
            } as any);

            mockCatalogsApi.getCatalogItem.mockResolvedValue({
                body: {
                    data: {
                        attributes: {
                            custom_metadata: { expected_lifetime_days: 60 },
                        },
                    },
                },
            } as any);

            const resultDate = await service.calculateNextReplenishment(
                "prod-1",
                "test@example.com",
            );

            expect(resultDate).not.toBeNull();

            const expectedDate = new Date();
            expectedDate.setDate(expectedDate.getDate() + 15);

            const diff = Math.abs(
                resultDate!.getTime() - expectedDate.getTime(),
            );
            expect(diff).toBeLessThan(1000 * 60 * 60 * 24);
        });

        it("should default to product lifetime if user has no history (cold start)", async () => {
            mockProfilesApi.getProfiles.mockResolvedValue({
                body: { data: [{ id: "new-user" }] },
            } as any);
            mockMetricsApi.getMetrics.mockResolvedValue({
                body: {
                    data: [
                        {
                            id: "metric-123",
                            attributes: { name: "Placed Order" },
                        },
                    ],
                },
            } as any);
            mockEventsApi.getEvents.mockResolvedValue({
                body: { data: [] },
            } as any);

            mockCatalogsApi.getCatalogItem.mockResolvedValue({
                body: {
                    data: {
                        attributes: {
                            custom_metadata: { expected_lifetime_days: 60 },
                        },
                    },
                },
            } as any);

            const resultDate = await service.calculateNextReplenishment(
                "prod-1",
                "new-user@example.com",
            );

            expect(resultDate).not.toBeNull();

            const expectedDate = new Date();
            expectedDate.setDate(expectedDate.getDate() + 60);

            const diff = Math.abs(
                resultDate!.getTime() - expectedDate.getTime(),
            );
            expect(diff).toBeLessThan(1000 * 60);
        });
    });

    describe("triggerReplenishmentEvent", () => {
        it("should trigger an event and update profile property", async () => {
            const profileId = "profile-123";
            const email = "test@example.com";
            const productId = "VS-001";
            const date = new Date("2026-02-15");
            const dateStr = "2026-02-15";

            mockProfilesApi.getProfiles.mockResolvedValue({
                body: { data: [{ id: profileId }] },
            } as any);

            mockProfilesApi.updateProfile.mockResolvedValue({} as any);
            mockEventsApi.createEvent.mockResolvedValue({} as any);

            await service.triggerReplenishmentEvent(email, productId, date);

            expect(mockEventsApi.createEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        attributes: expect.objectContaining({
                            properties: expect.objectContaining({
                                product_id: productId,
                                replenishment_date: dateStr,
                            }),
                        }),
                    }),
                }),
            );

            expect(mockProfilesApi.updateProfile).toHaveBeenCalledWith(
                profileId,
                expect.objectContaining({
                    data: expect.objectContaining({
                        id: profileId,
                        attributes: {
                            properties: {
                                [`replenishment_date_${productId}`]: dateStr,
                            },
                        },
                    }),
                }),
            );
        });
    });
});
