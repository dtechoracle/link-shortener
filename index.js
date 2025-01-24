const express = require("express");
const crypto = require("crypto");
const app = express();

// Enable CORS for testing
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  next();
});

app.use(express.json());

// Enhanced URL store with click tracking
const urlStore = new Map();

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

app.post("/shorten", async (req, res) => {
  console.log("Headers:", req.headers);
  console.log("Body:", req.body);
  console.log("Raw body:", req.rawBody);

  const { originalUrl } = req.body;
  if (!originalUrl) {
    return res.status(400).json({ error: "Original URL is required" });
  }

  const shortId = generateShortId(6);
  const shortUrl = `http://localhost:3000/${shortId}`;

  // Initialize with empty clicks array
  urlStore.set(shortId, {
    originalUrl,
    clicks: [],
    created: new Date().toLocaleString(),
    createdBy: {
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.headers["user-agent"],
      device: parseUserAgent(req.headers["user-agent"]),
      timestamp: new Date().toLocaleString(),
    },
  });

  res.json({
    shortUrl,
    shortId,
    originalUrl,
    created: new Date().toLocaleString(),
  });
});

app.get("/:shortId", async (req, res) => {
  const { shortId } = req.params;
  const data = urlStore.get(shortId);

  if (!data || !data.originalUrl) {
    return res.status(404).send("URL not found");
  }

  // Record detailed click information
  const clickInfo = {
    timestamp: new Date().toLocaleString(),
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.headers["user-agent"],
    device: parseUserAgent(req.headers["user-agent"]),
    language: req.headers["accept-language"],
    screenResolution: req.headers["sec-ch-viewport-width"]
      ? `${req.headers["sec-ch-viewport-width"]}x${req.headers["sec-ch-viewport-height"]}`
      : "Unknown",
  };

  // Initialize clicks array if it doesn't exist
  if (!data.clicks) {
    data.clicks = [];
  }

  // Add click information
  data.clicks.push(clickInfo);
  urlStore.set(shortId, data);

  res.redirect(data.originalUrl);
});

app.get("/analytics/:shortId", async (req, res) => {
  const { shortId } = req.params;
  const data = urlStore.get(shortId);

  if (!data || !data.originalUrl) {
    return res.status(404).send("URL not found");
  }

  // Format the analytics data
  const analytics = {
    "URL Information": {
      "Original URL": data.originalUrl,
      "Short URL": `http://localhost:3000/${shortId}`,
      Created: data.created || new Date().toLocaleString(),
      "Total Clicks": data.clicks.length,
    },
    "Click History": data.clicks.map((click, index) => ({
      "Visit #": index + 1,
      Time: new Date().toLocaleString(),
      "Visitor Information": {
        "IP Address": click.ip || req.ip || req.connection.remoteAddress,
        Device: {
          Type:
            click.device?.device ||
            parseUserAgent(req.headers["user-agent"]).device,
          "Operating System":
            click.device?.os || parseUserAgent(req.headers["user-agent"]).os,
          Browser:
            click.device?.browser ||
            parseUserAgent(req.headers["user-agent"]).browser,
        },
        Language: req.headers["accept-language"] || "Unknown",
        "Screen Resolution": req.headers["sec-ch-viewport-width"]
          ? `${req.headers["sec-ch-viewport-width"]}x${req.headers["sec-ch-viewport-height"]}`
          : "Unknown",
      },
    })),
  };

  res.json(analytics);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Test the API with these curl commands:`);
  console.log(`
  1. Create short URL:
     curl.exe -X POST "http://localhost:${PORT}/shorten" -H "Content-Type: application/json" -d "{\\\"originalUrl\\\":\\\"https://www.google.com\\\"}"

  2. Check analytics (replace ABC123 with your shortId):
     curl.exe "http://localhost:${PORT}/analytics/ABC123"
  `);
});

// Export app and urlStore for testing
module.exports = { app, urlStore };
