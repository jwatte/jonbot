import http from "http";
import { getStoredConfig } from "../config.js";
import { generateImage, Style } from "../image.js";
import { log } from "../logging.js";
import { joinChannel, postMessageToSlack } from "../slack.js";
import type { ICommand, ICommandContext } from "../types.js";

export class GenerateCommand implements ICommand {
    public constructor(
        readonly name: string,
        readonly description: string,
        readonly style: Style,
    ) {}
    async doCommand(
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
            const prompt = (
                commandText.startsWith(this.name)
                    ? commandText.substring(this.name.length)
                    : commandText
            ).trim();

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

            // Create a unique request ID at the beginning of the function
            const requestId = `[req-${Date.now()}-${Math.random().toString(36).slice(2, 11)}]`;
            // Acknowledge the command immediately
            log.info(`[${requestId}] Generating image for prompt: "${prompt}"`);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.write(
                JSON.stringify({
                    response_type: "ephemeral",
                    text: `Generating ${this.style} image for prompt: "${prompt}"... This may take a few moments.`,
                }),
            );
            res.end();

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
                    style: this.style ?? "aesthetic",
                    resolution: config.resolution ?? "1168x880",
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
    }
}

export const generate: ICommand = new GenerateCommand(
    "generate",
    "Generate an aesthetic image from a prompt",
    "aesthetic",
);

export const fun: ICommand = new GenerateCommand(
    "fun",
    "Generate a fun image from a prompt",
    "fun",
);

export const expand: ICommand = new GenerateCommand(
    "enhance",
    "Generate an enhanced image from a prompt",
    "enhanced",
);

export const raw: ICommand = new GenerateCommand(
    "raw",
    "Generate an image from an exact prompt",
    "raw",
);
