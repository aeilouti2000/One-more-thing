const http = require("http");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// In `expo start --tunnel` only Metro's port is reachable from the phone, so
// forward /api/* to the local backend. lib/api.ts points at the tunnel then.
const apiTarget = new URL(process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000/api");
const proxyApi =
  apiTarget.hostname === "localhost" || apiTarget.hostname === "127.0.0.1";
const apiPrefix = apiTarget.pathname.replace(/\/$/, "") || "/api";

function forwardToApi(req, res) {
  const upstream = http.request(
    {
      hostname: apiTarget.hostname,
      port: apiTarget.port || 80,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: apiTarget.host },
    },
    (apiRes) => {
      res.writeHead(apiRes.statusCode || 502, apiRes.headers);
      apiRes.pipe(res);
    },
  );
  upstream.on("error", (error) => {
    if (res.headersSent) return res.end();
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ code: "API_UNREACHABLE", message: error.message }));
  });
  req.pipe(upstream);
}

if (proxyApi) {
  const previous = config.server?.enhanceMiddleware;
  config.server = {
    ...config.server,
    enhanceMiddleware: (middleware, server) => {
      const next = previous ? previous(middleware, server) : middleware;
      return (req, res, done) => {
        if (req.url === apiPrefix || req.url?.startsWith(`${apiPrefix}/`)) {
          return forwardToApi(req, res);
        }
        return next(req, res, done);
      };
    },
  };
}

module.exports = withNativeWind(config, { input: "./app/global.css" });
