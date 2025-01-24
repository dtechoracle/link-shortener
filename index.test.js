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
    const response = await request(app)
      .post("/shorten")
      .send({ originalUrl: "" });

    expect(response.status).toBe(400);
  });

  test("Should redirect to the original URL and record visit", async () => {
    // First create a short URL
    const createResponse = await request(app)
      .post("/shorten")
      .send({ originalUrl: "http://example.com" });

    const shortId = createResponse.body.shortId;

    // Then try to access it
    const response = await request(app)
      .get(`/${shortId}`)
      .set("User-Agent", "test-agent");

    expect(response.status).toBe(302);
    expect(response.header.location).toBe("http://example.com");
  });

  test("Should return 404 for non-existent short URL", async () => {
    const response = await request(app).get("/nonexistent");

    expect(response.status).toBe(404);
  });

  test("Should return analytics with detailed information", async () => {
    // Create a short URL first
    const createResponse = await request(app)
      .post("/shorten")
      .send({ originalUrl: "http://example.com" });

    const shortId = createResponse.body.shortId;

    // Visit the URL a few times
    await request(app).get(`/${shortId}`).set("User-Agent", "test-agent-1");
    await request(app).get(`/${shortId}`).set("User-Agent", "test-agent-2");

    // Get analytics
    const response = await request(app).get(`/analytics/${shortId}`);

    expect(response.status).toBe(200);
    expect(response.body.clicks).toBe(2);
    expect(response.body.uniqueVisitors).toBe(2);
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

    // Multiple visits from same user agent
    await request(app).get(`/${shortId}`).set("User-Agent", "test-agent");
    await request(app).get(`/${shortId}`).set("User-Agent", "test-agent");
    await request(app).get(`/${shortId}`).set("User-Agent", "different-agent");

    const response = await request(app).get(`/analytics/${shortId}`);

    expect(response.status).toBe(200);
    expect(response.body.clicks).toBe(3);
    expect(response.body.uniqueVisitors).toBe(2);
  });
});
