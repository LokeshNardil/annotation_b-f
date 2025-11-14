type MessagePayload = Record<string, unknown>;

export type RemoteAnnotationMessage = {
  id: string;
  viewport_id?: string;
  coordinates?: Record<string, unknown>;
  label?: string;
  label_id?: string;
  text?: string;
  annotation_type?: string;
  status?: string;
  created_by?: string;
  modified_by_user?: string;
  created_at?: string;
  updated_at?: string;
  color?: string;
};

type RealtimeEvent =
  | "annotation:list"
  | "annotation:created"
  | "annotation:updated"
  | "annotation:deleted"
  | "annotation:conflict"
  | "cursor:update"
  | "presence:join"
  | "presence:leave"
  | "selection:update"
  | "selection:clear"
  | "ack"
  | "error";

type RealtimeMessage = {
  type: RealtimeEvent;
  project_id?: string;
  viewport_id?: string;
  annotation?: RemoteAnnotationMessage;
  annotations?: RemoteAnnotationMessage[];
  payload?: Record<string, unknown>;
  message?: string;
  event?: string;
  user?: { id: string; name?: string };
  selection_id?: string | null;
};

type Listener<T> = (payload: T) => void;

type RealtimeClientOptions = {
  baseUrl: string;
  projectId: string;
  token: string;
  onAnnotationList?: Listener<{ viewportId: string; annotations: RemoteAnnotationMessage[] }>;
  onAnnotationCreated?: Listener<RemoteAnnotationMessage>;
  onAnnotationUpdated?: Listener<RemoteAnnotationMessage>;
  onAnnotationDeleted?: Listener<RemoteAnnotationMessage>;
  onError?: Listener<{ event?: string; message: string }>;
  onCursorUpdate?: Listener<{ userId: string; payload: Record<string, unknown> }>;
  onPresenceJoin?: Listener<{ userId: string; name?: string }>;
  onPresenceLeave?: Listener<{ userId: string }>;
  onSelectionUpdate?: Listener<{ userId: string; annotationId: string | null; imageId?: string | null }>;
  localUserId?: string | null;
};

const HEARTBEAT_INTERVAL = 8000;

export class RealtimeClient {
  private readonly baseUrl: string;
  private readonly projectId: string;
  private readonly token: string;
  private socket: WebSocket | null = null;
  private heartbeatTimer: number | null = null;
  private isOpen = false;
  private viewportQueue = new Set<string>();
  private trackedViewports = new Set<string>();
  private readonly localUserId: string | null;

  private readonly opts: RealtimeClientOptions;

  constructor(options: RealtimeClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.projectId = options.projectId;
    this.token = options.token;
    this.opts = options;
    this.localUserId = options.localUserId ?? null;
  }

