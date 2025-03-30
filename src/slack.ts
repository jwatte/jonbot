import https from "https";
import { log } from "./logging.js";
import { getSlackToken } from "./util.js";

/**
 * Posts a message to Slack via the response_url
 *
 * @param responseUrl - The Slack response URL to post back to
 * @param message - The message payload to send
 * @param thread_ts - Optional thread timestamp to post the message as a reply in a thread
 */
export async function postMessageToSlack(
    responseUrl: string,
    message: any,
    thread_ts?: string,
): Promise<void> {
    return new Promise((resolve, reject) => {
        const requestId = `[req-${Date.now()}-${Math.random().toString(36).slice(2, 11)}]`;

        try {
            // Log the message details for debugging
            log.info(requestId, `Posting message with details:`, {
                responseUrl,
                thread_ts,
                messageKeys: Object.keys(message),
            });

            // If thread_ts is provided and not already in the message, add it
            if (thread_ts && !message.thread_ts) {
                message.thread_ts = thread_ts;
                log.info(requestId, `Added thread_ts: ${thread_ts}`);
            }

            const payload = JSON.stringify(message);
            // Log the final payload for debugging
            log.info(requestId, `Final payload:`, payload);

            const urlObj = new URL(responseUrl);
            const req = https.request(
                {
                    hostname: urlObj.hostname,
                    path: urlObj.pathname + urlObj.search,
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Content-Length": Buffer.byteLength(payload),
                    },
                },
                (res) => {
                    let data = "";
                    res.on("data", (chunk) => {
                        data += chunk;
                    });

                    res.on("end", () => {
                        if (res.statusCode !== 200) {
                            // Log error response with body
                            const errorBody =
                                data.length > 4000
                                    ? data.substring(0, 4000) + "..."
                                    : data;
                            log.info(
                                requestId,
                                `HTTP request failed: ${res.statusCode} ${res.statusMessage}`,
                                `Response body: ${errorBody}`,
                            );

                            log.error(
                                requestId,
                                `Slack API request failed with status ${res.statusCode}:`,
                                data,
                            );
                        } else {
                            // Log successful response
                            log.info(
                                requestId,

                                `HTTP request completed successfully. Response size: ${data.length} bytes`,
                            );
                        }
                        resolve();
                    });
                },
            );

            req.on("error", (err) => {
                // Log network error
                log.error(requestId, `Error posting to Slack:`, err);
                reject(err);
            });

            req.write(payload);
            req.end();
        } catch (err) {
            log.error(requestId, `Error in postMessageToSlack:`, err);
            reject(err);
        }
    });
}

/**
 * Uploads a PNG image to a Slack channel using external upload.
 *
 * @param imageBuffer - Buffer containing the PNG image.
 * @param channelId - Slack channel ID where the image should be posted.
 * @param responseUrl - The response URL from your command handler.
 * @param prompt - The prompt that was used to generate the image.
 * @param teamId - The Slack team ID for retrieving the correct OAuth token.
 * @param thread_ts - Optional thread timestamp to post the image as a reply in a thread.
 * @returns The JSON response from the complete upload API.
 */
