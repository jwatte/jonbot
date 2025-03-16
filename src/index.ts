import http from "http";
import path from "path";
import serveStatic from "serve-static";

import { setConfigValue } from "./config.js";
import { Jonbot } from "./jonbot.js";
import { log } from "./logging.js";
import { getTrustedIp } from "./util.js";

const J = new Jonbot();

async function notFound(
    req: http.IncomingMessage,
    res: http.ServerResponse,
): Promise<void> {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.write(`Bad path: ${req.url}\n`);
}

async function healthz(
    req: http.IncomingMessage,
    res: http.ServerResponse,
): Promise<void> {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.write(`<html><body><script>
document.location.href="/content/";
</script></body></html>`);
}

// Create a static file server for the content directory
const contentPath = path.join(process.cwd(), "content");
log.info(`serving static content from ${contentPath}`);
const staticServe = serveStatic(contentPath);

// Slack OAuth installation endpoint
async function handleOAuthInstall(
    req: http.IncomingMessage,
    res: http.ServerResponse,
): Promise<void> {
    try {
        const u = new URL(req.url ?? "/", `http://${req.headers.host}`);
        const code = u.searchParams.get("code");

        if (!code) {
            res.writeHead(400, { "Content-Type": "text/plain" });
            res.write("Missing required parameters: code and/or team");
            return;
        }

        // Exchange code for OAuth token
        const clientId = process.env.SLACKBOT_CLIENT_ID;
        const clientSecret = process.env.SLACKBOT_OUTGOING_CLIENT_SECRET;

        if (!clientId || !clientSecret) {
            log.error(
                "Missing Slack client credentials: SLACKBOT_CLIENT_ID and/or SLACKBOT_OUTGOING_CLIENT_SECRET environment variables are not set",
            );
            res.writeHead(500, { "Content-Type": "text/plain" });
            res.write("Server configuration error");
            return;
        }

        // Call Slack OAuth API to exchange the code for a token
        const tokenResponse = await fetch(
            "https://slack.com/api/oauth.v2.access",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body: new URLSearchParams({
                    code,
                    client_id: clientId,
                    client_secret: clientSecret,
                }).toString(),
            },
        );

        const tokenData = await tokenResponse.json();

        if (!tokenData.ok) {
            log.error("OAuth exchange failed:", tokenData.error);
            res.writeHead(400, { "Content-Type": "text/plain" });
            res.write(`Authentication failed: ${tokenData.error}`);
            return;
        }

        // Store the access token in the team's config
        const accessToken = tokenData.access_token;
        const teamId = tokenData.team?.id;
        log.info(`Storing access token for team ${teamId}: ${accessToken}`);
        if (!teamId) {
            log.error("No team ID received from Slack OAuth response");
            res.writeHead(400, { "Content-Type": "text/plain" });
            res.write("Authentication failed: No team ID received");
            return;
        }
        await setConfigValue("slack_oauth_token", accessToken, teamId);

        // Redirect to success page
        res.writeHead(302, { Location: "/content/success.html" });
    } catch (error) {
        log.error("OAuth installation error:", error);
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.write(
            `Error during installation: ${(error as Error).message || String(error)}`,
        );
    }
}

// Serve static content for the /content route
function serveContent(
    req: http.IncomingMessage,
    res: http.ServerResponse,
): Promise<void> {
    return new Promise<void>((resolve) => {
        // Create a safe copy of the URL
        const originalUrl = req.url;

        // Handle /content paths
        if (req.url?.startsWith("/content/")) {
            req.url = req.url.substring(8); // Skip the "/content/" prefix
        } else if (req.url === "/content") {
            req.url = "/";
        }

        // Ensure we have a valid URL
        if (!req.url || req.url === "") {
            req.url = "/";
        }

        log.info(`Static content request: ${originalUrl} → ${req.url}`);

        // Handle root redirect case
        if (req.url === "/") {
            res.writeHead(302, { Location: "/content/index.html" });
            res.end();
            resolve();
            return;
        }

        // Track if the response has been handled
        let isResolved = false;

        // Listen for the 'finish' event to handle successful responses
        res.on("finish", () => {
            if (!isResolved) {
                isResolved = true;
                resolve();
            }
        });

        // Handle errors too
        res.on("error", () => {
            if (!isResolved) {
                isResolved = true;
                resolve();
            }
        });

        // Serve the static file
        staticServe(req, res, () => {
            // This is the "next" function that gets called if no file is found
            if (!isResolved) {
                isResolved = true;
                res.writeHead(404, { "Content-Type": "text/plain" });
                res.write(`Static file not found: ${req.url}\n`);
                res.end();
                resolve();
            }
        });
    });
}

const HANDLERS: {
    [path: string]: (
        req: http.IncomingMessage,
        res: http.ServerResponse,
    ) => Promise<void>;
} = {
    "/": healthz,
    "/healthz": healthz,
    "/content": serveContent,
    "/jonbot/command": J.command.bind(J),
    "/jonbot/interact": J.interact.bind(J),
    "/jonbot/event": J.event.bind(J),
    "/install": handleOAuthInstall,
};

const server = http.createServer(
    (req: http.IncomingMessage, res: http.ServerResponse) => {
        const ip = getTrustedIp(req);
        const u = new URL(req.url ?? "/", `http://${req.headers.host}`);

        // Find the appropriate handler
        let handler;

        // Handle all /content/* paths with the static content handler
        if (u.pathname.startsWith("/content/") || u.pathname === "/content") {
            handler = serveContent;
        } else {
            // Use the exact path handler or fallback to notFound
            handler = HANDLERS[u.pathname] ?? notFound;
        }

        handler(req, res)
            .catch((err) => {
                log.info(`ip: ${ip} url: ${u.toString()} error: ${err}`);
                if (err?.stack) {
                    log.info(err.stack);
                }
                if (!res.headersSent) {
                    res.writeHead(500, { "Content-Type": "text/plain" });
                }
                res.write(`error: ${err}\n`);
            })
            .finally(() => {
                if (!res.headersSent) {
                    res.writeHead(202, { "Content-Type": "text/plain" });
                    res.write(`no result\n`);
                }
                res.end();
                log.info(`${req.method} ${req.url} ${res.statusCode} ${ip}`);
            });
    },
);

server.listen(
    {
        port: 3000,
        host: "0.0.0.0",
        reuseAddr: true,
    },
    () => {
        log.info(`Server is listening on :3000`);
    },
);
