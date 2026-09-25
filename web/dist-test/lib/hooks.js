"use strict";
"use client";
Object.defineProperty(exports, "__esModule", { value: true });
exports.usePoll = usePoll;
const react_1 = require("react");
/** Polling fetch with error + staleness. No global store needed. */
function usePoll(fn, ms, active = true) {
    const [data, setData] = (0, react_1.useState)(null);
    const [error, setError] = (0, react_1.useState)(null);
    const [stale, setStale] = (0, react_1.useState)(false);
    const [updatedAt, setUpdatedAt] = (0, react_1.useState)(null);
    const timer = (0, react_1.useRef)(null);
    const tick = (0, react_1.useCallback)(async () => {
        try {
            const v = await fn();
            setData(v);
            setError(null);
            setStale(false);
            setUpdatedAt(Date.now());
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "fetch failed");
            setStale(true);
        }
    }, [fn]);
    (0, react_1.useEffect)(() => {
        if (!active)
            return;
        void tick();
        timer.current = setInterval(() => {
            setStale(true);
            void tick();
        }, ms);
        return () => {
            if (timer.current !== null)
                clearInterval(timer.current);
        };
    }, [active, ms, tick]);
    return { data, error, stale, updatedAt };
}
