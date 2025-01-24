const express = require("express");
const crypto = require("crypto");
const { createClient } = require("redis");
const { customAlphabet } = require("nanoid");

const app = express();
const port = process.env.PORT || 3000;

// In-memory store for testing
const inMemoryStore = new Map();
const inMemoryVisitors = new Map();

// Create store based on environment
const createStore = () => {
  if (process.env.NODE_ENV === "test") {
    return {
      async set(key, value) {
        inMemoryStore.set(key, value);
      },
      async get(key) {
        return inMemoryStore.get(key);
      },
      async del(key) {
        inMemoryStore.delete(key);
      },
      async clear() {
        inMemoryStore.clear();
        inMemoryVisitors.clear();
      },
      async addVisitor(urlId, visitor) {
        const visitors = inMemoryVisitors.get(urlId) || new Set();
        visitors.add(visitor);
        inMemoryVisitors.set(urlId, visitors);
        return visitors.size;
      },
      async getVisitors(urlId) {
        return (inMemoryVisitors.get(urlId) || new Set()).size;
      },
      async incrementClicks(urlId) {
        const data = inMemoryStore.get(urlId) || { clicks: 0 };
        data.clicks = (data.clicks || 0) + 1;
        inMemoryStore.set(urlId, data);
        return data.clicks;
      },
    };
  }

  // Redis store for production
  const client = createClient({
    url: process.env.REDIS_URL || "redis://localhost:6379",
    socket: {
      reconnectStrategy: (retries) => {
        if (retries > 10) {
          console.error("Max Redis reconnection attempts reached");
          return new Error("Max Redis reconnection attempts reached");
        }
        return Math.min(retries * 100, 3000);
      },
      connectTimeout: 10000, // 10 seconds
    },
  });

  client.on("error", (err) => {
    if (process.env.NODE_ENV !== "test") {
      console.error("Redis Client Error:", err);
    }
  });

  return {
    client,
    async connect() {
      await client.connect();
    },
    async set(key, value) {
      await client.hSet(key, value);
    },
    async get(key) {
      return client.hGetAll(key);
    },
    async del(key) {
      await client.del(key);
    },
    async clear() {
      await client.flushDb();
    },
    async addVisitor(urlId, visitor) {
      await client.sAdd(`visitors:${urlId}`, visitor);
      return client.sCard(`visitors:${urlId}`);
    },
    async getVisitors(urlId) {
      return client.sCard(`visitors:${urlId}`);
    },
    async incrementClicks(urlId) {
      return client.hIncrBy(`url:${urlId}`, "clicks", 1);
    },
    async quit() {
      if (client.isOpen) {
        await client.quit();
      }
    },
  };
};

const store = createStore();

// Enable CORS for testing
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  next();
});

app.use(express.json());

// Create a custom nanoid function with a specific alphabet
const nanoid = customAlphabet(
  "1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
  8
);

// Function to generate short ID
function generateShortId(length = 6) {
  return crypto
    .randomBytes(length)
    .toString("base64")
    .replace(/[+/=]/g, "")
    .substring(0, length);
}

// Helper function to get client IP
function getClientInfo(req) {
  return {
    ip: req.ip || req.connection.remoteAddress,
    hostname: req.hostname,
    timestamp: new Date().toLocaleString(),
    userAgent: req.headers["user-agent"],
    language: req.headers["accept-language"],
    platform: req.headers["sec-ch-ua-platform"],
    device: parseUserAgent(req.headers["user-agent"]),
    screenResolution: req.headers["sec-ch-viewport-width"]
      ? `${req.headers["sec-ch-viewport-width"]}x${req.headers["sec-ch-viewport-height"]}`
      : "Unknown",
  };
}

// Helper function to parse user agent string
function parseUserAgent(userAgent) {
  if (!userAgent) return "Unknown Device";

  const details = {
    device: "Unknown",
    os: "Unknown",
    browser: "Unknown",
    isMobile: false,
  };

  // Operating System Detection
  if (userAgent.includes("Windows")) {
    details.os = "Windows";
  } else if (userAgent.includes("Mac OS")) {
    details.os = "MacOS";
  } else if (userAgent.includes("Linux")) {
    details.os = "Linux";
  } else if (userAgent.includes("Android")) {
    details.os = "Android";
    details.isMobile = true;
  } else if (userAgent.includes("iPhone") || userAgent.includes("iPad")) {
    details.os = "iOS";
    details.isMobile = true;
  }

  // Browser Detection
  if (userAgent.includes("Chrome")) {
    details.browser = "Chrome";
  } else if (userAgent.includes("Firefox")) {
    details.browser = "Firefox";
  } else if (userAgent.includes("Safari")) {
    details.browser = "Safari";
  } else if (userAgent.includes("Edge")) {
    details.browser = "Edge";
  }

  // Device Type
  if (userAgent.includes("Mobile")) {
    details.device = "Mobile";
  } else if (userAgent.includes("Tablet")) {
    details.device = "Tablet";
  } else {
    details.device = "Desktop";
  }

  return details;
}

// URL shortening endpoint
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

  try {
    await store.set(`url:${shortId}`, urlData);
    const shortUrl = `${req.protocol}://${req.get("host")}/${shortId}`;
    res.json({ shortUrl, shortId });
  } catch (error) {
    res.status(500).json({ error: "Failed to create short URL" });
  }
});

// Redirect endpoint
app.get("/:shortId", async (req, res) => {
  const { shortId } = req.params;

  try {
    const urlData = await store.get(`url:${shortId}`);

    if (!urlData || !urlData.originalUrl) {
      return res.status(404).send("URL not found");
    }

    const userAgent = req.get("user-agent") || "unknown";
    const clicks = await store.incrementClicks(shortId);
    const uniqueVisitors = await store.addVisitor(shortId, userAgent);

    await store.set(`url:${shortId}`, {
      ...urlData,
      clicks,
      uniqueVisitors,
    });

    res.redirect(urlData.originalUrl);
  } catch (error) {
    res.status(500).send("Server error");
  }
});

// Analytics endpoint
app.get("/analytics/:shortId", async (req, res) => {
  const { shortId } = req.params;

  try {
    const urlData = await store.get(`url:${shortId}`);

    if (!urlData || !urlData.originalUrl) {
      return res.status(404).json({ error: "URL not found" });
    }

    res.json({
      originalUrl: urlData.originalUrl,
      created: parseInt(urlData.created),
      clicks: parseInt(urlData.clicks),
      uniqueVisitors: parseInt(urlData.uniqueVisitors),
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to get analytics" });
  }
});

// Only start the server if not in test environment
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
  const testPort = process.env.TEST_PORT || 0;
  server = app.listen(testPort);
}

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("Received SIGTERM. Performing graceful shutdown...");
  await store.quit();
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});

module.exports = { app, server, store };
