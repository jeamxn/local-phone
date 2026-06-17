import { useEffect, useRef } from "react";
import { Avatar, Tag } from "antd";
import {
  AudioMutedOutlined,
  AudioOutlined,
  DesktopOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { langLabel } from "~/lib/languages";

interface Props {
  name: string;
  lang: string;
  stream: MediaStream | null;
  /** Mute this tile's ORIGINAL audio (always true for self to avoid echo;
   *  true for peers when the listener only wants translated audio). */
  muted?: boolean;
  hasVideo: boolean;
  screen?: boolean;
  /** Mic on/off of the person shown in this tile. */
  micOn?: boolean;
  /** Whether this person is currently speaking (active-speech detection). */
  speaking?: boolean;
  transcript?: string;
  isSelf?: boolean;
}

export function VideoTile({
  name,
  lang,
  stream,
  muted,
  hasVideo,
  screen,
  micOn,
  speaking,
  transcript,
  isSelf,
}: Props) {
  const ref = useRef<HTMLVideoElement>(null);

  // ONE persistent <video> element. Re-attach the stream whenever it changes.
  useEffect(() => {
    const el = ref.current;
    if (el && el.srcObject !== stream) {
      el.srcObject = stream;
    }
  }, [stream]);

  useEffect(() => {
    if (ref.current) ref.current.muted = !!muted;
  }, [muted]);

  return (
    <div
      style={{
        position: "relative",
        background: "#141414",
        borderRadius: 12,
        overflow: "hidden",
        aspectRatio: "16 / 9",
        // green ring while actively speaking
        border: speaking ? "3px solid #52c41a" : "1px solid #262626",
        boxShadow: speaking ? "0 0 12px rgba(82,196,26,0.5)" : "none",
        transition: "border-color 0.12s, box-shadow 0.12s",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* always mounted so srcObject survives cam/screen toggles.
          NOTE: no mirror transform — show video as-is (user asked for non-mirrored). */}
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={muted}
        style={{
          width: "100%",
          height: "100%",
          objectFit: screen ? "contain" : "cover",
          display: hasVideo ? "block" : "none",
        }}
      />
      {!hasVideo ? <Avatar size={64} icon={<UserOutlined />} /> : null}

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
        {/* mic state indicator */}
        {micOn === false ? (
          <AudioMutedOutlined style={{ color: "#ff4d4f" }} />
        ) : (
          <AudioOutlined style={{ color: speaking ? "#52c41a" : "#aaa" }} />
        )}
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
