import http from "http";
import https from "https";
import sharp from "sharp";
import { getStoredConfig } from "../config.js";
import type { ICommand, ICommandContext } from "../types.js";
import fs from "fs";
import path from "path";
import os from "os";
import { log } from "../logging.js";

/**
 * Sends a prompt to the REVE API and posts the generated image
 */
async function generateImage(
    prompt: string,
    apiKey: string,
    responseUrl: string,
    channelId: string
): Promise<void> {
    return new Promise((resolve, reject) => {
        // Create a unique request ID at the beginning of the function
        const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        try {
            const url = "https://preview.reve.art/api/misc/simple_generation";

            // Prepare the request payload
            const payload = JSON.stringify({
                prompt: prompt,
            });

            // Log the request start
            log.info(`[${requestId}] HTTP request to ${url}`);

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
                                    data.length > 4000 ? data.substring(0, 4000) + "..." : data;
                                log.info(
                                    `[${requestId}] HTTP request failed: ${res.statusCode} ${res.statusMessage}\nResponse body: ${errorBody}`
                                );

                                log.error(
                                    `API request failed with status code ${res.statusCode}`
                                );
                                let errorMessage;
                                try {
                                    const jsonResponse = JSON.parse(data);
                                    errorMessage =
                                        jsonResponse.message || `Error ${res.statusCode}`;
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
                                `[${requestId}] HTTP request completed successfully. Response size: ${data.length} bytes`
                            );

                            const jsonResponse = JSON.parse(data);
                            if (jsonResponse.image_base64) {
                                // Post image back to Slack
                                await postImageToSlack(
                                    responseUrl,
                                    jsonResponse.image_base64,
                                    prompt,
                                    channelId
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
                            log.error(
                                `Error processing API response:`,
                                err
                            );
                            await postMessageToSlack(responseUrl, {
                                text: "An error occurred while processing the generated image.",
                                response_type: "ephemeral",
                            });
                            resolve();
                        }
                    });
                }
            );

            req.on("error", async (err) => {
                // Log network error
                log.info(
                    `[${requestId}] HTTP request error: ${err.message}`
                );

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
            log.error(
                `[${requestId}] Error in generateImage:`,
                err
            );
            reject(err);
        }
    });
}

