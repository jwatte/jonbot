import http from "http";

import { Jonbot } from "./jonbot.js";
import { getTrustedIp } from "./util.js";

const J = new Jonbot();

async function notFound(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.write(`Bad path: ${req.url}\n`);
}

async function healthz(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.write(`ok\n`);
}

const HANDLERS: {
    [path: string]: (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>;
} = {
    "/": healthz,
    "/healthz": healthz,
    "/jonbot/command": J.command.bind(J),
    "/jonbot/interact": J.interact.bind(J),
    "/jonbot/event": J.event.bind(J),
};

const server = http.createServer((req: http.IncomingMessage, res: http.ServerResponse) => {
    const ip = getTrustedIp(req);
    const u = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const handler = HANDLERS[u.pathname] ?? notFound;
    handler(req, res)
        .catch((err) => {
            console.log(new Date().toISOString(), `ip: ${ip} url: ${u.toString()} error: ${err}`);
            if (err?.stack) {
                console.log(err.stack);
            }
            if (!res.headersSent) {
                res.writeHead(500, { "Content-Type": "text/plain" });
            }
            res.write(`error: ${err}\n`);
        })
        .finally(() => {
            if (!res.headersSent) {
                res.writeHead(202, { "Content-Type": "text/plain" });
                res.write(`no result\n`);
            }
            res.end();
            console.log(
                new Date().toISOString(),
                `${req.method} ${req.url} ${res.statusCode} ${ip}`
            );
        });
});

server.listen(
    {
        port: 3000,
        host: "0.0.0.0",
        reuseAddr: true,
    },
    () => {
        console.log(new Date().toISOString(), `Server is listening on :3000`);
    }
);
