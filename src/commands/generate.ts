import http from "http";
import https from "https";
import { getStoredConfig } from "../config.js";
import type { ICommand, ICommandContext } from "../types.js";

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
        try {
            // Prepare the request payload
            const payload = JSON.stringify({
                prompt: prompt
            });

            // Make the API request to generate the image
            const req = https.request(
                {
                    hostname: "preview.reve.art",
                    path: "/api/misc/simple_generation",
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Content-Length": Buffer.byteLength(payload),
                        "Authorization": `Bearer ${apiKey}`,
                        "Accept": "application/json"
                    }
                },
                (res) => {
                    let data = "";
                    res.on("data", (chunk) => {
                        data += chunk;
                    });

                    res.on("end", async () => {
                        try {
                            if (res.statusCode !== 200) {
                                console.error(`API request failed with status code ${res.statusCode}`);
                                let errorMessage;
                                try {
                                    const jsonResponse = JSON.parse(data);
                                    errorMessage = jsonResponse.message || `Error ${res.statusCode}`;
                                } catch (e) {
                                    errorMessage = `Error ${res.statusCode}`;
                                }
                                
                                // Send error back to Slack
                                await postMessageToSlack(responseUrl, {
                                    text: `Failed to generate image: ${errorMessage}`,
                                    response_type: "ephemeral"
                                });
                                resolve();
                                return;
                            }

                            const jsonResponse = JSON.parse(data);
                            if (jsonResponse.image_base64) {
                                // Post image back to Slack
                                await postImageToSlack(responseUrl, jsonResponse.image_base64, prompt, channelId);
                                resolve();
                            } else {
                                // No image in response
                                await postMessageToSlack(responseUrl, {
                                    text: "No image was generated. Please try again with a different prompt.",
                                    response_type: "ephemeral"
                                });
                                resolve();
                            }
                        } catch (err) {
                            console.error("Error processing API response:", err);
                            await postMessageToSlack(responseUrl, {
                                text: "An error occurred while processing the generated image.",
                                response_type: "ephemeral"
                            });
                            resolve();
                        }
                    });
                }
            );

            req.on("error", async (err) => {
                console.error("Error making API request:", err);
                await postMessageToSlack(responseUrl, {
                    text: `Connection error: ${err.message}`,
                    response_type: "ephemeral"
                });
                resolve();
            });

            req.write(payload);
            req.end();
        } catch (err) {
            console.error("Error in generateImage:", err);
            reject(err);
        }
    });
}

/**
 * Posts a message to Slack via the response_url
 */
async function postMessageToSlack(responseUrl: string, message: any): Promise<void> {
    return new Promise((resolve, reject) => {
        try {
            const payload = JSON.stringify(message);
            
            const urlObj = new URL(responseUrl);
            const req = https.request(
                {
                    hostname: urlObj.hostname,
                    path: urlObj.pathname + urlObj.search,
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Content-Length": Buffer.byteLength(payload)
                    }
                },
                (res) => {
                    let data = "";
                    res.on("data", (chunk) => {
                        data += chunk;
                    });
                    
                    res.on("end", () => {
                        if (res.statusCode !== 200) {
                            console.error(`Slack API request failed with status ${res.statusCode}:`, data);
                        }
                        resolve();
                    });
                }
            );
            
            req.on("error", (err) => {
                console.error("Error posting to Slack:", err);
                reject(err);
            });
            
            req.write(payload);
            req.end();
        } catch (err) {
            console.error("Error in postMessageToSlack:", err);
            reject(err);
        }
    });
}

/**
 * Uploads an image to Slack using the files.upload API
 */
