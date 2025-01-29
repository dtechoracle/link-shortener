const pool = require("../db/config");
const { nanoid } = require("nanoid");

class UrlService {
  async createShortUrl(originalUrl) {
    const shortId = nanoid(6);

    try {
      const result = await pool.query(
        "INSERT INTO urls (short_id, original_url) VALUES ($1, $2) RETURNING *",
        [shortId, originalUrl]
      );

      return result.rows[0];
    } catch (error) {
      console.error("Error creating short URL:", error);
      throw error;
    }
  }

  async getOriginalUrl(shortId) {
    try {
      const result = await pool.query(
        "SELECT original_url FROM urls WHERE short_id = $1",
        [shortId]
      );

      return result.rows[0]?.original_url;
    } catch (error) {
      console.error("Error getting original URL:", error);
      throw error;
    }
  }

  async trackVisit(shortId, visitorInfo) {
    try {
      const urlResult = await pool.query(
        "SELECT id FROM urls WHERE short_id = $1",
        [shortId]
      );

      const urlId = urlResult.rows[0]?.id;
      if (!urlId) return;

      await pool.query(
        `INSERT INTO analytics (
          url_id, visitor_ip, user_agent, referrer, 
          browser, os, device_type
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          urlId,
          visitorInfo.ip,
          visitorInfo.userAgent,
          visitorInfo.referrer,
          visitorInfo.browser,
          visitorInfo.os,
          visitorInfo.deviceType,
        ]
      );
    } catch (error) {
      console.error("Error tracking visit:", error);
      throw error;
    }
  }

  async getAnalytics(shortId) {
    try {
      const result = await pool.query(
        `
        SELECT 
          u.short_id,
          u.original_url,
          COUNT(DISTINCT a.visitor_ip) as unique_visitors,
          COUNT(a.id) as total_clicks,
          json_agg(json_build_object(
            'visitor_ip', a.visitor_ip,
            'browser', a.browser,
            'os', a.os,
            'device_type', a.device_type,
            'visited_at', a.visited_at
          )) as visits
        FROM urls u
        LEFT JOIN analytics a ON u.id = a.url_id
        WHERE u.short_id = $1
        GROUP BY u.id, u.short_id, u.original_url
      `,
        [shortId]
      );

      return result.rows[0];
    } catch (error) {
      console.error("Error getting analytics:", error);
      throw error;
    }
  }
}

module.exports = new UrlService();
