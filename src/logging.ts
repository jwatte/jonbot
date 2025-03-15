export interface ILogger {
    info(...data: unknown[]): void;
    error(...data: unknown[]): void;
}

class ConsoleLogger implements ILogger {
    info(...data: unknown[]) {
        console.log(new Date().toISOString(), "[I]", JSON.stringify(data));
    }
    error(...data: unknown[]) {
        console.log(new Date().toISOString(), "[E]", JSON.stringify(data));
    }
}

export const log = new ConsoleLogger();
