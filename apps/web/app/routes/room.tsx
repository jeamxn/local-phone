import { useParams } from "react-router";
import { Typography } from "antd";

export default function Room() {
  const { roomId } = useParams();
  return (
    <main style={{ padding: 24 }}>
      <Typography.Title level={3}>Room {roomId}</Typography.Title>
    </main>
  );
}
