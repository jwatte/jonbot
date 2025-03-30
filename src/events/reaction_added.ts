import http from "http";
import { generateImage } from "../commands/generate.js";
import { getStoredConfig } from "../config.js";
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
    try {
        const { event } = j;

        // Only process reactions to messages
        if (event.item.type !== "message") {
            log.info(
                `Ignoring reaction to non-message item: ${event.item.type}`,
            );
            return;
        }

        // Only process robot_face emoji
        if (event.reaction !== "robot_face") {
            log.info(`Ignoring non-robot_face reaction: ${event.reaction}`);
            return;
        }

        log.info(
            `Processing robot_face reaction to message in channel ${event.item.channel} with ts ${event.item.ts}`,
        );

        // Fetch the message that was reacted to
        const message = await fetchSlackMessage(
            event.item.channel,
            event.item.ts,
            j.team_id,
        );

        // Don't process empty messages
        if (!message.text.trim()) {
            log.info("Ignoring empty message");
            return;
        }

        // Get the API key for this team
        const config = await getStoredConfig(j.team_id);
        if (!config.reve_api_key) {
            log.error(`No REVE API key configured for team ${j.team_id}`);
            await chatPostMessageSimple(
                "I need an API key to generate images. Please use `/jonbot config` to set up your REVE API key.",
                event.item.channel,
                j.team_id,
                event.item.ts,
            );
            return;
        }

        // Send an acknowledgment message
        await chatPostMessageSimple(
            `Generating an image from: "${message.text.substring(0, 100)}${message.text.length > 100 ? "..." : ""}"`,
            event.item.channel,
            j.team_id,
            event.item.ts,
        );

        // If the message is in a thread, use the parent message's timestamp
        // Otherwise, use the message's timestamp
        const threadTs = message.thread_ts || event.item.ts;

        // Generate the image
        await generateImage(
            message.text,
            config.reve_api_key,
            "https://slack.com/api/chat.postMessage", // Fake response URL
            event.item.channel,
            j.team_id,
            threadTs, // Post in the thread
        );
    } catch (err) {
        log.error(`Error in handleReactionAdded: ${err}`);
    }
}
