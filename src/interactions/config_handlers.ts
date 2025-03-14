import http from "http";
import type { ICommandContext } from "../types.js";
import { setConfigValue } from "../config.js";

export async function handle_save_config(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    j: any,
    ctx: ICommandContext
): Promise<void> {
    try {
		console.log("Galloping fnords");
        // Parse payload if it's a string
        const payload = typeof j.payload === 'string' ? JSON.parse(j.payload) : j;
        
        // Log the full payload structure for debugging
        console.log(new Date().toISOString(), "Interaction payload keys:", Object.keys(payload));
        
        // Extract the team ID from the payload
        // Based on the actual payload structure we observed
        const teamId = payload.team?.id || "";
        
        if (!teamId) {
            console.log(new Date().toISOString(), "WARNING: Could not extract team ID from payload");
        }
        
        // Debug log to help troubleshoot team ID extraction
        console.log(new Date().toISOString(), `Save config - Team ID: ${teamId}, Payload structure:`, 
            JSON.stringify({
                hasTeam: !!payload.team,
                teamId: payload.team?.id
            })
        );
        
        // Get values from state
        const values = payload.state?.values;
        
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
                    if (actionId === 'reve_api_key_input' && values[blockId][actionId].value) {
                        revetApiKey = values[blockId][actionId].value;
                        found = true;
                        console.log(new Date().toISOString(), `Found API key in block: ${blockId}, action: ${actionId}`);
                        break;
                    }
                }
                if (found) break;
            }
            
            if (!found) {
                console.log(new Date().toISOString(), "State values structure:", JSON.stringify(values));
                throw new Error("Could not find REVE API key in form values");
            }
        }
        
        // Save the configuration with the team ID
        await setConfigValue("reve_api_key", revetApiKey, teamId);
        
        // Send a confirmation message
        res.writeHead(200, { "Content-Type": "application/json" });
        res.write(
            JSON.stringify({
                text: "✅ Configuration saved successfully!",
                response_type: "ephemeral"
            })
        );
        
        // Log the team ID for debugging
        console.log(new Date().toISOString(), `Saved configuration for team: ${teamId}`);
    } catch (error) {
        console.error("Error saving configuration:", error);
        
        // Send an error message
        res.writeHead(200, { "Content-Type": "application/json" });
        res.write(
            JSON.stringify({
                text: "❌ Error saving configuration. Please try again.",
                response_type: "ephemeral"
            })
        );
    }
}
