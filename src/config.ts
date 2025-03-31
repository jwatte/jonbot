import fs from "fs/promises";
import path from "path";

import { Resolution, Style } from "./image.js";
import { log } from "./logging.js";

// Define the config interface
export interface JonbotConfig {
    reve_api_key?: string;
    slack_oauth_token?: string;
    resolution?: Resolution;
    style?: Style;
}

// Config file path
const CONFIG_DIR = process.env.CONFIG_DIR || "./config";

// Helper function to get config path based on team ID
function getConfigPath(teamId?: string): string {
    if (!teamId) {
        // Fallback to default config if no team ID provided
        return path.join(CONFIG_DIR, "jonbot-config.json");
    }

    return path.join(CONFIG_DIR, `jonbot-config-${teamId}.json`);
}

// Get the stored configuration for a specific team
export async function getStoredConfig(teamId?: string): Promise<JonbotConfig> {
    try {
        // Ensure config directory exists
        await fs.mkdir(CONFIG_DIR, { recursive: true });

        const configFile = getConfigPath(teamId);

        try {
            const configData = await fs.readFile(configFile, "utf8");
            return JSON.parse(configData) as JonbotConfig;
        } catch (error) {
            // If file doesn't exist or can't be parsed, return empty config
            return {};
        }
    } catch (error) {
        log.error("Error reading config:", error);
        return {};
    }
}

// Save config to file for a specific team using safe save method
export async function setConfig(
    config: JonbotConfig,
    teamId: string,
): Promise<void> {
    try {
        // Ensure config directory exists
        await fs.mkdir(CONFIG_DIR, { recursive: true });

        const configFile = getConfigPath(teamId);
        const tempFile = `${configFile}.tmp`;

        // First write to a temporary file
        await fs.writeFile(tempFile, JSON.stringify(config, null, 2), "utf8");

        // Then rename the temp file to the actual config file
        await fs.rename(tempFile, configFile);
    } catch (error) {
        log.error("Error saving config:", error);
        throw error;
    }
}

// Save a specific config value for a team
export async function setConfigValue(
    key: keyof JonbotConfig,
    value: string,
    teamId: string,
): Promise<void> {
    try {
        // Get the existing config first to preserve other settings
        const config: JonbotConfig = await getStoredConfig(teamId);

        // Update just the specified key
        (config as { [key in keyof JonbotConfig]: string })[key] = value;

        // Save the updated config
        await setConfig(config, teamId);
    } catch (error) {
        log.error(`Error saving config value for ${key}:`, error);
        throw error;
    }
}
