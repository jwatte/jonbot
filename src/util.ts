import http from "http";
import { getStoredConfig } from "./config.js";
import { log } from "./logging.js";

export function readAllBody(req: http.IncomingMessage): Promise<{
    j: any;
    u: URL;
}> {
    const u = new URL(req.url ?? "/", `http://${req.headers.host}`);
    return new Promise((resolve, reject) => {
        req.on("error", (err) => {
            log.info(`input error: ${err}`);
            reject(err);
        });
        const chunks: Uint8Array[] = [];
        req.on("data", (chunk) => {
            chunks.push(chunk);
        });
        req.on("end", () => {
            try {
                const bufstr = Buffer.concat(chunks).toString();
                let j: { [key: string]: unknown };
                if (
                    req.headers["content-type"] ===
                    "application/x-www-form-urlencoded"
                ) {
                    j = {};
                    for (const [k, v] of new URLSearchParams(bufstr)) {
                        j[k] = v;
                    }
                } else {
                    j = JSON.parse(bufstr);
                }
                if (j.payload) {
                    log.info(`decoding payload`, j);
                    j = JSON.parse(j.payload as string);
                }
                if (
                    j.token !==
                        (process.env.SLACK_VERIFICATION_TOKEN ?? "").trim() &&
                    j.type !== "url_verification"
                ) {
                    log.info(`bad payload`, j);
                    reject(
                        new Error(
                            `invalid slack verification token ${j.token} != ${process.env.SLACK_VERIFICATION_TOKEN}`,
                        ),
                    );
                } else {
                    resolve({ j, u });
                }
            } catch (e) {
                reject(e);
            }
        });
    });
}

export function getTrustedIp(req: http.IncomingMessage): string {
    const xff = req.headers["x-forwarded-for"];
    if (typeof xff === "string") {
        return xff.split(",")[0];
    }
    return req.socket.remoteAddress ?? "unknown";
}

// Get the Slack OAuth token for a team
export async function getSlackToken(teamId?: string): Promise<string> {
    // If no team ID, use the environment variable as fallback
    if (!teamId) {
        return process.env.SLACKBOT_OAUTH_TOKEN ?? "";
    }

    // Try to get team-specific token from config
    const config = await getStoredConfig(teamId);
    return config.slack_oauth_token ?? process.env.SLACKBOT_OAUTH_TOKEN ?? "";
}

// Return timestamp of the message created
export async function chatPostMessageSimple(
    text: string,
    channel: string,
    teamId?: string,
): Promise<string> {
    const body = JSON.stringify({
        channel,
        text,
    });
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const url = process.env.SLACKBOT_POST_URL ?? "";

    // Get the appropriate token for this team
    const token = await getSlackToken(teamId);

    log.info(`[${requestId}] Fetch request to ${url}`);

    const res = await fetch(url, {
        method: "POST",
        body,
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            Accept: "text/plain",
        },
    });

    if (!res.ok) {
        const errorText = await res.text();
        const errorBody =
            errorText.length > 4000
                ? errorText.substring(0, 4000) + "..."
                : errorText;
        log.info(
            `[${requestId}] Fetch request failed: ${res.status} ${res.statusText}\nResponse body: ${errorBody}`,
        );
        throw new Error(
            `chat.postMessage failed: ${res.status} ${res.statusText}`,
        );
    }

    const responseText = await res.text();
    log.info(
        `[${requestId}] Fetch request completed successfully. Response size: ${responseText.length} bytes`,
    );

    /*
Headers {
  date: 'Sat, 01 Mar 2025 21:54:57 GMT',
  server: 'Apache',
  'strict-transport-security': 'max-age=31536000; includeSubDomains; preload',
  'referrer-policy': 'no-referrer',
  'x-slack-unique-id': 'Z8OCMX6ejVvXXrQVkBjg1gAAEAo',
  'x-slack-backend': 'r',
  'access-control-allow-origin': '*',
  'x-frame-options': 'SAMEORIGIN',
  'content-type': 'text/html',
  via: '1.1 slack-prod.tinyspeck.com, envoy-www-iad-zvarbqif,envoy-edge-pdx-xmeobdtx',
  vary: 'Accept-Encoding',
  'content-encoding': 'br',
  'content-length': '6',
  'x-envoy-attempt-count': '1',
  'x-envoy-upstream-service-time': '107',
  'x-backend': 'main_normal main_canary_with_overflow main_control_with_overflow',
  'x-server': 'slack-www-hhvm-main-iad-zpew',
  'x-slack-shared-secret-outcome': 'no-match',
  'x-edge-backend': 'envoy-www',
  'x-slack-edge-shared-secret-outcome': 'no-match'
}
*/
    return res.headers.get("x-slack-unique-id") ?? "";
}
