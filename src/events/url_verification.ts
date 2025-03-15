import http from "http";

import { type ICommandContext } from "../types.js";

export function url_verification(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    j: any,
    ctx: ICommandContext,
): Promise<void> {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.write(j.challenge);
    return Promise.resolve();
}
