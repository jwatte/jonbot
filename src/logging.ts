export interface ILogger {
    info(...data: unknown[]): void;
    error(...data: unknown[]): void;
}

class ConsoleLogger implements ILogger {
    info(...data: unknown[]) {
        console.log(new Date().toISOString(), "[I]", ...data);
    }

    error(...data: unknown[]) {
        console.log(new Date().toISOString(), "[E]", ...data);

        // Print detailed error information for each error object after the main log line
        data.forEach((item) => {
            if (item instanceof Error) {
                this.printErrorDetails(item);
            }
        });
    }

    private printErrorDetails(
        err: Error,
        depth = 0,
        seen = new Set<Error>(),
    ): void {
        // Avoid circular references
        if (seen.has(err)) {
            console.log(`    Error: [Circular reference]`);
            return;
        }
        seen.add(err);

        console.log(`    Error: ${err.message}`);

        // Print stack trace if available
        if (err.stack) {
            const stackLines = err.stack.split("\n");
            // Skip the first line if it just contains the error message
            const firstLineIndex = stackLines[0].includes(err.message) ? 1 : 0;
            for (let i = firstLineIndex; i < stackLines.length; i++) {
                console.log(`    ${stackLines[i].trim()}`);
            }
        }

        // Check for cause property which may contain a nested error
        const errorWithCause = err as Error & { cause?: unknown };
        if (errorWithCause.cause && errorWithCause.cause instanceof Error) {
            console.log(`    Caused by:`);
            this.printErrorDetails(errorWithCause.cause, depth + 1, seen);
        }
    }
}

export const log = new ConsoleLogger();
