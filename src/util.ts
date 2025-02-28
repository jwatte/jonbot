import http from "http";

export function readAllBody(req: http.IncomingMessage): Promise<{
	j: any;
	u: URL;
}> {
	const u = new URL(req.url ?? "/", `http://${req.headers.host}`);
	return new Promise((resolve, reject) => {
		req.on("error", (err) => {
			console.log(new Date().toISOString(), `input error: ${err}`);
			reject(err);
		});
		const chunks: Uint8Array[] = [];
		req.on("data", (chunk) => {
			chunks.push(chunk);
		});
		req.on("end", () => {
			try {
				const bufstr = Buffer.concat(chunks).toString();
				let j: { [key: string]: unknown };
				if (req.headers["content-type"] === "application/x-www-form-urlencoded") {
					j = {};
					for (const [k, v] of new URLSearchParams(bufstr)) {
						j[k] = v;
					}
				} else {
					j = JSON.parse(bufstr);
				}
				if (
					j.token !== process.env.SLACK_VERIFICATION_TOKEN &&
					j.type !== "url_verification"
				) {
					reject(
						new Error(
							`invalid slack verifiction token $j.token} != ${process.env.SLACK_VERIFICATION_TOKEN}`
						)
					);
				} else {
					resolve({ j, u });
				}
			} catch (e) {
				reject(e);
			}
		});
	});
}
