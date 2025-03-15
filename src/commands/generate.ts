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
				prompt: prompt,
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
								console.error(
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
							console.error("Error processing API response:", err);
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
				console.error("Error making API request:", err);
				await postMessageToSlack(responseUrl, {
					text: `Connection error: ${err.message}`,
					response_type: "ephemeral",
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

async function postImageToSlack(
	responseUrl: string,
	webpBase64: string,
	prompt: string,
	channelId: string
): Promise<void> {
	try {
		// Step 1: Convert base64 to buffer
		const imageBuffer = Buffer.from(webpBase64, "base64");

		// Step 2: Get upload URL using the new getUploadURLExternal method
		const getUploadURLResponse = await fetch(
			"https://slack.com/api/files.getUploadURLExternal",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${process.env.SLACKBOT_OAUTH_TOKEN ?? ""}`,
				},
				body: JSON.stringify({
					filename: `image_${Date.now()}.webp`,
					length: imageBuffer.length,
					snippet_type: "image/webp",
				}),
			}
		);

		if (!getUploadURLResponse.ok) {
			throw new Error(
				`Failed to get upload URL: ${getUploadURLResponse.status} ${getUploadURLResponse.statusText}`
			);
		}

		const uploadURLData = (await getUploadURLResponse.json()) as {
			ok: boolean;
			upload_url?: string;
			file_id?: string;
			error?: string;
		};

		if (!uploadURLData.ok) {
			throw new Error(`Failed to get upload URL: ${uploadURLData.error || "Unknown error"}`);
		}

		if (!uploadURLData.upload_url || !uploadURLData.file_id) {
			throw new Error("Missing upload_url or file_id in response");
		}

		// Step 3: Upload the file to the provided URL
		const uploadResponse = await fetch(uploadURLData.upload_url, {
			method: "PUT",
			headers: {
				"Content-Type": "image/webp",
			},
			body: imageBuffer,
		});

		if (!uploadResponse.ok) {
			throw new Error(
				`Failed to upload file: ${uploadResponse.status} ${uploadResponse.statusText}`
			);
		}

		// Step 4: Complete the upload and share the file
		const completeResponse = await fetch("https://slack.com/api/files.completeUploadExternal", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${process.env.SLACKBOT_OAUTH_TOKEN ?? ""}`,
			},
			body: JSON.stringify({
				files: [
					{
						id: uploadURLData.file_id,
						title: `Generated image: ${prompt.substring(0, 80)}${prompt.length > 80 ? "..." : ""}`,
						alt_text: prompt,
					},
				],
				channel_id: channelId,
			}),
		});

		if (!completeResponse.ok) {
			throw new Error(
				`Failed to complete upload: ${completeResponse.status} ${completeResponse.statusText}`
			);
		}

		const completeData = (await completeResponse.json()) as { ok: boolean; error?: string };

		if (!completeData.ok) {
			throw new Error(`Failed to complete upload: ${completeData.error || "Unknown error"}`);
		}

		// Notify that the image was posted
		await postMessageToSlack(responseUrl, {
			text: `Generated image for prompt: "${prompt}"`,
			response_type: "in_channel",
		});
	} catch (error) {
		console.error("Error posting image to Slack:", error);
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
							console.error(
								`Slack API request failed with status ${res.statusCode}:`,
								data
							);
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
					console.error("Error generating image:", err);
					postMessageToSlack(j.response_url, {
						text: "An error occurred while generating the image. Please try again later.",
						response_type: "ephemeral",
					}).catch((e) => console.error("Failed to send error message to Slack:", e));
				}
			);
		} catch (err) {
			console.error("Error processing generate command:", err);

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