async function postImageToSlack(
    responseUrl: string,
    webpBase64: string,
    prompt: string,
    channelId: string
): Promise<void> {
    // Create a unique request ID at the beginning of the function
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
        // Step 1: Convert base64 to buffer
        const webpBuffer = Buffer.from(webpBase64, "base64");

        // Step 1.1: Convert WEBP to PNG using Sharp
        const pngBuffer = await sharp(webpBuffer).toFormat("png").toBuffer();

        // Step 1.2: Write buffer to temporary file
        const tmpDir = os.tmpdir();
        const fileName = `image_${Date.now()}.png`;
        const filePath = path.join(tmpDir, fileName);

        // Write PNG to temp file
        fs.writeFileSync(filePath, pngBuffer);

        // Step 2: Get upload URL using files.getUploadURLExternal
        log.info(`[${requestId}] Getting upload URL from Slack`);

        const getUploadUrlResponse = await new Promise<{
            ok: boolean;
            error?: string;
            upload_url?: string;
            file_id?: string;
        }>((resolve, reject) => {
            const payload = JSON.stringify({
                filename: fileName,
                length: pngBuffer.length,
                alt_text: `Generated image for prompt: "${prompt}"`,
                title: `Generated image: ${prompt.substring(0, 80)}${prompt.length > 80 ? "..." : ""}`,
            });

            const req = https.request(
                {
                    method: "POST",
                    hostname: "slack.com",
                    path: "/api/files.getUploadURLExternal",
                    headers: {
                        "Content-Type": "application/json",
                        "Content-Length": Buffer.byteLength(payload),
                        Authorization: `Bearer ${process.env.SLACKBOT_OAUTH_TOKEN ?? ""}`,
                    },
                },
                (res) => {
                    let data = "";
                    res.on("data", (chunk) => {
                        data += chunk;
                    });

                    res.on("end", () => {
                        try {
                            // Log the response
                            if (res.statusCode !== 200) {
                                const errorBody =
                                    data.length > 4000 ? data.substring(0, 4000) + "..." : data;
                                log.info(
                                    `[${requestId}] HTTP request failed: ${res.statusCode} ${res.statusMessage}\nResponse body: ${errorBody}`
                                );
                            } else {
                                log.info(
                                    `[${requestId}] HTTP request completed successfully. Response size: ${data.length} bytes`
                                );
                            }

                            const responseData = JSON.parse(data);
                            resolve(responseData);
                        } catch (err) {
                            log.info(
                                `[${requestId}] Error parsing response: ${(err as Error).message}`
                            );
                            reject(new Error(`Failed to parse Slack API response: ${err}`));
                        }
                    });
                }
            );

            req.on("error", (err) => {
                // Log network error
                log.info(`[${requestId}] HTTP request error: ${err.message}`);
                reject(err);
            });

            req.write(payload);
            req.end();
        });

        if (
            !getUploadUrlResponse.ok ||
            !getUploadUrlResponse.upload_url ||
            !getUploadUrlResponse.file_id
        ) {
            throw new Error(
                `Failed to get upload URL: ${getUploadUrlResponse.error || "Unknown error"}`
            );
        }

        // Step 3: Upload the file to the provided URL
        log.info(
            `${new Date().toISOString()} [${requestId}] Uploading file to URL: ${getUploadUrlResponse.upload_url}`
        );

        const uploadUrl = new URL(getUploadUrlResponse.upload_url);
        const uploadResponse = await new Promise<{
            ok: boolean;
            error?: string;
        }>((resolve, reject) => {
            const req = https.request(
                {
                    method: "PUT",
                    hostname: uploadUrl.hostname,
                    path: uploadUrl.pathname + uploadUrl.search,
                    headers: {
                        "Content-Type": "application/octet-stream",
                        "Content-Length": pngBuffer.length,
                    },
                },
                (res) => {
                    let data = "";
                    res.on("data", (chunk) => {
                        data += chunk;
                    });

                    res.on("end", () => {
                        try {
                            // Log the response
                            if (res.statusCode !== 200) {
                                const errorBody =
                                    data.length > 4000 ? data.substring(0, 4000) + "..." : data;
                                log.info(
                                    `[${requestId}] HTTP request failed: ${res.statusCode} ${res.statusMessage}\nResponse body: ${errorBody}`
                                );
                                resolve({
                                    ok: false,
                                    error: `Upload failed with status ${res.statusCode}`,
                                });
                            } else {
                                log.info(
                                    `[${requestId}] HTTP request completed successfully. Response size: ${data.length} bytes`
                                );
                                resolve({ ok: true });
                            }
                        } catch (err) {
                            log.info(
                                `[${requestId}] Error parsing response: ${(err as Error).message}`
                            );
                            reject(new Error(`Failed to parse upload response: ${err}`));
                        }
                    });
                }
            );

            req.on("error", (err) => {
                // Log network error
                log.info(`[${requestId}] HTTP request error: ${err.message}`);
                reject(err);
            });

            // Write the file buffer directly to the request
            req.write(pngBuffer);
            req.end();
        });

        if (!uploadResponse.ok) {
            throw new Error(
                `Failed to upload file to URL: ${uploadResponse.error || "Unknown error"}`
            );
        }

        // Step 4: Complete the upload with files.completeUploadExternal
        log.info(`[${requestId}] Completing file upload with Slack`);

        const completeUploadResponse = await new Promise<{
            ok: boolean;
            error?: string;
            file?: { id: string; permalink: string };
        }>((resolve, reject) => {
            const payload = JSON.stringify({
                files: [
                    {
                        id: getUploadUrlResponse.file_id,
                        title: `Generated image: ${prompt.substring(0, 80)}${prompt.length > 80 ? "..." : ""}`,
                        alt_text: `Generated image for prompt: "${prompt}"`,
                        initial_comment: `Generated image for prompt: "${prompt}"`,
                        channels: [channelId],
                    },
                ],
            });

            const req = https.request(
                {
                    method: "POST",
                    hostname: "slack.com",
                    path: "/api/files.completeUploadExternal",
                    headers: {
                        "Content-Type": "application/json",
                        "Content-Length": Buffer.byteLength(payload),
                        Authorization: `Bearer ${process.env.SLACKBOT_OAUTH_TOKEN ?? ""}`,
                    },
                },
                (res) => {
                    let data = "";
                    res.on("data", (chunk) => {
                        data += chunk;
                    });

                    res.on("end", () => {
                        try {
                            // Log the response
                            if (res.statusCode !== 200) {
                                const errorBody =
                                    data.length > 4000 ? data.substring(0, 4000) + "..." : data;
                                log.info(
                                    `[${requestId}] HTTP request failed: ${res.statusCode} ${res.statusMessage}\nResponse body: ${errorBody}`
                                );
                            } else {
                                log.info(
                                    `[${requestId}] HTTP request completed successfully. Response size: ${data.length} bytes`
                                );
                            }

                            const responseData = JSON.parse(data);
                            resolve(responseData);
                        } catch (err) {
                            log.info(
                                `[${requestId}] Error parsing response: ${(err as Error).message}`
                            );
                            reject(new Error(`Failed to parse Slack API response: ${err}`));
                        }
                    });
                }
            );

            req.on("error", (err) => {
                // Log network error
                log.info(`[${requestId}] HTTP request error: ${err.message}`);
                reject(err);
            });

            req.write(payload);
            req.end();
        });

        // Clean up the temporary file
        fs.unlinkSync(filePath);

        if (!completeUploadResponse.ok) {
            throw new Error(
                `Failed to complete upload: ${completeUploadResponse.error || "Unknown error"}`
            );
        }

        // Notify that the upload was successful
        await postMessageToSlack(responseUrl, {
            text: `Generated image for prompt: "${prompt}"`,
            response_type: "in_channel",
        });
    } catch (error) {
        log.error(`[${requestId}] Error posting image to Slack:`, error);
        // Send error back to Slack
        await postMessageToSlack(responseUrl, {
            text: `Failed to upload image: ${(error as Error).message}`,
            response_type: "ephemeral",
        });
    }
}

