import { PassThrough } from "node:stream";
import type { EntryContext } from "react-router";
import { ServerRouter } from "react-router";
import { createReadableStreamFromReadable } from "@react-router/node";
import { renderToPipeableStream } from "react-dom/server";
import { isbot } from "isbot";
import { createCache, extractStyle, StyleProvider } from "@ant-design/cssinjs";

const ABORT_DELAY = 10_000;

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
): Promise<Response> {
  return new Promise((resolve, reject) => {
    let shellRendered = false;
    const cache = createCache();
    const userAgent = request.headers.get("user-agent");
    const readyOption =
      userAgent && isbot(userAgent) ? "onAllReady" : "onShellReady";

    const { pipe, abort } = renderToPipeableStream(
      <StyleProvider cache={cache}>
        <ServerRouter context={routerContext} url={request.url} />
      </StyleProvider>,
      {
        [readyOption]() {
          shellRendered = true;
          const body = new PassThrough({
            transform(chunk, _enc, cb) {
              const s = chunk.toString();
              if (s.includes("__ANTD_STYLE__")) {
                cb(null, s.replace("__ANTD_STYLE__", extractStyle(cache, true)));
              } else {
                cb(null, chunk);
              }
            },
          });
          const stream = createReadableStreamFromReadable(body);
          responseHeaders.set("Content-Type", "text/html");
          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            }),
          );
          pipe(body);
        },
        onShellError(error: unknown) {
          reject(error);
        },
        onError(error: unknown) {
          responseStatusCode = 500;
          if (shellRendered) console.error(error);
        },
      },
    );

    setTimeout(abort, ABORT_DELAY);
  });
}
