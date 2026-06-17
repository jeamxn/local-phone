import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
  Button,
  Segmented,
  Space,
  Tooltip,
  Drawer,
  Badge,
  App,
  Modal,
  Input,
  Select,
  Typography,
} from "antd";
import {
  AudioOutlined,
  AudioMutedOutlined,
  VideoCameraOutlined,
  VideoCameraAddOutlined,
  DesktopOutlined,
  MessageOutlined,
  PhoneOutlined,
  EditOutlined,
  CopyOutlined,
  TranslationOutlined,
} from "@ant-design/icons";
import { useCall } from "~/lib/useCall";
import { LANGUAGES, type ListenMode } from "~/lib/languages";
import { VideoTile } from "~/components/VideoTile";
import { ChatPanel } from "~/components/ChatPanel";

export function meta() {
  return [{ title: "통화 — local-phone" }];
}

export default function Room() {
  const { roomId = "" } = useParams();
  const { message } = App.useApp();

  // read identity chosen in the lobby (client-only)
  const [identity, setIdentity] = useState<{ name: string; lang: string } | null>(null);
  const [askName, setAskName] = useState(false);
  const [tmpName, setTmpName] = useState("");
  const [tmpLang, setTmpLang] = useState("ko");

  useEffect(() => {
    let name = "";
    let lang = "ko";
    try {
      name = localStorage.getItem("lp.name") || "";
      lang = localStorage.getItem("lp.lang") || "ko";
    } catch {
      /* ignore */
    }
    if (name) {
      setIdentity({ name, lang });
    } else {
      setTmpLang(lang);
      setAskName(true);
    }
  }, []);

  const confirmIdentity = () => {
    const n = tmpName.trim();
    if (!n) {
      message.warning("이름을 입력해줘");
      return;
    }
    try {
      localStorage.setItem("lp.name", n);
      localStorage.setItem("lp.lang", tmpLang);
    } catch {
      /* ignore */
    }
    setIdentity({ name: n, lang: tmpLang });
    setAskName(false);
  };

  return (
    <>
      <Modal
        open={askName}
        title="입장 정보"
        onOk={confirmIdentity}
        okText="입장"
        closable={false}
        maskClosable={false}
        cancelButtonProps={{ style: { display: "none" } }}
      >
        <Space direction="vertical" style={{ width: "100%" }}>
          <Typography.Text strong>이름</Typography.Text>
          <Input
            placeholder="표시될 이름"
            value={tmpName}
            maxLength={40}
            onChange={(e) => setTmpName(e.target.value)}
            onPressEnter={confirmIdentity}
          />
          <Typography.Text strong>언어</Typography.Text>
          <Select
            value={tmpLang}
            onChange={setTmpLang}
            style={{ width: "100%" }}
            options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
          />
        </Space>
      </Modal>

      {identity ? (
        <CallRoom roomId={roomId} name={identity.name} lang={identity.lang} />
      ) : null}
    </>
  );
}

