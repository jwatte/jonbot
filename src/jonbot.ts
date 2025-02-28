import * as http from "http";

import { ICommand, ICommandContext } from "./types.js";
import { readAllBody } from "./util.js";

import { help } from "./commands/help.js";
import { url_verification } from "./events/url_verification.js";

const EVENTS: {
	[type: string]: (
		req: http.IncomingMessage,
		res: http.ServerResponse,
		j: any,
		ctx: ICommandContext
	) => Promise<void>;
} = {
	url_verification,
};

const INTERACTIONS: {
	[type: string]: (
		req: http.IncomingMessage,
		res: http.ServerResponse,
		j: any,
		ctx: ICommandContext
	) => Promise<void>;
} = {};

const COMMANDS: ICommand[] = [help];

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
				return cmd.doCommand(req, res, j, ctx);
			}
		}
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
			return fun(req, res, j, ctx);
		}
		console.log(new Date().toISOString(), `unhandled interaction type: ${j.type}`);
	}

	async event(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		const { j, u } = await readAllBody(req);
		console.log(
			new Date().toISOString(),
			`event: ${u.toString()} payload: ${JSON.stringify(j)}`
		);
		const fun = EVENTS[j.type];
		if (fun) {
			return fun(req, res, j, ctx);
		}
		console.log(new Date().toISOString(), `unhandled event type: ${j.type}`);
	}
}
