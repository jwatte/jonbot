import http from "http";
import https from "https";
import sharp from "sharp";
import { log } from "./logging.js";
import { postImageToSlack, postMessageToSlack } from "./slack.js";

interface ImageGenerationConfig {
    prompt: string;
    apiKey: string;
    requestId: string;
}

interface SlackDestination {
    responseUrl: string;
    channelId: string;
    teamId: string;
    threadTs?: string;
}

/**
 * Sends a prompt to the REVE API and posts the generated image
 *
 * @param config - Configuration for image generation
 * @param destination - Destination for posting the image
 */
export async function generateImage(
    config: ImageGenerationConfig,
    destination: SlackDestination,
): Promise<void> {
    return new Promise((resolve, reject) => {
        try {
            const url = "https://preview.reve.art/api/misc/simple_generation";
            const payload = JSON.stringify({ prompt: config.prompt });

            log.info(config.requestId, `HTTP request to ${url}`);

            const req = https.request(
                {
                    hostname: "preview.reve.art",
                    path: "/api/misc/simple_generation",
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Content-Length": Buffer.byteLength(payload),
                        Authorization: `Bearer ${config.apiKey}`,
                        Accept: "application/json",
                    },
                },
                (res) => {
                    handleImageGenerationResponse(res, config, destination)
                        .then(resolve)
                        .catch(reject);
                },
            );

            req.on("error", async (err) => {
                log.info(
                    config.requestId,
                    `HTTP request error: ${err.message}`,
                );
                log.error(`Error making API request:`, err);
                await postMessageToSlack(destination.responseUrl, {
                    text: `Connection error: ${err.message}`,
                    response_type: "ephemeral",
                });
                resolve();
            });

            req.write(payload);
            req.end();
        } catch (err) {
            log.error(config.requestId, `Error in generateImage:`, err);
            reject(err);
        }
    });
}

async function processAndPostImage(
    data: string,
    prompt: string,
    destination: SlackDestination,
): Promise<void> {
    const jsonResponse = JSON.parse(data);
    if (!jsonResponse.image_base64) {
        await postMessageToSlack(destination.responseUrl, {
            text: "No image was generated. Please try again with a different prompt.",
            response_type: "ephemeral",
        });
        return;
    }

    const b64buf = Buffer.from(jsonResponse.image_base64, "base64");
    const jpgBuf = await sharp(b64buf)
        .keepMetadata()
        .jpeg({ quality: 90 })
        .toBuffer();

    await postImageToSlack(
        jpgBuf,
        destination.channelId,
        destination.responseUrl,
        prompt.substring(0, 64) + (prompt.length > 64 ? "..." : ""),
        destination.teamId,
        destination.threadTs,
    );
}

async function handleImageGenerationResponse(
    res: http.IncomingMessage,
    config: ImageGenerationConfig,
    destination: SlackDestination,
): Promise<void> {
    let data = "";
    return new Promise<void>((resolve, reject) => {
        res.on("data", (chunk: Buffer | string) => {
            data += chunk;
        });

        res.on("end", async () => {
            try {
                if (res.statusCode !== 200) {
                    const errorBody =
                        data.length > 4000
                            ? data.substring(0, 4000) + "..."
                            : data;
                    log.info(
                        config.requestId,
                        `HTTP request failed: ${res.statusCode} ${res.statusMessage}\nResponse body: ${errorBody}`,
                    );

                    log.error(
                        `API request failed with status code ${res.statusCode}`,
                    );
                    let errorMessage: string;
                    try {
                        const jsonResponse = JSON.parse(data);
                        errorMessage =
                            jsonResponse.message || `Error ${res.statusCode}`;
                    } catch (e) {
                        errorMessage = `Error ${res.statusCode}`;
                    }

                    await postMessageToSlack(destination.responseUrl, {
                        text: `Failed to generate image: ${errorMessage}`,
                        response_type: "ephemeral",
                    });
                    resolve();
                    return;
                }

                log.info(
                    config.requestId,
                    `HTTP request completed successfully. Response size: ${data.length} bytes`,
                );

                await processAndPostImage(data, config.prompt, destination);
                resolve();
            } catch (err) {
                log.error(`Error processing API response:`, err);
                await postMessageToSlack(destination.responseUrl, {
                    text: `An error occurred while uploading the generated image: ${(err as Error).message ?? err}`,
                    response_type: "ephemeral",
                });
                resolve();
            }
        });
    });
}
