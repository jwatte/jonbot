import http from "http";
import https from "https";
import sharp from "sharp";
import { getStoredConfig } from "../config.js";
import { getSlackToken } from "../util.js";
import { log } from "../logging.js";
import type { ICommand, ICommandContext } from "../types.js";

/**
 * Sends a prompt to the REVE API and posts the generated image
 */
async function generateImage(
    prompt: string,
    apiKey: string,
    responseUrl: string,
    channelId: string,
): Promise<void> {
    return new Promise((resolve, reject) => {
        // Create a unique request ID at the beginning of the function
        const requestId = `[req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}]`;

        try {
            // Try to join the channel first, but don't await it
            // This runs in parallel with the image generation
            joinChannel(requestId, channelId).catch((err) => {
                log.info(requestId, `Failed to join channel: ${err.message}`);
                // Continue anyway - we'll handle "not_in_channel" errors later if needed
            });

            const url = "https://preview.reve.art/api/misc/simple_generation";

            // Prepare the request payload
            const payload = JSON.stringify({
                prompt: prompt,
            });

            // Log the request start
            log.info(requestId, `HTTP request to ${url}`);

            // Make the API request to generate the image
            const req = https.request(
                {
                    hostname: "preview.reve.art",
                    path: "/api/misc/simple_generation",
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Content-Length": Buffer.byteLength(payload),
                        Authorization: `Bearer ${apiKey}`,
                        Accept: "application/json",
                    },
                },
                (res) => {
                    let data = "";
                    res.on("data", (chunk) => {
                        data += chunk;
                    });

                    res.on("end", async () => {
                        try {
                            if (res.statusCode !== 200) {
                                // Log error response with body
                                const errorBody =
                                    data.length > 4000
                                        ? data.substring(0, 4000) + "..."
                                        : data;
                                log.info(
                                    requestId,
                                    `HTTP request failed: ${res.statusCode} ${res.statusMessage}\nResponse body: ${errorBody}`,
                                );

                                log.error(
                                    `API request failed with status code ${res.statusCode}`,
                                );
                                let errorMessage;
                                try {
                                    const jsonResponse = JSON.parse(data);
                                    errorMessage =
                                        jsonResponse.message ||
                                        `Error ${res.statusCode}`;
                                } catch (e) {
                                    errorMessage = `Error ${res.statusCode}`;
                                }

                                // Send error back to Slack
                                await postMessageToSlack(responseUrl, {
                                    text: `Failed to generate image: ${errorMessage}`,
                                    response_type: "ephemeral",
                                });
                                resolve();
                                return;
                            }

                            // Log successful response
                            log.info(
                                requestId,
                                `HTTP request completed successfully. Response size: ${data.length} bytes`,
                            );

                            const jsonResponse = JSON.parse(data);
                            const b64buf = Buffer.from(
                                jsonResponse.image_base64,
                                "base64",
                            );
                            const jpgBuf = await sharp(b64buf)
                                .keepMetadata()
                                .jpeg({ quality: 90 })
                                .toBuffer();
                            if (jsonResponse.image_base64) {
                                // Post image back to Slack
                                await postImageToSlack(
                                    jpgBuf,
                                    channelId,
                                    responseUrl,
                                    prompt.substring(0, 64) +
                                        (prompt.length > 64 ? "..." : ""),
                                );
                                resolve();
                            } else {
                                // No image in response
                                await postMessageToSlack(responseUrl, {
                                    text: "No image was generated. Please try again with a different prompt.",
                                    response_type: "ephemeral",
                                });
                                resolve();
                            }
                        } catch (err) {
                            log.error(`Error processing API response:`, err);
                            await postMessageToSlack(responseUrl, {
                                text: `An error occurred while uploading the generated image: ${(err as Error).message ?? err}`,
                                response_type: "ephemeral",
                            });
                            resolve();
                        }
                    });
                },
            );

            req.on("error", async (err) => {
                // Log network error
                log.info(requestId, `HTTP request error: ${err.message}`);

                log.error(`Error making API request:`, err);
                await postMessageToSlack(responseUrl, {
                    text: `Connection error: ${err.message}`,
                    response_type: "ephemeral",
                });
                resolve();
            });

            req.write(payload);
            req.end();
        } catch (err) {
            log.error(requestId, `Error in generateImage:`, err);
            reject(err);
        }
    });
}

