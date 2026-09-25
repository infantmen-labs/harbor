"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JsonlLogger = void 0;
const node_fs_1 = require("node:fs");
class JsonlLogger {
    constructor(path) {
        this.path = path;
    }
    log(record) {
        (0, node_fs_1.appendFileSync)(this.path, JSON.stringify(record) + "\n");
    }
}
exports.JsonlLogger = JsonlLogger;
