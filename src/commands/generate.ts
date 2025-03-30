import http from "http";
import { getStoredConfig } from "../config.js";
import { generateImage } from "../image.js";
import { log } from "../logging.js";
import { joinChannel, postMessageToSlack } from "../slack.js";
import type { ICommand, ICommandContext } from "../types.js";

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

            // Create a unique request ID at the beginning of the function
            const requestId = `[req-${Date.now()}-${Math.random().toString(36).slice(2, 11)}]`;
            // Try to join the channel first, but don't await it
            // This runs in parallel with the image generation
            joinChannel(requestId, j.channel_id, teamId).catch((err) => {
                log.info(requestId, `Failed to join channel: ${err.message}`);
                // Continue anyway - we'll handle "not_in_channel" errors later if needed
            });

            // Generate the image asynchronously
            // We'll use the response_url to post back when the image is ready
            // and channel_id to upload the file
            await generateImage(
                {
                    prompt,
                    apiKey: config.reve_api_key,
                    requestId,
                },
                {
                    responseUrl: j.response_url,
                    channelId: j.channel_id,
                    teamId,
                    threadTs: j.thread_ts,
                },
            ).catch((err) => {
                const errorId = `err-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
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
            const errorId = `err-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
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
