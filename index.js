const express = require("express");
const { customAlphabet } = require("nanoid");
const useragent = require("express-useragent");
const requestIp = require("request-ip");

const app = express();
const port = process.env.PORT || 3000;

// Create nanoid with custom alphabet
const nanoid = customAlphabet(
  "1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
  8
);

// In-memory storage
const urlStore = new Map();
const visitorStore = new Map();
const visitorDetailsStore = new Map();

// Middleware
app.use(express.json());
app.use(useragent.express());
app.use(requestIp.mw());

// Create store interface
const store = {
  async set(key, value) {
    urlStore.set(key, value);
  },

  async get(key) {
    return urlStore.get(key);
  },

  async clear() {
    urlStore.clear();
    visitorStore.clear();
    visitorDetailsStore.clear();
  },

  async addVisitor(urlId, visitorInfo) {
    // Get or initialize visitor sets
    let visitors = visitorStore.get(urlId);
    if (!visitors) {
      visitors = new Set();
      visitorStore.set(urlId, visitors);
    }

    // Get or initialize visitor details array
    let details = visitorDetailsStore.get(urlId);
    if (!details) {
      details = [];
      visitorDetailsStore.set(urlId, details);
    }

    // Add visitor to unique set using user agent as identifier
    visitors.add(visitorInfo.userAgent);

    // Add visit details
    details.push({
      ...visitorInfo,
      timestamp: new Date().toISOString(),
    });

    // Get and update URL data
    const urlData = await this.get(urlId);
    if (urlData) {
      urlData.uniqueVisitors = visitors.size;
      await this.set(urlId, urlData);
    }

    return visitors.size;
  },

  async getVisitorDetails(urlId) {
    return visitorDetailsStore.get(urlId) || [];
  },

  async getUniqueVisitorCount(urlId) {
    const visitors = visitorStore.get(urlId);
    return visitors ? visitors.size : 0;
  },

  async incrementClicks(urlId) {
    const data = await this.get(urlId);
    if (data) {
      data.clicks = (data.clicks || 0) + 1;
      await this.set(urlId, data);
      return data.clicks;
    }
    return 0;
  },
};

// Shorten URL endpoint
app.post("/shorten", async (req, res) => {
  const { originalUrl } = req.body;

  if (!originalUrl) {
    return res.status(400).json({ error: "URL is required" });
  }

  const shortId = nanoid();
  const urlData = {
    originalUrl,
    created: Date.now(),
    clicks: 0,
    uniqueVisitors: 0,
  };

  await store.set(shortId, urlData);
  const shortUrl = `${req.protocol}://${req.get("host")}/${shortId}`;
  res.json({ shortUrl, shortId });
});

// Redirect endpoint
app.get("/:shortId", async (req, res) => {
  const { shortId } = req.params;
  const urlData = await store.get(shortId);

  if (!urlData) {
    return res.status(404).send("URL not found");
  }

  const visitorInfo = {
    ip: req.clientIp,
    userAgent: req.get("user-agent") || "unknown",
    browser: {
      name: req.useragent.browser,
      version: req.useragent.version,
    },
    os: {
      name: req.useragent.os,
      version: req.useragent.platform,
    },
    device: {
      type: req.useragent.isMobile
        ? "mobile"
        : req.useragent.isTablet
        ? "tablet"
        : req.useragent.isDesktop
        ? "desktop"
        : "unknown",
    },
    referer: req.get("referer") || "direct",
  };

  await store.incrementClicks(shortId);
  await store.addVisitor(shortId, visitorInfo);

  res.redirect(urlData.originalUrl);
});

// Analytics endpoint
app.get("/analytics/:shortId", async (req, res) => {
  const { shortId } = req.params;
  const urlData = await store.get(shortId);

  if (!urlData) {
    return res.status(404).json({ error: "URL not found" });
  }

  const visitorDetails = await store.getVisitorDetails(shortId);
  const uniqueVisitors = await store.getUniqueVisitorCount(shortId);

  // Process visitor details for analytics
  const browsers = {};
  const operatingSystems = {};
  const devices = {};
  const hourlyClicks = {};

  visitorDetails.forEach((visitor) => {
    // Count browsers
    browsers[visitor.browser.name] = (browsers[visitor.browser.name] || 0) + 1;

    // Count operating systems
    operatingSystems[visitor.os.name] =
      (operatingSystems[visitor.os.name] || 0) + 1;

    // Count device types
    devices[visitor.device.type] = (devices[visitor.device.type] || 0) + 1;

    // Track hourly clicks
    const hour = new Date(visitor.timestamp).getHours();
    hourlyClicks[hour] = (hourlyClicks[hour] || 0) + 1;
  });

  res.json({
    urlInfo: {
      originalUrl: urlData.originalUrl,
      created: urlData.created,
      shortId,
    },
    analytics: {
      totalClicks: urlData.clicks,
      uniqueVisitors,
      browsers,
      operatingSystems,
      devices,
      hourlyClicks,
    },
    recentVisitors: visitorDetails.slice(-10).reverse(), // Last 10 visitors
  });
});

// Start server
let server;
if (process.env.NODE_ENV !== "test") {
  server = app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    console.log("Test the API with these curl commands:");
    console.log(`
      1. Create short URL:
         curl -X POST "http://localhost:${port}/shorten" -H "Content-Type: application/json" -d "{\\"originalUrl\\":\\"https://www.google.com\\"}"

      2. Check analytics (replace ABC123 with your shortId):
         curl "http://localhost:${port}/analytics/ABC123"
    `);
  });
} else {
  server = app.listen(0);
}

module.exports = { app, server, store };