/**
 * Posts a message to Slack via the response_url
 */
async function postMessageToSlack(responseUrl: string, message: any): Promise<void> {
    return new Promise((resolve, reject) => {
        // Create a unique request ID at the beginning of the function
        const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        try {
            // Log the request start
            log.info(
                `${new Date().toISOString()} [${requestId}] HTTP request to ${responseUrl}`
            );

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
                                data.length > 4000 ? data.substring(0, 4000) + "..." : data;
                            log.info(
                                `[${requestId}] HTTP request failed: ${res.statusCode} ${res.statusMessage}\nResponse body: ${errorBody}`
                            );

                            log.error(
                                `[${requestId}] Slack API request failed with status ${res.statusCode}:`,
                                data
                            );
                        } else {
                            // Log successful response
                            log.info(
                                `[${requestId}] HTTP request completed successfully. Response size: ${data.length} bytes`
                            );
                        }
                        resolve();
                    });
                }
            );

            req.on("error", (err) => {
                // Log network error
                log.info(`[${requestId}] HTTP request error: ${err.message}`);

                log.error(`[${requestId}] Error posting to Slack:`, err);
                reject(err);
            });

            req.write(payload);
            req.end();
        } catch (err) {
            log.error(`[${requestId}] Error in postMessageToSlack:`, err);
            reject(err);
        }
    });
}

export const generate: ICommand = {
    name: "generate",
    description: "Generate an image from a text prompt using the REVE API",
    doCommand: async function (
        req: http.IncomingMessage,
        res: http.ServerResponse,
        j: any,
        ctx: ICommandContext
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
                    })
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
                    })
                );
                return;
            }

            // Acknowledge the command immediately
            res.writeHead(200, { "Content-Type": "application/json" });
            res.write(
                JSON.stringify({
                    response_type: "ephemeral",
                    text: `Generating image for prompt: "${prompt}"... This may take a few moments.`,
                })
            );

            // Generate the image asynchronously
            // We'll use the response_url to post back when the image is ready
            // and channel_id to upload the file
            generateImage(prompt, config.reve_api_key, j.response_url, j.channel_id).catch(
                (err) => {
                    const errorId = `err-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                    log.error(`[${errorId}] Error generating image:`, err);
                    postMessageToSlack(j.response_url, {
                        text: "An error occurred while generating the image. Please try again later.",
                        response_type: "ephemeral",
                    }).catch((e) =>
                        log.error(`[${errorId}] Failed to send error message to Slack:`, e)
                    );
                }
            );
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
                    })
                );
            }
        }
    },
};
