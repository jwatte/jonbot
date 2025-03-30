import https from "https";
import sharp from "sharp";
import { log } from "./logging.js";
import { postImageToSlack, postMessageToSlack } from "./slack.js";

/**
 * Sends a prompt to the REVE API and posts the generated image
 *
 * @param prompt - The prompt to generate an image from
 * @param apiKey - The REVE API key to use
 * @param responseUrl - The Slack response URL to post back to
 * @param channelId - The Slack channel ID to post the image to
 * @param teamId - The Slack team ID for retrieving the correct OAuth token
 * @param thread_ts - Optional thread timestamp to post the image as a reply in a thread
 */
export async function generateImage(
    prompt: string,
    apiKey: string,
    responseUrl: string,
    channelId: string,
    teamId: string,
    requestId: string,
    thread_ts?: string,
): Promise<void> {
    return new Promise((resolve, reject) => {
        try {
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
                                    teamId,
                                    thread_ts,
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
