import { useState } from "react";
import { useNavigate } from "react-router";
import {
  Button,
  Card,
  Input,
  Select,
  Typography,
  Space,
  Divider,
  App,
} from "antd";
import { VideoCameraOutlined, ArrowRightOutlined } from "@ant-design/icons";
import { LANGUAGES } from "~/lib/languages";

export function meta() {
  return [{ title: "local-phone" }];
}

function randomCode(): string {
  const a = "abcdefghijkmnpqrstuvwxyz23456789";
  const pick = () =>
    Array.from({ length: 3 }, () => a[Math.floor(Math.random() * a.length)]).join("");
  return `${pick()}-${pick()}-${pick()}`;
}

export default function Home() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [name, setName] = useState("");
  const [lang, setLang] = useState("ko");
  const [code, setCode] = useState("");

  const persist = () => {
    try {
      localStorage.setItem("lp.name", name.trim());
      localStorage.setItem("lp.lang", lang);
    } catch {
      /* ignore */
    }
  };

  const enter = (roomCode: string) => {
    if (!name.trim()) {
      message.warning("이름을 입력해줘");
      return;
    }
    persist();
    navigate(`/room/${encodeURIComponent(roomCode)}`);
  };

  const onJoin = () => {
    const c = code.trim().toLowerCase();
    if (!c) {
      message.warning("회의 코드를 입력해줘");
      return;
    }
    enter(c);
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <Card style={{ width: 420, maxWidth: "100%" }}>
        <Space direction="vertical" size="large" style={{ width: "100%" }}>
          <div style={{ textAlign: "center" }}>
            <Typography.Title level={2} style={{ marginBottom: 0 }}>
              <VideoCameraOutlined /> local-phone
            </Typography.Title>
            <Typography.Text type="secondary">실시간 번역 P2P 통화</Typography.Text>
          </div>

          <div>
            <Typography.Text strong>이름</Typography.Text>
            <Input
              size="large"
              placeholder="표시될 이름"
              value={name}
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
              onPressEnter={() => enter(randomCode())}
              style={{ marginTop: 6 }}
            />
          </div>

          <div>
            <Typography.Text strong>내가 들을 / 말할 언어</Typography.Text>
            <Select
              size="large"
              value={lang}
              onChange={setLang}
              style={{ width: "100%", marginTop: 6 }}
              options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
            />
          </div>

          <Button
            type="primary"
            size="large"
            block
            icon={<ArrowRightOutlined />}
            onClick={() => enter(randomCode())}
          >
            새 회의 만들기
          </Button>

          <Divider style={{ margin: "4px 0" }}>또는</Divider>

          <Space.Compact style={{ width: "100%" }}>
            <Input
              size="large"
              placeholder="회의 코드 (예: abc-def-ghi)"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onPressEnter={onJoin}
            />
            <Button size="large" onClick={onJoin}>
              입장
            </Button>
          </Space.Compact>
        </Space>
      </Card>
    </main>
  );
}
