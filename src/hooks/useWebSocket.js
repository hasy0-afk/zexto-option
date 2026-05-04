import { useState, useEffect, useRef, useCallback } from "react";

export function useWebSocket(url, options = {}) {
  const { autoConnect = true } = options;
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("disconnected");
  const wsRef = useRef(null);
  const reconnectRef = useRef(0);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    setStatus("connecting");
    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;
      ws.onopen = () => { setStatus("connected"); reconnectRef.current = 0; };
      ws.onmessage = (e) => {
        try { setData(JSON.parse(e.data)); } catch { setData(e.data); }
      };
      ws.onclose = () => {
        setStatus("disconnected");
        if (reconnectRef.current < 5) {
          setTimeout(() => { reconnectRef.current++; connect(); }, 2000);
        }
      };
      ws.onerror = () => setStatus("error");
    } catch { setStatus("error"); }
  }, [url]);

  const send = useCallback((msg) => {
    if (wsRef.current?.readyState === WebSocket.OPEN)
      wsRef.current.send(typeof msg === "string" ? msg : JSON.stringify(msg));
  }, []);

  const subscribe = useCallback((symbol, tf = "1m") => send({ type: "subscribe", symbol, timeframe: tf }), [send]);
  const unsubscribe = useCallback((symbol) => send({ type: "unsubscribe", symbol }), [send]);

  useEffect(() => {
    if (autoConnect) connect();
    return () => wsRef.current?.close();
  }, [autoConnect, connect]);

  return { data, status, send, subscribe, unsubscribe, connect, wsRef };
}
export default useWebSocket;
