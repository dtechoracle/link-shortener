const express = require("express");
const { customAlphabet } = require("nanoid");
const useragent = require("express-useragent");
const requestIp = require("request-ip");
const urlService = require("./services/urlService");

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
  try {
    const { originalUrl } = req.body;
    const url = await urlService.createShortUrl(originalUrl);

    res.json({
      shortUrl: `http://${req.get("host")}/${url.short_id}`,
      shortId: url.short_id,
    });
  } catch (error) {
    res.status(500).json({ error: "Error creating short URL" });
  }
});

// Redirect endpoint
app.get("/:shortId", async (req, res) => {
  try {
    const originalUrl = await urlService.getOriginalUrl(req.params.shortId);

    if (!originalUrl) {
      return res.status(404).json({ error: "URL not found" });
    }

    const visitorInfo = {
      ip: req.clientIp,
      userAgent: req.headers["user-agent"],
      referrer: req.headers.referer || "",
      browser: req.useragent.browser,
      os: req.useragent.os,
      deviceType: req.useragent.isMobile ? "mobile" : "desktop",
    };

    await urlService.trackVisit(req.params.shortId, visitorInfo);
    res.redirect(originalUrl);
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});

// Analytics endpoint
app.get("/analytics/:shortId", async (req, res) => {
  try {
    const analytics = await urlService.getAnalytics(req.params.shortId);
    if (!analytics) {
      return res.status(404).json({ error: "URL not found" });
    }
    res.json(analytics);
  } catch (error) {
    res.status(500).json({ error: "Error fetching analytics" });
  }
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
