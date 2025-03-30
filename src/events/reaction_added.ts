import http from "http";
import { getStoredConfig } from "../config.js";
import { generateImage } from "../image.js";
import { log } from "../logging.js";
import type { ICommandContext } from "../types.js";
import { chatPostMessageSimple, fetchSlackMessage } from "../util.js";
import type { ReactionAddedEvent } from "./event-types.js";

export async function reaction_added(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    j: ReactionAddedEvent,
    ctx: ICommandContext,
): Promise<void> {
    // Acknowledge the event immediately
    res.writeHead(200, { "Content-Type": "application/json" });
    res.write(JSON.stringify({ ok: true }));
    res.end();

    // Process the reaction asynchronously
    handleReactionAdded(j).catch((err) => {
        log.error(`Error handling reaction_added event: ${err}`);
    });
}

async function handleReactionAdded(j: ReactionAddedEvent): Promise<void> {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    try {
        const { event } = j;

        // Only process reactions to messages
        if (event.item.type !== "message") {
            log.info(
                `[${requestId}] Ignoring reaction to non-message item: ${event.item.type}`,
            );
            return;
        }

        // Only process robot_face emoji
        if (event.reaction !== "robot_face") {
            log.info(
                `[${requestId}] Ignoring non-robot_face reaction: ${event.reaction}`,
            );
            return;
        }

        log.info(
            `[${requestId}] Processing robot_face reaction to message in channel ${event.item.channel} with ts ${event.item.ts}`,
        );

        // Fetch the message that was reacted to
        const message = await fetchSlackMessage(
            requestId,
            event.item.channel,
            event.item.ts,
            j.team_id,
        );

        // Log the message details for debugging
        log.info(`Message details:`, {
            text: message.text?.substring(0, 100),
            message_ts: message.message_ts,
            thread_ts: message.thread_ts,
        });

        // Don't process empty messages
        if (!message.text?.trim()) {
            log.info(`[${requestId}] Ignoring empty message`);
            return;
        }

        // Get the API key for this team
        const config = await getStoredConfig(j.team_id);
        if (!config.reve_api_key) {
            log.error(
                `[${requestId}] No REVE API key configured for team ${j.team_id}`,
            );
            await chatPostMessageSimple(
                "I need an API key to generate images. Please use `/jonbot config` to set up your REVE API key.",
                event.item.channel,
                j.team_id,
                message.thread_ts, // Use thread_ts directly
            );
            return;
        }

        // Send an acknowledgment message
        await chatPostMessageSimple(
            `Generating an image from: "${message.text.substring(0, 100)}${message.text.length > 100 ? "..." : ""}"`,
            event.item.channel,
            j.team_id,
            message.thread_ts, // Use thread_ts directly
        );

        // Generate the image
        await generateImage(
            {
                prompt: message.text,
                apiKey: config.reve_api_key,
                requestId: `reaction-${event.event_ts}`,
            },
            {
                responseUrl: "https://slack.com/api/chat.postMessage",
                channelId: event.item.channel,
                teamId: j.team_id,
                threadTs: message.thread_ts, // Use thread_ts directly
            },
        );
    } catch (err) {
        log.error(`[${requestId}] Error in handleReactionAdded: ${err}`);
        if (err instanceof Error) {
            log.error(`Error details: ${err.stack}`);
        }
    }
}
