import http from "http";
import https from "https";

import type { ICommand, ICommandContext } from "../types.js";
import { getStoredConfig } from "../config.js";

export const config: ICommand = {
    name: "config",
    description: "Configure jonbot settings",
    doCommand: async function (
        req: http.IncomingMessage,
        res: http.ServerResponse,
        j: any,
        ctx: ICommandContext,
    ): Promise<void> {
        // Extract team ID from the request
        const teamId = j.team_id || j.team?.id || j.user?.team_id;

        // Debug log for team ID extraction
        console.log(
            new Date().toISOString(),
            `Config command - Team ID: ${teamId}, Payload keys: ${Object.keys(j).join(", ")}`,
        );

        // Get config specific to this team
        const currentConfig = await getStoredConfig(teamId);

        // First, acknowledge the slash command with a simple response
        res.writeHead(200, { "Content-Type": "application/json" });
        res.write(
            JSON.stringify({
                response_type: "ephemeral",
                text: "Opening configuration dialog...",
            }),
        );
        res.end();

        // Then open a modal using the Slack API
        try {
            // Prepare modal payload
            const token = process.env.SLACKBOT_OAUTH_TOKEN;
            const modalPayload = {
                trigger_id: j.trigger_id,
                view: {
                    type: "modal",
                    callback_id: "config_modal",
                    title: {
                        type: "plain_text",
                        text: "Jonbot Configuration",
                        emoji: true,
                    },
                    submit: {
                        type: "plain_text",
                        text: "Save",
                        emoji: true,
                    },
                    close: {
                        type: "plain_text",
                        text: "Cancel",
                        emoji: true,
                    },
                    private_metadata: JSON.stringify({ teamId }), // Pass team ID to view submission handler
                    blocks: [
                        {
                            type: "section",
                            text: {
                                type: "mrkdwn",
                                text: "Configure jonbot settings below:",
                            },
                        },
                        {
                            type: "input",
                            block_id: "reve_api_key_block",
                            element: {
                                type: "plain_text_input",
                                action_id: "reve_api_key_input",
                                placeholder: {
                                    type: "plain_text",
                                    text: "Enter API key",
                                },
                                multiline: true,
                                max_length: 1000,
                                initial_value: currentConfig.reve_api_key || "",
                            },
                            label: {
                                type: "plain_text",
                                text: "REVE API Key",
                                emoji: true,
                            },
                        },
                    ],
                },
            };

            // Make request to Slack API
            const postData = JSON.stringify(modalPayload);
            const slackReq = https.request(
                {
                    hostname: "slack.com",
                    port: 443,
                    path: "/api/views.open",
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Content-Length": Buffer.byteLength(postData),
                        Authorization: `Bearer ${token}`,
                    },
                },
                (slackRes) => {
                    let data = "";
                    slackRes.on("data", (chunk) => {
                        data += chunk;
                    });
                    slackRes.on("end", () => {
                        console.log(
                            new Date().toISOString(),
                            `Slack API response: ${data}`,
                        );
                    });
                },
            );

            slackReq.on("error", (error) => {
                console.error(
                    new Date().toISOString(),
                    `Error opening modal: ${error.message}`,
                );
            });

            slackReq.write(postData);
            slackReq.end();
        } catch (error) {
            console.error(
                new Date().toISOString(),
                `Error opening configuration modal: ${error}`,
            );
        }
    },
};