function CallRoom({ roomId, name, lang }: { roomId: string; name: string; lang: string }) {
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const call = useCall(roomId, name, lang);
  const [chatOpen, setChatOpen] = useState(false);
  const [myName, setMyName] = useState(name);
  const [myLang, setMyLang] = useState(lang);
  const [unread, setUnread] = useState(0);

  // unread badge
  useEffect(() => {
    if (!chatOpen && call.chat.length > 0) {
      const last = call.chat[call.chat.length - 1];
      if (!last.mine) setUnread((u) => u + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call.chat.length]);
  useEffect(() => {
    if (chatOpen) setUnread(0);
  }, [chatOpen]);

  const tileCount = call.peers.length + 1;
  const cols = tileCount <= 1 ? 1 : tileCount <= 4 ? 2 : 3;

  const copyInvite = async () => {
    const url = `${window.location.origin}/room/${encodeURIComponent(roomId)}`;
    try {
      await navigator.clipboard.writeText(url);
      message.success("초대 링크 복사됨");
    } catch {
      message.info(url);
    }
  };

  const doRename = () => {
    let value = myName;
    modal.confirm({
      title: "이름 변경",
      icon: null,
      content: (
        <Input
          defaultValue={myName}
          maxLength={40}
          onChange={(e) => (value = e.target.value)}
        />
      ),
      okText: "변경",
      onOk: () => {
        const n = value.trim();
        if (!n) return;
        setMyName(n);
        call.rename(n);
        try {
          localStorage.setItem("lp.name", n);
        } catch {
          /* ignore */
        }
      },
    });
  };

  const changeLang = (l: string) => {
    setMyLang(l);
    call.setLang(l);
    try {
      localStorage.setItem("lp.lang", l);
    } catch {
      /* ignore */
    }
  };

  const leave = () => navigate("/");

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#0a0a0a" }}>
      {/* header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 16px",
          borderBottom: "1px solid #262626",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <Space>
          <Typography.Text strong style={{ color: "#fff" }}>
            회의 {roomId}
          </Typography.Text>
          <Tooltip title="초대 링크 복사">
            <Button size="small" icon={<CopyOutlined />} onClick={copyInvite}>
              공유
            </Button>
          </Tooltip>
          <Badge status={call.connected ? "success" : "error"} text={call.connected ? "연결됨" : "연결 끊김"} />
        </Space>
        <Space wrap>
          <Tooltip title="내 언어 (이 언어로 상대 목소리를 들음)">
            <Select
              size="small"
              value={myLang}
              onChange={changeLang}
              style={{ width: 130 }}
              options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
            />
          </Tooltip>
          <Tooltip title="듣기 모드">
            <Segmented<ListenMode>
              size="small"
              value={call.listenMode}
              onChange={(v) => call.setListenMode(v)}
              options={[
                { label: "원본", value: "original" },
                { label: "번역", value: "translated" },
                { label: "동시", value: "both" },
              ]}
            />
          </Tooltip>
          <Button size="small" icon={<EditOutlined />} onClick={doRename}>
            {myName}
          </Button>
        </Space>
      </div>

      {/* video grid */}
      <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gap: 12,
          }}
        >
          <VideoTile
            name={myName}
            lang={myLang}
            stream={call.localStream}
            muted
            hasVideo={call.camOn || call.screenOn}
            screen={call.screenOn}
            micOn={call.micOn}
            speaking={call.localSpeaking}
            isSelf
          />
          {call.peers.map((p) => (
            <VideoTile
              key={p.id}
              name={p.name}
              lang={p.lang}
              stream={p.stream}
              muted={call.listenMode === "translated"}
              hasVideo={p.camOn || p.screenOn}
              screen={p.screenOn}
              micOn={p.micOn}
              speaking={!!call.speaking[p.id]}
              transcript={call.transcripts[p.id]}
            />
          ))}
        </div>
      </div>

      {/* control bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: 12,
          padding: 16,
          borderTop: "1px solid #262626",
        }}
      >
        <Tooltip title={call.micOn ? "마이크 끄기" : "마이크 켜기"}>
          <Button
            shape="circle"
            size="large"
            danger={!call.micOn}
            icon={call.micOn ? <AudioOutlined /> : <AudioMutedOutlined />}
            onClick={call.toggleMic}
          />
        </Tooltip>
        <Tooltip title={call.camOn ? "카메라 끄기" : "카메라 켜기"}>
          <Button
            shape="circle"
            size="large"
            type={call.camOn ? "primary" : "default"}
            icon={call.camOn ? <VideoCameraOutlined /> : <VideoCameraAddOutlined />}
            onClick={() => void call.toggleCam()}
          />
        </Tooltip>
        <Tooltip title={call.screenOn ? "화면공유 중지" : "화면공유"}>
          <Button
            shape="circle"
            size="large"
            type={call.screenOn ? "primary" : "default"}
            icon={<DesktopOutlined />}
            onClick={() => void call.toggleScreen()}
          />
        </Tooltip>
        <Badge count={unread} size="small">
          <Tooltip title="채팅">
            <Button
              shape="circle"
              size="large"
              icon={<MessageOutlined />}
              onClick={() => setChatOpen(true)}
            />
          </Tooltip>
        </Badge>
        <Tooltip title="나가기">
          <Button shape="circle" size="large" danger type="primary" icon={<PhoneOutlined rotate={135} />} onClick={leave} />
        </Tooltip>
      </div>

      <Drawer
        title="채팅"
        placement="right"
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        width={360}
        styles={{ body: { padding: 0 } }}
      >
        <ChatPanel messages={call.chat} onSend={call.sendChat} />
      </Drawer>
    </div>
  );
}
