import { useEffect, useRef, useState } from "react";
import { Input, Button, Empty } from "antd";
import { SendOutlined } from "@ant-design/icons";
import type { ChatMsg } from "~/lib/useCall";

interface Props {
  messages: ChatMsg[];
  onSend: (text: string) => void;
}

export function ChatPanel({ messages, onSend }: Props) {
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const submit = () => {
    if (!text.trim()) return;
    onSend(text);
    setText("");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
        {messages.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="메시지 없음" />
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: m.mine ? "flex-end" : "flex-start",
                marginBottom: 10,
              }}
            >
              <span style={{ fontSize: 11, color: "#888", marginBottom: 2 }}>
                {m.mine ? "나" : m.name}
              </span>
              <div
                style={{
                  maxWidth: "80%",
                  padding: "6px 10px",
                  borderRadius: 10,
                  background: m.mine ? "#4f8cff" : "#262626",
                  color: "#fff",
                  wordBreak: "break-word",
                }}
              >
                {m.text}
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
      <div style={{ padding: 12, borderTop: "1px solid #262626", display: "flex", gap: 8 }}>
        <Input
          value={text}
          placeholder="메시지 입력"
          onChange={(e) => setText(e.target.value)}
          onPressEnter={submit}
          maxLength={2000}
        />
        <Button type="primary" icon={<SendOutlined />} onClick={submit} />
      </div>
    </div>
  );
}
