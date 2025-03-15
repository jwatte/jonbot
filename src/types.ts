import http from "http";

export interface ICommandContext {
    readonly EVENTS: {
        [type: string]: (
            req: http.IncomingMessage,
            res: http.ServerResponse,
            j: any,
            ctx: ICommandContext,
        ) => Promise<void>;
    };
    readonly INTERACTIONS: {
        [type: string]: (
            req: http.IncomingMessage,
            res: http.ServerResponse,
            j: any,
            ctx: ICommandContext,
        ) => Promise<void>;
    };
    readonly COMMANDS: ICommand[];
}

export interface ICommand {
    readonly name: string;
    readonly description: string;
    doCommand(
        req: http.IncomingMessage,
        res: http.ServerResponse,
        j: any,
        ctx: ICommandContext,
    ): Promise<void>;
}
