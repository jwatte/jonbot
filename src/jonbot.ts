import * as http from "http";

import { ICommand, ICommandContext } from "./types.js";
import { readAllBody } from "./util.js";

import { help } from "./commands/help.js";
import { config } from "./commands/config.js";
import { app_mention } from "./events/app_mention.js";
import { url_verification } from "./events/url_verification.js";
import { handle_save_config } from "./interactions/config_handlers.js";

const EVENTS: {
	[type: string]: (
		req: http.IncomingMessage,
		res: http.ServerResponse,
		j: any,
		ctx: ICommandContext
	) => Promise<void>;
} = {
	url_verification,
	app_mention,
};

const INTERACTIONS: {
	[type: string]: (
		req: http.IncomingMessage,
		res: http.ServerResponse,
		j: any,
		ctx: ICommandContext
	) => Promise<void>;
} = {
	block_actions: async (req, res, j, ctx) => {
		const payload = j.payload ? JSON.parse(j.payload) : j;
		const actionId = payload.actions?.[0]?.action_id;
		
		if (actionId === "save_config") {
			return handle_save_config(req, res, j, ctx);
		}
		
		console.log(new Date().toISOString(), `unhandled block_actions actionId: ${actionId}`);
	}
};

const COMMANDS: ICommand[] = [help, config];

const ctx: ICommandContext = {
	EVENTS,
	INTERACTIONS,
	COMMANDS,
};

export class Jonbot {
	async command(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		const { j, u } = await readAllBody(req);
		console.log(
			new Date().toISOString(),
			`command: ${u.toString()} payload: ${JSON.stringify(j)}`
		);
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
		console.log(new Date().toISOString(), `unhandled command name: ${txt.substring(0, 12)}...`);
		return help.doCommand(req, res, j, ctx);
	}

	async interact(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		const { j, u } = await readAllBody(req);
		console.log(
			new Date().toISOString(),
			`interact: ${u.toString()} payload: ${JSON.stringify(j)}`
		);
		const fun = INTERACTIONS[j.type];
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
		console.log(new Date().toISOString(), `unhandled interaction type: ${j.type}`);
	}

	async event(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		const { j, u } = await readAllBody(req);
		console.log(
			new Date().toISOString(),
			`event: ${u.toString()} payload: ${JSON.stringify(j)}`
		);
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
		console.log(new Date().toISOString(), `unhandled event type: ${j.type}`);
	}
}