/**
 * Posts a message to Slack via the response_url
 */
async function postMessageToSlack(
    responseUrl: string,
    message: any,
): Promise<void> {
    return new Promise((resolve, reject) => {
        // Create a unique request ID at the beginning of the function
        const requestId = `[req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}]`;

        try {
            // Log the request start
            log.info(requestId, `HTTP request to ${responseUrl}`);

            const payload = JSON.stringify(message);

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

function promptify(prompt: string): string {
    return "reve" + prompt.replace(/[^a-zA-Z0-9]/g, "").substring(0, 60);
}

/**
 * Attempts to join a Slack channel.
 *
 * @param requestId - The request ID for logging
 * @param channelId - The ID of the channel to join
 * @returns A promise that resolves if the join is successful, or rejects with an error
 */
async function joinChannel(
    requestId: string,
    channelId: string,
): Promise<void> {
    log.info(requestId, `Attempting to join channel ${channelId}`);

    // Get the appropriate token for this team
    const token = await getSlackToken(channelId.split('_')[0]);
    
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

/**
 * Uploads a PNG image to a Slack channel using external upload.
 *
 * @param imageBuffer - Buffer containing the PNG image.
 * @param channelId - Slack channel ID where the image should be posted.
 * @param responseUrl - The response URL from your command handler.
 * @param apiToken - Your Slack API token.
 * @returns The JSON response from the complete upload API.
 */
async function postImageToSlack(
    imageBuffer: Buffer,
    channelId: string,
    responseUrl: string,
    prompt: string,
): Promise<any> {
    // Step 1: Get the external upload URL from Slack.
    const requestId = `[req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}]`;
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
    const token = await getSlackToken(channelId.split('_')[0]);
    
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

export const generate: ICommand = {
    name: "generate",
    description: "Generate an image from a text prompt using the REVE API",
    doCommand: async function (
        req: http.IncomingMessage,
        res: http.ServerResponse,
        j: any,
        ctx: ICommandContext,
    ): Promise<void> {
        try {
            // Extract team ID from the request
            const teamId = j.team_id || j.team?.id || j.user?.team_id;

            // Extract the prompt from the command text
            // The format is "/jonbot generate <prompt>"
            const commandText = j.text || "";
            const prompt = commandText.replace(/^generate\s+/, "").trim();

            if (!prompt) {
                // No prompt provided
                res.writeHead(200, { "Content-Type": "application/json" });
                res.write(
                    JSON.stringify({
                        response_type: "ephemeral",
                        text: "Please provide a prompt after 'generate'. Example: `/jonbot generate a cat sitting on a rainbow`",
                    }),
                );
                return;
            }

            // Get the stored API key for this team
            const config = await getStoredConfig(teamId);
            if (!config.reve_api_key) {
                // No API key configured
                res.writeHead(200, { "Content-Type": "application/json" });
                res.write(
                    JSON.stringify({
                        response_type: "ephemeral",
                        text: "REVE API key is not configured. Please use `/jonbot config` to set up your API key first.",
                    }),
                );
                return;
            }

            // Acknowledge the command immediately
            res.writeHead(200, { "Content-Type": "application/json" });
            res.write(
                JSON.stringify({
                    response_type: "ephemeral",
                    text: `Generating image for prompt: "${prompt}"... This may take a few moments.`,
                }),
            );

            // Generate the image asynchronously
            // We'll use the response_url to post back when the image is ready
            // and channel_id to upload the file
            generateImage(
                prompt,
                config.reve_api_key,
                j.response_url,
                j.channel_id,
            ).catch((err) => {
                const errorId = `err-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                log.error(`[${errorId}] Error generating image:`, err);
                postMessageToSlack(j.response_url, {
                    text: "An error occurred while generating the image. Please try again later.",
                    response_type: "ephemeral",
                }).catch((e) =>
                    log.error(
                        `[${errorId}] Failed to send error message to Slack:`,
                        e,
                    ),
                );
            });
        } catch (err) {
            const errorId = `err-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            log.error(`[${errorId}] Error processing generate command:`, err);

            // Return an error message
            if (!res.headersSent) {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.write(
                    JSON.stringify({
                        response_type: "ephemeral",
                        text: "An error occurred while processing your request. Please try again later.",
                    }),
                );
            }
        }
    },
};
