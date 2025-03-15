import http from "http";
import https from "https";
import { setConfigValue } from "../config.js";
import type { ICommandContext } from "../types.js";

// Function to validate the REVE API token
async function validateToken(token: string): Promise<{ valid: boolean; message?: string }> {
	return new Promise((resolve) => {
		const req = https.request(
			{
				hostname: "preview.reve.art",
				path: "/api/misc/userinfo",
				method: "GET",
				headers: {
					Authorization: `Bearer ${token}`,
					Accept: "application/json",
				},
			},
			(res) => {
				let data = "";
				res.on("data", (chunk) => {
					data += chunk;
				});

				res.on("end", () => {
					if (res.statusCode === 200) {
						resolve({ valid: true });
					} else {
						let errorMessage;
						try {
							const jsonResponse = JSON.parse(data);
							errorMessage = jsonResponse.message || `Error ${res.statusCode}`;
						} catch (e) {
							errorMessage = `Error ${res.statusCode}`;
						}
						resolve({ valid: false, message: errorMessage });
					}
				});
			}
		);

		req.on("error", (err) => {
			resolve({ valid: false, message: `Connection error: ${err.message}` });
		});

		req.end();
	});
}

export async function config_view_submission(
	req: http.IncomingMessage,
	res: http.ServerResponse,
	j: any,
	ctx: ICommandContext
): Promise<void> {
	try {
		// Parse payload if it's a string
		const payload = typeof j.payload === "string" ? JSON.parse(j.payload) : j;

		// Extract the team ID from private_metadata if available
		let teamId = "";
		try {
			const metadata = JSON.parse(payload.view?.private_metadata || "{}");
			teamId = metadata.teamId || "";
		} catch (err) {
			console.error("Error parsing private_metadata:", err);
		}

		// Fallback to team info from payload if metadata doesn't have team ID
		if (!teamId) {
			teamId = payload.team?.id || "";
		}

		if (!teamId) {
			console.log(
				new Date().toISOString(),
				"WARNING: Could not extract team ID from payload"
			);
		}

		// Debug log to help troubleshoot team ID extraction
		console.log(new Date().toISOString(), `Save config - Team ID: ${teamId}`);

		// Get values from state
		const values = payload.view?.state?.values;

		if (!values) {
			throw new Error("Could not find form values in payload");
		}

		// Find the block ID and action ID dynamically by looking for the reve_api_key_input action ID
		let revetApiKey = "";

		// First, check if we have the exact expected structure
		if (values.reve_api_key_block?.reve_api_key_input?.value) {
			revetApiKey = values.reve_api_key_block.reve_api_key_input.value;
		} else {
			// Otherwise, search for it by iterating through the state values structure
			let found = false;

			for (const blockId in values) {
				for (const actionId in values[blockId]) {
					if (actionId === "reve_api_key_input" && values[blockId][actionId].value) {
						revetApiKey = values[blockId][actionId].value;
						found = true;
						console.log(
							new Date().toISOString(),
							`Found API key in block: ${blockId}, action: ${actionId}`
						);
						break;
					}
				}
				if (found) break;
			}

			if (!found) {
				console.log(
					new Date().toISOString(),
					"State values structure:",
					JSON.stringify(values)
				);
				throw new Error("Could not find REVE API key in form values");
			}
		}

		// Validate the API token
		const validationResult = await validateToken(revetApiKey);

		if (!validationResult.valid) {
			// Return validation error to the modal
			console.log(
				new Date().toISOString(),
				`API key validation failed: ${validationResult.message}`
			);
			res.writeHead(200, { "Content-Type": "application/json" });
			res.write(
				JSON.stringify({
					response_action: "errors",
					errors: {
						reve_api_key_block: `Invalid API key: ${validationResult.message}`,
					},
				})
			);
			return;
		}

		// Save the configuration with the team ID using the safe save method
		await setConfigValue("reve_api_key", revetApiKey, teamId);

		// Acknowledge the view submission and close the dialog
		res.writeHead(200, { "Content-Type": "application/json" });
		res.write(JSON.stringify({ response_action: "clear" }));

		// Log the team ID for debugging
		console.log(
			new Date().toISOString(),
			`Saved configuration for team: ${teamId} with validated API key`
		);
	} catch (err) {
		const error = err as Error;
		console.error("Error saving configuration:", error);

		// Return errors to the modal
		res.writeHead(200, { "Content-Type": "application/json" });
		res.write(
			JSON.stringify({
				response_action: "errors",
				errors: {
					reve_api_key_block: `Error saving configuration: ${error.message || String(error)}`,
				},
			})
		);
	}
}
