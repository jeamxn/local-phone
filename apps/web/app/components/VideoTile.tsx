import { useEffect, useRef } from "react";
import { Avatar, Tag } from "antd";
import { AudioMutedOutlined, DesktopOutlined, UserOutlined } from "@ant-design/icons";
import { langLabel } from "~/lib/languages";

interface Props {
  name: string;
  lang: string;
  stream: MediaStream | null;
  muted?: boolean; // mute the <video> element (always true for self to avoid echo)
  mirror?: boolean;
  hasVideo: boolean;
  screen?: boolean;
  transcript?: string;
  isSelf?: boolean;
}

export function VideoTile({
  name,
  lang,
  stream,
  muted,
  mirror,
  hasVideo,
  screen,
  transcript,
  isSelf,
}: Props) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (ref.current && stream) {
      ref.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div
      style={{
        position: "relative",
        background: "#141414",
        borderRadius: 12,
        overflow: "hidden",
        aspectRatio: "16 / 9",
        border: "1px solid #262626",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {hasVideo ? (
        <video
          ref={ref}
          autoPlay
          playsInline
          muted={muted}
          style={{
            width: "100%",
            height: "100%",
            objectFit: screen ? "contain" : "cover",
            transform: mirror ? "scaleX(-1)" : undefined,
          }}
        />
      ) : (
        <>
          {/* keep audio flowing even with no video */}
          {stream ? <video ref={ref} autoPlay playsInline muted={muted} style={{ display: "none" }} /> : null}
          <Avatar size={64} icon={<UserOutlined />} />
        </>
      )}

      <div
        style={{
          position: "absolute",
          left: 8,
          bottom: 8,
          display: "flex",
          gap: 6,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <Tag color="blue" style={{ margin: 0 }}>
          {name}
          {isSelf ? " (나)" : ""}
        </Tag>
        <Tag style={{ margin: 0 }}>{langLabel(lang)}</Tag>
        {screen ? (
          <Tag color="purple" icon={<DesktopOutlined />} style={{ margin: 0 }}>
            화면
          </Tag>
        ) : null}
        {muted && isSelf ? <AudioMutedOutlined style={{ color: "#aaa" }} /> : null}
      </div>

      {transcript ? (
        <div
          style={{
            position: "absolute",
            left: 8,
            right: 8,
            bottom: 44,
            padding: "4px 8px",
            background: "rgba(0,0,0,0.6)",
            borderRadius: 8,
            color: "#fff",
            fontSize: 13,
          }}
        >
          {transcript}
        </div>
      ) : null}
    </div>
  );
}
