import http from "http";

import type { ICommand, ICommandContext } from "../types.js";
import { getStoredConfig } from "../config.js";

export const config: ICommand = {
	name: "config",
	description: "Configure jonbot settings",
	doCommand: async function (
		req: http.IncomingMessage,
		res: http.ServerResponse,
		j: any,
		ctx: ICommandContext
	): Promise<void> {
		// Extract team ID from the request
		const teamId = j.team_id || j.team?.id || j.user?.team_id;
		
		// Debug log for team ID extraction
		console.log(new Date().toISOString(), `Config command - Team ID: ${teamId}, Payload keys: ${Object.keys(j).join(", ")}`);
		
		// Get config specific to this team
		const currentConfig = await getStoredConfig(teamId);

		res.writeHead(200, { "Content-Type": "application/json" });
		res.write(
			JSON.stringify({
				response_type: "ephemeral",
				blocks: [
					{
						type: "header",
						text: {
							type: "plain_text",
							text: "Jonbot Configuration",
							emoji: true
						}
					},
					{
						type: "section",
						text: {
							type: "mrkdwn",
							text: "Configure jonbot settings below:"
						}
					},
					{
						type: "input",
						block_id: "reve_api_key_block",
						element: {
							type: "plain_text_input",
							action_id: "reve_api_key_input",
							placeholder: {
								type: "plain_text",
								text: "Enter API key"
							},
							multiline: true,
							max_length: 1000,
							initial_value: currentConfig.reve_api_key || ""
						},
						label: {
							type: "plain_text",
							text: "REVE API Key",
							emoji: true
						}
					},
					{
						type: "actions",
						elements: [
							{
								type: "button",
								text: {
									type: "plain_text",
									text: "Save Configuration",
									emoji: true
								},
								style: "primary",
								value: "save_config",
								action_id: "save_config"
							}
						]
					}
				]
			})
		);
	},
};