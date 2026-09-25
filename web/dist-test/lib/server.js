"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchInfo = fetchInfo;
exports.fetchReceipt = fetchReceipt;
exports.setKilled = setKilled;
const env_1 = require("./env");
async function get(path) {
    try {
        const r = await fetch(`${env_1.SERVER_URL}${path}`);
        if (!r.ok)
            return null;
        return (await r.json());
    }
    catch {
        return null;
    }
}
async function post(path, body) {
    const r = await fetch(`${env_1.SERVER_URL}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
    return { status: r.status, json: (await r.json()) };
}
function fetchInfo() {
    return get("/info");
}
function fetchReceipt(channel, nonce) {
    return get(`/receipt/${channel}/${nonce}`);
}
function setKilled(killed) {
    return post("/admin/kill", { killed }).then((r) => r.status === 200, () => false);
}
