const request = require("supertest");
const { app, urlStore } = require("./index");

describe("Link Shortener Service", () => {
  beforeEach(() => {
    // Clear the urlStore before each test
    urlStore.clear();
  });

  test("Should shorten a URL", async () => {
    const response = await request(app)
      .post("/shorten")
      .send({ originalUrl: "http://example.com" });

    expect(response.status).toBe(200);
    expect(response.body.shortUrl).toMatch(/http:\/\/localhost:3000\/\w{6}/);
    expect(response.body.originalUrl).toBe("http://example.com");
    expect(response.body.created).toBeDefined();
  });

  test("Should reject empty URL", async () => {
    const response = await request(app)
      .post("/shorten")
      .send({ originalUrl: "" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Original URL is required");
  });

  test("Should redirect to the original URL and record visit", async () => {
    const shortId = "abcdef";
    urlStore.set(shortId, {
      originalUrl: "http://example.com",
      clicks: [],
      created: new Date().toLocaleString(),
    });

    const response = await request(app).get(`/${shortId}`);

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe("http://example.com");

    // Verify click was recorded
    const data = urlStore.get(shortId);
    expect(data.clicks.length).toBe(1);
    expect(data.clicks[0]).toHaveProperty("timestamp");
    expect(data.clicks[0]).toHaveProperty("ip");
    expect(data.clicks[0]).toHaveProperty("device");
  });

  test("Should return 404 for non-existent short URL", async () => {
    const response = await request(app).get("/nonexistent");
    expect(response.status).toBe(404);
  });

  test("Should return analytics with detailed information", async () => {
    const shortId = "abcdef";
    const mockClick = {
      timestamp: new Date().toLocaleString(),
      ip: "127.0.0.1",
      userAgent: "Mozilla/5.0",
      device: {
        device: "Desktop",
        os: "Windows",
        browser: "Chrome",
      },
      language: "en-US",
    };

    urlStore.set(shortId, {
      originalUrl: "http://example.com",
      clicks: [mockClick],
      created: new Date().toLocaleString(),
    });

    const response = await request(app).get(`/analytics/${shortId}`);

    expect(response.status).toBe(200);
    expect(response.body["URL Information"]["Short URL"]).toBe(
      `http://localhost:3000/${shortId}`
    );
    expect(response.body).toHaveProperty("URL Information");
    expect(response.body).toHaveProperty("Click History");
    expect(response.body["URL Information"]).toHaveProperty("Original URL");
    expect(response.body["URL Information"]).toHaveProperty("Total Clicks");
    expect(response.body["Click History"]).toHaveLength(1);
    expect(response.body["Click History"][0]).toHaveProperty(
      "Visitor Information"
    );
  });

  test("Should return 404 for non-existent analytics", async () => {
    const response = await request(app).get("/analytics/nonexistent");
    expect(response.status).toBe(404);
  });

  test("Should handle multiple clicks and record unique information", async () => {
    // Create a short URL
    const createResponse = await request(app)
      .post("/shorten")
      .send({ originalUrl: "http://example.com" });

    const shortId = createResponse.body.shortId;

    // Simulate multiple visits
    await request(app).get(`/${shortId}`);
    await request(app).get(`/${shortId}`);
    await request(app).get(`/${shortId}`);

    // Check analytics
    const analyticsResponse = await request(app).get(`/analytics/${shortId}`);
    expect(analyticsResponse.status).toBe(200);
    expect(analyticsResponse.body["URL Information"]["Total Clicks"]).toBe(3);
    expect(analyticsResponse.body["Click History"]).toHaveLength(3);
  });
});
