import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  ReactNode,
  useMemo,
  useCallback,
} from "react";
import { useAuth } from "./AuthContext";
import { getWebSocketUrlAsync } from "./lib/apiOrigin";
import { Message } from "./types/websocket";

interface WebSocketContextValue {
  send: (message: Message) => void;
  subscribe: (callback: (message: Message) => void) => () => void;
  connected: boolean;
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

interface WebSocketProviderProps {
  children: ReactNode;
}

export const WebSocketProvider: React.FC<WebSocketProviderProps> = ({
  children,
}) => {
  const socket = useRef<WebSocket | null>(null);
  const { isAuthenticated } = useAuth();
  const subscribers = useRef<Set<(message: Message) => void>>(new Set());
  const [connected, setConnected] = useState(false);

  const reconnectTimeout = useRef<NodeJS.Timeout | null>(null);

  //TODO: Turn this into a custom hook
  useEffect(() => {
    if (!isAuthenticated) {
      if (socket.current) {
        socket.current.close();
        socket.current = null;
        setConnected(false);
        subscribers.current.clear();
      }
      return;
    }

    let cancelled = false;

    const scheduleReconnect = () => {
      if (cancelled) return;
      reconnectTimeout.current ??= setTimeout(() => {
        reconnectTimeout.current = null;
        void attemptConnect();
      }, 1000);
    };

    const attemptConnect = async () => {
      if (cancelled) return;
      try {
        const url = await getWebSocketUrlAsync();
        if (cancelled) return;
        const ws = new WebSocket(url);
        if (cancelled) {
          ws.close();
          return;
        }
        socket.current = ws;
        ws.onopen = () => {
          setConnected(true);
          if (reconnectTimeout.current) {
            clearTimeout(reconnectTimeout.current);
            reconnectTimeout.current = null;
          }
        };
        ws.onmessage = (event: MessageEvent<string>) => {
          const message = JSON.parse(event.data) as Message;
          subscribers.current.forEach((cb) => {
            cb(message);
          });
        };
        ws.onclose = () => {
          setConnected(false);
          socket.current = null;
          // Do not clear subscribers — they must survive reconnect so pages keep handling
          // messages. Stale handlers are removed when components unmount via unsubscribe().
          scheduleReconnect();
        };
        ws.onerror = (err) => {
          console.error("WebSocket error", err);
          ws.close();
        };
      } catch (e) {
        console.error("WebSocket connect failed", e);
        scheduleReconnect();
      }
    };

    void attemptConnect();

    return () => {
      cancelled = true;
      if (socket.current) {
        socket.current.close();
        socket.current = null;
      }
      subscribers.current.clear();

      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
        reconnectTimeout.current = null;
      }
      setConnected(false);
    };
  }, [isAuthenticated]);

  const subscribe = useCallback((callback: (message: Message) => void) => {
    subscribers.current.add(callback);

    return () => {
      subscribers.current.delete(callback);
    };
  }, []);
  const send = (message: Message) => {
    if (socket.current && socket.current.readyState === WebSocket.OPEN) {
      socket.current.send(JSON.stringify(message));
    } else {
      console.warn("WebSocket not ready");
    }
  };

  const contextValue = useMemo(
    () => ({
      send,
      subscribe,
      connected,
    }),
    [connected, subscribe],
  );

  return (
    <WebSocketContext.Provider value={contextValue}>
      {children}
    </WebSocketContext.Provider>
  );
};

export const useWebSocket = (): WebSocketContextValue => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error("useWebSocket must be used within a WebSocketProvider");
  }
  return context;
};
