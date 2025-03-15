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
document.location.href="/jonbot";
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
        const teamId = u.searchParams.get("team");

        if (!code || !teamId) {
            res.writeHead(400, { "Content-Type": "text/plain" });
            res.write("Missing required parameters: code and team");
            return;
        }

        // Exchange code for OAuth token
        const clientId = process.env.SLACK_CLIENT_ID;
        const clientSecret = process.env.SLACK_CLIENT_SECRET;

        if (!clientId || !clientSecret) {
            log.error(
                "Missing Slack client credentials in environment variables",
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
        await setConfigValue("slack_oauth_token", accessToken, teamId);

        // Redirect to success page
        res.writeHead(302, { Location: "/jonbot/success.html" });
    } catch (error) {
        log.error("OAuth installation error:", error);
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.write(
            `Error during installation: ${(error as Error).message || String(error)}`,
        );
    }
}

// Serve static content for the /jonbot route
function serveContent(
    req: http.IncomingMessage,
    res: http.ServerResponse,
): Promise<void> {
    if (req.url?.startsWith("/jonbot")) {
        req.url = req.url.substring(7) ?? "/";
    }
    if (req.url === "/") {
        res.writeHead(302, { Location: "/jonbot/index.html" });
        res.end();
        return Promise.resolve();
    }
    staticServe(req, res, () => {
        // This is the "next" function that gets called if no file is found
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.write(`Static file not found: ${req.url}\n`);
    });
    return Promise.resolve();
}

const HANDLERS: {
    [path: string]: (
        req: http.IncomingMessage,
        res: http.ServerResponse,
    ) => Promise<void>;
} = {
    "/": healthz,
    "/healthz": healthz,
    "/jonbot": serveContent,
    "/jonbot/command": J.command.bind(J),
    "/jonbot/interact": J.interact.bind(J),
    "/jonbot/event": J.event.bind(J),
    "/jonbot/install": handleOAuthInstall,
};

const server = http.createServer(
    (req: http.IncomingMessage, res: http.ServerResponse) => {
        const ip = getTrustedIp(req);
        const u = new URL(req.url ?? "/", `http://${req.headers.host}`);
        const handler = HANDLERS[u.pathname] ?? notFound;
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