async function uploadImageToSlack(
    channelId: string, 
    imageBase64: string, 
    prompt: string
): Promise<void> {
    return new Promise((resolve, reject) => {
        try {
            // Get the Slack OAuth token from environment variables
            const token = process.env.SLACKBOT_OAUTH_TOKEN;
            if (!token) {
                throw new Error("SLACKBOT_OAUTH_TOKEN not found in environment variables");
            }
            
            // Convert base64 to binary buffer
            const imageBuffer = Buffer.from(imageBase64, 'base64');
            
            // Prepare file upload with multipart/form-data
            const boundary = `----WebKitFormBoundary${Math.random().toString(16).substr(2)}`;
            
            // Create form data parts
            const parts = [
                `--${boundary}`,
                'Content-Disposition: form-data; name="token"',
                '',
                token,
                `--${boundary}`,
                'Content-Disposition: form-data; name="channels"',
                '',
                channelId,
                `--${boundary}`,
                'Content-Disposition: form-data; name="title"',
                '',
                `Generated image: ${prompt}`,
                `--${boundary}`,
                'Content-Disposition: form-data; name="filename"',
                '',
                'generated-image.png',
                `--${boundary}`,
                'Content-Disposition: form-data; name="filetype"',
                '',
                'png',
                `--${boundary}`,
                'Content-Disposition: form-data; name="initial_comment"',
                '',
                `Generated image for prompt: "${prompt}"`,
                `--${boundary}`,
                'Content-Disposition: form-data; name="file"; filename="generated-image.png"',
                'Content-Type: image/png',
                '',
                imageBuffer,
                `--${boundary}--`
            ];
            
            // Join parts with CRLF
            const payload = parts.join('\r\n').replace(/\r\n\r\n{}/g, '\r\n\r\n');
            
            // Make the API request to upload the file
            const req = https.request(
                {
                    hostname: "slack.com",
                    path: "/api/files.upload",
                    method: "POST",
                    headers: {
                        "Content-Type": `multipart/form-data; boundary=${boundary}`,
                        "Content-Length": Buffer.byteLength(payload)
                    }
                },
                (res) => {
                    let data = "";
                    res.on("data", (chunk) => {
                        data += chunk;
                    });
                    
                    res.on("end", () => {
                        if (res.statusCode !== 200) {
                            console.error(`Slack API request failed with status ${res.statusCode}:`, data);
                            reject(new Error(`Slack API request failed: ${data}`));
                            return;
                        }
                        
                        try {
                            const response = JSON.parse(data);
                            if (!response.ok) {
                                console.error("Slack files.upload failed:", response.error);
                                reject(new Error(`Slack API error: ${response.error}`));
                                return;
                            }
                            
                            console.log(new Date().toISOString(), 
                                `Successfully uploaded image to Slack, file ID: ${response.file?.id}`);
                            resolve();
                        } catch (err) {
                            console.error("Error parsing Slack API response:", err);
                            reject(err);
                        }
                    });
                }
            );
            
            req.on("error", (err) => {
                console.error("Error uploading file to Slack:", err);
                reject(err);
            });
            
            req.write(payload);
            req.end();
        } catch (err) {
            console.error("Error in uploadImageToSlack:", err);
            reject(err);
        }
    });
}

/**
 * Posts an image to Slack as a response
 */
async function postImageToSlack(responseUrl: string, imageBase64: string, prompt: string, channelId: string): Promise<void> {
    try {
        // First post a message that we're processing the image
        await postMessageToSlack(responseUrl, {
            response_type: "ephemeral", // Only visible to the user who triggered the command
            text: "Image generated successfully. Uploading to Slack..."
        });
        
        // Upload the image to Slack using files.upload API
        await uploadImageToSlack(channelId, imageBase64, prompt);
        
        // Log success
        console.log(new Date().toISOString(), 
            `Successfully handled image for prompt: "${prompt}"`);
    } catch (err) {
        console.error("Error posting image to Slack:", err);
        
        // Notify the user of the error
        await postMessageToSlack(responseUrl, {
            response_type: "ephemeral",
            text: `Error uploading image to Slack: ${err.message}`
        });
        
        throw err;
    }
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
                res.write(JSON.stringify({
                    "response_type": "ephemeral",
                    "text": "Please provide a prompt after 'generate'. Example: `/jonbot generate a cat sitting on a rainbow`"
                }));
                return;
            }
            
            // Get the stored API key for this team
            const config = await getStoredConfig(teamId);
            if (!config.reve_api_key) {
                // No API key configured
                res.writeHead(200, { "Content-Type": "application/json" });
                res.write(JSON.stringify({
                    "response_type": "ephemeral",
                    "text": "REVE API key is not configured. Please use `/jonbot config` to set up your API key first."
                }));
                return;
            }
            
            // Acknowledge the command immediately
            res.writeHead(200, { "Content-Type": "application/json" });
            res.write(JSON.stringify({
                "response_type": "ephemeral",
                "text": `Generating image for prompt: "${prompt}"... This may take a few moments.`
            }));
            
            // Generate the image asynchronously
            // We'll use the response_url to post back when the image is ready
            // and channel_id to upload the file
            generateImage(prompt, config.reve_api_key, j.response_url, j.channel_id)
                .catch(err => {
                    console.error("Error generating image:", err);
                    postMessageToSlack(j.response_url, {
                        text: "An error occurred while generating the image. Please try again later.",
                        response_type: "ephemeral"
                    }).catch(e => console.error("Failed to send error message to Slack:", e));
                });
            
        } catch (err) {
            console.error("Error processing generate command:", err);
            
            // Return an error message
            if (!res.headersSent) {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.write(JSON.stringify({
                    "response_type": "ephemeral",
                    "text": "An error occurred while processing your request. Please try again later."
                }));
            }
        }
    }
};