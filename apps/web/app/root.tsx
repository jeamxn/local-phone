import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";
import { ConfigProvider, theme, App as AntdApp } from "antd";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>local-phone</title>
        <Meta />
        <Links />
        {/* antd SSR style injection placeholder — replaced in entry.server.tsx */}
        {typeof document === "undefined" ? (
          <style
            id="antd-ssr"
            dangerouslySetInnerHTML={{ __html: "__ANTD_STYLE__" }}
          />
        ) : null}
      </head>
      <body style={{ margin: 0, background: "#0a0a0a" }}>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: { colorPrimary: "#4f8cff", borderRadius: 10 },
      }}
    >
      <AntdApp>
        <Outlet />
      </AntdApp>
    </ConfigProvider>
  );
}

export function ErrorBoundary({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : "Unknown error";
  return (
    <main style={{ padding: 24, color: "#eee", fontFamily: "system-ui" }}>
      <h1>문제가 발생했어</h1>
      <pre>{message}</pre>
    </main>
  );
}