  connect() {
    if (this.socket) return;

    const url = `${this.baseUrl}/ws/projects/${this.projectId}?token=${encodeURIComponent(this.token)}`;
    console.info("[Realtime][WS] Opening connection", {
      url,
      baseUrl: this.baseUrl,
      projectId: this.projectId,
      tokenPreview: `${this.token.slice(0, 12)}…`,
      localUserId: this.localUserId,
    });
    this.socket = new WebSocket(url);

    this.socket.addEventListener("open", () => {
      this.isOpen = true;
      console.info("[Realtime][WS] Connection open", {
        readyState: this.socket?.readyState,
      });
      this.flushViewportQueue();
      this.startHeartbeat();
    });

    this.socket.addEventListener("close", (event) => {
      console.warn("[Realtime][WS] Connection closed", {
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
      });
      this.isOpen = false;
      this.stopHeartbeat();
      this.socket = null;
    });

    this.socket.addEventListener("error", (event) => {
      console.error("[Realtime][WS] Socket error", event);
    });

    this.socket.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(event.data) as RealtimeMessage;
        this.handleMessage(message);
      } catch (error) {
        console.error("Failed to parse realtime message", error);
      }
    });
  }

  disconnect() {
    this.stopHeartbeat();
    this.socket?.close();
    this.socket = null;
    this.isOpen = false;
    this.viewportQueue.clear();
  }

  setTrackedViewports(viewportIds: string[]) {
    const newlyTracked: string[] = [];
    viewportIds.forEach((id) => {
      if (!id) return;
      if (!this.trackedViewports.has(id)) {
        this.trackedViewports.add(id);
        newlyTracked.push(id);
      }
    });
    if (newlyTracked.length > 0) {
      this.requestAnnotationLists(newlyTracked);
    }
  }

  requestAnnotationLists(viewportIds: string[]) {
    viewportIds.forEach((id) => {
      if (!id) return;
      if (!this.isOpen) {
        this.viewportQueue.add(id);
        return;
      }

      this.send("annotation:list", { viewport_id: id });
    });
  }

  private flushViewportQueue() {
    if (!this.isOpen) return;
    this.viewportQueue.forEach((id) => {
      this.send("annotation:list", { viewport_id: id });
    });
    this.viewportQueue.clear();
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = window.setInterval(() => {
      this.send("presence:ping", {});
      this.flushViewportQueue();
    }, HEARTBEAT_INTERVAL);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private handleMessage(message: RealtimeMessage) {
    if (message.user?.id && this.localUserId && message.user.id === this.localUserId) {
      return;
    }

    switch (message.type) {
      case "annotation:list":
        if (message.viewport_id && Array.isArray(message.annotations)) {
          this.opts.onAnnotationList?.({
            viewportId: message.viewport_id,
            annotations: message.annotations,
          });
        }
        break;
      case "annotation:created":
      case "annotation:updated":
        if (message.annotation) {
          const handler =
            message.type === "annotation:created"
              ? this.opts.onAnnotationCreated
              : this.opts.onAnnotationUpdated;
          handler?.(message.annotation);
        }
        break;
      case "annotation:deleted":
        if (message.annotation) {
          this.opts.onAnnotationDeleted?.(message.annotation);
        }
        break;
      case "annotation:conflict":
        if (message.annotation) {
          this.opts.onAnnotationUpdated?.(message.annotation);
        }
        break;
      case "cursor:update":
        if (message.user?.id && message.payload) {
          this.opts.onCursorUpdate?.({
            userId: message.user.id,
            payload: message.payload,
          });
        }
        break;
      case "presence:join":
        if (message.user?.id) {
          this.opts.onPresenceJoin?.({
            userId: message.user.id,
            name: message.user.name,
          });
        }
        break;
      case "presence:leave":
        if (message.user?.id) {
          this.opts.onPresenceLeave?.({ userId: message.user.id });
        }
        break;
      case "selection:update":
        if (message.user?.id) {
          const payloadImageId =
            (message.payload?.image_id as string | undefined) ??
            (message.payload?.imageId as string | undefined) ??
            null;
          this.opts.onSelectionUpdate?.({
            userId: message.user.id,
            annotationId: message.selection_id ?? null,
            imageId: payloadImageId ?? null,
          });
        }
        break;
      case "selection:clear":
        if (message.user?.id) {
          this.opts.onSelectionUpdate?.({
            userId: message.user.id,
            annotationId: null,
          });
        }
        break;
      case "error":
        this.opts.onError?.({ event: message.event, message: message.message ?? "Unknown error" });
        break;
      default:
        break;
    }
  }

  private send(type: string, payload: MessagePayload) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    this.socket.send(JSON.stringify({ type, payload }));
  }

  updateCursor(payload: { imageX: number; imageY: number; tool?: string; color?: string; imageId?: string | null }) {
    if (!this.isOpen) return;
    this.send("cursor:update", {
      x: payload.imageX,
      y: payload.imageY,
      tool: payload.tool,
      color: payload.color,
      image_id: payload.imageId ?? undefined,
    });
  }

  updateSelection(annotationId: string | null, imageId?: string | null) {
    if (!this.isOpen) return;
    if (annotationId) {
      this.send("selection:update", {
        annotation_id: annotationId,
        image_id: imageId ?? undefined,
      });
    } else {
      this.send("selection:clear", {});
    }
  }
}

