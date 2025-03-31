import http from "http";

import type { ICommand, ICommandContext } from "../types.js";

export const help: ICommand = {
    name: "help",
    description: "List all commands",
    doCommand: async function (
        req: http.IncomingMessage,
        res: http.ServerResponse,
        j: any,
        ctx: ICommandContext,
    ): Promise<void> {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.write(
            JSON.stringify({
                response_type: "ephemeral",
                text:
                    ctx.COMMANDS.map(
                        (c) => `/${c.name} - ${c.description}\n`,
                    ).join("") +
                    "Use the `:robot_face:` emoji reaction to generate images from the text of any message.\n",
            }),
        );
    },
};