export async function postImageToSlack(
    imageBuffer: Buffer,
    channelId: string,
    responseUrl: string,
    prompt: string,
    teamId: string,
    thread_ts?: string,
): Promise<any> {
    // Step 1: Get the external upload URL from Slack.
    const requestId = `[req-${Date.now()}-${Math.random().toString(36).slice(2, 11)}]`;
    const body = {
        filename: `${promptify(prompt)}.jpg`,
        length: imageBuffer.length,
        alt_text: prompt,
    };
    log.info(
        requestId,
        `HTTP request to https://slack.com/api/files.getUploadURLExternal`,
        body,
    );
    const urlEncoded = new URLSearchParams();
    for (const [key, value] of Object.entries(body)) {
        urlEncoded.append(key, value.toString());
    }
    // Get the appropriate token for this team
    const token = await getSlackToken(teamId);

    const getUrlResponse = await fetch(
        "https://slack.com/api/files.getUploadURLExternal",
        {
            method: "POST",
            headers: {
                "Content-Type":
                    "application/x-www-form-urlencoded; charset=utf-8",
                Authorization: `Bearer ${token}`,
            },
            body: urlEncoded.toString(),
        },
    );

    const getUrlData = await getUrlResponse.json();
    if (!getUrlData.ok) {
        log.error(requestId, `Error getting upload URL: ${getUrlData.error}`);
        throw new Error(`Error getting upload URL: ${getUrlData.error}`);
    }
    // Assume the API returns an "upload_url" and a "file_id".
    const uploadUrl: string = getUrlData.upload_url;
    const fileId: string = getUrlData.file_id;

    // Step 2: POST the image to the obtained external upload URL.
    log.info(
        requestId,
        `HTTP file upload request to ${uploadUrl}`,
        imageBuffer.length,
    );
    const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        headers: {
            "Content-Type": "image/jpeg", // Ensure the content type matches your image format.
        },
        body: imageBuffer,
    });
    if (!uploadResponse.ok) {
        log.error(requestId, `Error uploading image to external URL`);
        throw new Error("Error uploading image to external URL");
    }

    // Step 3: Complete the upload by calling Slack's complete upload API,
    // now using the channelId.
    log.info(
        requestId,
        `HTTP completion request to https://slack.com/api/files.completeUploadExternal`,
        fileId,
    );
    // We'll reuse the token we got earlier

    const completeResponse = await fetch(
        "https://slack.com/api/files.completeUploadExternal",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json; charset=utf-8",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
                files: [
                    {
                        id: fileId,
                        title:
                            prompt.substring(0, 64) +
                            (prompt.length > 64 ? "..." : ""),
                    },
                ],
                channels: channelId, // Use the channelId to specify where the file should be posted.
                thread_ts: thread_ts, // Add thread_ts if provided to post in a thread
                // Additional parameters (e.g., initial_comment) can be added here.
            }),
        },
    );
    const completeData = await completeResponse.json();
    if (!completeData.ok) {
        log.error(requestId, `Error completing upload: ${completeData.error}`);
        throw new Error(`Error completing upload: ${completeData.error}`);
    }

    // Optionally, send a confirmation back using the responseUrl.
    log.info(
        requestId,
        `HTTP thread response to ${responseUrl}`,
        "Image uploaded successfully!",
    );
    await fetch(responseUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            response_type: "in_channel",
            text: prompt,
        }),
    });
    // don't care if it doesn't work

    return completeData;
}

/**
 * Attempts to join a Slack channel.
 *
 * @param requestId - The request ID for logging
 * @param channelId - The ID of the channel to join
 * @param teamId - The ID of the team the channel belongs to
 * @returns A promise that resolves if the join is successful, or rejects with an error
 */
export async function joinChannel(
    requestId: string,
    channelId: string,
    teamId: string,
): Promise<void> {
    log.info(
        requestId,
        `Attempting to join channel ${channelId} for team ${teamId}`,
    );

    // Get the appropriate token for this team
    const token = await getSlackToken(teamId);

    const response = await fetch("https://slack.com/api/conversations.join", {
        method: "POST",
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
            channel: channelId,
        }),
    });

    const data = await response.json();

    if (data.ok) {
        log.info(requestId, `Successfully joined channel ${channelId}`);
        return;
    } else if (data.error === "already_in_channel") {
        log.info(requestId, `Already in channel ${channelId}`);
        return;
    } else {
        log.error(requestId, `Failed to join channel: ${data.error}`);
        throw new Error(`Failed to join channel: ${data.error}`);
    }
}

export function promptify(prompt: string): string {
    return "reve" + prompt.replace(/[^a-zA-Z0-9]/g, "").substring(0, 60);
}
