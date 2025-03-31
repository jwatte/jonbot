import * as http from "http";

import { log } from "./logging.js";
import { ICommand, ICommandContext } from "./types.js";
import { readAllBody } from "./util.js";

import { config } from "./commands/config.js";
import { expand, fun, generate, raw } from "./commands/generate.js";
import { help } from "./commands/help.js";
import { app_mention } from "./events/app_mention.js";
import { reaction_added } from "./events/reaction_added.js";
import { url_verification } from "./events/url_verification.js";
import { config_view_submission } from "./interactions/config_handlers.js";

const EVENTS: {
    [type: string]: (
        req: http.IncomingMessage,
        res: http.ServerResponse,
        j: any,
        ctx: ICommandContext,
    ) => Promise<void>;
} = {
    url_verification,
    app_mention,
    reaction_added,
};

const INTERACTIONS: {
    [type: string]: (
        req: http.IncomingMessage,
        res: http.ServerResponse,
        j: any,
        ctx: ICommandContext,
    ) => Promise<void>;
} = {
    block_actions: async (req, res, j, ctx) => {
        const payload = j.payload ? JSON.parse(j.payload) : j;
        const actionId = payload.actions?.[0]?.action_id;

        log.info(`unhandled block_actions actionId: ${actionId}`);
    },
    view_submission: async (req, res, j, ctx) => {
        const payload = j.payload ? JSON.parse(j.payload) : j;
        const callbackId = payload.view?.callback_id;

        if (callbackId === "config_modal") {
            return config_view_submission(req, res, j, ctx);
        }

        log.info(`unhandled view_submission callbackId: ${callbackId}`);
    },
};

const COMMANDS: ICommand[] = [help, config, generate, fun, expand, raw];

const ctx: ICommandContext = {
    EVENTS,
    INTERACTIONS,
    COMMANDS,
};

export class Jonbot {
    async command(
        req: http.IncomingMessage,
        res: http.ServerResponse,
    ): Promise<void> {
        const { j, u } = await readAllBody(req);
        log.info(`command: ${u.toString()} payload: ${JSON.stringify(j)}`);
        const txt = (j.text as string).trim();
        for (const cmd of COMMANDS) {
            if (txt.startsWith(cmd.name)) {
                await cmd.doCommand(req, res, j, ctx);
                if (!res.headersSent) {
                    res.writeHead(200, {
                        "Content-Type": "application/json",
                        "Content-Length": "12",
                    });
                    res.write(`{"ok": true}`);
                }
                return;
            }
        }
        log.info(`unhandled command name: ${txt.substring(0, 12)}...`);
        return help.doCommand(req, res, j, ctx);
    }

    async interact(
        req: http.IncomingMessage,
        res: http.ServerResponse,
    ): Promise<void> {
        const { j, u } = await readAllBody(req);
        log.info(`interact: ${u.toString()} payload: ${JSON.stringify(j)}`);
        const fun = INTERACTIONS[j.type];
        if (fun) {
            await fun(req, res, j, ctx);
            if (!res.headersSent) {
                log.info(`interaction generated no output: ${j.type}`);
                res.writeHead(200, {
                    "Content-Type": "application/json",
                    "Content-Length": "12",
                });
                res.write(`{"ok": true}`);
            }
            return;
        }
        log.info(`unhandled interaction type: ${j.type}`);
    }

    async event(
        req: http.IncomingMessage,
        res: http.ServerResponse,
    ): Promise<void> {
        const { j, u } = await readAllBody(req);
        log.info(`event: ${u.toString()} payload: ${JSON.stringify(j)}`);
        const type = j.event?.type ?? j.type;
        const fun = EVENTS[type];
        if (fun) {
            await fun(req, res, j, ctx);
            if (!res.headersSent) {
                res.writeHead(200, {
                    "Content-Type": "application/json",
                    "Content-Length": "12",
                });
                res.write(`{"ok": true}`);
            }
            return;
        }
        log.info(`unhandled event type: ${j.type}`);
    }
}
