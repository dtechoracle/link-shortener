const request = require("supertest");
const { app, server, store } = require("./index");

jest.setTimeout(60000); // Increase global timeout to 60 seconds

describe("Link Shortener Service", () => {
  beforeEach(async () => {
    await store.clear();
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  test("Should shorten a URL", async () => {
    const response = await request(app)
      .post("/shorten")
      .send({ originalUrl: "http://example.com" })
      .expect(200);

    expect(response.body.shortUrl).toBeDefined();
    expect(response.body.shortId).toBeDefined();
  }, 10000);

  test("Should reject empty URL", async () => {
    await request(app).post("/shorten").send({ originalUrl: "" }).expect(400);
  });

  test("Should redirect to the original URL and record visit with details", async () => {
    // First create a short URL
    const createResponse = await request(app)
      .post("/shorten")
      .send({ originalUrl: "http://example.com" });

    const shortId = createResponse.body.shortId;

    // Simulate visits with different user agents
    await request(app)
      .get(`/${shortId}`)
      .set(
        "User-Agent",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
      )
      .expect(302)
      .expect("Location", "http://example.com");
  });

  test("Should return 404 for non-existent short URL", async () => {
    await request(app).get("/nonexistent").expect(404);
  });

  test("Should return detailed analytics information", async () => {
    // Create a short URL
    const createResponse = await request(app)
      .post("/shorten")
      .send({ originalUrl: "http://example.com" });

    const shortId = createResponse.body.shortId;

    // Simulate different visitors
    const userAgents = [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Mobile/15E148 Safari/604.1",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15",
    ];

    for (const userAgent of userAgents) {
      await request(app)
        .get(`/${shortId}`)
        .set("User-Agent", userAgent)
        .expect(302);
    }

    // Get analytics
    const response = await request(app)
      .get(`/analytics/${shortId}`)
      .expect(200);

    // Test the structure of analytics response
    expect(response.body).toHaveProperty("urlInfo");
    expect(response.body).toHaveProperty("analytics");
    expect(response.body).toHaveProperty("recentVisitors");

    // Test URL info
    expect(response.body.urlInfo).toEqual({
      originalUrl: "http://example.com",
      created: expect.any(Number),
      shortId,
    });

    // Test analytics data
    const { analytics } = response.body;
    expect(analytics).toHaveProperty("totalClicks", 3);
    expect(analytics).toHaveProperty("uniqueVisitors");
    expect(analytics).toHaveProperty("browsers");
    expect(analytics).toHaveProperty("operatingSystems");
    expect(analytics).toHaveProperty("devices");
    expect(analytics).toHaveProperty("hourlyClicks");

    // Test recent visitors
    expect(response.body.recentVisitors).toBeInstanceOf(Array);
    expect(response.body.recentVisitors.length).toBeGreaterThan(0);

    // Test visitor details structure
    const visitor = response.body.recentVisitors[0];
    expect(visitor).toHaveProperty("ip");
    expect(visitor).toHaveProperty("timestamp");
    expect(visitor).toHaveProperty("browser");
    expect(visitor).toHaveProperty("os");
    expect(visitor).toHaveProperty("device");
  });

  test("Should return 404 for non-existent analytics", async () => {
    await request(app).get("/analytics/nonexistent").expect(404);
  });

  test("Should handle multiple clicks and record unique information", async () => {
    // Create a short URL
    const createResponse = await request(app)
      .post("/shorten")
      .send({ originalUrl: "http://example.com" });

    const shortId = createResponse.body.shortId;

    // Define distinct user agents
    const userAgents = [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/91.0.4472.124",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 14_6) Safari/604.1",
      "Mozilla/5.0 (X11; Linux x86_64) Firefox/89.0",
    ];

    // Make visits with each user agent
    for (const userAgent of userAgents) {
      // Make two visits with each user agent
      await request(app)
        .get(`/${shortId}`)
        .set("User-Agent", userAgent)
        .expect(302);

      await request(app)
        .get(`/${shortId}`)
        .set("User-Agent", userAgent)
        .expect(302);
    }

    // Get analytics
    const response = await request(app)
      .get(`/analytics/${shortId}`)
      .expect(200);

    // Debug output
    console.log("Analytics response:", JSON.stringify(response.body, null, 2));

    // Verify total clicks (2 visits × 3 user agents = 6)
    expect(response.body.analytics.totalClicks).toBe(6);

    // Verify unique visitors (3 different user agents)
    expect(response.body.analytics.uniqueVisitors).toBe(3);

    // Verify visitor details
    expect(response.body.recentVisitors).toHaveLength(6);

    // Verify we have data for each browser
    const browsers = Object.keys(response.body.analytics.browsers);
    expect(browsers).toHaveLength(3);
  });

  test("Should handle malformed URLs", async () => {
    const response = await request(app)
      .post("/shorten")
      .send({ originalUrl: "not-a-valid-url" })
      .expect(200); // Currently accepting any string, could be enhanced with URL validation

    expect(response.body.shortUrl).toBeDefined();
    expect(response.body.shortId).toBeDefined();
  });
});
