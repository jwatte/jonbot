import http from "http";

import { type ICommandContext } from "../types.js";
import { chatPostMessageSimple } from "../util.js";
import type { AppMentionEvent } from "./event-types.js";
import { log } from "../logging.js";

export async function app_mention(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    j: AppMentionEvent,
    ctx: ICommandContext,
): Promise<void> {
    app_mention_internal(j); // run async
    return Promise.resolve();
}

async function app_mention_internal(j: AppMentionEvent): Promise<void> {
    const ts = await chatPostMessageSimple("Hello", j.event.channel);
    log.info(`app_mention: response ts: ${ts}`);
}
