import { useCallback, useEffect, useMemo, useRef } from "react";

import { RealtimeClient, RemoteAnnotationMessage } from "@/services/realtimeClient";
import { useAnnotationStore, PROFILE_LABEL_CONFIG } from "@/store/annotationStore";
import { useCollaborationStore } from "@/store/collaborationStore";

const isProfileLabel = (label?: string) => {
  if (!label) return false;
  return PROFILE_LABEL_CONFIG.some((config) => config.name === label);
};

const defaultWsBase = () => {
  if (typeof window === "undefined") return "ws://localhost:8000";
  const { origin } = window.location;
  return origin.replace(/^http/i, "ws");
};

const wsBaseUrl = () => {
  const envUrl = import.meta.env.VITE_REALTIME_WS_URL as string | undefined;
  return envUrl ? envUrl.replace(/\/$/, "") : defaultWsBase();
};

const decodeUserId = (token: string | null) => {
  if (!token) return null;
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const decoded = JSON.parse(atob(payload));
    return decoded?.sub ?? decoded?.user_id ?? decoded?.uid ?? null;
  } catch {
    return null;
  }
};

export const useRealtimeSync = (
  projectId: string | null,
  token: string | null,
) => {
  const ingestAnnotationList = useAnnotationStore((state) => state.ingestAnnotationList);
  const upsertRemoteAnnotation = useAnnotationStore((state) => state.upsertRemoteAnnotation);
  const removeRemoteAnnotation = useAnnotationStore((state) => state.removeRemoteAnnotation);
  const annotations = useAnnotationStore((state) => state.annotations);

  const setLocalUserId = useCollaborationStore((state) => state.setLocalUserId);
  const upsertUser = useCollaborationStore((state) => state.upsertUser);
  const removeUser = useCollaborationStore((state) => state.removeUser);
  const updateCursor = useCollaborationStore((state) => state.updateCursor);
  const updateSelection = useCollaborationStore((state) => state.updateSelection);

  const profileViewportIds = useMemo(() => {
    return annotations
      .filter((ann) => isProfileLabel(ann.label))
      .map((ann) => ann.id);
  }, [annotations]);

  const realtimeRef = useRef<RealtimeClient | null>(null);
  const localUserId = useMemo(() => decodeUserId(token), [token]);

  useEffect(() => {
    if (localUserId) {
      setLocalUserId(localUserId);
    }
  }, [localUserId, setLocalUserId]);

  useEffect(() => {
    if (!projectId || !token) {
      // console.info("[Realtime] Disabled or missing credentials", {
      //   projectIdPresent: Boolean(projectId),
      //   tokenPresent: Boolean(token),
      // });
      return;
    }

    const client = new RealtimeClient({
      baseUrl: wsBaseUrl(),
      projectId,
      token,
      localUserId,
      onAnnotationList: ({ viewportId, annotations: remoteAnnotations }) => {
        // console.info("[Realtime] Received annotation list", {
        //   viewportId,
        //   count: remoteAnnotations.length,
        // });
        ingestAnnotationList(viewportId, remoteAnnotations);
      },
      onAnnotationCreated: (annotation: RemoteAnnotationMessage) => {
        // console.info("[Realtime] Remote annotation created", annotation.id);
        upsertRemoteAnnotation(annotation);
      },
      onAnnotationUpdated: (annotation: RemoteAnnotationMessage) => {
        // console.info("[Realtime] Remote annotation updated", annotation.id);
        upsertRemoteAnnotation(annotation);
      },
      onAnnotationDeleted: (annotation: RemoteAnnotationMessage) => {
        // console.info("[Realtime] Remote annotation deleted", annotation.id);
        removeRemoteAnnotation(annotation.id, annotation.viewport_id);
      },
      onCursorUpdate: ({ userId, payload }) => {
        const imageX = Number(payload?.x);
        const imageY = Number(payload?.y);
        if (Number.isFinite(imageX) && Number.isFinite(imageY)) {
          // console.info("[Realtime] Remote cursor update", {
          //   userId,
          //   imageX,
          //   imageY,
          //   tool: payload?.tool,
          // });
          updateCursor(userId, {
            imageX,
            imageY,
            tool: typeof payload?.tool === "string" ? (payload.tool as string) : undefined,
          });
        }
      },
      onPresenceJoin: ({ userId, name }) => {
        // console.info("[Realtime] Presence join", { userId, name });
        upsertUser(userId, { name });
      },
      onPresenceLeave: ({ userId }) => {
        // console.info("[Realtime] Presence leave", { userId });
        removeUser(userId);
      },
      onSelectionUpdate: ({ userId, annotationId }) => {
        // console.info("[Realtime] Remote selection update", { userId, annotationId });
        updateSelection(userId, annotationId);
      },
      onError: ({ event, message }) => {
        console.error("[Realtime] Error", event, message);
      },
    });

    realtimeRef.current = client;
    // console.info("[Realtime] Connecting", {
    //   baseUrl: client["baseUrl"],
    //   projectId,
    //   hasToken: Boolean(token),
    //   localUserId,
    // });
    client.connect();

    return () => {
      // console.info("[Realtime] Disconnecting");
      client.disconnect();
      realtimeRef.current = null;
    };
  }, [
    projectId,
    token,
    localUserId,
    ingestAnnotationList,
    upsertRemoteAnnotation,
    removeRemoteAnnotation,
    upsertUser,
    removeUser,
    updateCursor,
    updateSelection,
  ]);

  useEffect(() => {
    if (!realtimeRef.current || profileViewportIds.length === 0) {
      return;
    }

    realtimeRef.current.setTrackedViewports(profileViewportIds);
  }, [profileViewportIds]);

  const sendCursorUpdate = useCallback(
    (payload: { imageX: number; imageY: number; tool?: string; color?: string }) => {
      if (!realtimeRef.current) {
        // console.info("[Realtime] Skipping cursor update – client not connected", payload);
        return;
      }
      // console.info("[Realtime] Sending cursor update", payload);
      realtimeRef.current?.updateCursor(payload);
    },
    [],
  );

  const sendSelectionUpdate = useCallback((annotationId: string | null) => {
    if (!realtimeRef.current) {
      // console.info("[Realtime] Skipping selection update – client not connected", {
      //   annotationId,
      // });
      return;
    }
    // console.info("[Realtime] Sending selection update", { annotationId });
    realtimeRef.current?.updateSelection(annotationId);
  }, []);

  return {
    sendCursorUpdate,
    sendSelectionUpdate,
    localUserId,
  };
};

